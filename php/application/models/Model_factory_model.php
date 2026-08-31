<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Model_factory_model — the Enterprise AI Model Factory (Session 46).
 *
 * Ports apps/api/src/modelFactory/modelFactory.service.ts onto MySQL. Node kept
 * a `mf2:models` sorted set of ids with each model stored whole as a `_doc`
 * string in `mf2:model:<id>`, benchmark results under `mf2:bench` /
 * `mf2:bench:<id>`, fine-tune jobs under `mf2:tunes` / `mf2:tune:<id>`, and the
 * annotations ledger in the shared tenantStore (`mf:notes:*`).
 *
 * Two Redis counters are NOT carried over: `mf2:m:safety` and `mf2:m:appr`.
 * Node increments them on a safety evaluation and on a canary attempt blocked
 * by governance, and no route ever reads them back. `safetyEvaluations` is
 * counted from the models here (a model whose safety_passed is not NULL has
 * been evaluated) and `governanceBlocking` from the models sitting in the
 * approval stage without governance approval — both derived from the rows they
 * describe, so they cannot drift out of agreement with them.
 *
 * What is deliberately absent: anything that produces a score, a verdict or a
 * training run. Node's earlier service invented benchmark scores and
 * hard-coded them as passing; the version this port mirrors takes the measured
 * score and verdict from the caller. `start_fine_tune` records a job and
 * launches nothing — no trainer is started, and `status` stays 'running' at
 * `progressPct` 0 until something outside this request moves it.
 *
 * Nothing is seeded: Node guards its five sample models behind
 * `demoDataEnabled()`, so a production tenant's factory starts empty.
 */
class Model_factory_model extends CI_Model {

  /** The seven builder kinds, in the order Node's schema declares them. */
  public static $BUILDERS = array('slm', 'llm', 'vision', 'speech', 'audio', 'multimodal', 'domain');

  /** The lifecycle. Index order is the only ordering Node enforces. */
  public static $STAGES = array(
    'research', 'benchmarking', 'validation', 'approval', 'canary', 'deployed', 'monitoring', 'retired',
  );

  /** Fine-tuning methods. */
  public static $METHODS = array('supervised', 'rlhf', 'dpo', 'lora', 'qlora');

  /**
   * Stages that cannot be entered before a safety evaluation has been
   * recorded. `monitoring` and `retired` are deliberately not gated: Node's
   * check lists only these four.
   */
  public static $SAFETY_GATED = array('validation', 'approval', 'canary', 'deployed');

  public function __construct() { parent::__construct(); $this->load->database(); }

  /** Node's uid(): `m2-`, `br-`, `ft-` or `mf-` plus 8 hex characters. */
  public function uid($prefix) { return $prefix . substr(bin2hex(random_bytes(4)), 0, 8); }

  private function iso($value) { return $value ? gmdate('c', strtotime($value)) : NULL; }

  private function now() { return gmdate('Y-m-d H:i:s'); }

  private function table_missing() { return !$this->db->table_exists('model_factory_models'); }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * The model document. `safetyPassed`, `governanceApproved`, `canaryPct`,
   * `baseModelId` and `benchmarkScore` are omitted rather than nulled when they
   * are unset, because Node's objects omit them too — and two of them are
   * load-bearing: the dashboard counts a model as evaluated only when
   * `safetyPassed` is present, and `!m.governanceApproved` is the gate that
   * blocks a canary.
   */
  public function public_model($row) {
    if (!$row) return NULL;
    $out = array(
      'id'          => $row['id'],
      'name'        => $row['name'],
      'builder'     => $row['builder'],
      'stage'       => $row['stage'],
      'size'        => $row['size'],
      'quant'       => $row['quant'],
      'vramMb'      => (int) $row['vram_mb'],
      'versions'    => (int) $row['versions'],
      'createdAt'   => $this->iso($row['created_at']),
    );
    if ($row['base_model_id'] !== NULL) $out['baseModelId'] = $row['base_model_id'];
    if ($row['benchmark_score'] !== NULL) $out['benchmarkScore'] = (float) $row['benchmark_score'];
    if ($row['safety_passed'] !== NULL) $out['safetyPassed'] = (bool) $row['safety_passed'];
    if ((int) $row['governance_approved'] === 1) $out['governanceApproved'] = TRUE;
    if ($row['canary_pct'] !== NULL) $out['canaryPct'] = (int) $row['canary_pct'];
    return $out;
  }

  public function public_benchmark($row) {
    if (!$row) return NULL;
    return array(
      'id'        => $row['id'],
      'modelId'   => $row['model_id'],
      'benchmark' => $row['benchmark'],
      'score'     => (float) $row['score'],
      'pass'      => (bool) $row['passed'],
      'at'        => $this->iso($row['recorded_at']),
    );
  }

