<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Autonomous — Session 72/106 Autonomous Organization approval register.
 *
 * Port of apps/api/src/http/routes/autonomous.ts (6 routes):
 *
 *   GET    /api/v1/autonomous/dashboard/rollup
 *   GET    /api/v1/autonomous/decisions
 *   POST   /api/v1/autonomous/decisions                 (admin)
 *   GET    /api/v1/autonomous/decisions/:id
 *   POST   /api/v1/autonomous/decisions/:id/resolve     (admin)
 *   DELETE /api/v1/autonomous/decisions/:id             (admin)
 *
 * Everything is organization-scoped; a session with no organization gets 403,
 * which is what Node's `orgOf()` does when the claim is missing.
 *
 * The name is worth a note: this module proposes and records human decisions.
 * It does not execute anything autonomously. Node's dashboard returns literal
 * zeros for budgets, board seats and AI executives because nothing backs them,
 * and this port keeps those zeros as zeros instead of building tables that
 * would make invented figures look retrieved.
 */
class Autonomous extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->org = isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL;
    if (!$this->org) {
      $this->fail('FORBIDDEN', 'The autonomous decision register is organization-scoped and this session carries no organization.', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Autonomous_model', 'aut');
    $this->load->model('Permission_model', 'permissions');
  }

  /** Node's requireAdmin, on the PHP permission catalogue. */
  private function require_admin() {
    if (!$this->permissions->has($this->c['sub'], 'ORG_ADMIN', $this->org)) {
      $this->fail('FORBIDDEN', 'Administrator access required', 403);
      return FALSE;
    }
    return TRUE;
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/autonomous/dashboard/rollup
  // ---------------------------------------------------------------------------
  public function dashboard_rollup() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->aut->dashboard($this->org));
  }

  // ---------------------------------------------------------------------------
  // GET  /api/v1/autonomous/decisions
  // POST /api/v1/autonomous/decisions
  // ---------------------------------------------------------------------------
  /** CodeIgniter routes on URI only; the verb decides which handler runs. */
  public function decisions_dispatch() {
    $method = $this->input->method(TRUE);
    if ($method === 'POST') return $this->decisions_create();
    if ($method === 'GET') return $this->decisions_index();
    if ($method === 'DELETE') return $this->fail('METHOD_NOT_ALLOWED', 'DELETE requires a decision id', 405);
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  public function decisions_index() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $status = $this->input->get('status');
    $department = $this->input->get('department');
    $limit = $this->input->get('limit');

    if ($status !== NULL && !in_array($status, array('drafted', 'awaiting_human', 'approved', 'rejected', 'executing', 'executed'), TRUE)) {
      return $this->fail('VALIDATION_ERROR', 'status must be a known decision status', 422);
    }
    if ($department !== NULL && strlen($department) > 64) return $this->fail('VALIDATION_ERROR', 'department must be at most 64 characters', 422);
    if ($limit !== NULL && (!is_numeric($limit) || (int) $limit < 1 || (int) $limit > 100)) {
      return $this->fail('VALIDATION_ERROR', 'limit must be between 1 and 100', 422);
    }
    return $this->respond($this->aut->list_decisions($this->org, array(
      'status'     => $status,
      'department' => $department,
      'limit'      => $limit === NULL ? 50 : (int) $limit,
    )));
  }

  public function decisions_create() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    if (!$this->require_admin()) return NULL;
    $body = $this->body();
    $input = $this->validate_create($body);
    if (!$input) return NULL;
    return $this->respond($this->aut->propose($this->org, $input), 201);
  }

  // ---------------------------------------------------------------------------
  // GET    /api/v1/autonomous/decisions/:id
  // DELETE /api/v1/autonomous/decisions/:id
  //
  // CodeIgniter routes on URI only, so both verbs arrive at the same route and
  // the method picks the handler — the same trick `decisions_dispatch()` uses
  // for the collection. Each handler re-asserts its own verb.
  // ---------------------------------------------------------------------------
  public function decisions_item_dispatch($id = NULL) {
    $method = $this->input->method(TRUE);
    if ($method === 'GET') return $this->decisions_item($id);
    if ($method === 'DELETE') return $this->decisions_delete($id);
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or DELETE required', 405);
  }

  public function decisions_item($id = NULL) {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    if (!$this->valid_id($id)) return NULL;
    $decision = $this->aut->get_decision($this->org, (string) $id);
    return $decision ? $this->respond($decision) : $this->fail('NOT_FOUND', 'Decision not found', 404);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/autonomous/decisions/:id/resolve
  // ---------------------------------------------------------------------------
  public function decisions_resolve($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    if (!$this->require_admin()) return NULL;
    if (!$this->valid_id($id)) return NULL;

    $body = $this->body();
    if (!array_key_exists('approved', $body) || !is_bool($body['approved'])) {
      return $this->fail('VALIDATION_ERROR', 'approved must be a boolean', 422);
    }
    $note = NULL;
    if (array_key_exists('note', $body) && $body['note'] !== NULL) {
      if (!is_string($body['note'])) return $this->fail('VALIDATION_ERROR', 'note must be a string', 422);
      // Node trims and keeps an empty string (`z.string().trim().max(2000)`),
      // so an all-whitespace note is stored as "" rather than dropped.
      $note = trim($body['note']);
      if (strlen($note) > 2000) return $this->fail('VALIDATION_ERROR', 'note must be at most 2000 characters', 422);
    }

    $decision = $this->aut->decide($this->org, (string) $id, $this->c['sub'], $body['approved'], $note);
    if ($decision === NULL) return $this->fail('NOT_FOUND', 'Decision not found', 404);
    if ($decision === FALSE) return $this->fail('CONFLICT', 'Decision has already been resolved', 409);
    return $this->respond($decision);
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/autonomous/decisions/:id
  // ---------------------------------------------------------------------------
  public function decisions_delete($id = NULL) {
    if ($this->input->method(TRUE) !== 'DELETE') return $this->fail('METHOD_NOT_ALLOWED', 'DELETE required', 405);
    if (!$this->require_admin()) return NULL;
    if (!$this->valid_id($id)) return NULL;

    $deleted = $this->aut->delete_decision($this->org, (string) $id);
    if ($deleted === NULL) return $this->fail('NOT_FOUND', 'Decision not found', 404);
    if ($deleted === FALSE) return $this->fail('CONFLICT', 'Resolved decisions cannot be deleted', 409);
    return $this->respond(array('deleted' => TRUE, 'id' => (string) $id));
  }

  // ---------------------------------------------------------------------------
  // Validation (packages/shared/src/autonomous.ts)
  // ---------------------------------------------------------------------------

  private function valid_id($id) {
    if (!is_string($id) || strlen($id) < 1 || strlen($id) > 100) {
      $this->fail('VALIDATION_ERROR', 'id must be between 1 and 100 characters', 422);
      return FALSE;
    }
    return TRUE;
  }

  private function validate_create($body) {
    $errors = array();
    $input = array();

    $input['title'] = $this->text($body, 'title', $errors, 1, 200);
    $input['department'] = $this->text($body, 'department', $errors, 1, 64);
    $input['recommendation'] = $this->text($body, 'recommendation', $errors, 1, 10000);
    $input['reasoning'] = $this->text($body, 'reasoning', $errors, 1, 20000);

    if (!array_key_exists('confidence', $body) || !is_numeric($body['confidence'])) {
      $errors[] = 'confidence must be a number between 0 and 1';
      $input['confidence'] = NULL;
    } else {
      $confidence = (float) $body['confidence'];
      if ($confidence < 0 || $confidence > 1) { $errors[] = 'confidence must be between 0 and 1'; $input['confidence'] = NULL; }
      else $input['confidence'] = $confidence;
    }

    if (!isset($body['riskLevel']) || !in_array($body['riskLevel'], array('low', 'med', 'high', 'critical'), TRUE)) {
      $errors[] = 'riskLevel must be one of: low, med, high, critical';
      $input['riskLevel'] = NULL;
    } else {
      $input['riskLevel'] = $body['riskLevel'];
    }

    // Node accepts any finite number; +/-INF and NAN never survive JSON.
    if (!array_key_exists('estimatedImpactUsd', $body) || !is_numeric($body['estimatedImpactUsd']) || !is_finite((float) $body['estimatedImpactUsd'])) {
      $errors[] = 'estimatedImpactUsd must be a finite number';
      $input['estimatedImpactUsd'] = NULL;
    } else {
      $input['estimatedImpactUsd'] = (float) $body['estimatedImpactUsd'];
    }

    if (count($errors)) { $this->fail('VALIDATION_ERROR', implode('; ', $errors), 422); return NULL; }
    return $input;
  }

  private function text($body, $field, &$errors, $min, $max) {
    if (!isset($body[$field]) || !is_string($body[$field])) { $errors[] = $field . ' is required'; return NULL; }
    $value = trim($body[$field]);
    if (strlen($value) < $min) { $errors[] = $field . ' must be at least ' . $min . ' characters'; return NULL; }
    if (strlen($value) > $max) { $errors[] = $field . ' must be at most ' . $max . ' characters'; return NULL; }
    return $value;
  }
}
