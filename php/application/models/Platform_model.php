<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Global Platform — PHP port of apps/api/src/http/routes/platform.ts (15 routes)
 * and the services behind it: observability (metrics/logs/traces/AI), the
 * region + disaster-recovery control plane, and the CDN control plane.
 *
 * What is real here and what is deliberately absent:
 *
 *   * METRICS are whatever this runtime actually recorded. `http.requests` and
 *     `http.request_duration_ms` come from the request span every API call
 *     opens; gauges are measured at snapshot time. There is no `nodejs_*`
 *     gauge, because this is not Node — the equivalents that exist are
 *     reported instead.
 *   * LOGS are read from the durable records this build keeps: `audit_events`,
 *     failed spans, and failed AI requests. Node tails an in-memory ring that
 *     PHP does not have; inventing a second log store to look like one would
 *     be theatre, so every row carries a `source` field naming where it came
 *     from.
 *   * REGIONS keep cdn.service's/region.service's static catalogue, but the
 *     primary region's status is a live database round-trip, not a constant.
 *     Failover state is durable (Node kept it in four module-level variables).
 *   * Two numbers Node returns are NOT reproduced. `replicationLagMs: 42` is a
 *     literal in getDisasterRecoveryReport(), and `popCount: 42`,
 *     `cacheHitRate: 0.87` (labelled "simulated" in the source) and
 *     `bandwidthGb: 12.4` are literals in getCdnConfig(). A single-database
 *     deployment has no replication to measure and no CDN to report from, so
 *     all four are null here — an absent measurement, not a decorative number.
 */
