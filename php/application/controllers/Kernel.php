<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Enterprise AI Kernel — PHP port of apps/api/src/http/routes/kernel.ts.
 *
 *   GET  /api/v1/kernel/status            — dashboard summary
 *   GET  /api/v1/kernel/components        — component health list
 *   POST /api/v1/kernel/dispatch          — emit a kernel event
 *   GET  /api/v1/kernel/events            — newest 100 events
 *   POST /api/v1/kernel/policy/evaluate   — MVP policy decision
 *   POST /api/v1/kernel/resources/grant   — resource grant for a priority
 *   POST /api/v1/kernel/model/select      — model selection for a task
 *   POST /api/v1/kernel/diagnostics/run   — health sweep + MVP self-healing
 *
 * Every response keeps the Node envelope `{ ok, data, meta }`.
 */
class Kernel extends MY_Controller {

  private $c;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->model('Kernel_model', 'kernel');
    $this->kernel->ensure_started();
  }

  public function status() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->kernel->summary());
  }

  public function components() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->kernel->components());
  }

  public function dispatch() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d = $this->body();
    if (!is_array($d)) $d = array();

    $kind   = isset($d['kind'])   ? trim((string)$d['kind'])   : '';
    $source = isset($d['source']) ? trim((string)$d['source']) : '';
    if ($kind === '' || strlen($kind) > 80)     return $this->fail('VALIDATION_ERROR', 'kind is required and must be 1-80 characters', 422);
    if ($source === '' || strlen($source) > 120) return $this->fail('VALIDATION_ERROR', 'source is required and must be 1-120 characters', 422);

    $target = isset($d['target']) ? trim((string)$d['target']) : NULL;
    if ($target !== NULL && strlen($target) > 120) return $this->fail('VALIDATION_ERROR', 'target must be 1-120 characters', 422);

    $payload = isset($d['payload']) && is_array($d['payload']) ? $d['payload'] : array();

    $event = $this->kernel->dispatch(
      array('kind' => $kind, 'source' => $source, 'target' => $target, 'payload' => $payload),
      $this->c['organizationId'] ?? NULL,
      $this->c['sub'] ?? NULL
    );
    return $this->respond($event, 201);
  }

  public function events() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $limit = (int)($this->input->get('limit') ?: 100);
    return $this->respond($this->kernel->events($limit));
  }

  public function policy_evaluate() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d = $this->body();
    return $this->respond($this->kernel->evaluate_policy(is_array($d) ? $d : array()));
  }

  public function resources_grant() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d        = is_array($this->body()) ? $this->body() : array();
    $priority = isset($d['priority']) ? (string)$d['priority'] : 'interactive';
    if (!in_array($priority, array('interactive', 'batch'), TRUE)) {
      return $this->fail('VALIDATION_ERROR', 'priority must be interactive or batch', 422);
    }
    $gpuCards = NULL;
    if (array_key_exists('gpuCards', $d) && $d['gpuCards'] !== NULL) {
      if (!is_numeric($d['gpuCards']) || (int)$d['gpuCards'] < 0) {
        return $this->fail('VALIDATION_ERROR', 'gpuCards must be a non-negative integer', 422);
      }
      $gpuCards = (int)$d['gpuCards'];
    }
    return $this->respond($this->kernel->grant_resources($priority, $gpuCards));
  }

  public function model_select() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d    = is_array($this->body()) ? $this->body() : array();
    $task = isset($d['task']) ? trim((string)$d['task']) : 'chat';
    if ($task === '') $task = 'chat';
    return $this->respond($this->kernel->select_model($task, $this->c['organizationId'] ?? NULL));
  }

  public function diagnostics_run() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $result = $this->kernel->run_diagnostics();
    $this->audit('kernel.diagnostics', array('healthy' => $result['healthy'], 'degraded' => $result['degraded']));
    return $this->respond($result);
  }

  private function audit($type, $payload) {
    $this->db->insert('audit_events', array(
      'organization_id' => $this->c['organizationId'] ?? NULL,
      'user_id'         => $this->c['sub'] ?? NULL,
      'event_type'      => $type,
      'payload'         => json_encode($payload),
      'ip_address'      => $this->input->ip_address(),
      'user_agent'      => substr((string)$this->input->user_agent(), 0, 500),
      'created_at'      => date('Y-m-d H:i:s'),
    ));
  }
}
