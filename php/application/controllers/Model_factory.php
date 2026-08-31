<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Model_factory — Session 46 Enterprise AI Model Factory.
 *
 * Port of apps/api/src/http/routes/modelFactory.ts (13 routes):
 *
 *   GET    /api/v1/model-factory/dashboard/rollup
 *   GET    /api/v1/model-factory/models
 *   POST   /api/v1/model-factory/models
 *   POST   /api/v1/model-factory/models/:id/advance
 *   POST   /api/v1/model-factory/models/:id/benchmark
 *   POST   /api/v1/model-factory/models/:id/safety
 *   POST   /api/v1/model-factory/models/:id/governance-approve
 *   GET    /api/v1/model-factory/fine-tunes
 *   POST   /api/v1/model-factory/fine-tunes
 *   GET    /api/v1/model-factory/notes
 *   POST   /api/v1/model-factory/notes
 *   PATCH  /api/v1/model-factory/notes/:id
 *   DELETE /api/v1/model-factory/notes/:id
 *
 * Node puts `authenticate` and an ORG_ADMIN check on the whole router, so
 * every route here is administrator-only — 403 "Admins only" for a plain
 * member, and the same 403 for a session that carries no organization at all.
 *
 * THE TENANCY BOUNDARY MOVED, deliberately. Node's `mf2:*` Redis keys carry no
 * organization segment, so its model registry is global: one administrator can
 * read, advance or retire another organization's models. This port scopes the
 * register by organization, because a model registry says what a company is
 * building and how far it has got, and this build's tenant boundary is a
 * column rather than a gate.
 *
 * The lifecycle gates are Node's, in Node's order: a stage cannot move
 * backwards, a model cannot enter canary without governance approval, and it
 * cannot enter validation, approval, canary or deployed without a recorded
 * safety evaluation. Two Node behaviours are preserved rather than "fixed"
 * because a caller may depend on them: recording a benchmark does not require
 * the model to exist, and starting a fine-tune does not either.
 *
 * Nothing here invents a measurement. A benchmark score and its pass/fail
 * verdict are supplied by the evaluator that ran the benchmark and stored as
 * given; a fine-tune job is recorded at 0% and started by nothing in this
 * request.
 */