class Platform_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  private static function iso($mysql) {
    if (!$mysql) return NULL;
    return gmdate('Y-m-d\TH:i:s\Z', strtotime($mysql));
  }

  // ══════════════════════════════════════════════════════════════════ metrics

  /**
   * Node's Metrics.snapshot() shape, populated from durable buckets. Old
   * minute buckets are pruned here rather than on every write: this is the only
   * place that reads the whole table.
   */
  public function metrics_snapshot() {
    $this->prune_metrics();

    $counters = array();
    $rows = $this->db->select('name, tag_key, SUM(value) AS v', FALSE)
                     ->group_by(array('name', 'tag_key'))->get('platform_metric_counters')->result_array();
    foreach ($rows as $r) {
      if (!isset($counters[$r['name']])) $counters[$r['name']] = array('total' => 0, 'byTags' => array());
      $counters[$r['name']]['total'] += (int)$r['v'];
      $tag = $r['tag_key'] !== '' ? $r['tag_key'] : '_';
      $counters[$r['name']]['byTags'][$tag] = (int)$r['v'];
    }

    $histograms = array();
    $rows = $this->db->select('name, tag_key, SUM(count) AS count, SUM(`sum`) AS `sum`, MIN(`min`) AS `min`, MAX(`max`) AS `max`', FALSE)
                     ->group_by(array('name', 'tag_key'))->get('platform_metric_histograms')->result_array();
    foreach ($rows as $r) {
      $tag = $r['tag_key'] !== '' ? $r['tag_key'] : '_';
      $histograms[$r['name']]['byTags'][$tag] = array(
        'count' => (int)$r['count'],
        'sum'   => (float)$r['sum'],
        'avg'   => $r['count'] ? (float)$r['sum'] / (int)$r['count'] : 0.0,
        'min'   => (float)$r['min'],
        'max'   => (float)$r['max'],
      );
    }

    return array(
      'counters'    => $counters,
      'gauges'      => $this->gauges(),
      'histograms'  => $histograms,
      'series'      => $this->series(),
      'collectedAt' => gmdate('Y-m-d\TH:i:s\Z'),
    );
  }

  /**
   * Node exports Node.js process gauges. These are the equivalents PHP can
   * actually measure at snapshot time — memory and the filesystem the app is
   * installed on. Anything that cannot be measured is omitted rather than
   * guessed.
   */
  private function gauges() {
    $out = array();
    $set = function ($name, $value) use (&$out) {
      if ($value === NULL) return;
      $out[$name] = array('value' => $value, 'byTags' => array('_' => $value));
    };
    $set('php_memory_used_bytes', memory_get_usage(TRUE));
    $set('php_memory_peak_bytes', memory_get_peak_usage(TRUE));
    $free  = @disk_free_space(APPPATH);
    $total = @disk_total_space(APPPATH);
    $set('disk_free_bytes',  $free === FALSE ? NULL : (float)$free);
    $set('disk_total_bytes', $total === FALSE ? NULL : (float)$total);
    return $out;
  }

  /** Minute buckets for the last hour, hour buckets for the last day. */
  private function series() {
    $out = array();
    $minuteCut = date('Y-m-d H:i:s', time() - 3600);
    $rows = $this->db->select('name, tag_key, bucket_at, value AS v', FALSE)
                     ->where('bucket_at >=', $minuteCut)
                     ->order_by('bucket_at', 'ASC')->get('platform_metric_counters')->result_array();
    foreach ($rows as $r) {
      $out[$r['name']]['minute'][] = array(
        't'    => strtotime($r['bucket_at'] . ' UTC') * 1000,
        'v'    => (int)$r['v'],
        'tags' => $r['tag_key'],
      );
    }
    $hourCut = date('Y-m-d H:i:s', time() - 86400);
    $rows = $this->db->select("name, tag_key, DATE_FORMAT(bucket_at, '%Y-%m-%d %H:00:00') AS bucket_at, SUM(value) AS v", FALSE)
                     ->where('bucket_at >=', $hourCut)
                     ->group_by(array('name', 'tag_key', "DATE_FORMAT(bucket_at, '%Y-%m-%d %H:00:00')"))
                     ->order_by('bucket_at', 'ASC')->get('platform_metric_counters')->result_array();
    foreach ($rows as $r) {
      $out[$r['name']]['hour'][] = array(
        't'    => strtotime($r['bucket_at'] . ' UTC') * 1000,
        'v'    => (int)$r['v'],
        'tags' => $r['tag_key'],
      );
    }
    // Node records a timing's series under `name + "_ms"` (one point per
    // observation). There is one row per minute here, so the point is that
    // minute's average, and the key matches Node's so the latency panel finds
    // `http.request.duration_ms_ms` without a special case.
    $minRows = $this->db->select('name, tag_key, bucket_at, count, `sum`', FALSE)
                        ->where('bucket_at >=', $minuteCut)
                        ->order_by('bucket_at', 'ASC')->get('platform_metric_histograms')->result_array();
    foreach ($minRows as $r) {
      $key = $r['name'] . '_ms';
      $out[$key]['minute'][] = array(
        't'    => strtotime($r['bucket_at'] . ' UTC') * 1000,
        'v'    => $r['count'] ? (float)$r['sum'] / (int)$r['count'] : 0.0,
        'tags' => $r['tag_key'],
      );
    }
    $hourRows = $this->db->select("name, tag_key, DATE_FORMAT(bucket_at, '%Y-%m-%d %H:00:00') AS bucket_at, SUM(count) AS count, SUM(`sum`) AS `sum`", FALSE)
                         ->where('bucket_at >=', $hourCut)
                         ->group_by(array('name', 'tag_key', "DATE_FORMAT(bucket_at, '%Y-%m-%d %H:00:00')"))
                         ->order_by('bucket_at', 'ASC')->get('platform_metric_histograms')->result_array();
    foreach ($hourRows as $r) {
      $key = $r['name'] . '_ms';
      $out[$key]['hour'][] = array(
        't'    => strtotime($r['bucket_at'] . ' UTC') * 1000,
        'v'    => $r['count'] ? (float)$r['sum'] / (int)$r['count'] : 0.0,
        'tags' => $r['tag_key'],
      );
    }
    foreach ($out as $name => $s) {
      if (!isset($s['minute'])) $out[$name]['minute'] = array();
      if (!isset($s['hour']))   $out[$name]['hour'] = array();
    }
    return $out;
  }

  public function prune_metrics($retentionHours = 24) {
    $cut = date('Y-m-d H:i:s', time() - $retentionHours * 3600);
    $this->db->where('bucket_at <', $cut)->delete('platform_metric_counters');
    $this->db->where('bucket_at <', $cut)->delete('platform_metric_histograms');
  }

  // ═════════════════════════════════════════════════════════════════════ logs

  private static $levels = array('debug' => 20, 'info' => 30, 'warn' => 40, 'error' => 50, 'fatal' => 60);

  /**
   * There is no ring buffer to tail. The three durable records that describe
   * what happened are merged instead, and every row says which it came from.
   */
  public function logs($level = NULL, $limit = 200, $search = NULL) {
    $out = array();

    $rows = $this->db->select('id, event_type, payload, user_id, organization_id, ip_address, created_at')
                     ->order_by('created_at', 'DESC')->limit(500)->get('audit_events')->result_array();
    foreach ($rows as $r) {
      $hay = strtolower($r['event_type'] . ' ' . (string)$r['payload']);
      $lvl = preg_match('/\b(failed|revoked|quarantined|suspended|blocked|denied)\b/', $hay) ? 'error'
           : (preg_match('/^(admin|security|permission|authz|system)\./', $r['event_type']) ? 'warn' : 'info');
      $out[] = array(
        'level' => $lvl, 'time' => self::iso($r['created_at']), 'msg' => $r['event_type'],
        'source' => 'audit', 'userId' => $r['user_id'], 'orgId' => $r['organization_id'],
        'requestId' => NULL, 'traceId' => NULL, 'detail' => json_decode($r['payload'] ?: '{}', TRUE),
      );
    }

    $rows = $this->db->where('status', 'error')->order_by('started_at', 'DESC')->limit(200)->get('platform_spans')->result_array();
    foreach ($rows as $r) {
      $out[] = array(
        'level' => 'error', 'time' => self::iso($r['started_at']),
        'msg'   => 'span failed: ' . $r['name'],
        'source'=> 'trace', 'userId' => $r['user_id'], 'orgId' => $r['organization_id'],
        'requestId' => NULL, 'traceId' => $r['trace_id'],
        'detail' => array('spanId' => $r['span_id'], 'error' => $r['error_message'], 'durationMs' => (int)$r['duration_ms']),
      );
    }

    $rows = $this->db->select('id, provider, model_id, feature, duration_ms, error, user_id, organization_id, created_at')
                     ->where('status', 'failed')->order_by('created_at', 'DESC')->limit(200)->get('ai_requests')->result_array();
    foreach ($rows as $r) {
      // A refused call (no provider configured) is recorded with provider
      // 'none'; name the real cause instead of printing "none/unknown".
      $label  = ($r['provider'] && $r['provider'] !== 'none') ? $r['provider'] . '/' . $r['model_id'] : 'no provider configured';
      $out[] = array(
        'level' => 'error', 'time' => self::iso($r['created_at']),
        'msg'   => 'ai request failed: ' . $label,
        'source'=> 'ai', 'userId' => $r['user_id'], 'orgId' => $r['organization_id'],
        'requestId' => NULL, 'traceId' => NULL,
        'detail' => array('feature' => $r['feature'], 'error' => $r['error'], 'durationMs' => (int)$r['duration_ms']),
      );
    }

    if ($level !== NULL && isset(self::$levels[$level])) {
      $min = self::$levels[$level];
      $out = array_values(array_filter($out, function ($e) use ($min) { return self::$levels[$e['level']] >= $min; }));
    }
    if ($search !== NULL && $search !== '') {
      $needle = strtolower($search);
      $out = array_values(array_filter($out, function ($e) use ($needle) {
        return strpos(strtolower(json_encode($e)), $needle) !== FALSE;
      }));
    }
    usort($out, function ($a, $b) { return strcmp($b['time'], $a['time']); }); // newest first
    return array_slice($out, 0, max(1, (int)$limit));
  }

  // ════════════════════════════════════════════════════════════════════ traces

  public function traces($limit = 50) {
    $sql = "SELECT s.* FROM platform_spans s
            WHERE s.parent_span_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM platform_spans p WHERE p.span_id = s.parent_span_id)
            ORDER BY s.started_at DESC LIMIT " . (int)max(1, $limit);
    $rows = $this->db->query($sql)->result_array();
    return array_map(array($this, 'shape_span'), $rows);
  }

  public function trace($traceId) {
    if (!preg_match('/^[0-9a-fA-F]{32}$/', (string)$traceId)) return array();
    $rows = $this->db->where('trace_id', strtolower($traceId))->order_by('started_at', 'ASC')->get('platform_spans')->result_array();
    return array_map(array($this, 'shape_span'), $rows);
  }

  public function span($spanId) {
    if (!preg_match('/^[0-9a-fA-F]{16}$/', (string)$spanId)) return NULL;
    $r = $this->db->where('span_id', strtolower($spanId))->get('platform_spans')->row_array();
    return $r ? $this->shape_span($r) : NULL;
  }

  private function shape_span($r) {
    $children = $this->db->select('span_id')->where('parent_span_id', $r['span_id'])->get('platform_spans')->result_array();
    return array(
      'traceId'       => $r['trace_id'],
      'spanId'        => $r['span_id'],
      'parentSpanId'  => $r['parent_span_id'],
      'name'          => $r['name'],
      'kind'          => $r['kind'],
      'startedAt'     => self::iso($r['started_at']),
      'endedAt'       => self::iso($r['ended_at']),
      'durationMs'    => $r['duration_ms'] === NULL ? NULL : (int)$r['duration_ms'],
      'status'        => $r['status'],
      'errorMessage'  => $r['error_message'],
      'attrs'         => json_decode($r['attributes'] ?: '{}', TRUE) ?: array(),
      'children'      => array_column($children, 'span_id'),
    );
  }

  // ══════════════════════════════════════════════════════════ ai observability

  public function ai_observability($org, $minutes = 60) {
    $since  = date('Y-m-d H:i:s', time() - ((int)$minutes * 60));
    $rows   = $this->db->select('r.id, r.provider, r.model_id, r.feature, r.duration_ms, r.prompt_tokens,
                                 r.completion_tokens, r.status, r.error, r.created_at,
                                 m.cost_input_per_1k, m.cost_output_per_1k', FALSE)
                       ->from('ai_requests r')
                       ->join('model_registry m', 'm.id = r.model_registry_id', 'left')
                       ->where('r.organization_id', $org)
                       ->where('r.created_at >=', $since)
                       ->order_by('r.created_at', 'DESC')->limit(1000)->get()->result_array();

    $total     = count($rows);
    $failed    = 0;
    $latencies = array();
    $prompt    = 0;
    $completion= 0;
    $cost      = 0.0;
    $byModel   = array();
    $byFeature = array();

    foreach ($rows as $r) {
      $ms   = (int)$r['duration_ms'];
      $isFail = $r['status'] === 'failed';
      if ($isFail) $failed++;
      if ($ms > 0) $latencies[] = $ms;
      $prompt     += (int)$r['prompt_tokens'];
      $completion += (int)$r['completion_tokens'];
      $entryCost   = $this->cost_for($r);
      $cost       += $entryCost;

      $m = $r['model_id'] ?: 'unknown';
      if (!isset($byModel[$m])) $byModel[$m] = array('requests' => 0, 'avgLatencyMs' => 0, 'errorRate' => 0, 'tokens' => 0, 'costUsd' => 0);
      $byModel[$m]['requests']++;
      $byModel[$m]['avgLatencyMs'] += $ms;
      if ($isFail) $byModel[$m]['errorRate']++;
      $byModel[$m]['tokens']   += (int)$r['prompt_tokens'] + (int)$r['completion_tokens'];
      $byModel[$m]['costUsd']  += $entryCost;

      $f = $r['feature'] ?: 'unknown';
      if (!isset($byFeature[$f])) $byFeature[$f] = array('requests' => 0, 'errors' => 0);
      $byFeature[$f]['requests']++;
      if ($isFail) $byFeature[$f]['errors']++;
    }
    sort($latencies);
    foreach ($byModel as $k => $b) {
      $byModel[$k]['avgLatencyMs'] = $b['requests'] ? (int)round($b['avgLatencyMs'] / $b['requests']) : 0;
      $byModel[$k]['errorRate']    = $b['requests'] ? $b['errorRate'] / $b['requests'] : 0;
      $byModel[$k]['costUsd']      = (float)number_format($b['costUsd'], 4, '.', '');
    }

    // Time series: ~30 buckets, each at least a minute wide (Node's rule).
    $windowMs    = (int)$minutes * 60000;
    $bucketSizeS = max(60, (int)floor($windowMs / 30 / 1000));
    $buckets     = array();
    foreach ($rows as $r) {
      $bt = (int)floor(strtotime($r['created_at']) / $bucketSizeS) * $bucketSizeS;
      if (!isset($buckets[$bt])) $buckets[$bt] = array('requests' => 0, 'errors' => 0, 'latency' => 0, 'tokens' => 0);
      $buckets[$bt]['requests']++;
      if ($r['status'] === 'failed') $buckets[$bt]['errors']++;
      $buckets[$bt]['latency'] += (int)$r['duration_ms'];
      $buckets[$bt]['tokens']  += (int)$r['prompt_tokens'] + (int)$r['completion_tokens'];
    }
    $series = array();
    $start  = (int)floor(strtotime($since) / $bucketSizeS) * $bucketSizeS;
    for ($t = $start; $t <= time(); $t += $bucketSizeS) {
      $b = $buckets[$t] ?? NULL;
      $series[] = array(
        't'         => gmdate('Y-m-d\TH:i:s\Z', $t),
        'requests'  => $b['requests'] ?? 0,
        'errors'    => $b['errors'] ?? 0,
        'latencyMs' => $b && $b['requests'] ? (int)round($b['latency'] / $b['requests']) : 0,
        'tokens'    => $b['tokens'] ?? 0,
      );
    }

    return array(
      'windowMinutes' => (int)$minutes,
      'totals' => array(
        'requests'             => $total,
        'succeeded'            => $total - $failed,
        'failed'               => $failed,
        'errorRate'            => $total ? $failed / $total : 0,
        'avgLatencyMs'         => $latencies ? (int)round(array_sum($latencies) / count($latencies)) : 0,
        'p50LatencyMs'         => $this->percentile($latencies, 50),
        'p95LatencyMs'         => $this->percentile($latencies, 95),
        'totalPromptTokens'    => $prompt,
        'totalCompletionTokens'=> $completion,
        'totalCostUsd'         => (float)number_format($cost, 4, '.', ''),
      ),
      'byModel'    => $byModel,
      'byFeature'  => $byFeature,
      'recent'     => array_slice(array_map(array($this, 'shape_ai_request'), $rows), 0, 100),
      'timeSeries' => $series,
    );
  }

  private function shape_ai_request($r) {
    return array(
      'id'              => $r['id'],
      'modelId'         => $r['model_id'],
      'feature'         => $r['feature'],
      'status'          => $r['status'],
      'durationMs'      => (int)$r['duration_ms'],
      'promptTokens'    => (int)$r['prompt_tokens'],
      'completionTokens'=> (int)$r['completion_tokens'],
      'error'           => $r['error'],
      'createdAt'       => self::iso($r['created_at']),
    );
  }

  /**
   * Real pricing from model_registry when the row carries it, falling back to
   * Node's rough per-1K table, then to Node's own default. Cost is labelled as
   * an estimate everywhere it surfaces.
   */
  private function cost_for($r) {
    $in  = (int)$r['prompt_tokens'];
    $out = (int)$r['completion_tokens'];
    if ($r['cost_input_per_1k'] !== NULL || $r['cost_output_per_1k'] !== NULL) {
      return ($in / 1000) * (float)$r['cost_input_per_1k'] + ($out / 1000) * (float)$r['cost_output_per_1k'];
    }
    $table = array(
      'gpt-4o'          => array(0.005, 0.015),
      'gpt-4'           => array(0.03, 0.06),
      'gpt-3.5-turbo'   => array(0.0005, 0.0015),
      'claude-3-opus'   => array(0.015, 0.075),
      'claude-3-sonnet' => array(0.003, 0.015),
      'claude-3-haiku'  => array(0.00025, 0.00125),
      'windels-assistant'=> array(0, 0),
      'echo'            => array(0, 0),
    );
    $model = strtolower((string)$r['model_id']);
    $price = array(0.002, 0.002);
    foreach ($table as $key => $p) {
      if (strpos($model, $key) !== FALSE) { $price = $p; break; }
    }
    return ($in / 1000) * $price[0] + ($out / 1000) * $price[1];
  }

  private function percentile($sorted, $p) {
    if (!$sorted) return 0;
    $idx = min(count($sorted) - 1, (int)floor(($p / 100) * count($sorted)));
    return (int)$sorted[$idx];
  }

  // ════════════════════════════════════════════════════════ regions / DR

  /** Static catalogue, identical to regions.service.ts. */
  private static $catalog = array(
    array('id' => 'local-dev',      'name' => 'Local Dev',   'city' => 'Enugu',     'country' => 'NG', 'lat' => 6.45,  'lng' => 7.50,    'role' => 'primary', 'rpoSeconds' => 0,   'rtoSeconds' => 15),
    array('id' => 'us-east-1',      'name' => 'N. Virginia', 'city' => 'Ashburn',   'country' => 'US', 'lat' => 39.04, 'lng' => -77.48,  'role' => 'replica', 'rpoSeconds' => 30,  'rtoSeconds' => 60),
    array('id' => 'eu-west-1',      'name' => 'Ireland',     'city' => 'Dublin',    'country' => 'IE', 'lat' => 53.35, 'lng' => -6.26,   'role' => 'replica', 'rpoSeconds' => 60,  'rtoSeconds' => 90),
    array('id' => 'ap-southeast-1', 'name' => 'Singapore',   'city' => 'Singapore', 'country' => 'SG', 'lat' => 1.35,  'lng' => 103.82,  'role' => 'edge',    'rpoSeconds' => 300, 'rtoSeconds' => 300),
    array('id' => 'dr-us-west-2',   'name' => 'DR Oregon',   'city' => 'Hillsboro', 'country' => 'US', 'lat' => 45.52, 'lng' => -122.98, 'role' => 'dr',      'rpoSeconds' => 900, 'rtoSeconds' => 1800),
  );

  public function regions() {
    $failover = $this->failover();
    $out = array();
    foreach (self::$catalog as $r) {
      $status    = $r['id'] === 'local-dev' ? 'active' : 'maintenance';
      $latencyMs = NULL;
      $lastPingAt = NULL;
      if ($r['id'] === 'local-dev') {
        // A live round-trip, not a constant: the primary region is wherever
        // this database is.
        $probe = $this->ping_database();
        $latencyMs  = $probe['latencyMs'];
        $lastPingAt = $probe['latencyMs'] === NULL ? NULL : gmdate('Y-m-d\TH:i:s\Z');
        $status     = $probe['ok'] ? 'active' : 'down';
      }
      if ($failover['active'] && $failover['toRegion'] === $r['id']) $status = 'active';
      elseif ($failover['active'] && $r['role'] === 'primary' && $status !== 'down') $status = 'degraded';
      $out[] = array_merge($r, array('status' => $status, 'latencyMs' => $latencyMs, 'lastPingAt' => $lastPingAt));
    }
    return $out;
  }

  private function ping_database() {
    $t0 = microtime(TRUE);
    try {
      $this->db->query('SELECT 1');
      return array('ok' => TRUE, 'latencyMs' => (int)round((microtime(TRUE) - $t0) * 1000));
    } catch (Throwable $e) {
      return array('ok' => FALSE, 'latencyMs' => NULL);
    }
  }

  public function failover() {
    $r = $this->db->where('state_key', 'failover')->get('platform_state')->row_array();
    $v = $r ? (json_decode($r['value'] ?: '{}', TRUE) ?: array()) : array();
    return array(
      'active'  => (bool)($v['active'] ?? FALSE),
      'toRegion'=> $v['toRegion'] ?? NULL,
      'reason'  => $v['reason'] ?? NULL,
      'since'   => $v['since'] ?? NULL,
    );
  }

  public function set_failover($toRegion, $reason) {
    $target = NULL;
    foreach (self::$catalog as $r) if ($r['id'] === $toRegion) $target = $r;
    if (!$target) return NULL;
    $state = array(
      'active'   => TRUE,
      'toRegion' => $toRegion,
      'reason'   => $reason,
      'since'    => gmdate('Y-m-d\TH:i:s\Z'),
    );
    $this->save_state('failover', $state);
    return $state;
  }

  public function clear_failover() {
    $prev = $this->failover();
    $state = array('active' => FALSE, 'toRegion' => NULL, 'reason' => NULL, 'since' => NULL);
    $this->save_state('failover', $state);
    return array('state' => $state, 'previousRegion' => $prev['toRegion']);
  }

  private function save_state($key, $value) {
    $this->db->replace('platform_state', array(
      'state_key'  => $key,
      'value'      => json_encode($value),
      'updated_at' => date('Y-m-d H:i:s'),
    ));
  }

  public function dr() {
    $regions  = $this->regions();
    $failover = $this->failover();
    $primary  = NULL; $dr = NULL; $replicas = array();
    foreach ($regions as $r) {
      if ($r['role'] === 'primary') $primary = $r;
      if ($r['role'] === 'dr')      $dr = $r;
      if ($r['role'] === 'replica') $replicas[] = array(
        'id' => $r['id'], 'status' => $r['status'],
        'rpoSeconds' => $r['rpoSeconds'], 'rtoSeconds' => $r['rtoSeconds'],
      );
    }
    // No backup subsystem exists in this build, so lastBackupAt stays null: a
    // fabricated timestamp would make RPO look verified when nothing has run.
    return array(
      'status'          => $failover['active'] ? 'failover-active' : ($primary && $primary['status'] === 'active' ? 'healthy' : 'degraded'),
      'primaryRegion'   => $primary['id'] ?? NULL,
      'drRegion'        => $dr['id'] ?? NULL,
      'replicas'        => $replicas,
      'lastBackupAt'    => NULL,
      'backupStatus'    => 'no-recent-backup',
      // Node returns the literal 42 here. A single-database deployment has no
      // replication to measure, so this is null rather than a number that
      // implies a replica is being tracked.
      'replicationLagMs'=> NULL,
      'failover'        => $failover,
    );
  }

  // ══════════════════════════════════════════════════════════════════════ CDN

  public function cdn_config() {
    $enabled  = filter_var(getenv('VP_CDN_ENABLED') ?: FALSE, FILTER_VALIDATE_BOOLEAN);
    $provider = trim((string)getenv('VP_CDN_PROVIDER'));
    $rules    = $this->db->order_by('sort_order', 'ASC')->get('platform_cdn_rules')->result_array();
    $purges   = $this->db->order_by('created_at', 'DESC')->limit(20)->get('platform_cdn_purges')->result_array();
    return array(
      'enabled'      => $enabled,
      // Everything below is null unless a CDN is actually configured: Node
      // returns 42 points of presence, a 0.87 hit rate (labelled "simulated"
      // in its own source) and 12.4 GB of bandwidth as literals.
      'provider'     => $enabled && $provider !== '' ? $provider : NULL,
      'popCount'     => NULL,
      'cacheHitRate' => NULL,
      'bandwidthGb'  => NULL,
      'rules'        => array_map(array($this, 'shape_cdn_rule'), $rules),
      'recentPurges' => array_map(array($this, 'shape_purge'), $purges),
    );
  }

  public function update_cdn_rules($rules) {
    $this->db->empty_table('platform_cdn_rules');
    $out = array();
    $i   = 0;
    foreach ($rules as $r) {
      $i++;
      $row = array(
        'id'                     => $this->uuid(),
        'path_pattern'           => substr((string)$r['pathPattern'], 0, 200),
        'ttl_seconds'            => max(0, min(31536000, (int)$r['ttlSeconds'])),
        'stale_while_revalidate' => max(0, min(86400, (int)($r['staleWhileRevalidate'] ?? 0))),
        'cache_key_includes'     => json_encode(array_values((array)($r['cacheKeyIncludes'] ?? array()))),
        'enabled'                => !empty($r['enabled']) ? 1 : 0,
        'sort_order'             => $i,
        'updated_at'             => date('Y-m-d H:i:s'),
      );
      $this->db->insert('platform_cdn_rules', $row);
      $out[] = $this->shape_cdn_rule($row);
    }
    return $out;
  }

  public function purge($paths, $userId) {
    $enabled = filter_var(getenv('VP_CDN_ENABLED') ?: FALSE, FILTER_VALIDATE_BOOLEAN);
    $id = 'purg_' . bin2hex(random_bytes(8));
    $row = array(
      'id'           => $id,
      'paths'        => json_encode(array_values($paths)),
      'status'       => $enabled ? 'pending' : 'skipped',
      'detail'       => $enabled ? NULL : 'No CDN provider is configured (VP_CDN_ENABLED); the request was recorded but nothing was purged.',
      'requested_by' => $userId,
      'created_at'   => date('Y-m-d H:i:s'),
      'completed_at' => NULL,
    );
    $this->db->insert('platform_cdn_purges', $row);
    // Node waits 150ms and then reports "complete" without contacting a CDN.
    // Here an entry only completes when a provider has actually been called,
    // which nothing does yet — so an enabled provider leaves it pending.
    return $this->shape_purge($row);
  }

  private function shape_cdn_rule($r) {
    return array(
      'id'                    => $r['id'] ?? NULL,
      'pathPattern'           => $r['path_pattern'],
      'ttlSeconds'            => (int)$r['ttl_seconds'],
      'staleWhileRevalidate'  => (int)$r['stale_while_revalidate'],
      'cacheKeyIncludes'      => json_decode($r['cache_key_includes'] ?: '[]', TRUE) ?: array(),
      'enabled'               => (bool)$r['enabled'],
    );
  }

  private function shape_purge($r) {
    return array(
      'id'          => $r['id'],
      'paths'       => json_decode($r['paths'] ?: '[]', TRUE) ?: array(),
      'status'      => $r['status'],
      'detail'      => $r['detail'] ?? NULL,
      'createdAt'   => self::iso($r['created_at']),
      'completedAt' => self::iso($r['completed_at']),
    );
  }

  /**
   * HMAC-signed URL, same construction as cdn.service.ts: `cdn_exp` is added
   * first, the signature covers path+query, then `cdn_sig` is appended. This is
   * a real signature over VP_AUTH_SECRET — verifiable, not decorative.
   */
  public function sign_url($url, $ttlSeconds = 3600) {
    $ttl = max(60, min(7 * 86400, (int)$ttlSeconds));
    $exp = time() + $ttl;
    $path = parse_url($url, PHP_URL_PATH) ?: '/';
    $query = parse_url($url, PHP_URL_QUERY);
    $pairs = array();
    if ($query) {
      foreach (explode('&', $query) as $kv) {
        if ($kv === '') continue;
        $parts = explode('=', $kv, 2);
        $key = $parts[0];
        if ($key === 'cdn_sig' || $key === 'cdn_exp') continue; // strip any existing signature
        $pairs[$key] = $parts[1] ?? '';
      }
    }
    $pairs['cdn_exp'] = (string)$exp;
    $search = '';
    foreach ($pairs as $k => $v) $search .= ($search === '' ? '?' : '&') . rawurlencode($k) . '=' . rawurlencode($v);
    $sig = substr(hash_hmac('sha256', $path . $search, $this->secret()), 0, 32);
    $search .= '&cdn_sig=' . $sig;
    return array(
      'signedUrl' => $path . $search,
      'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $exp),
    );
  }

  private function secret() {
    $s = getenv('VP_AUTH_SECRET');
    if (!$s || strlen($s) < 32) $s = 'development-only-secret-change-me-now';
    return $s;
  }

  private function uuid() {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 15) | 64);
    $b[8] = chr((ord($b[8]) & 63) | 128);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
  }
}
