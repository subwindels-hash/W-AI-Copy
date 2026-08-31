<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Tenant Isolation — PHP port of apps/api/src/http/routes/tenantIsolation.ts.
 *
 *   GET  /api/v1/tenant-isolation/policy                 — this org's policy
 *   PUT  /api/v1/tenant-isolation/policy                 — upsert it
 *   POST /api/v1/tenant-isolation/compliance/run         — run the audit (201)
 *   GET  /api/v1/tenant-isolation/compliance/runs        — past runs
 *   GET  /api/v1/tenant-isolation/compliance/runs/:id    — one run
 *   POST /api/v1/tenant-isolation/export-check           — export gate (200/403)
 *
 * The export gate answers 200 when the stored policy allows the export and 403
 * when it does not, exactly as Node does — the body is `ok:true` either way so
 * callers read `data.allowed`, not the HTTP status.
 */
class Tenant_isolation extends MY_Controller {

  private $c;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->model('Tenant_isolation_model', 'ti');
  }

  private function org() {
    $org = $this->c['organizationId'] ?? NULL;
    if (!$org) { $this->fail('FORBIDDEN', 'Isolation policy is organization-scoped and this session carries no organization.', 403); return NULL; }
    return $org;
  }

  public function policy() {
    $org = $this->org(); if (!$org) return;
    $method = $this->input->method(TRUE);
    if ($method === 'GET')  return $this->respond($this->ti->get_policy($org));
    if ($method === 'PUT')  return $this->put_policy($org);
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or PUT required', 405);
  }

  private function put_policy($org) {
    $d = is_array($this->body()) ? $this->body() : array();
    foreach (array('allowCrossTenantExport', 'allowExternalSharing') as $f) {
      if (!array_key_exists($f, $d) || !is_bool($d[$f])) {
        return $this->fail('VALIDATION_ERROR', $f . ' is required and must be a boolean', 422);
      }
    }
    if (!isset($d['piiRedactionLevel']) || !in_array($d['piiRedactionLevel'], array('none', 'basic', 'strict'), TRUE)) {
      return $this->fail('VALIDATION_ERROR', 'piiRedactionLevel must be none, basic or strict', 422);
    }
    if (!isset($d['retentionDays']) || !is_numeric($d['retentionDays'])
        || (int)$d['retentionDays'] < 1 || (int)$d['retentionDays'] > 3650) {
      return $this->fail('VALIDATION_ERROR', 'retentionDays must be an integer between 1 and 3650', 422);
    }
    if (isset($d['regionPin']) && $d['regionPin'] !== NULL && strlen((string)$d['regionPin']) > 64) {
      return $this->fail('VALIDATION_ERROR', 'regionPin must be at most 64 characters', 422);
    }
    $policy = $this->ti->upsert_policy($org, $d, $this->c['sub'] ?? NULL);
    $this->audit_event('tenant-isolation.policy.updated', array('allowCrossTenantExport' => $policy['allowCrossTenantExport']));
    return $this->respond($policy);
  }

  public function compliance_run() {
    $org = $this->org(); if (!$org) return;
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $run = $this->ti->run_compliance($org);
    $this->audit_event('tenant-isolation.run_completed', array('runId' => $run['id'], 'status' => $run['status'], 'score' => $run['score']));
    return $this->respond($run, 201);
  }

  public function compliance_runs() {
    $org = $this->org(); if (!$org) return;
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->ti->list_runs($org));
  }

  public function compliance_run_item($id = NULL) {
    $org = $this->org(); if (!$org) return;
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    if (!$id || strlen($id) > 64) return $this->fail('VALIDATION_ERROR', 'A run id is required', 422);
    $run = $this->ti->get_run($org, $id);
    return $run ? $this->respond($run) : $this->fail('NOT_FOUND', 'Run not found', 404);
  }

  public function export_check() {
    $org = $this->org(); if (!$org) return;
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d       = is_array($this->body()) ? $this->body() : array();
    $dataset = isset($d['dataset']) ? trim((string)$d['dataset']) : '';
    if ($dataset === '' || strlen($dataset) > 200) {
      return $this->fail('VALIDATION_ERROR', 'dataset is required and must be 1-200 characters', 422);
    }
    $result = $this->ti->check_export($org, $dataset);
    $this->audit_event($result['allowed'] ? 'tenant-isolation.export.allowed' : 'tenant-isolation.export.blocked', array('dataset' => $dataset));
    return $this->respond($result, $result['allowed'] ? 200 : 403);
  }

  private function audit_event($type, $payload) {
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
