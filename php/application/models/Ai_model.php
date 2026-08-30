<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * AI model registry + telemetry — PHP port of the parts of
 * apps/api/src/services/ai/registry.ts and aiMonitoring.service.ts that the
 * /api/v1/ai/* endpoints need.
 *
 * Node keeps provider state in memory (registered at boot, health swept every
 * 30s by a timer). PHP has no long-lived process, so provider state is derived
 * from .env on every request and health is measured on demand by
 * /api/v1/ai/test-providers.
 */
class Ai_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  /**
   * Models routable for this organisation: rows from model_registry (global
   * rows plus this organisation's own) merged with the models implied by the
   * providers configured in .env.
   */
  public function list_models($organizationId, $providers) {
    $configured = array();
    foreach ($providers as $p) { if (!empty($p['configured'])) $configured[$p['id']] = $p; }

    $out = array();
    $rows = $this->db->query(
      "SELECT model_id, provider, name, version, capabilities, context_window, max_output_tokens,
              cost_input_per_1k, cost_output_per_1k, is_default, enabled
         FROM model_registry
        WHERE enabled = 1 AND (organization_id IS NULL OR organization_id = ?)
        ORDER BY organization_id IS NULL ASC, name ASC",
      array($organizationId)
    )->result_array();

    foreach ($rows as $r) {
      $caps = json_decode($r['capabilities'], TRUE);
      $out[] = array(
        'id'              => $r['model_id'],
        'provider'        => $r['provider'],
        'displayName'     => $r['name'],
        'version'         => $r['version'],
        'contextWindow'   => (int)$r['context_window'],
        'maxOutput'       => (int)$r['max_output_tokens'],
        'capabilities'    => is_array($caps) ? $caps : array(),
        'costInputPer1k'  => (float)$r['cost_input_per_1k'],
        'costOutputPer1k' => (float)$r['cost_output_per_1k'],
        'isDefault'       => (bool)$r['is_default'],
        'source'          => 'registry',
        'configured'      => isset($configured[$r['provider']]),
        'healthy'         => NULL, // measured by /ai/test-providers
      );
    }

    // Providers configured in .env but absent from the registry still need to
    // be selectable, so they are listed from the provider descriptor.
    $seen = array();
    foreach ($out as $m) $seen[$m['provider'] . '/' . $m['id']] = TRUE;
    foreach ($configured as $id => $p) {
      if ($p['id'] === 'echo') continue;
      $key = $p['id'] . '/' . $p['model'];
      if (isset($seen[$key])) continue;
      $out[] = array(
        'id'              => $p['model'],
        'provider'        => $p['id'],
        'displayName'     => $p['displayName'] . ' — ' . $p['model'],
        'version'         => '1.0',
        'contextWindow'   => 128000,
        'maxOutput'       => 4096,
        'capabilities'    => array('chat'),
        'costInputPer1k'  => 0.0,
        'costOutputPer1k' => 0.0,
        'isDefault'       => FALSE,
        'source'          => 'env',
        'configured'      => TRUE,
        'healthy'         => NULL,
      );
    }

    // The demo assistant last, and only when it is actually available.
    foreach ($providers as $p) {
      if ($p['id'] !== 'echo' || empty($p['configured'])) continue;
      $out[] = array(
        'id' => 'windels-echo-demo', 'provider' => 'echo', 'displayName' => 'Windels Echo (demo)',
        'version' => '1.0', 'contextWindow' => 8192, 'maxOutput' => 1024,
        'capabilities' => array('chat'), 'costInputPer1k' => 0.0, 'costOutputPer1k' => 0.0,
        'isDefault' => FALSE, 'source' => 'echo-demo', 'configured' => TRUE, 'healthy' => TRUE,
      );
    }
    return $out;
  }

  /** Aggregate AI telemetry for an organisation over the last N days. */
  public function usage($organizationId, $periodDays = 30) {
    $periodDays = max(1, min(365, (int)$periodDays));
    $since      = date('Y-m-d H:i:s', time() - ($periodDays * 86400));

    $totals = $this->db->query(
      "SELECT COUNT(*) AS requests,
              SUM(status = 'succeeded') AS succeeded,
              SUM(status = 'failed')    AS failed,
              COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(AVG(duration_ms), 0)       AS avg_duration_ms
         FROM ai_requests
        WHERE organization_id = ? AND created_at >= ?",
      array($organizationId, $since)
    )->row_array();

    $byModel = $this->db->query(
      "SELECT model_id, provider, COUNT(*) AS requests,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
         FROM ai_requests
        WHERE organization_id = ? AND created_at >= ?
        GROUP BY model_id, provider
        ORDER BY requests DESC, model_id ASC",
      array($organizationId, $since)
    )->result_array();

    $byDay = $this->db->query(
      "SELECT DATE(created_at) AS day, COUNT(*) AS requests,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens
         FROM ai_requests
        WHERE organization_id = ? AND created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY day ASC",
      array($organizationId, $since)
    )->result_array();

    $byChannel = $this->db->query(
      "SELECT channel, COUNT(*) AS requests
         FROM ai_requests
        WHERE organization_id = ? AND created_at >= ?
        GROUP BY channel
        ORDER BY requests DESC, channel ASC",
      array($organizationId, $since)
    )->result_array();

    $recent = $this->db->query(
      "SELECT id, channel, provider, model_id, duration_ms, prompt_tokens, completion_tokens,
              status, error, feature, created_at
         FROM ai_requests
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 20",
      array($organizationId)
    )->result_array();

    foreach ($byChannel as $i => $r) $byChannel[$i]['requests'] = (int)$r['requests'];

    // Cost is only knowable for requests whose model is in the registry.
    $costRows = $this->db->query(
      "SELECT r.prompt_tokens AS pt, r.completion_tokens AS ct,
              m.cost_input_per_1k AS cin, m.cost_output_per_1k AS cout
         FROM ai_requests r
         JOIN model_registry m ON m.id = r.model_registry_id
        WHERE r.organization_id = ? AND r.created_at >= ?",
      array($organizationId, $since)
    )->result_array();
    $totalCost = 0.0;
    foreach ($costRows as $r) {
      $totalCost += ((int)$r['pt'] / 1000) * (float)$r['cin'] + ((int)$r['ct'] / 1000) * (float)$r['cout'];
    }

    $requests  = (int)($totals['requests'] ?? 0);
    $succeeded = (int)($totals['succeeded'] ?? 0);

    $shapedByModel = array();
    foreach ($byModel as $r) {
      $shapedByModel[] = array(
        'modelId'          => $r['model_id'],
        'count'            => (int)$r['requests'],
        'avgDurationMs'    => (int)round((float)$r['avg_duration_ms']),
        'promptTokens'     => (int)$r['prompt_tokens'],
        'completionTokens' => (int)$r['completion_tokens'],
      );
    }

    $shapedRecent = array();
    foreach ($recent as $r) {
      $shapedRecent[] = array(
        'id'               => $r['id'],
        'channel'          => $r['channel'],
        'provider'         => $r['provider'],
        'modelId'          => $r['model_id'],
        'durationMs'       => (int)$r['duration_ms'],
        'promptTokens'     => (int)$r['prompt_tokens'],
        'completionTokens' => (int)$r['completion_tokens'],
        'status'           => $r['status'],
        'error'            => $r['error'],
        'feature'          => $r['feature'],
        'createdAt'        => gmdate('Y-m-d\TH:i:s\Z', strtotime($r['created_at'])),
      );
    }

    return array(
      'periodDays' => $periodDays,
      'since'      => gmdate('Y-m-d\TH:i:s\Z', strtotime($since)),
      'totals'     => array(
        'requests'             => $requests,
        'succeeded'            => $succeeded,
        'failed'               => (int)($totals['failed'] ?? 0),
        'avgLatency'           => (int)round((float)($totals['avg_duration_ms'] ?? 0)),
        'totalCost'            => round($totalCost, 6),
        'totalPromptTokens'    => (int)($totals['prompt_tokens'] ?? 0),
        'totalCompletionTokens' => (int)($totals['completion_tokens'] ?? 0),
        'successRate'          => $requests ? round(($succeeded / $requests) * 1000) / 10 : 0,
      ),
      'byModel'   => $shapedByModel,
      'byChannel' => $byChannel,
      'recent'    => $shapedRecent,
    );
  }

  /**
   * Record one AI request. Telemetry only — a failure to record must never
   * fail the request that produced it.
   */
  public function record($row) {
    try {
      $this->db->insert('ai_requests', array(
        'id'                => $this->uuid(),
        'organization_id'   => $row['organizationId'],
        'user_id'           => $row['userId'] ?? NULL,
        'agent_id'          => $row['agentId'] ?? NULL,
        'conversation_id'   => $row['conversationId'] ?? NULL,
        'workflow_run_id'   => $row['workflowRunId'] ?? NULL,
        'channel'           => $row['channel'] ?? 'api',
        'provider'          => substr((string)$row['provider'], 0, 40),
        'model_id'          => substr((string)$row['modelId'], 0, 100),
        'model_registry_id' => $row['modelRegistryId'] ?? NULL,
        'feature'           => isset($row['feature']) ? substr((string)$row['feature'], 0, 100) : NULL,
        'duration_ms'       => max(0, (int)($row['durationMs'] ?? 0)),
        'prompt_tokens'     => max(0, (int)($row['promptTokens'] ?? 0)),
        'completion_tokens' => max(0, (int)($row['completionTokens'] ?? 0)),
        'status'            => ($row['status'] ?? 'succeeded') === 'failed' ? 'failed' : 'succeeded',
        'error'             => $row['error'] ?? NULL,
        'created_at'        => date('Y-m-d H:i:s'),
      ));
    } catch (Throwable $e) {
      log_message('error', '[ai] telemetry insert failed: ' . $e->getMessage());
    }
    return TRUE;
  }

  /** Default registered model, used to resolve cost rows. */
  public function registry_row($organizationId, $provider, $modelId) {
    if (!$organizationId) return NULL;
    return $this->db->query(
      "SELECT id FROM model_registry
        WHERE provider = ? AND model_id = ? AND (organization_id IS NULL OR organization_id = ?)
        ORDER BY organization_id DESC LIMIT 1",
      array($provider, $modelId, $organizationId)
    )->row_array();
  }

  private function uuid() {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 15) | 64);
    $b[8] = chr((ord($b[8]) & 63) | 128);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
  }
}
