<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Usage Intelligence — PHP port of apps/api/src/usage/usage.service.ts and
 * usageEvents.service.ts (Node Session 55, completed by Session 123).
 *
 * Session 123's honesty rules are the reason this file looks the way it does,
 * and they are preserved exactly:
 *
 *   - a percentage change without a prior-period baseline is null, never 0
 *     (0 reads as "no change");
 *   - a rate with an empty denominator is null — no AI requests is not a 0%
 *     error rate, and no workflow runs is not a 0% automation rate;
 *   - an average latency that was never measured is null, never 0 ms (0 ms
 *     reads as "perfectly fast");
 *   - per-module p95 latency and error rate are computed from the window's real
 *     request rows, and null where a module has none;
 *   - empty days in the 30-day series carry latencyMs: null, not 0;
 *   - structural zeros (host resources, cost, savings, ROI, carbon) stay 0 but
 *     are named field by field in the `provenance` block.
 *
 * Node reads a 30-day and a 60-day window from Prisma; this reads the same
 * windows from MySQL. Everything counted here is counted from rows this
 * organization actually holds.
 */
class Usage_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  const WINDOW_DAYS = 30;
  const SERIES_DAYS = 30;
  const MAX_EVENTS  = 1000;

  // -------------------------------------------------------------- dashboard

  public function dashboard($orgId) {
    $now       = time();
    $since     = date('Y-m-d H:i:s', $now - self::WINDOW_DAYS * 86400);
    $prevSince = date('Y-m-d H:i:s', $now - 2 * self::WINDOW_DAYS * 86400);

    $conversations     = $this->count_conversations($orgId, $since, NULL);
    $prevConversations = $this->count_conversations($orgId, $prevSince, $since);
    $messages          = $this->count_messages($orgId, $since, NULL);
    $prevMessages      = $this->count_messages($orgId, $prevSince, $since);
    $workflowRuns      = $this->count_runs($orgId, $since, NULL, NULL);
    $prevWorkflowRuns  = $this->count_runs($orgId, $prevSince, $since, NULL);
    $workflowsAuto     = $this->count_runs($orgId, $since, NULL, 'SUCCEEDED');
    $tasks             = $this->count_tasks($orgId, $since, NULL);
    $prevTasks         = $this->count_tasks($orgId, $prevSince, $since);

    $agents  = (int)$this->db->where('organization_id', $orgId)->count_all_results('agents');
    $members = (int)$this->db->where('organization_id', $orgId)->count_all_results('memberships');
    $workflowsTotal = (int)$this->db->where('organization_id', $orgId)->count_all_results('workflows');

    $aiRequests     = $this->count_ai($orgId, $since, NULL, NULL);
    $prevAiRequests = $this->count_ai($orgId, $prevSince, $since, NULL);
    $aiAgg          = $this->agg_ai($orgId, $since, NULL);
    $prevAiAgg      = $this->agg_ai($orgId, $prevSince, $since);
    $aiFailed       = $this->count_ai($orgId, $since, NULL, 'failed');
    $prevAiFailed   = $this->count_ai($orgId, $prevSince, $since, 'failed');

    $activeMembers = (int)$this->db->query(
      "SELECT COUNT(DISTINCT user_id) AS n FROM ai_requests
        WHERE organization_id = ? AND created_at >= ? AND user_id IS NOT NULL",
      array($orgId, $since)
    )->row()->n;

    $rows = $this->db->query(
      "SELECT created_at, duration_ms, status, channel, model_id, user_id, prompt_tokens, completion_tokens
         FROM ai_requests WHERE organization_id = ? AND created_at >= ?",
      array($orgId, $since)
    )->result_array();

    $totalTokens     = (int)($aiAgg['sum_prompt'] ?? 0) + (int)($aiAgg['sum_completion'] ?? 0);
    $prevTotalTokens = (int)($prevAiAgg['sum_prompt'] ?? 0) + (int)($prevAiAgg['sum_completion'] ?? 0);

    $avgLatencyMs    = $aiRequests > 0 && $aiAgg['avg_duration'] !== NULL ? (int)round((float)$aiAgg['avg_duration']) : NULL;
    $prevAvgLatency  = $prevAiRequests > 0 && $prevAiAgg['avg_duration'] !== NULL ? (int)round((float)$prevAiAgg['avg_duration']) : NULL;
    $errorRatePct    = $aiRequests     ? $this->round2(($aiFailed / $aiRequests) * 100)     : NULL;
    $prevErrorRate   = $prevAiRequests ? $this->round2(($prevAiFailed / $prevAiRequests) * 100) : NULL;
    $totalRequests30d = $messages + $workflowRuns + $conversations + $aiRequests;

    return array(
      'metrics'    => $this->metrics(array(
        'conversations' => $conversations, 'prevConversations' => $prevConversations,
        'messages'      => $messages,      'prevMessages'      => $prevMessages,
        'workflowRuns'  => $workflowRuns,  'prevWorkflowRuns'  => $prevWorkflowRuns,
        'tasks'         => $tasks,         'prevTasks'         => $prevTasks,
        'aiRequests'    => $aiRequests,    'prevAiRequests'    => $prevAiRequests,
        'totalTokens'   => $totalTokens,   'prevTotalTokens'   => $prevTotalTokens,
        'avgLatencyMs'  => $avgLatencyMs,  'prevAvgLatency'    => $prevAvgLatency,
        'errorRate'     => $errorRatePct,  'prevErrorRate'     => $prevErrorRate,
        'agents'        => $agents,        'members'           => $members,
      )),
      'departments' => array(),
      'modules'     => $this->modules($rows, $aiRequests),
      'topModels'   => $this->top_models($rows),
      'series'      => $this->series($rows, $now),
      // No host telemetry and no billing feed are connected in this deployment.
      // These stay 0 rather than being estimated, and `provenance` says so.
      'resources'   => array('cpuPct' => 0, 'memPct' => 0, 'gpuPct' => 0, 'storageGb' => 0,
                             'storageQuotaGb' => 0, 'networkMbps' => 0, 'carbonKgCO2e' => 0, 'costPerDayUsd' => 0),
      'totalRequests30d'        => $totalRequests30d,
      'totalCost30dUsd'         => 0,
      'totalSavings30dUsd'      => 0,
      'automationRate'          => $workflowRuns ? $this->round3($workflowsAuto / $workflowRuns) : NULL,
      'productivityGainHours30d' => 0,
      'roiPct'                  => 0,
      'adoptionPct'             => $members ? $this->round3($activeMembers / $members) : NULL,
      'carbonKgCO2e30d'         => 0,
      'activeMembers30d'        => $activeMembers,
      'workflowsTotal'          => $workflowsTotal,
      'provenance'              => $this->provenance(),
    );
  }

  // ------------------------------------------------------------ event ledger

  public function record_event($orgId, $input, $actorId = NULL) {
    $createdAt = date('Y-m-d H:i:s');
    $meta      = isset($input['meta']) && is_array($input['meta']) ? $input['meta'] : new stdClass();
    $id        = 'u-' . bin2hex(random_bytes(10));
    $this->db->insert('usage_events', array(
      'id'              => $id,
      'organization_id' => $orgId,
      'feature'         => substr((string)$input['feature'], 0, 64),
      'actor'           => substr((string)$input['actor'], 0, 120),
      'quantity'        => (float)$input['quantity'],
      'unit'            => substr((string)$input['unit'], 0, 24),
      'meta'            => json_encode($meta),
      'created_by'      => $actorId,
      'created_at'      => $createdAt,
    ));
    return $this->shape_event($this->db->get_where('usage_events', array('id' => $id), 1)->row_array());
  }

  public function list_events($orgId, $limit = 100) {
    $limit = max(1, min(self::MAX_EVENTS, (int)$limit));
    $rows  = $this->db->order_by('created_at', 'DESC')->limit($limit)
                      ->get_where('usage_events', array('organization_id' => $orgId))->result_array();
    return array_map(array($this, 'shape_event'), $rows);
  }

  public function get_event($orgId, $id) {
    $row = $this->db->get_where('usage_events', array('organization_id' => $orgId, 'id' => $id), 1)->row_array();
    return $row ? $this->shape_event($row) : NULL;
  }

  public function remove_event($orgId, $id) {
    $this->db->where('organization_id', $orgId)->where('id', $id)->delete('usage_events');
    return $this->db->affected_rows() > 0;
  }

  private function shape_event($row) {
    $meta = json_decode($row['meta'], TRUE);
    return array(
      'id'        => $row['id'],
      'createdAt' => $this->iso($row['created_at']),
      'feature'   => $row['feature'],
      'actor'     => $row['actor'],
      'quantity'  => (float)$row['quantity'],
      'unit'      => $row['unit'],
      'meta'      => is_array($meta) ? $meta : new stdClass(),
    );
  }

  // ------------------------------------------------------------- aggregations

  private function count_conversations($orgId, $from, $to) {
    $sql = "SELECT COUNT(*) AS n FROM conversations WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND created_at < ?"; $args[] = $to; }
    return (int)$this->db->query($sql, $args)->row()->n;
  }

  private function count_messages($orgId, $from, $to) {
    $sql = "SELECT COUNT(*) AS n FROM talk_messages tm
              JOIN talk_channels tc ON tc.id = tm.channel_id
             WHERE tc.organization_id = ? AND tm.deleted_at IS NULL AND tm.created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND tm.created_at < ?"; $args[] = $to; }
    return (int)$this->db->query($sql, $args)->row()->n;
  }

  private function count_runs($orgId, $from, $to, $status) {
    $sql = "SELECT COUNT(*) AS n FROM workflow_runs wr
              JOIN workflows w ON w.id = wr.workflow_id
             WHERE w.organization_id = ? AND wr.created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND wr.created_at < ?"; $args[] = $to; }
    if ($status) { $sql .= " AND wr.status = ?"; $args[] = $status; }
    return (int)$this->db->query($sql, $args)->row()->n;
  }

  private function count_tasks($orgId, $from, $to) {
    $sql = "SELECT COUNT(*) AS n FROM tasks WHERE organization_id = ? AND created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND created_at < ?"; $args[] = $to; }
    return (int)$this->db->query($sql, $args)->row()->n;
  }

  /** $failed: NULL = all, 'failed' = every status except succeeded. */
  private function count_ai($orgId, $from, $to, $failed) {
    $sql = "SELECT COUNT(*) AS n FROM ai_requests WHERE organization_id = ? AND created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND created_at < ?"; $args[] = $to; }
    if ($failed) { $sql .= " AND status <> 'succeeded'"; }
    return (int)$this->db->query($sql, $args)->row()->n;
  }

  private function agg_ai($orgId, $from, $to) {
    $sql = "SELECT COALESCE(SUM(prompt_tokens), 0) AS sum_prompt,
                   COALESCE(SUM(completion_tokens), 0) AS sum_completion,
                   AVG(duration_ms) AS avg_duration
              FROM ai_requests WHERE organization_id = ? AND created_at >= ?";
    $args = array($orgId, $from);
    if ($to) { $sql .= " AND created_at < ?"; $args[] = $to; }
    return $this->db->query($sql, $args)->row_array();
  }

  private function metrics($v) {
    $m = function ($label, $value, $unit, $prev) {
      $delta = ($value === NULL || $prev === NULL) ? NULL : $this->delta_pct($value, $prev);
      return array('label' => $label, 'value' => $value, 'unit' => $unit, 'deltaPct' => $delta, 'trend' => $this->trend_of($delta));
    };
    return array(
      $m('Conversations (30d)', $v['conversations'], '', $v['prevConversations']),
      $m('Messages (30d)',      $v['messages'],      '', $v['prevMessages']),
      $m('Workflow runs (30d)', $v['workflowRuns'],  '', $v['prevWorkflowRuns']),
      $m('Tasks (30d)',         $v['tasks'],         '', $v['prevTasks']),
      $m('AI requests (30d)',   $v['aiRequests'],    '', $v['prevAiRequests']),
      $m('AI tokens (30d)',     $v['totalTokens'],   'tokens', $v['prevTotalTokens']),
      $m('Avg AI latency',      $v['avgLatencyMs'],  'ms', $v['prevAvgLatency']),
      $m('AI error rate',       $v['errorRate'],     '%', $v['prevErrorRate']),
      // Point-in-time counts have no prior-period baseline, so the delta is
      // honestly null — never 0 and never "flat".
      $m('AI employees',        $v['agents'],        '', NULL),
      $m('Members',             $v['members'],       '', NULL),
    );
  }

  /** Per-module metrics, measured from the window's rows. */
  private function modules($rows, $aiRequests) {
    $groups = array();
    foreach ($rows as $r) {
      $ch = $r['channel'] ?: 'unknown';
      if (!isset($groups[$ch])) $groups[$ch] = array('requests' => 0, 'users' => array(), 'durations' => array(), 'failed' => 0);
      $groups[$ch]['requests'] += 1;
      if ($r['user_id']) $groups[$ch]['users'][$r['user_id']] = TRUE;
      if ($r['duration_ms'] !== NULL) $groups[$ch]['durations'][] = (int)$r['duration_ms'];
      if ($r['status'] && $r['status'] !== 'succeeded') $groups[$ch]['failed'] += 1;
    }
    $out = array();
    foreach ($groups as $channel => $g) {
      $out[] = array(
        'module'       => $channel,
        'requests'     => $g['requests'],
        'users'        => count($g['users']),
        'p95LatencyMs' => $this->percentile($g['durations'], 95),
        'errorRate'    => $g['requests'] ? $this->round2(($g['failed'] / $g['requests']) * 100) : NULL,
        'sharePct'     => $aiRequests ? $this->round1(($g['requests'] / $aiRequests) * 100) : 0,
      );
    }
    usort($out, function ($a, $b) { return $b['requests'] - $a['requests']; });
    return $out;
  }

  private function top_models($rows) {
    $groups = array();
    foreach ($rows as $r) {
      $mid = $r['model_id'] ?: 'unknown';
      if (!isset($groups[$mid])) $groups[$mid] = array('requests' => 0, 'tokens' => 0);
      $groups[$mid]['requests'] += 1;
      $groups[$mid]['tokens']   += (int)$r['prompt_tokens'] + (int)$r['completion_tokens'];
    }
    $out = array();
    foreach ($groups as $modelId => $g) $out[] = array('modelId' => $modelId, 'requests' => $g['requests'], 'tokens' => $g['tokens']);
    usort($out, function ($a, $b) { return $b['requests'] - $a['requests']; });
    return array_slice($out, 0, 10);
  }

  /** 30 daily buckets; empty days carry null latency and null automation tasks. */
  private function series($rows, $now) {
    $buckets = array();
    for ($i = self::SERIES_DAYS - 1; $i >= 0; $i--) {
      $buckets[gmdate('Y-m-d', $now - $i * 86400)] = array('requests' => 0, 'tokens' => 0, 'durations' => array());
    }
    foreach ($rows as $r) {
      $key = date('Y-m-d', strtotime($r['created_at']));
      if (!isset($buckets[$key])) continue;
      $buckets[$key]['requests'] += 1;
      $buckets[$key]['tokens']   += (int)$r['prompt_tokens'] + (int)$r['completion_tokens'];
      if ($r['duration_ms'] !== NULL) $buckets[$key]['durations'][] = (int)$r['duration_ms'];
    }
    $out = array();
    foreach ($buckets as $date => $b) {
      $out[] = array(
        'ts'              => $date,
        'requests'        => $b['requests'],
        'tokens'          => $b['tokens'],
        'latencyMs'       => ($b['requests'] && $b['durations']) ? (int)round(array_sum($b['durations']) / count($b['durations'])) : NULL,
        'automationTasks' => NULL, // no automation-task metering exists; null, never 0
      );
    }
    return $out;
  }

  private function provenance() {
    return array(
      'entries' => array(
        array('field' => 'metrics', 'basis' => 'measured',
          'detail' => 'counted from ai_requests/conversations/talk_messages/workflow_runs/tasks rows; deltas vs the prior 30-day window, null without a baseline'),
        array('field' => 'modules', 'basis' => 'measured',
          'detail' => 'requests/users/p95LatencyMs/errorRate derived from the window\'s ai_requests rows'),
        array('field' => 'topModels', 'basis' => 'measured',
          'detail' => 'requests and tokens per model_id from the window\'s rows'),
        array('field' => 'series', 'basis' => 'measured',
          'detail' => 'requests/tokens/latency per day; empty days have null latency and null automationTasks'),
        array('field' => 'automationRate', 'basis' => 'measured',
          'detail' => 'SUCCEEDED workflow runs over all runs in the window; null without runs'),
        array('field' => 'adoptionPct', 'basis' => 'measured',
          'detail' => 'members with AI traffic over members; null without members'),
        array('field' => 'resources', 'basis' => 'structural_zero',
          'detail' => 'no host telemetry feed is connected'),
        array('field' => 'totalCost30dUsd / totalSavings30dUsd / productivityGainHours30d / roiPct / carbonKgCO2e30d',
          'basis' => 'structural_zero', 'detail' => 'no billing or carbon feed is connected'),
        array('field' => 'departments', 'basis' => 'structural_zero',
          'detail' => 'no department attribution is recorded'),
      ),
      'note' => 'metrics, modules, topModels, series, automationRate, adoptionPct and activeMembers30d are counted from real records (ai_requests, conversations, talk messages, workflow runs, tasks, memberships). resources, totalCost30dUsd, totalSavings30dUsd, productivityGainHours30d, roiPct and carbonKgCO2e30d are structural zeros: no host telemetry or billing feed is connected, so nothing is reported as if it were a measurement.',
    );
  }

  // ------------------------------------------------------------------ maths

  /** Same-window percentage change; null without a prior baseline. */
  private function delta_pct($current, $previous) {
    if (!is_finite($current) || !is_finite($previous) || $previous <= 0) return NULL;
    return $this->round1((($current - $previous) / $previous) * 100);
  }

  private function trend_of($delta) {
    if ($delta === NULL) return NULL;
    return $delta > 1 ? 'up' : ($delta < -1 ? 'down' : 'flat');
  }

  /** Nearest-rank percentile; null for an empty sample. */
  private function percentile($values, $pct) {
    $clean = array_values(array_filter($values, function ($v) { return is_finite($v); }));
    if (!$clean) return NULL;
    sort($clean, SORT_NUMERIC);
    $idx = min(count($clean) - 1, max(0, (int)ceil(($pct / 100) * count($clean)) - 1));
    return $clean[$idx];
  }

  private function round1($n) { return round((float)$n, 1); }
  private function round2($n) { return round((float)$n, 2); }
  private function round3($n) { return round((float)$n, 3); }
  private function iso($dt)   { $ts = strtotime((string)$dt); return $ts ? gmdate('Y-m-d\TH:i:s\Z', $ts) : NULL; }
}
