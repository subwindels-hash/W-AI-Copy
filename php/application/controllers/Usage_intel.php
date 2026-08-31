<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Usage Intelligence — PHP port of apps/api/src/http/routes/usage.ts.
 *
 *   GET    /api/v1/usage-intel/dashboard/rollup   any authenticated member
 *   POST   /api/v1/usage-intel/events             admin → 201
 *   GET    /api/v1/usage-intel/events             any authenticated member
 *   GET    /api/v1/usage-intel/events/:id         org-scoped single fetch
 *   DELETE /api/v1/usage-intel/events/:id         admin → correction path
 *
 * Every handler refuses a session carrying no organization with 403 rather
 * than building a query scoped to a null id (Session 123).
 */
class Usage_intel extends MY_Controller {

  private $c;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->model('Usage_model', 'usage');
  }

  private function org() {
    $org = $this->c['organizationId'] ?? NULL;
    if (!$org) {
      $this->fail('FORBIDDEN', 'The usage ledger is organization-scoped and this session carries no organization.', 403);
      return NULL;
    }
    return $org;
  }

  private function is_admin() {
    return in_array(strtolower((string)($this->c['role'] ?? '')), array('super_admin', 'admin', 'owner'), TRUE);
  }

  public function dashboard_rollup() {
    $org = $this->org(); if (!$org) return;
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);

    $rollup = $this->usage->dashboard($org);
    // Same window Node reports: the most recent 100 events, newest first.
    $events = $this->usage->list_events($org, 100);
    $byFeature = array();
    foreach ($events as $e) {
      if (!isset($byFeature[$e['feature']])) $byFeature[$e['feature']] = array('quantity' => 0, 'count' => 0);
      $byFeature[$e['feature']]['quantity'] += $e['quantity'];
      $byFeature[$e['feature']]['count']    += 1;
    }
    $rollup['ledger'] = array(
      'total'     => count($events),
      'byFeature' => $byFeature,
      // Session 123 — say that these counts are a window, not the whole ledger.
      'note'      => 'Counts cover the most recent 100 recorded events, newest first.',
    );
    return $this->respond($rollup);
  }

  public function events_index() {
    $org = $this->org(); if (!$org) return;
    $method = $this->input->method(TRUE);

    if ($method === 'POST') {
      if (!$this->is_admin()) return $this->fail('FORBIDDEN', 'Only admins can record usage events', 403);
      $d = is_array($this->body()) ? $this->body() : array();

      $feature  = isset($d['feature']) ? trim((string)$d['feature']) : '';
      $actor    = isset($d['actor']) ? trim((string)$d['actor']) : '';
      $unit     = isset($d['unit']) ? trim((string)$d['unit']) : '';
      $quantity = $d['quantity'] ?? NULL;

      if (strlen($feature) < 2 || strlen($feature) > 64) return $this->fail('VALIDATION_ERROR', 'feature must be 2-64 characters', 422);
      if (strlen($actor) < 2 || strlen($actor) > 120)    return $this->fail('VALIDATION_ERROR', 'actor must be 2-120 characters', 422);
      if ($unit === '' || strlen($unit) > 24)            return $this->fail('VALIDATION_ERROR', 'unit must be 1-24 characters', 422);
      if (!is_numeric($quantity) || (float)$quantity < 0 || (float)$quantity > 1e9) {
        return $this->fail('VALIDATION_ERROR', 'quantity must be a number between 0 and 1000000000', 422);
      }
      if (isset($d['meta']) && !is_array($d['meta'])) return $this->fail('VALIDATION_ERROR', 'meta must be an object', 422);

      return $this->respond($this->usage->record_event($org, $d, $this->c['sub'] ?? NULL), 201);
    }

    if ($method === 'GET') {
      $limit = (int)($this->input->get('limit') ?: 100);
      return $this->respond($this->usage->list_events($org, $limit));
    }
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  public function events_item($id = NULL) {
    $org = $this->org(); if (!$org) return;
    $method = $this->input->method(TRUE);
    if (!$id) return $this->fail('VALIDATION_ERROR', 'An event id is required', 422);

    if ($method === 'GET') {
      $event = $this->usage->get_event($org, $id);
      return $event ? $this->respond($event) : $this->fail('NOT_FOUND', 'Event not found', 404);
    }
    if ($method === 'DELETE') {
      if (!$this->is_admin()) return $this->fail('FORBIDDEN', 'Only admins can remove usage events', 403);
      if (!$this->usage->remove_event($org, $id)) return $this->fail('NOT_FOUND', 'Event not found', 404);
      return $this->respond(array('id' => $id, 'deleted' => TRUE));
    }
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or DELETE required', 405);
  }
}
