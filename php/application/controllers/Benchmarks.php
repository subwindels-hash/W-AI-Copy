<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Benchmarks — Session 50 Enterprise AI Benchmark Center.
 *
 * Port of apps/api/src/http/routes/benchmarks.ts (8 routes):
 *
 *   GET    /api/v1/benchmarks/dashboard/rollup
 *   GET    /api/v1/benchmarks/runs
 *   POST   /api/v1/benchmarks/run
 *   POST   /api/v1/benchmarks/schedule
 *   GET    /api/v1/benchmarks/notes
 *   POST   /api/v1/benchmarks/notes
 *   PATCH  /api/v1/benchmarks/notes/:id
 *   DELETE /api/v1/benchmarks/notes/:id
 *
 * Every route is authenticated and organization-scoped; none is admin-gated,
 * because Node puts `authenticate` on the router and nothing else — any member
 * of the organization may record a result. A session with no organization gets
 * 403, which is what Node's `orgOf()` throws.
 *
 * The honesty rule this controller exists to protect: the benchmark centre
 * records evaluations, it does not produce them. `POST /run` requires an
 * evaluator and an evidence reference, the score and the pass/fail verdict are
 * stored exactly as supplied (a low score with `passed: true` stays passing —
 * the evaluator owns the criteria, not the registry), and an organization with
 * nothing recorded reports zeros instead of a plausible-looking baseline.
 */