  public function public_tune($row) {
    if (!$row) return NULL;
    return array(
      'id'          => $row['id'],
      'dataset'     => $row['dataset'],
      'method'      => $row['method'],
      'status'      => $row['status'],
      'progressPct' => (int) $row['progress_pct'],
      'startedAt'   => $this->iso($row['started_at']),
      // Node's route reads `req.body.modelId ?? req.params.modelId` and its
      // schema has neither, so Node records a job with no model at all. This
      // port keeps the model when the client sends one.
      'modelId'     => $row['model_id'],
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
  // Models
  // ---------------------------------------------------------------------------

  /**
   * Node's models are a zset in which every member carries score 0, so Redis
   * breaks the tie lexicographically by id — the list is ordered by id, not by
   * creation time. `ORDER BY id` reproduces it.
   *
   * `stage` is filtered only when it is one of the eight known stages: Node
   * reads `req.query.stage as any` with no validation, so an unknown stage
   * matches nothing and answers an empty list rather than a 422.
   */
  public function list_models($org, $stage = NULL) {
    if ($this->table_missing()) return array();
    if ($stage !== NULL && $stage !== '' && !in_array($stage, self::$STAGES, TRUE)) return array();
    $this->db->where('organization_id', $org);
    if ($stage !== NULL && $stage !== '') $this->db->where('stage', $stage);
    $rows = $this->db->order_by('id', 'ASC')->get('model_factory_models')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_model($row);
    return $out;
  }

  public function get_model($org, $id) {
    if ($this->table_missing()) return NULL;
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))
      ->get('model_factory_models')->row_array();
    return $row ? $this->public_model($row) : NULL;
  }

  private function raw_model($org, $id) {
    return $this->db->where(array('id' => $id, 'organization_id' => $org))
      ->get('model_factory_models')->row_array();
  }

  public function create_model($org, $input) {
    $row = array(
      'id'              => $this->uid('m2-'),
      'organization_id' => $org,
      'name'            => $input['name'],
      'builder'         => $input['builder'],
      'stage'           => isset($input['stage']) ? $input['stage'] : 'research',
      'base_model_id'   => isset($input['baseModelId']) ? $input['baseModelId'] : NULL,
      'size'            => $input['size'],
      'quant'           => $input['quant'],
      'vram_mb'         => (int) $input['vramMb'],
      'created_at'      => $this->now(),
    );
    $this->db->insert('model_factory_models', $row);
    return $this->get_model($org, $row['id']);
  }

  /**
   * The lifecycle gate. Returns the advanced model, or a failure describing
   * which gate stopped it — the controller turns that into Node's exact status
   * and message.
   */
  public function advance_stage($org, $id, $to) {
    $row = $this->raw_model($org, $id);
    if (!$row) return array('ok' => FALSE, 'status' => 404, 'message' => 'Model not found');

    $from = array_search($row['stage'], self::$STAGES, TRUE);
    $toIdx = array_search($to, self::$STAGES, TRUE);
    if ($toIdx <= $from) {
      return array('ok' => FALSE, 'status' => 400, 'message' => 'Cannot advance backwards');
    }
    // Checked before safety, as Node does: a model blocked on governance
    // reports governance, even if it has also never passed a safety review.
    if ($to === 'canary' && !$row['governance_approved']) {
      return array('ok' => FALSE, 'status' => 400, 'message' => 'Governance approval required before canary');
    }
    if (in_array($to, self::$SAFETY_GATED, TRUE) && !$row['safety_passed']) {
      return array('ok' => FALSE, 'status' => 400, 'message' => 'Safety evaluation required before advancing');
    }

    $this->db->where('id', $id)->update('model_factory_models', array(
      'stage'    => $to,
      'versions' => (int) $row['versions'] + 1,
    ));
    return array('ok' => TRUE, 'model' => $this->get_model($org, $id));
  }

  /**
   * Records a measured result. Node does not check that the model exists — a
   * benchmark for an unknown id is stored against that id — and neither does
   * this, so the register never silently discards a result.
   */
  public function record_benchmark($org, $model_id, $input) {
    $row = array(
      'id'              => $this->uid('br-'),
      'organization_id' => $org,
      'model_id'        => $model_id,
      'benchmark'       => $input['benchmark'],
      'score'           => $input['score'],
      'passed'          => $input['pass'] ? 1 : 0,
      'recorded_at'     => $this->now(),
    );
    $this->db->insert('model_factory_benchmarks', $row);
    return $this->public_benchmark($this->db->where('id', $row['id'])->get('model_factory_benchmarks')->row_array());
  }

  public function set_safety($org, $id, $passed) {
    $row = $this->raw_model($org, $id);
    if (!$row) return NULL;
    $this->db->where('id', $id)->update('model_factory_models', array(
      'safety_passed' => $passed ? 1 : 0,
    ));
    return $this->get_model($org, $id);
  }

