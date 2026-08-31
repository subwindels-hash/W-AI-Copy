<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Memory_evolution_model — the enterprise memory register.
 *
 * Ports apps/api/src/memoryEvolution/memoryEvolution.service.ts onto MySQL.
 * Node kept memories in `me:mem:<id>` hashes behind a global `me:mems` sorted
 * set, with `me:type:<t>` / `me:scope:<s>` sets as indexes and three `me:m:*`
 * counters. Here that is three tables scoped by organization_id — see
 * migration 009 for why the scoping differs from Node's global keys.
 *
 * The behaviour that IS carried over unchanged is the point of the module:
 *
 *   * strength decays 1% per day since the memory was last accessed;
 *   * recall recomputes that decay and re-stamps the access before deciding;
 *   * a memory whose strength has fallen below 0.2 is not surfaced (the
 *     "intelligent forgetting" cut-off), and an `age` consolidation deletes
 *     one that is both below 0.05 strength and below 0.5 confidence;
 *   * adding the same content again inside the same scope is a deduplication,
 *     not a second row: the existing memory's access count and confidence go
 *     up instead;
 *   * no seed data. Node's nine sample memories were opt-in behind
 *     `demoDataEnabled()`, so production starts empty and so does this.
 */
class Memory_evolution_model extends CI_Model {

  /** The nine memory types, mirroring MeMemoryType in packages/shared. */
  public static $TYPES = array('episodic', 'semantic', 'procedural', 'organizational', 'department', 'project', 'user', 'team', 'knowledge');

  public static $KINDS = array('merge', 'deduplicate', 'refine', 'age', 'forget');

  /** Node: DECAY_PER_DAY — strength falls 1% for every day since last access. */
  const DECAY_PER_DAY = 0.01;
  /** Node: recall stops surfacing a memory whose strength is below this. */
  const RECALL_FLOOR = 0.2;
  /** Node: an `age` pass forgets a memory below BOTH of these. */
  const FORGET_STRENGTH = 0.05;
  const FORGET_CONFIDENCE = 0.5;
  const DEFAULT_SCOPE = 'enterprise:windels';
  const DEFAULT_CONFIDENCE = 0.8;

  public function __construct() { parent::__construct(); $this->load->database(); }

  /** Node's uid(): `mem-` or `cj-` plus 8 hex characters. */
  public function uid($prefix) { return $prefix . substr(bin2hex(random_bytes(4)), 0, 8); }

  private function iso($value) { return $value ? gmdate('c', strtotime($value)) : NULL; }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  public function public_memory($row) {
    if (!$row) return NULL;
    $tags = json_decode($row['tags'], TRUE);
    return array(
      'id'              => $row['id'],
      'type'            => $row['type'],
      'content'         => $row['content'],
      'confidence'      => (float) $row['confidence'],
      'accessCount'     => (int) $row['access_count'],
      'lastAccessedAt'  => $this->iso($row['last_accessed_at']),
      'createdAt'       => $this->iso($row['created_at']),
      'decayedStrength' => (float) $row['decayed_strength'],
      'tags'            => is_array($tags) ? array_values($tags) : array(),
      'scope'           => $row['scope'],
    );
  }

