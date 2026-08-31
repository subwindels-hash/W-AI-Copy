<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Benchmarks_model — the Enterprise AI Benchmark Center result registry.
 *
 * Ports apps/api/src/benchmarks/benchmarks.service.ts onto MySQL. Node kept
 * runs in `bm:run:<org>:<id>` hashes behind a `bm:runs:<org>` sorted set, a
 * `bm:area:<org>` zset holding the last score per area, and a `bm:m:<org>`
 * counter hash; the notes ledger lived in the shared tenantStore.
 *
 * Two pieces of that state are DERIVED here rather than copied:
 *
 *   * the per-area score, because a zset overwritten on every run is just
 *     "the newest score for that area" — a fourth table would only be a cache
 *     of these rows with a chance of disagreeing with them;
 *   * the optimizedModels / pendingRecommendations counters, because
 *     `hincrby` per run is an exact count of runs above and below the same
 *     80-point threshold.
 *
 * What is deliberately NOT here: anything that produces a score. An earlier
 * version of the Node service seeded one random "completed" run per area, and
 * the 2026-07-31 rewrite removed it because fabricated measurements were
 * indistinguishable from real ones in the dashboard. This port inherits the
 * rewritten behaviour — runs enter only through record_run(), which requires
 * an evaluator and an evidence reference, and an organization with nothing
 * recorded reports zeros rather than a plausible-looking baseline.
 */
class Benchmarks_model extends CI_Model {

  /** The 14 evaluation areas, mirroring BM_AREAS in packages/shared. */
  public static $AREAS = array(
    'ai_models', 'ai_employees', 'ai_workflows', 'voice_models', 'vision_models',
    'translation_quality', 'coding_performance', 'response_accuracy', 'latency',
    'resource_consumption', 'cost_efficiency', 'safety_metrics', 'reliability',
    'user_satisfaction',
  );

  /** Node splits a run below this score into a "pending recommendation". */
  const THRESHOLD = 80;

  public function __construct() { parent::__construct(); $this->load->database(); }

  /** Node's uid(): `br-`, `sc-` or `bm-` plus 8 hex characters. */
  public function uid($prefix) { return $prefix . substr(bin2hex(random_bytes(4)), 0, 8); }

  private function iso($value) { return $value ? gmdate('c', strtotime($value)) : NULL; }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  public function public_run($row) {
    if (!$row) return NULL;
    $metrics = json_decode($row['metrics'], TRUE);
    return array(
      'id'             => $row['id'],
      'organizationId' => $row['organization_id'],
      'area'           => $row['area'],
      'targetId'       => $row['target_id'],
      'targetName'     => $row['target_name'],
      'status'         => $row['status'],
      'startedAt'      => $this->iso($row['started_at']),
      'completedAt'    => $this->iso($row['completed_at']),
      'durationMs'     => (int) $row['duration_ms'],
      // Stored as JSON text; decode before re-encoding or it double-escapes.
      'metrics'        => is_array($metrics) ? $metrics : array(),
      'overallScore'   => (float) $row['overall_score'],
      'passed'         => (bool) $row['passed'],
      'notes'          => $row['notes'],
      'metadata'       => array(
        'evaluator' => $row['evaluator'],
        'evidence'  => $row['evidence'],
        'imported'  => (bool) $row['imported'],
      ),
    );
  }

  public function public_note($row) {
    if (!$row) return NULL;
    $tags = json_decode($row['tags'], TRUE);
    return array(
      'id'        => $row['id'],
      'createdAt' => $this->iso($row['created_at']),
      'createdBy' => $row['created_by'],
      'title'     => $row['title'],
      'body'      => $row['body'],
      'tags'      => is_array($tags) ? array_values($tags) : array(),
    );
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  /** Newest first — Node read the sorted set in reverse. */
  public function list_runs($org, $limit = 30) {
    $limit = max(1, min(100, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)->get('benchmark_runs')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_run($row);
    return $out;
  }

  public function get_run($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('benchmark_runs')->row_array();
    return $row ? $this->public_run($row) : NULL;
  }

  /**
   * Record a result that was measured elsewhere. The caller owns the score and
   * the verdict: nothing here grades, averages or adjusts them.
   */
  public function record_run($org, $input) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'              => $this->uid('br-'),
      'organization_id' => $org,
      'area'            => $input['area'],
      'target_id'       => isset($input['targetId']) && $input['targetId'] !== '' ? $input['targetId'] : NULL,
      'target_name'     => $input['targetName'],
      'status'          => 'completed',
      'started_at'      => $now,
      'completed_at'    => $now,
      'duration_ms'     => 0,
      'metrics'         => json_encode($input['metrics']),
      'overall_score'   => (float) $input['overallScore'],
      'passed'          => !empty($input['passed']) ? 1 : 0,
      'notes'           => isset($input['notes']) ? $input['notes'] : NULL,
      'evaluator'       => $input['evaluator'],
      'evidence'        => $input['evidence'],
      'imported'        => 1,
      'created_at'      => $now,
    );
    $this->db->insert('benchmark_runs', $row);
    return $this->public_run($this->db->where('id', $row['id'])->get('benchmark_runs')->row_array());
  }

  /**
   * A run below the threshold is flagged for follow-up rather than counted as
   * an optimized model. Node emitted a kernel event on that branch too.
   */
  public function is_underperforming($run) { return $run['overallScore'] < self::THRESHOLD; }

  // ---------------------------------------------------------------------------
  // Schedules
  // ---------------------------------------------------------------------------