  /**
   * Governance approval. Approving a model that is waiting in the approval
   * stage moves it into canary, which is the one place outside `advanceStage`
   * where Node writes a stage.
   */
  public function approve_governance($org, $id) {
    $row = $this->raw_model($org, $id);
    if (!$row) return NULL;
    $set = array('governance_approved' => 1);
    if ($row['stage'] === 'approval') $set['stage'] = 'canary';
    $this->db->where('id', $id)->update('model_factory_models', $set);
    return $this->get_model($org, $id);
  }

  // ---------------------------------------------------------------------------
  // Fine-tunes
  // ---------------------------------------------------------------------------

  public function list_fine_tunes($org) {
    if ($this->table_missing()) return array();
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'ASC')
      ->get('model_factory_fine_tunes')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_tune($row);
    return $out;
  }

  public function start_fine_tune($org, $input) {
    $row = array(
      'id'              => $this->uid('ft-'),
      'organization_id' => $org,
      'model_id'        => isset($input['modelId']) ? $input['modelId'] : NULL,
      'dataset'         => $input['dataset'],
      'method'          => $input['method'],
      'status'          => 'running',
      'progress_pct'    => 0,
      'started_at'      => $this->now(),
    );
    $this->db->insert('model_factory_fine_tunes', $row);
    return $this->public_tune($this->db->where('id', $row['id'])->get('model_factory_fine_tunes')->row_array());
  }

  // ---------------------------------------------------------------------------
  // Notes ledger (Node's tenantStore, prefix "mf:notes", ids "mf-")
  // ---------------------------------------------------------------------------

  public function list_notes($org, $limit = 200) {
    if ($this->table_missing()) return array();
    $limit = max(1, min(200, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)
      ->get('model_factory_notes')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_note($row);
    return $out;
  }

  public function create_note($org, $input, $user_id) {
    $now = $this->now();
    $row = array(
      'id'              => $this->uid('mf-'),
      'organization_id' => $org,
      'title'           => $input['title'],
      'body'            => $input['body'],
      'tags'            => json_encode(array_values($input['tags'])),
      'created_by'      => $user_id,
      'created_at'      => $now,
      'updated_at'      => $now,
    );
    $this->db->insert('model_factory_notes', $row);
    return $this->public_note($this->db->where('id', $row['id'])->get('model_factory_notes')->row_array());
  }

  /** A partial update: only the keys present in $patch are written. */
  public function update_note($org, $id, $patch) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))
      ->get('model_factory_notes')->row_array();
    if (!$row) return NULL;
    $set = array('updated_at' => $this->now());
    if (array_key_exists('title', $patch)) $set['title'] = $patch['title'];
    if (array_key_exists('body', $patch)) $set['body'] = $patch['body'];
    if (array_key_exists('tags', $patch)) $set['tags'] = json_encode(array_values($patch['tags']));
    $this->db->where('id', $id)->update('model_factory_notes', $set);
    return $this->public_note($this->db->where('id', $id)->get('model_factory_notes')->row_array());
  }

  public function delete_note($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))
      ->get('model_factory_notes')->row_array();
    if (!$row) return FALSE;
    $this->db->where('id', $id)->delete('model_factory_notes');
    return TRUE;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Every number here is a count of rows this module actually holds. An
   * organization that has never registered a model reports eight zero stages,
   * zero fine-tunes and `benchmarksPassedPct: 100` — Node's "no benchmarks
   * recorded yet" answer, not a fabricated pass rate.
   */
  public function dashboard($org) {
    $models = $this->table_missing()
      ? array()
      : $this->db->where('organization_id', $org)->get('model_factory_models')->result_array();

    $byStage = array_fill_keys(self::$STAGES, 0);
    $safetyEvaluations = 0;
    $blocked = 0;
    foreach ($models as $row) {
      $byStage[$row['stage']]++;
      if ($row['safety_passed'] !== NULL) $safetyEvaluations++;
      if ($row['stage'] === 'approval' && !$row['governance_approved']) $blocked++;
    }

    $benches = $this->table_missing()
      ? array()
      : $this->db->where('organization_id', $org)->get('model_factory_benchmarks')->result_array();
    $passed = 0;
    foreach ($benches as $row) if ($row['passed']) $passed++;
    $total = count($benches);

    $tunes = $this->table_missing()
      ? 0
      : (int) $this->db->where('organization_id', $org)->count_all_results('model_factory_fine_tunes');

    return array(
      'totalModels'        => count($models),
      'byStage'            => $byStage,
      'activeFineTunes'    => $tunes,
      'benchmarksPassedPct'=> $total ? (int) round(($passed / $total) * 100) : 100,
      'canaryActive'       => $byStage['canary'] > 0,
      'governanceBlocking' => $blocked,
      'safetyEvaluations'  => $safetyEvaluations,
      'extendsS43Registry' => TRUE,
    );
  }
}