class Benchmarks extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->org = isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL;
    if (!$this->org) {
      $this->fail('FORBIDDEN', 'The benchmark register is organization-scoped and this session carries no organization.', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Benchmarks_model', 'bm');
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/benchmarks/dashboard/rollup
  // ---------------------------------------------------------------------------
  public function dashboard_rollup() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->bm->dashboard($this->org));
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/benchmarks/runs
  // ---------------------------------------------------------------------------
  public function runs() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->bm->list_runs($this->org, 30));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/benchmarks/run
  // ---------------------------------------------------------------------------
  public function run() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_run($body);
    if ($input === NULL) return NULL;

    if (!isset($input['targetName'])) {
      $input['targetName'] = !empty($input['targetId']) ? $input['targetId'] : str_replace('_', ' ', $input['area']);
    }

    $run = $this->bm->record_run($this->org, $input);
    if ($this->bm->is_underperforming($run)) {
      $this->emit_kernel('benchmarks.underperforming', array(
        'organizationId' => $this->org,
        'area'           => $run['area'],
        'score'          => $run['overallScore'],
        'runId'          => $run['id'],
      ));
    }
    return $this->respond($run);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/benchmarks/schedule
  // ---------------------------------------------------------------------------
  public function schedule() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_schedule($body);
    if ($input === NULL) return NULL;
    // Scheduling records an intent; it never starts a runner and never writes
    // a run.
    return $this->respond($this->bm->schedule($this->org, $input));
  }

  // ---------------------------------------------------------------------------
  // GET    /api/v1/benchmarks/notes
  // POST   /api/v1/benchmarks/notes
  // PATCH  /api/v1/benchmarks/notes/:id
  // DELETE /api/v1/benchmarks/notes/:id
  //
  // CodeIgniter routes on URI only, so all four arrive here and the verb
  // decides. Note that Node defines no GET /notes/:id at all — Express simply
  // has no such route — so that combination is a 404 here, not a 405.
  // ---------------------------------------------------------------------------
  public function notes_dispatch($id = NULL) {
    $method = $this->input->method(TRUE);

    if ($id === NULL) {
      if ($method === 'GET') return $this->notes_index();
      if ($method === 'POST') return $this->notes_create();
      return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
    }

    if (!$this->valid_note_id($id)) return NULL;
    if ($method === 'PATCH') return $this->notes_update((string) $id);
    if ($method === 'DELETE') return $this->notes_delete((string) $id);
    if ($method === 'GET') return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->fail('METHOD_NOT_ALLOWED', 'PATCH or DELETE required', 405);
  }

  private function notes_index() {
    return $this->respond($this->bm->list_notes($this->org, 200));
  }

  private function notes_create() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, FALSE);
    if ($input === NULL) return NULL;
    return $this->respond($this->bm->create_note($this->org, $input, $this->c['sub']), 201);
  }

  private function notes_update($id) {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, TRUE);
    if ($input === NULL) return NULL;
    // An empty patch is a no-op and still returns the note, as Node does.
    $note = $this->bm->update_note($this->org, $id, $input);
    return $note ? $this->respond($note) : $this->fail('NOT_FOUND', 'Note not found', 404);
  }

  private function notes_delete($id) {
    if (!$this->bm->delete_note($this->org, $id)) return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->output->set_status_header(204)->set_output('');
  }

  // ---------------------------------------------------------------------------
  // Validation — packages/shared/src/benchmarks.ts and the route schemas
  // ---------------------------------------------------------------------------

  /**
   * The body must be a JSON object; anything else is a 422, not a 500. An
   * empty object is accepted — PATCH /notes/:id with `{}` is a no-op update in
   * Node, not an error.
   */
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

  private function validate_run($body) {
    $errors = array();
    $input  = array();

    $area = $this->enum($body, 'area', $errors, $this->bm::$AREAS, 'area must be one of: ' . implode(', ', $this->bm::$AREAS));
    if ($area === NULL) { $this->fail_fields($errors); return NULL; }
    $input['area'] = $area;

    $input['targetId'] = $this->opt_string($body, 'targetId', $errors, 0, 4000);
    $input['targetName'] = $this->opt_string($body, 'targetName', $errors, 1, 200);
    $input['notes'] = $this->opt_string($body, 'notes', $errors, 0, 1000);

    if (!isset($body['metrics']) || !is_array($body['metrics']) || !array_is_list($body['metrics'])) {
      $errors[] = 'metrics must be an array of 1 to 50 metric objects';
    } else {
      $count = count($body['metrics']);
      if ($count < 1 || $count > 50) $errors[] = 'metrics must be an array of 1 to 50 metric objects';
      $metrics = array();
      foreach ($body['metrics'] as $metric) {
        $clean = $this->validate_metric($metric);
        if ($clean === NULL) { $errors[] = 'each metric needs key, label, value, unit and higherIsBetter'; break; }
        $metrics[] = $clean;
      }
      $input['metrics'] = $metrics;
    }

    if (!array_key_exists('overallScore', $body) || !is_numeric($body['overallScore']) || !is_finite((float) $body['overallScore'])) {
      $errors[] = 'overallScore must be a number between 0 and 100';
    } else {
      $score = (float) $body['overallScore'];
      if ($score < 0 || $score > 100) $errors[] = 'overallScore must be between 0 and 100';
      else $input['overallScore'] = $score;
    }

    if (!array_key_exists('passed', $body) || !is_bool($body['passed'])) $errors[] = 'passed must be a boolean';
    else $input['passed'] = $body['passed'];

    if (!isset($body['evaluator']) || !is_string($body['evaluator']) || strlen($body['evaluator']) < 1 || strlen($body['evaluator']) > 200) {
      $errors[] = 'evaluator must be 1 to 200 characters — a score needs an attributable source';
    } else {
      $input['evaluator'] = $body['evaluator'];
    }

    if (!isset($body['evidence']) || !is_string($body['evidence']) || strlen($body['evidence']) < 1 || strlen($body['evidence']) > 2000) {
      $errors[] = 'evidence must be 1 to 2000 characters — a score needs somewhere it can be checked';
    } else {
      $input['evidence'] = $body['evidence'];
    }

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  private function validate_metric($metric) {
    if (!is_array($metric) || array_is_list($metric)) return NULL;
    foreach (array('key', 'label', 'value', 'unit', 'higherIsBetter') as $field) {
      if (!array_key_exists($field, $metric)) return NULL;
    }
    if (!is_string($metric['key']) || strlen($metric['key']) < 1 || strlen($metric['key']) > 80) return NULL;
    if (!is_string($metric['label']) || strlen($metric['label']) < 1 || strlen($metric['label']) > 120) return NULL;
    if (!is_numeric($metric['value']) || !is_finite((float) $metric['value'])) return NULL;
    if (!is_string($metric['unit']) || strlen($metric['unit']) > 32) return NULL;
    if (!is_bool($metric['higherIsBetter'])) return NULL;

    $clean = array(
      'key'            => $metric['key'],
      'label'          => $metric['label'],
      'value'          => (float) $metric['value'],
      'unit'           => $metric['unit'],
      'higherIsBetter' => $metric['higherIsBetter'],
    );
    if (array_key_exists('baseline', $metric)) {
      if (!is_numeric($metric['baseline']) || !is_finite((float) $metric['baseline'])) return NULL;
      $clean['baseline'] = (float) $metric['baseline'];
    }
    if (array_key_exists('target', $metric)) {
      if (!is_numeric($metric['target']) || !is_finite((float) $metric['target'])) return NULL;
      $clean['target'] = (float) $metric['target'];
    }
    return $clean;
  }

  private function validate_schedule($body) {
    $errors = array();
    $area = $this->enum($body, 'area', $errors, $this->bm::$AREAS, 'area must be one of: ' . implode(', ', $this->bm::$AREAS));
    if ($area === NULL) { $this->fail_fields($errors); return NULL; }

    $input = array('area' => $area);
    $input['targetId'] = $this->opt_string($body, 'targetId', $errors, 0, 4000);

    // Node defaults both fields when they are absent.
    $cron = array_key_exists('cron', $body) ? $body['cron'] : '0 0 * * *';
    if (!is_string($cron) || !preg_match('/^[\d\-\*\/\,\?\sA-Za-z]+$/', $cron) || strlen($cron) > 64) {
      $errors[] = 'cron must be a cron expression';
    } else {
      $input['cron'] = $cron;
    }

    $enabled = array_key_exists('enabled', $body) ? $body['enabled'] : TRUE;
    if (!is_bool($enabled)) $errors[] = 'enabled must be a boolean';
    else $input['enabled'] = $enabled;

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  private function validate_note($body, $partial) {
    $errors = array();
    $patch  = array();

    if (array_key_exists('title', $body) || !$partial) {
      if (!isset($body['title']) || !is_string($body['title']) || strlen($body['title']) < 2 || strlen($body['title']) > 200) {
        $errors[] = 'title must be 2 to 200 characters';
      } else {
        $patch['title'] = $body['title'];
      }
    }
    if (array_key_exists('body', $body) || !$partial) {
      if (!isset($body['body']) || !is_string($body['body']) || strlen($body['body']) < 2 || strlen($body['body']) > 4000) {
        $errors[] = 'body must be 2 to 4000 characters';
      } else {
        $patch['body'] = $body['body'];
      }
    }
    if (array_key_exists('tags', $body)) {
      if (!is_array($body['tags']) || !array_is_list($body['tags']) || count($body['tags']) > 20) {
        $errors[] = 'tags must be an array of at most 20 strings';
      } else {
        foreach ($body['tags'] as $tag) {
          if (!is_string($tag) || strlen($tag) > 40) { $errors[] = 'each tag must be a string of at most 40 characters'; break; }
        }
        $patch['tags'] = array_values($body['tags']);
      }
    } elseif (!$partial) {
      $patch['tags'] = array();
    }

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $patch;
  }

  private function valid_note_id($id) {
    if (!is_string($id) || strlen($id) < 3 || strlen($id) > 64) {
      $this->fail('VALIDATION_ERROR', 'id must be between 3 and 64 characters', 422);
      return FALSE;
    }
    return TRUE;
  }

  private function enum($body, $field, &$errors, $allowed, $message) {
    if (!isset($body[$field]) || !is_string($body[$field]) || !in_array($body[$field], $allowed, TRUE)) {
      $errors[] = $message;
      return NULL;
    }
    return $body[$field];
  }

  /** An optional string field: absent is fine, present must fit the limits. */
  private function opt_string($body, $field, &$errors, $min, $max) {
    if (!array_key_exists($field, $body) || $body[$field] === NULL) return NULL;
    if (!is_string($body[$field])) { $errors[] = $field . ' must be a string'; return NULL; }
    $length = strlen($body[$field]);
    if ($length < $min || $length > $max) { $errors[] = $field . ' must be between ' . $min . ' and ' . $max . ' characters'; return NULL; }
    return $body[$field];
  }

  // ---------------------------------------------------------------------------
  // Kernel bus
  // ---------------------------------------------------------------------------

  /**
   * Node emits "benchmarks.underperforming" through the kernel service, best
   * effort. The PHP kernel records events in kernel_events (migration 002); if
   * that table is not installed the run still stands, because the run table is
   * authoritative.
   */
  private function emit_kernel($kind, $payload) {
    try {
      if (!$this->db->table_exists('kernel_events')) return;
      $this->load->model('Kernel_model', 'kernel');
      $this->kernel->dispatch(
        array('kind' => $kind, 'source' => 'benchmarks', 'payload' => $payload),
        $this->org,
        $this->c['sub']
      );
    } catch (Exception $error) { /* the run is already recorded */ }
  }
}