  public function public_job($row) {
    if (!$row) return NULL;
    return array(
      'id'          => $row['id'],
      'kind'        => $row['kind'],
      'processedAt' => $this->iso($row['processed_at']),
      'affected'    => (int) $row['affected'],
    );
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private function memory_row($org, $id) {
    return $this->db->where(array('id' => $id, 'organization_id' => $org))->get('memory_evolution_memories')->row_array();
  }

  /** Node: max(0, 1 - days * 0.01) measured from the last access. */
  private function strength($row, $now = NULL) {
    $now = $now ?: time();
    $days = ($now - strtotime($row['last_accessed_at'])) / 86400;
    return max(0, 1 - $days * self::DECAY_PER_DAY);
  }

  /**
   * Recall. The pool is narrowed by type, else by scope, else everything —
   * newest first, where Node's set-backed pools were unordered.
   *
   * Every candidate is aged and re-stamped as it is examined, exactly as Node
   * does, including the ones that are then filtered out: the cut-off and the
   * query filter decide what is *surfaced*, not what was touched.
   */
  public function recall($org, $filter = array()) {
    $limit = isset($filter['limit']) ? (int) $filter['limit'] : 20;
    if ($limit < 1) $limit = 20;
    $now = time();
    $stamp = date('Y-m-d H:i:s', $now);

    $this->db->where('organization_id', $org);
    if (!empty($filter['type'])) $this->db->where('type', $filter['type']);
    if (!empty($filter['scope'])) $this->db->where('scope', $filter['scope']);
    $rows = $this->db->order_by('seq', 'DESC')->get('memory_evolution_memories')->result_array();

    $needle = isset($filter['query']) && $filter['query'] !== '' ? strtolower($filter['query']) : NULL;
    $out = array();
    foreach ($rows as $row) {
      $strength = $this->strength($row, $now);
      $this->db->where('id', $row['id'])->update('memory_evolution_memories', array(
        'decayed_strength' => $strength,
        'last_accessed_at' => $stamp,
        'access_count'     => ((int) $row['access_count']) + 1,
      ));
      if ($strength < self::RECALL_FLOOR) continue;
      if ($needle !== NULL && strpos(strtolower($row['content']), $needle) === FALSE) continue;
      $row['decayed_strength']  = $strength;
      $row['last_accessed_at']  = $stamp;
      $row['access_count']      = ((int) $row['access_count']) + 1;
      $out[] = $this->public_memory($row);
      if (count($out) >= $limit) break;
    }
    return $out;
  }

  public function list_memories($org, $filter = array()) {
    $this->db->where('organization_id', $org);
    if (!empty($filter['type'])) $this->db->where('type', $filter['type']);
    if (!empty($filter['scope'])) $this->db->where('scope', $filter['scope']);
    $rows = $this->db->order_by('seq', 'DESC')->get('memory_evolution_memories')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_memory($row);
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Store a memory. Identical content inside the same scope is a
   * deduplication, not a new row — the existing memory is strengthened
   * instead, which is what makes repeated experience raise confidence.
   */
  public function add($org, $input) {
    $now = date('Y-m-d H:i:s');
    $scope = isset($input['scope']) && $input['scope'] !== '' ? $input['scope'] : self::DEFAULT_SCOPE;

    $existing = $this->db->where(array('organization_id' => $org, 'scope' => $scope, 'content' => $input['content']))
                         ->order_by('seq', 'ASC')->limit(1)->get('memory_evolution_memories')->row_array();
    if ($existing) {
      $confidence = min(1, (float) $existing['confidence'] + 0.02);
      $this->db->where('id', $existing['id'])->update('memory_evolution_memories', array(
        'access_count'     => ((int) $existing['access_count']) + 1,
        'last_accessed_at' => $now,
        'confidence'       => $confidence,
      ));
      $this->bump($org, 'duplicates_merged', 1);
      $existing['access_count']     = ((int) $existing['access_count']) + 1;
      $existing['last_accessed_at'] = $now;
      $existing['confidence']       = $confidence;
      return $this->public_memory($existing);
    }

    $row = array(
      'id'               => $this->uid('mem-'),
      'organization_id'  => $org,
      'type'             => $input['type'],
      'content'          => $input['content'],
      'confidence'       => array_key_exists('confidence', $input) ? (float) $input['confidence'] : self::DEFAULT_CONFIDENCE,
      'access_count'     => 1,
      'last_accessed_at' => $now,
      'created_at'       => $now,
      'decayed_strength' => 1,
      'tags'             => json_encode(array_values(isset($input['tags']) ? $input['tags'] : array())),
      'scope'            => $scope,
    );
    $this->db->insert('memory_evolution_memories', $row);
    return $this->public_memory($this->memory_row($org, $row['id']));
  }

  /**
   * A consolidation pass. `age` recomputes strength and forgets what is both
   * decayed and low-confidence; `deduplicate` merges rows that share a scope
   * and the first 60 characters of content; the other kinds are Node's
   * no-op-with-a-count (they report how many memories were considered).
   */
  public function consolidate($org, $kind) {
    $now = time();
    $stamp = date('Y-m-d H:i:s', $now);
    $affected = 0;

    // Node walks the register oldest first; merges and forgets need that order.
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'ASC')->get('memory_evolution_memories')->result_array();

    if ($kind === 'age') {
      foreach ($rows as $row) {
        $strength = $this->strength($row, $now);
        if ($strength < self::FORGET_STRENGTH && (float) $row['confidence'] < self::FORGET_CONFIDENCE) {
          $this->db->where('id', $row['id'])->delete('memory_evolution_memories');
          $this->bump($org, 'memories_forgotten', 1);
          $affected++;
          continue;
        }
        $this->db->where('id', $row['id'])->update('memory_evolution_memories', array('decayed_strength' => $strength));
      }
    } elseif ($kind === 'deduplicate') {
      $seen = array();
      foreach ($rows as $row) {
        if (!$this->memory_row($org, $row['id'])) continue; // already merged away
        $key = $row['scope'] . ':' . substr($row['content'], 0, 60);
        if (isset($seen[$key])) {
          $first = $this->memory_row($org, $seen[$key]);
          if ($first) {
            $this->db->where('id', $first['id'])->update('memory_evolution_memories', array(
              'confidence'   => min(1, (float) $first['confidence'] + 0.05),
              'access_count' => ((int) $first['access_count']) + ((int) $row['access_count']),
            ));
          }
          $this->db->where('id', $row['id'])->delete('memory_evolution_memories');
          $this->bump($org, 'duplicates_merged', 1);
          $affected++;
        } else {
          $seen[$key] = $row['id'];
        }
      }
    } else {
      // merge / refine / forget: Node counts the register and touches nothing.
      $affected = count($rows);
    }

    $job = array(
      'id'              => $this->uid('cj-'),
      'organization_id' => $org,
      'kind'            => $kind,
      'processed_at'    => $stamp,
      'affected'        => $affected,
    );
    $this->db->insert('memory_evolution_jobs', $job);
    return $this->public_job($job);
  }

  public function list_consolidations($org, $limit = 50) {
    $limit = max(1, min(200, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)->get('memory_evolution_jobs')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_job($row);
    return $out;
  }

  /**
   * Cross-agent sharing. Node increments the counter and emits the event
   * without checking that the memory exists; this keeps that contract rather
   * than inventing a 404 the client is not written to handle.
   */
  public function share($org, $memoryId, $agentId) {
    $this->bump($org, 'cross_agent_shares', 1);
    return array('ok' => TRUE, 'sharedWith' => $agentId);
  }

  // ---------------------------------------------------------------------------
  // Counters
  // ---------------------------------------------------------------------------

  private function bump($org, $column, $by) {
    $this->metrics_row($org);
    $this->db->where('organization_id', $org)->set($column, "$column + " . (int) $by, FALSE)
             ->set('updated_at', date('Y-m-d H:i:s'))->update('memory_evolution_metrics');
  }

  private function metrics_row($org) {
    $row = $this->db->where('organization_id', $org)->get('memory_evolution_metrics')->row_array();
    if ($row) return $row;
    $now = date('Y-m-d H:i:s');
    $this->db->insert('memory_evolution_metrics', array(
      'organization_id' => $org, 'duplicates_merged' => 0, 'memories_forgotten' => 0,
      'cross_agent_shares' => 0, 'updated_at' => $now,
    ));
    return $this->db->where('organization_id', $org)->get('memory_evolution_metrics')->row_array();
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  public function dashboard($org) {
    $by_type = array();
    foreach (self::$TYPES as $type) $by_type[$type] = 0;

    $rows = $this->db->where('organization_id', $org)->get('memory_evolution_memories')->result_array();
    $confidence = 0;
    foreach ($rows as $row) {
      if (isset($by_type[$row['type']])) $by_type[$row['type']]++;
      $confidence += (float) $row['confidence'];
    }
    $total  = count($rows);
    $metrics = $this->metrics_row($org);
    $jobs = (int) $this->db->where('organization_id', $org)->count_all_results('memory_evolution_jobs');

    return array(
      // Node: Math.round((conf / n) * 100) / 100
      'memoriesByType'             => $by_type,
      'total'                      => $total,
      'avgConfidence'              => $total ? round($confidence / $total, 2) : 0,
      'consolidationJobs24h'       => $jobs,
      'duplicatesMerged'           => (int) $metrics['duplicates_merged'],
      'memoriesForgotten'          => (int) $metrics['memories_forgotten'],
      'crossAgentShares'           => (int) $metrics['cross_agent_shares'],
      'agingActive'                => TRUE,
      'intelligentForgettingActive' => TRUE,
      'extendsS37Fabric'           => TRUE,
    );
  }
}