  /**
   * Store a schedule. Nothing is executed: there is no cron runner here, and
   * creating a schedule must never manufacture a run.
   */
  public function schedule($org, $input) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'              => $this->uid('sc-'),
      'organization_id' => $org,
      'area'            => $input['area'],
      'target_id'       => isset($input['targetId']) && $input['targetId'] !== '' ? $input['targetId'] : NULL,
      'cron'            => $input['cron'],
      'enabled'         => !empty($input['enabled']) ? 1 : 0,
      // Node: now + 1 hour.
      'next_run_at'     => date('Y-m-d H:i:s', strtotime($now) + 3600),
      'created_at'      => $now,
    );
    $this->db->insert('benchmark_schedules', $row);
    return array(
      'id'        => $row['id'],
      'area'      => $row['area'],
      'targetId'  => $row['target_id'],
      'cron'      => $row['cron'],
      'enabled'   => (bool) $row['enabled'],
      'nextRunAt' => $this->iso($row['next_run_at']),
    );
  }

  public function count_schedules($org) {
    return (int) $this->db->where('organization_id', $org)->count_all_results('benchmark_schedules');
  }

  // ---------------------------------------------------------------------------
  // Notes ledger
  // ---------------------------------------------------------------------------

  /** Newest first, matching tenantStore's reverse-sorted index. */
  public function list_notes($org, $limit = 200) {
    $limit = max(1, min(200, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)->get('benchmark_notes')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_note($row);
    return $out;
  }

  public function get_note($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('benchmark_notes')->row_array();
    return $row ? $this->public_note($row) : NULL;
  }

  public function create_note($org, $input, $user_id) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'              => $this->uid('bm-'),
      'organization_id' => $org,
      'title'           => $input['title'],
      'body'            => $input['body'],
      'tags'            => json_encode(array_values($input['tags'])),
      'created_by'      => $user_id,
      'created_at'      => $now,
      'updated_at'      => $now,
    );
    $this->db->insert('benchmark_notes', $row);
    return $this->public_note($this->db->where('id', $row['id'])->get('benchmark_notes')->row_array());
  }

  /** A partial update: only the keys present in $patch are written. */
  public function update_note($org, $id, $patch) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('benchmark_notes')->row_array();
    if (!$row) return NULL;
    $set = array('updated_at' => date('Y-m-d H:i:s'));
    if (array_key_exists('title', $patch)) $set['title'] = $patch['title'];
    if (array_key_exists('body', $patch)) $set['body'] = $patch['body'];
    if (array_key_exists('tags', $patch)) $set['tags'] = json_encode(array_values($patch['tags']));
    $this->db->where('id', $id)->update('benchmark_notes', $set);
    return $this->public_note($this->db->where('id', $id)->get('benchmark_notes')->row_array());
  }

  public function delete_note($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('benchmark_notes')->row_array();
    if (!$row) return FALSE;
    $this->db->where('id', $id)->delete('benchmark_notes');
    return TRUE;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  public function dashboard($org) {
    $runs      = $this->list_runs($org, 100);
    $completed = array();
    $passed    = 0;
    $day       = 86400;
    $last_24h  = 0;

    foreach ($runs as $run) {
      if ($run['status'] !== 'completed') continue;
      $completed[] = $run;
      if ($run['passed']) $passed++;
      if (abs(time() - strtotime($run['startedAt'])) < $day) $last_24h++;
    }

    $total     = count($completed);
    $sum       = 0;
    foreach ($completed as $run) $sum += $run['overallScore'];
    // Node: Math.round(avg * 10) / 10.
    $avg       = $total ? round(($sum / $total), 1) : 0;

    $leaderboard = $completed;
    usort($leaderboard, function ($a, $b) {
      if ($a['overallScore'] !== $b['overallScore']) return $b['overallScore'] <=> $a['overallScore'];
      return strcmp($a['id'], $b['id']);
    });
    $leaderboard = array_slice($leaderboard, 0, 8);
    foreach ($leaderboard as $i => $row) {
      $leaderboard[$i] = array(
        'area'         => $row['area'],
        'targetName'   => $row['targetName'],
        'overallScore' => $row['overallScore'],
        'runs'         => 1,
      );
    }

    return array(
      'totalRuns'     => count($runs),
      'completed24h'  => $last_24h,
      'avgScore'      => $avg,
      'passRate'      => $total ? ($passed / $total) : 0,
      'leaderboard'   => array_values($leaderboard),
      'areaScores'    => $this->area_scores($org),
      'recentRuns'    => array_slice($runs, 0, 10),
      'feedbackToModelFactory' => $this->feedback($org),
    );
  }

  /**
   * The last recorded score per area — Node's zset held exactly one entry per
   * area, overwritten on every run, so this is the newest run in each area.
   * Areas with no run at all report 0, which is the honest value: an
   * unmeasured area has no score, not a baseline.
   */
  private function area_scores($org) {
    $scores = array();
    foreach (self::$AREAS as $area) $scores[$area] = 0;
    $rows = $this->db->query(
      'SELECT r.area, r.overall_score FROM benchmark_runs r
        WHERE r.organization_id = ? AND r.seq = (
          SELECT MAX(x.seq) FROM benchmark_runs x
           WHERE x.organization_id = r.organization_id AND x.area = r.area)',
      array($org)
    )->result_array();
    foreach ($rows as $row) $scores[$row['area']] = (float) $row['overall_score'];
    return $scores;
  }

  /**
   * Counted over every run ever recorded, not just the 100 the dashboard
   * reads, because Node incremented these counters on every run.
   */
  private function feedback($org) {
    $row = $this->db->query(
      'SELECT SUM(overall_score < ?) AS pending, SUM(overall_score >= ?) AS optimized
         FROM benchmark_runs WHERE organization_id = ?',
      array(self::THRESHOLD, self::THRESHOLD, $org)
    )->row_array();
    return array(
      'optimizedModels'        => (int) ($row['optimized'] ?? 0),
      'pendingRecommendations' => (int) ($row['pending'] ?? 0),
    );
  }
}