class Model_factory extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->org = isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL;
    if (!$this->org) {
      $this->fail('FORBIDDEN', 'The model factory is organization-scoped and this session carries no organization.', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Permission_model', 'permissions');
    if (!$this->permissions->has($this->c['sub'], 'ORG_ADMIN', $this->org)) {
      $this->fail('FORBIDDEN', 'Admins only', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Model_factory_model', 'mf');
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/model-factory/dashboard/rollup
  // ---------------------------------------------------------------------------
  public function dashboard_rollup() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->mf->dashboard($this->org));
  }

  // ---------------------------------------------------------------------------
  // GET  /api/v1/model-factory/models
  // POST /api/v1/model-factory/models
  // ---------------------------------------------------------------------------
  public function models_dispatch() {
    $method = $this->input->method(TRUE);
    if ($method === 'GET') return $this->models_index();
    if ($method === 'POST') return $this->models_create();
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  private function models_index() {
    return $this->respond($this->mf->list_models($this->org, $this->input->get('stage')));
  }

  private function models_create() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_create($body);
    if ($input === NULL) return NULL;
    $model = $this->mf->create_model($this->org, $input);
    $this->emit_kernel('model-factory.created', array(
      'modelId' => $model['id'],
      'builder' => $model['builder'],
    ));
    return $this->respond($model);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/model-factory/models/:id/advance
  // ---------------------------------------------------------------------------
  public function model_advance($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;

    if (!array_key_exists('to', $body)) {
      return $this->fail('VALIDATION_ERROR', 'to is required', 422);
    }
    $to = $body['to'];
    if (!is_string($to) || !in_array($to, $this->mf::$STAGES, TRUE)) {
      return $this->fail('VALIDATION_ERROR', 'to must be one of: ' . implode(', ', $this->mf::$STAGES), 422);
    }

    $result = $this->mf->advance_stage($this->org, (string) $id, $to);
    if (!$result['ok']) return $this->fail('VALIDATION_ERROR', $result['message'], $result['status']);

    $this->emit_kernel('model-factory.advanced', array('modelId' => (string) $id, 'to' => $to));
    return $this->respond($result['model']);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/model-factory/models/:id/benchmark
  //
  // Node does not check that the model exists: a result recorded against an
  // unknown id is stored against that id. Kept, so a result is never discarded
  // because it arrived before the model did.
  // ---------------------------------------------------------------------------
  public function model_benchmark($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_benchmark($body);
    if ($input === NULL) return NULL;
    return $this->respond($this->mf->record_benchmark($this->org, (string) $id, $input));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/model-factory/models/:id/safety
  // ---------------------------------------------------------------------------
  public function model_safety($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;

    if (!array_key_exists('passed', $body) || !is_bool($body['passed'])) {
      return $this->fail('VALIDATION_ERROR', 'passed must be a boolean', 422);
    }
    $model = $this->mf->set_safety($this->org, (string) $id, $body['passed']);
    if (!$model) return $this->fail('NOT_FOUND', 'Model not found', 404);

    $this->emit_kernel('model-factory.safety', array('modelId' => (string) $id, 'passed' => $body['passed']));
    return $this->respond($model);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/model-factory/models/:id/governance-approve
  //
  // Node validates no body here at all — the route takes none and ignores one.
  // ---------------------------------------------------------------------------
  public function model_governance($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $model = $this->mf->approve_governance($this->org, (string) $id);
    if (!$model) return $this->fail('NOT_FOUND', 'Model not found', 404);

    $this->emit_kernel('model-factory.governance-approved', array('modelId' => (string) $id));
    return $this->respond($model);
  }

  // ---------------------------------------------------------------------------
  // GET  /api/v1/model-factory/fine-tunes
  // POST /api/v1/model-factory/fine-tunes
  // ---------------------------------------------------------------------------
  public function fine_tunes_dispatch() {
    $method = $this->input->method(TRUE);
    if ($method === 'GET') return $this->respond($this->mf->list_fine_tunes($this->org));
    if ($method === 'POST') return $this->fine_tunes_create();
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  private function fine_tunes_create() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_finetune($body);
    if ($input === NULL) return NULL;
    $job = $this->mf->start_fine_tune($this->org, $input);
    $this->emit_kernel('model-factory.finetune-started', array(
      'jobId'   => $job['id'],
      'modelId' => $job['modelId'],
      'method'  => $job['method'],
    ));
    return $this->respond($job);
  }

  // ---------------------------------------------------------------------------
  // GET    /api/v1/model-factory/notes
  // POST   /api/v1/model-factory/notes
  // PATCH  /api/v1/model-factory/notes/:id
  // DELETE /api/v1/model-factory/notes/:id
  //
  // CodeIgniter routes on URI only, so all four arrive here and the verb
  // decides. Node defines no GET /notes/:id — Express simply has no such route
  // — so that combination is a 404 here, not a 405.
  // ---------------------------------------------------------------------------
  public function notes_dispatch($id = NULL) {
    $method = $this->input->method(TRUE);

    if ($id === NULL) {
      if ($method === 'GET') return $this->respond($this->mf->list_notes($this->org, 200));
      if ($method === 'POST') return $this->notes_create();
      return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
    }

    if (!$this->valid_note_id($id)) return NULL;
    if ($method === 'PATCH') return $this->notes_update((string) $id);
    if ($method === 'DELETE') return $this->notes_delete((string) $id);
    if ($method === 'GET') return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->fail('METHOD_NOT_ALLOWED', 'PATCH or DELETE required', 405);
  }

  private function notes_create() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, FALSE);
    if ($input === NULL) return NULL;
    return $this->respond($this->mf->create_note($this->org, $input, $this->c['sub']), 201);
  }

  private function notes_update($id) {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, TRUE);
    if ($input === NULL) return NULL;
    // An empty patch is a no-op that still returns the note, as Node does.
    $note = $this->mf->update_note($this->org, $id, $input);
    return $note ? $this->respond($note) : $this->fail('NOT_FOUND', 'Note not found', 404);
  }

  private function notes_delete($id) {
    if (!$this->mf->delete_note($this->org, $id)) return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->output->set_status_header(204)->set_output('');
  }

  // ---------------------------------------------------------------------------
  // Validation — packages/shared/src/modelFactory.ts and the route schemas
  // ---------------------------------------------------------------------------

  /** The body must be a JSON object; anything else is a 422, not a 500. */
  private function body_array() {
    $body = $this->body();
    if (!is_array($body) || ($body !== array() && array_is_list($body))) {
      $this->fail('VALIDATION_ERROR', 'A JSON object body is required', 422);
      return NULL;
    }
    return $body;
  }

  private function fail_fields($errors) {
    return $this->fail('VALIDATION_ERROR', implode('; ', $errors), 422);
  }

  /**
   * A required string. `z.string()` in Node's `create` schema has no length
   * bounds — an empty name is accepted — so neither does this.
   */
  private function req_string($body, $field, &$errors) {
    if (!array_key_exists($field, $body) || !is_string($body[$field])) {
      $errors[] = $field . ' is required';
      return NULL;
    }
    return $body[$field];
  }

  private function opt_string($body, $field, &$errors, $min, $max) {
    if (!array_key_exists($field, $body)) return NULL;
    $value = $body[$field];
    if (!is_string($value) || strlen($value) < $min || strlen($value) > $max) {
      $errors[] = $field . ' must be a string of ' . $min . ' to ' . $max . ' characters';
      return NULL;
    }
    return $value;
  }

  private function enum($body, $field, &$errors, $allowed, $required) {
    if (!array_key_exists($field, $body)) {
      if ($required) $errors[] = $field . ' is required';
      return NULL;
    }
    $value = $body[$field];
    if (!is_string($value) || !in_array($value, $allowed, TRUE)) {
      $errors[] = $field . ' must be one of: ' . implode(', ', $allowed);
      return NULL;
    }
    return $value;
  }

  /** POST /models — the `create` schema. */
  private function validate_create($body) {
    $errors = array();
    $input  = array();

    $name = $this->req_string($body, 'name', $errors);
    if ($name !== NULL) $input['name'] = $name;

    $builder = $this->enum($body, 'builder', $errors, $this->mf::$BUILDERS, TRUE);
    if ($builder !== NULL) $input['builder'] = $builder;

    $size = $this->req_string($body, 'size', $errors);
    if ($size !== NULL) $input['size'] = $size;

    $quant = $this->req_string($body, 'quant', $errors);
    if ($quant !== NULL) $input['quant'] = $quant;

    // z.number().int().positive(): a JSON integer greater than zero.
    if (!array_key_exists('vramMb', $body)) {
      $errors[] = 'vramMb is required';
    } elseif (!is_int($body['vramMb']) || $body['vramMb'] < 1) {
      $errors[] = 'vramMb must be a positive integer';
    } else {
      $input['vramMb'] = $body['vramMb'];
    }

    $base = $this->opt_string($body, 'baseModelId', $errors, 0, 200);
    if ($base !== NULL) $input['baseModelId'] = $base;

    $stage = $this->enum($body, 'stage', $errors, $this->mf::$STAGES, FALSE);
    if ($stage !== NULL) $input['stage'] = $stage;

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  /** POST /models/:id/benchmark — the `bench` schema. */
  private function validate_benchmark($body) {
    $errors = array();
    $input  = array();

    $benchmark = $this->opt_string($body, 'benchmark', $errors, 1, 120);
    if ($benchmark === NULL && !array_key_exists('benchmark', $body)) $errors[] = 'benchmark is required';
    if ($benchmark !== NULL) $input['benchmark'] = $benchmark;

    if (!array_key_exists('score', $body)) {
      $errors[] = 'score is required';
    } elseif (!is_int($body['score']) && !is_float($body['score'])) {
      $errors[] = 'score must be a number';
    } elseif ($body['score'] < 0 || $body['score'] > 100) {
      $errors[] = 'score must be between 0 and 100';
    } else {
      $input['score'] = $body['score'];
    }

    if (!array_key_exists('pass', $body) || !is_bool($body['pass'])) {
      $errors[] = 'pass must be a boolean';
    } else {
      $input['pass'] = $body['pass'];
    }

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  /**
   * POST /fine-tunes — the `finetune` schema, plus `modelId`.
   *
   * Node's schema declares only `dataset` and `method`, while its handler reads
   * `req.body.modelId ?? req.params.modelId` — neither of which exists, so
   * every job Node records is stored with no model at all. This port accepts
   * an optional `modelId` (the web client sends one) and records NULL when
   * none is supplied, which is the same answer Node gives for a request that
   * omits it.
   */
  private function validate_finetune($body) {
    $errors = array();
    $input  = array();

    $dataset = $this->req_string($body, 'dataset', $errors);
    if ($dataset !== NULL) $input['dataset'] = $dataset;

    $method = $this->enum($body, 'method', $errors, $this->mf::$METHODS, TRUE);
    if ($method !== NULL) $input['method'] = $method;

    $model_id = $this->opt_string($body, 'modelId', $errors, 1, 64);
    if ($model_id !== NULL) $input['modelId'] = $model_id;

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  /** POST and PATCH /notes — the tenantStore note schema. */
  private function validate_note($body, $partial) {
    $errors = array();
    $input  = array();

    $has_title = array_key_exists('title', $body);
    $has_body  = array_key_exists('body', $body);
    $has_tags  = array_key_exists('tags', $body);

    if ($has_title) {
      $title = $this->opt_string($body, 'title', $errors, 2, 200);
      if ($title !== NULL) $input['title'] = $title;
    } elseif (!$partial) {
      $errors[] = 'title is required';
    }

    if ($has_body) {
      $text = $this->opt_string($body, 'body', $errors, 2, 4000);
      if ($text !== NULL) $input['body'] = $text;
    } elseif (!$partial) {
      $errors[] = 'body is required';
    }

    if ($has_tags) {
      $tags = $body['tags'];
      if (!is_array($tags) || array_is_list($tags) === FALSE || count($tags) > 20) {
        $errors[] = 'tags must be an array of at most 20 strings';
      } else {
        $bad = FALSE;
        foreach ($tags as $tag) {
          if (!is_string($tag) || strlen($tag) > 40) { $bad = TRUE; break; }
        }
        if ($bad) $errors[] = 'each tag must be a string of at most 40 characters';
        else $input['tags'] = array_values($tags);
      }
    } elseif (!$partial) {
      // z.array(...).default([]): a note created without tags gets none.
      $input['tags'] = array();
    }

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  /** Node validates the note id: 3 to 64 characters, else 422. */
  private function valid_note_id($id) {
    if (!is_string($id) || strlen($id) < 3 || strlen($id) > 64) {
      $this->fail('VALIDATION_ERROR', 'id must be between 3 and 64 characters', 422);
      return FALSE;
    }
    return TRUE;
  }

  /**
   * Node emits model-factory.* through the kernel service, best effort. The
   * PHP kernel records events in kernel_events (migration 002); if that table
   * is absent the operation still stands.
   */
  private function emit_kernel($kind, $payload) {
    try {
      if (!$this->db->table_exists('kernel_events')) return;
      $this->load->model('Kernel_model', 'kernel');
      $this->kernel->dispatch(
        array('kind' => $kind, 'source' => 'model-factory', 'payload' => $payload),
        $this->org,
        $this->c['sub']
      );
    } catch (Exception $error) { /* the register is authoritative */ }
  }
}
