<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Enterprise AI Kernel — MySQL port of apps/api/src/kernel/kernel.service.ts.
 *
 * The Node service keeps kernel state in Redis (hashes, a sorted set of events,
 * INCR counters and an LTRIM'd latency list). This port keeps the same shape in
 * MySQL via kernel_components / kernel_events / kernel_counters /
 * kernel_latencies / kernel_state.
 *
 * See application/migrations/002_kernel_module.sql for the two places this
 * deliberately diverges from Node (true rolling 24h counters, 200-sample
 * latency window) — both are fixes, not drift.
 */
class Kernel_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  const START_KEY   = 'kernel:start';
  const EVENT_CAP   = 500;  // Node: ZREMRANGEBYRANK events 0 -501
  const LATENCY_CAP = 200;  // Node: LTRIM latencies 0 199

  // ---------------------------------------------------------------- bootstrap

  /**
   * Record the kernel start time the first time the kernel is touched.
   * The 20 default components themselves are seeded by SQL
   * (application/migrations/002_kernel_module.sql, mirrored in production.sql)
   * rather than on first request, so a fresh install is never half-seeded if
   * the first request is interrupted.
   * Returns TRUE only when this call performed the bootstrap.
   */
  public function ensure_started() {
    $row = $this->db->get_where('kernel_state', array('state_key' => self::START_KEY), 1)->row_array();
    if ($row) return FALSE;
    $now = date('Y-m-d H:i:s');
    $this->db->query(
      "INSERT IGNORE INTO kernel_state (state_key, state_value, updated_at) VALUES (?, ?, ?)",
      array(self::START_KEY, $now, $now)
    );
    return TRUE;
  }

  /** ISO-8601 timestamp the kernel was first started, or NULL. */
  public function started_at() {
    $row = $this->db->get_where('kernel_state', array('state_key' => self::START_KEY), 1)->row_array();
    return $row ? $row['state_value'] : NULL;
  }

  public function uptime_seconds() {
    $started = $this->started_at();
    if (!$started) return 0;
    $ts = strtotime($started);
    return $ts ? max(0, time() - $ts) : 0;
  }

  // --------------------------------------------------------------- components

  /** @return array<int,array> Node orders by score then key; every score is 0. */
  public function components() {
    $rows = $this->db->order_by('component_key', 'ASC')->get('kernel_components')->result_array();
    $out = array();
    foreach ($rows as $r) {
      $out[] = array(
        'key'           => $r['component_key'],
        'name'          => $r['name'],
        'status'        => $r['status'],
        'messageRate'   => (int)$r['message_rate'],
        'errorRate'     => (float)$r['error_rate'],
        'lastHeartbeat' => $this->iso($r['last_heartbeat']),
      );
    }
    return $out;
  }

  /**
   * Record a component heartbeat. A component reporting more than 10% errors
   * is marked degraded, exactly as in Node. Returns FALSE for an unknown key.
   */
  public function heartbeat($key, $messageRate = 0, $errorRate = 0) {
    $row = $this->db->get_where('kernel_components', array('component_key' => $key), 1)->row_array();
    if (!$row) return FALSE;
    $errorRate   = (float)$errorRate;
    $status      = $errorRate > 0.1 ? 'degraded' : 'online';
    if ($row['status'] === 'stub') $status = 'stub'; // stubs stay stubs until implemented
    $now = date('Y-m-d H:i:s');
    $this->db->where('component_key', $key)->update('kernel_components', array(
      'message_rate'   => (int)$messageRate,
      'error_rate'     => $errorRate,
      'status'         => $status,
      'last_heartbeat' => $now,
      'updated_at'     => $now,
    ));
    return TRUE;
  }

  /** Set a component's status directly — used by diagnostics/self-healing. */
  public function set_status($key, $status) {
    $now = date('Y-m-d H:i:s');
    $this->db->where('component_key', $key)->update('kernel_components', array(
      'status' => $status, 'updated_at' => $now,
    ));
    return $this->db->affected_rows() > 0;
  }

  // ------------------------------------------------------------------- events

  /**
   * Dispatch a kernel event. $event is kind/source/target/payload; id and
   * timestamp are assigned here, matching KernelService.dispatch().
   */
  public function dispatch($event, $organizationId = NULL, $userId = NULL) {
    $started = microtime(TRUE);
    $id      = 'ke-' . bin2hex(random_bytes(4));
    $now     = date('Y-m-d H:i:s');
    $payload = isset($event['payload']) && is_array($event['payload']) ? $event['payload'] : new stdClass();

    $this->db->insert('kernel_events', array(
      'id'              => $id,
      'kind'            => substr((string)$event['kind'], 0, 80),
      'source'          => substr((string)$event['source'], 0, 120),
      'target'          => isset($event['target']) ? substr((string)$event['target'], 0, 120) : NULL,
      'payload'         => json_encode($payload),
      'organization_id' => $organizationId,
      'user_id'         => $userId,
      'created_at'      => $now,
    ));

    $this->hit('events');
    $this->record_latency((int)round((microtime(TRUE) - $started) * 1000));
    $this->prune_events();

    return array(
      'id'      => $id,
      'kind'    => $event['kind'],
      'source'  => $event['source'],
      'target'  => isset($event['target']) ? $event['target'] : NULL,
      'payload' => $payload,
      'at'      => $this->iso($now),
    );
  }

  /** Newest first, capped at $limit (Node default 100). */
  public function events($limit = 100) {
    $limit = max(1, min(500, (int)$limit));
    $rows  = $this->db->order_by('created_at', 'DESC')->order_by('id', 'DESC')->limit($limit)->get('kernel_events')->result_array();
    $out   = array();
    foreach ($rows as $r) {
      $payload = json_decode($r['payload'], TRUE);
      $out[] = array(
        'id'      => $r['id'],
        'kind'    => $r['kind'],
        'source'  => $r['source'],
        'target'  => $r['target'],
        'payload' => is_array($payload) ? $payload : new stdClass(),
        'at'      => $this->iso($r['created_at']),
      );
    }
    return $out;
  }

  private function prune_events() {
    $total = (int)$this->db->count_all('kernel_events');
    if ($total <= self::EVENT_CAP) return;
    $drop = $total - self::EVENT_CAP;
    $this->db->query("DELETE FROM kernel_events ORDER BY created_at ASC, id ASC LIMIT " . $drop);
  }

  // ----------------------------------------------------------------- counters

  public function hit($counterKey) {
    $this->db->insert('kernel_counters', array(
      'counter_key' => substr((string)$counterKey, 0, 40),
      'created_at'  => date('Y-m-d H:i:s'),
    ));
    $this->prune_counters();
    return TRUE;
  }

  /** Rolling 24h total — what Node's `...24` counters claimed to return. */
  public function count_24h($counterKey) {
    $row = $this->db->query(
      "SELECT COUNT(*) AS n FROM kernel_counters WHERE counter_key = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)",
      array($counterKey)
    )->row_array();
    return (int)($row['n'] ?? 0);
  }

  private function prune_counters() {
    // 7 days of history is 7x the widest window anyone queries.
    $this->db->query("DELETE FROM kernel_counters WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
  }

  // ---------------------------------------------------------------- latencies

  public function record_latency($ms) {
    $this->db->insert('kernel_latencies', array(
      'latency_ms' => max(0, (int)$ms),
      'created_at' => date('Y-m-d H:i:s'),
    ));
    $this->prune_latencies();
    return TRUE;
  }

  /** Mean of the newest 200 samples; Node falls back to 5 when empty. */
  public function average_latency() {
    $rows = $this->db->order_by('id', 'DESC')->limit(self::LATENCY_CAP)->get('kernel_latencies')->result_array();
    $vals = array();
    foreach ($rows as $r) { if ((int)$r['latency_ms'] > 0) $vals[] = (int)$r['latency_ms']; }
    return $vals ? (int)round(array_sum($vals) / count($vals)) : 5;
  }

  private function prune_latencies() {
    $total = (int)$this->db->count_all('kernel_latencies');
    if ($total <= self::LATENCY_CAP) return;
    $drop = $total - self::LATENCY_CAP;
    $this->db->query("DELETE FROM kernel_latencies ORDER BY id ASC LIMIT " . $drop);
  }

  // ------------------------------------------------------------- kernel logic

  /** Node's MVP policy: allow unless high-risk without an approval. */
  public function evaluate_policy($input) {
    $this->hit('policy');
    $risk     = is_array($input) ? ($input['risk'] ?? NULL) : NULL;
    $approved = is_array($input) ? !empty($input['approved']) : FALSE;
    if ($risk === 'high' && !$approved) {
      $this->hit('block');
      return array(
        'allowed'           => FALSE,
        'reason'            => 'high-risk requires approval',
        'requiredApprovals' => array('org-admin', 'risk-officer'),
      );
    }
    return array('allowed' => TRUE, 'requiredApprovals' => array());
  }

  /** Resource grant is a pure function of priority, as in Node. */
  public function grant_resources($priority, $gpuCards = NULL) {
    $interactive = ($priority !== 'batch');
    return array(
      'cpuMillicores' => $interactive ? 2000 : 500,
      'memoryMb'      => $interactive ? 4096 : 1024,
      'gpuCards'      => $gpuCards === NULL ? 0 : max(0, (int)$gpuCards),
      'ttlSeconds'    => $interactive ? 60 : 600,
    );
  }

  /**
   * Model selection. Node hardcodes `mdl-windels-core-v2-210`; this port
   * prefers the organisation's default registered model, then VP_OPENAI_MODEL,
   * and only then falls back to the Node constant, so an operator who registers
   * a model in the model registry actually gets it selected.
   */
  public function select_model($task = 'chat', $organizationId = NULL) {
    $this->hit('modelsel');
    if ($organizationId) {
      $row = $this->db->query(
        "SELECT model_id FROM model_registry
         WHERE enabled = 1 AND (organization_id = ? OR organization_id IS NULL)
         ORDER BY organization_id DESC, is_default DESC, id ASC LIMIT 1",
        array($organizationId)
      )->row_array();
      if ($row && $row['model_id']) {
        return array('modelId' => $row['model_id'], 'via' => 'kernel.model-select.model-registry-default');
      }
    }
    $env = getenv('VP_OPENAI_MODEL');
    if ($env) return array('modelId' => $env, 'via' => 'kernel.model-select.env');
    return array('modelId' => 'mdl-windels-core-v2-210', 'via' => 'kernel.model-select.local-preferred');
  }

  /**
   * Diagnostics + MVP self-healing: report degraded/offline components, then
   * restore every non-stub one to online. Mirrors Node, including the fact
   * that `stub` components are never healed.
   */
  public function run_diagnostics() {
    $rows     = $this->db->get('kernel_components')->result_array();
    $degraded = array();
    foreach ($rows as $r) {
      if ($r['status'] === 'degraded' || $r['status'] === 'offline') $degraded[] = $r['name'];
    }
    if ($degraded) {
      $this->hit('selfheal');
      foreach ($rows as $r) {
        if ($r['status'] !== 'stub' && ($r['status'] === 'offline' || $r['status'] === 'degraded')) {
          $this->set_status($r['component_key'], 'online');
        }
      }
    }
    return array('healthy' => count($degraded) === 0, 'degraded' => $degraded);
  }

  public function summary() {
    return array(
      'components'            => $this->components(),
      'events24h'             => $this->count_24h('events'),
      'avgDispatchLatencyMs'  => $this->average_latency(),
      'policiesEvaluated24h'  => $this->count_24h('policy'),
      'policiesBlocked24h'    => $this->count_24h('block'),
      'uptimeSeconds'         => $this->uptime_seconds(),
      'selfHealed24h'         => $this->count_24h('selfheal'),
      'modelSelections24h'    => $this->count_24h('modelsel'),
    );
  }

  // ------------------------------------------------------------------ helpers

  private function iso($mysqlDatetime) {
    $ts = strtotime((string)$mysqlDatetime);
    return $ts ? gmdate('Y-m-d\TH:i:s\Z', $ts) : NULL;
  }
}
