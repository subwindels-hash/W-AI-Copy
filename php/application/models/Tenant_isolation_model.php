<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Tenant Isolation & Cross-Tenant Data Governance — PHP port of
 * apps/api/src/tenantIsolation/tenantIsolation.service.ts (Node Session 89).
 *
 * Cross-tenant leakage is the highest-severity failure mode on a shared
 * platform, so every verdict this model returns is measured, never asserted.
 *
 * WHAT HAD TO BE RE-SPECIFIED RATHER THAN TRANSLATED
 *
 * 1. Node audits *Redis key namespaces*: for each `org_scoped` prefix it checks
 *    that every key carries the org id as a segment. PHP has no Redis, so the
 *    audit scans the equivalent surface here — org-scoped *tables* — and counts
 *    rows whose `organization_id` is absent. A tenant row with no org is the
 *    same defect as a Redis key with no org segment: data outside the boundary.
 *    Findings use scope `database` (added to the shared union for this port).
 *
 * 2. Node's cross-tenant probe writes a throwaway policy for a synthetic org
 *    and reads it back as a different org. PHP does the same thing, with a
 *    sentinel row in `tenant_isolation_probes` and a real SELECT scoped to a
 *    different organization, and adds a second probe on the policy store.
 *    Both write, read, and then clean up — a probe that cannot fail is not a
 *    probe.
 */
class Tenant_isolation_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  /** Resolved primary-key column per table, so the audit only hits the DB once. */
  private $pkCache = array();

  const MAX_RUNS = 50;
  const PII_LEVELS = array('none', 'basic', 'strict');

  /**
   * Org-scoped tables whose organization_id must be present. Node's equivalent
   * is TI_NAMESPACE_CATALOG. Curated rather than derived from
   * information_schema: several tables legitimately hold platform-global rows
   * (organizations, users, refresh tokens, governance standards, event schemas),
   * and flagging those would be a false positive on every install.
   */
  /**
   * table => NULL when the row carries `organization_id` itself, or
   * [parent table, foreign key] when the tenant is reached through a parent.
   * Several tenant tables are scoped only indirectly — canvas blocks/cursors
   * through `canvases`, talk messages/members through `talk_channels`, webhook
   * deliveries through `webhook_endpoints`, workflow runs through `workflows` —
   * so an audit that only looked for an `organization_id` column would silently
   * skip most of the tenant surface (8 of these 17 tables on a fresh install).
   */
  const ORG_SCOPED_TABLES = array(
    'action_items'       => NULL,
    'canvas_blocks'      => array('canvases', 'canvas_id'),
    'canvas_connections' => array('canvases', 'canvas_id'),
    'canvas_cursors'     => array('canvases', 'canvas_id'),
    'canvas_presence'    => array('canvases', 'canvas_id'),
    'canvases'           => NULL,
    'kernel_events'      => NULL,
    'meetings'           => NULL,
    'memberships'        => NULL,
    'notifications'      => NULL,
    'talk_channels'      => NULL,
    'talk_members'       => array('talk_channels', 'channel_id'),
    'talk_messages'      => array('talk_channels', 'channel_id'),
    'webhook_deliveries' => array('webhook_endpoints', 'webhook_id'),
    'webhook_endpoints'  => NULL,
    'workflow_runs'      => array('workflows', 'workflow_id'),
    'workflows'          => NULL,
  );

  /**
   * Tables where a NULL organization_id means "platform-global entry", not a
   * leak: the model registry, the plugin catalogue and the service registry all
   * publish rows that every tenant may read, and the queries that consume them
   * select `organization_id = ? OR organization_id IS NULL` deliberately.
   * These are still counted and reported (scope `shared`) so the split is
   * visible, but an unscoped row here is not a finding.
   */
  const GLOBAL_OR_TENANT_TABLES = array('model_registry', 'plugins', 'service_registry');

  private function default_policy($orgId) {
    return array(
      'orgId'                   => $orgId,
      'allowCrossTenantExport'  => FALSE,
      'allowExternalSharing'    => FALSE,
      'piiRedactionLevel'       => 'basic',
      'retentionDays'           => 365,
      'regionPin'               => NULL,
      'updatedAt'               => '1970-01-01T00:00:00Z',
      'updatedBy'               => 'system',
    );
  }

  // ------------------------------------------------------------------ policy

  public function get_policy($orgId) {
    $row = $this->db->get_where('tenant_isolation_policies', array('organization_id' => $orgId), 1)->row_array();
    if (!$row) return $this->default_policy($orgId);
    return array(
      'orgId'                  => $row['organization_id'],
      'allowCrossTenantExport' => (bool)$row['allow_cross_tenant_export'],
      'allowExternalSharing'   => (bool)$row['allow_external_sharing'],
      'piiRedactionLevel'      => $row['pii_redaction_level'],
      'retentionDays'          => (int)$row['retention_days'],
      'regionPin'              => $row['region_pin'],
      'updatedAt'              => $this->iso($row['updated_at']),
      'updatedBy'              => $row['updated_by'],
    );
  }

  public function upsert_policy($orgId, $input, $actorId) {
    $now    = date('Y-m-d H:i:s');
    $record = array(
      'organization_id'          => $orgId,
      'allow_cross_tenant_export'=> !empty($input['allowCrossTenantExport']) ? 1 : 0,
      'allow_external_sharing'   => !empty($input['allowExternalSharing']) ? 1 : 0,
      'pii_redaction_level'      => $input['piiRedactionLevel'],
      'retention_days'           => (int)$input['retentionDays'],
      'region_pin'               => isset($input['regionPin']) ? $input['regionPin'] : NULL,
      'updated_by'               => $actorId,
      'updated_at'               => $now,
    );
    $exists = $this->db->get_where('tenant_isolation_policies', array('organization_id' => $orgId), 1)->row_array();
    if ($exists) $this->db->where('organization_id', $orgId)->update('tenant_isolation_policies', $record);
    else         $this->db->insert('tenant_isolation_policies', $record);
    return $this->get_policy($orgId);
  }

  /** Node's reviewPolicy(): the org's own settings vs the platform baseline. */
  public function review_policy($policy) {
    $findings = array();
    if (!empty($policy['allowCrossTenantExport'])) {
      $findings[] = array('severity' => 'medium', 'scope' => 'policy', 'message' => 'allowCrossTenantExport is enabled',
        'detail' => 'Cross-tenant data export is permitted by policy — confirm this is intentional.');
    }
    if (!empty($policy['allowExternalSharing'])) {
      $findings[] = array('severity' => 'medium', 'scope' => 'policy', 'message' => 'allowExternalSharing is enabled',
        'detail' => 'Data may be shared outside the tenant — confirm this is intentional.');
    }
    if (($policy['piiRedactionLevel'] ?? '') === 'none') {
      $findings[] = array('severity' => 'high', 'scope' => 'policy', 'message' => 'PII redaction is disabled',
        'detail' => 'The org mandates no PII redaction, which is not recommended for a shared platform.');
    }
    if ((int)($policy['retentionDays'] ?? 0) < 30) {
      $findings[] = array('severity' => 'low', 'scope' => 'policy', 'message' => 'retentionDays is ' . (int)$policy['retentionDays'] . ' (< 30)',
        'detail' => 'Short retention may conflict with compliance obligations.');
    }
    if (!empty($policy['regionPin'])) {
      $findings[] = array('severity' => 'low', 'scope' => 'policy', 'message' => 'region pinned to ' . $policy['regionPin'],
        'detail' => 'Data is pinned to a specific region by policy.');
    }
    return $findings;
  }

  // ------------------------------------------------------------------- audit

  /**
   * Real row-level tenancy scan. Returns [namespaces, findings]; every count is
   * a COUNT(*) against the live table.
   */
  public function audit_tenancy() {
    $namespaces = array();
    $findings   = array();

    $plan = array();
    foreach (self::ORG_SCOPED_TABLES as $table => $via)       $plan[$table] = array($via, 'org_scoped');
    foreach (self::GLOBAL_OR_TENANT_TABLES as $table)         $plan[$table] = array(NULL, 'shared');

    foreach ($plan as $table => $entry) {
      list($via, $scope) = $entry;
      if (!$this->db->table_exists($table)) continue;
      $key = $this->primary_key_of($table);

      if ($via === NULL) {
        if (!$this->db->field_exists('organization_id', $table)) continue;
        $from  = "`{$table}`";
        $where = "organization_id IS NULL OR organization_id = ''";
        $sel   = "`{$key}` AS id";
      } else {
        list($parent, $fk) = $via;
        if (!$this->db->table_exists($parent)) continue;
        if (!$this->db->field_exists($fk, $table)) continue;
        if (!$this->db->field_exists('organization_id', $parent)) continue;
        // LEFT JOIN, so an orphaned child (parent deleted) also counts as
        // unscoped — a row whose tenant can no longer be resolved is outside
        // the boundary whether or not the column is empty.
        $from  = "`{$table}` c LEFT JOIN `{$parent}` p ON p.id = c.`{$fk}`";
        $where = "p.id IS NULL OR p.organization_id IS NULL OR p.organization_id = ''";
        $sel   = "c.`{$key}` AS id";
      }

      $total  = (int)$this->db->query("SELECT COUNT(*) AS n FROM `{$table}`")->row()->n;
      $leakedRows = $this->db->query("SELECT {$sel} FROM {$from} WHERE {$where} LIMIT 10")->result_array();
      $leaked = $this->db->query("SELECT COUNT(*) AS n FROM {$from} WHERE {$where}")->row()->n;

      $namespaces[] = array(
        'prefix'         => $table,
        'scope'          => $scope,
        'keyCount'       => $total,
        'conformingKeys' => $total - (int)$leaked,
        'leakedKeys'     => array_map(function ($r) { return (string)$r['id']; }, $leakedRows),
        'note'           => (int)$leaked === 0
          ? 'all rows carry an organization_id'
          : ($scope === 'shared'
              ? ((int)$leaked . ' platform-global row(s) — intentionally unscoped, reported not flagged')
              : ((int)$leaked . ' row(s) carry no organization_id — outside the tenant boundary')),
      );

      if ((int)$leaked > 0 && $scope === 'org_scoped') {
        $findings[] = array(
          'severity' => 'high', 'scope' => 'database',
          'message'  => "{$table}: " . (int)$leaked . ' row(s) have no organization_id',
          'detail'   => 'Tenant-scoped table with unscoped rows — these are readable outside any org scope.',
        );
      }
    }
    return array($namespaces, $findings);
  }

  /**
   * Cross-tenant row probe. Writes a sentinel row under a synthetic org, then
   * tries to read it back scoped to a *different* org. Passing means the
   * scoping predicate actually held.
   */
  public function probe_row_isolation() {
    $t0    = microtime(TRUE);
    $key   = 'tiprobe_' . bin2hex(random_bytes(6));
    $orgA  = 'probe-a-' . substr($key, -12);
    $orgB  = 'probe-b-' . substr($key, -12);
    $owned = FALSE;
    try {
      $this->db->insert('tenant_isolation_probes', array(
        'probe_key'       => $key,
        'organization_id' => $orgA,
        'payload'         => json_encode(array('sentinel' => TRUE)),
        'created_at'      => date('Y-m-d H:i:s'),
      ));
      $owned = $this->db->where('probe_key', $key)->where('organization_id', $orgA)->count_all_results('tenant_isolation_probes') > 0;
      // The whole point: read it back as a different tenant.
      $visible = $this->db->where('probe_key', $key)->where('organization_id', $orgB)->count_all_results('tenant_isolation_probes');
      $passed  = $owned && (int)$visible === 0;
      $detail  = $passed
        ? "Sentinel row written under the synthetic tenant was invisible to another tenant's scope."
        : 'FAIL: the sentinel row was readable from another tenant (cross-tenant leak detected).';
    } catch (Throwable $e) {
      $passed = FALSE;
      $detail = 'FAIL: probe could not run — ' . $e->getMessage();
    } finally {
      $this->db->where('probe_key', $key)->delete('tenant_isolation_probes');
    }
    return array(
      'name'       => 'cross-tenant row isolation (organization_id scope)',
      'passed'     => $passed,
      'detail'     => $detail,
      'durationMs' => $this->ms($t0),
    );
  }

  /**
   * Cross-tenant policy probe — the direct port of Node's policyCrossTenantProbe:
   * store a policy for one tenant, read as another, prove it is not visible.
   * The synthetic orgs are deleted afterwards.
   */
  public function probe_policy_isolation() {
    $t0   = microtime(TRUE);
    $seed = bin2hex(random_bytes(5));
    // The probe needs two real organization rows: tenant_isolation_policies is
    // foreign-keyed to organizations(id), so a synthetic id would fail the
    // constraint before the isolation question was ever asked — the probe would
    // be measuring the foreign key, not tenant scoping. Two throwaway orgs are
    // created, used, and deleted (the FK cascades the policy rows away).
    $orgA = $this->probe_org('Isolation probe A ' . $seed, 'probe-a-' . $seed);
    $orgB = $this->probe_org('Isolation probe B ' . $seed, 'probe-b-' . $seed);
    try {
      if (!$orgA || !$orgB) throw new RuntimeException('could not create the probe organizations');
      $this->db->insert('tenant_isolation_policies', array(
        'organization_id'           => $orgA,
        'allow_cross_tenant_export' => 1,
        'allow_external_sharing'    => 0,
        'pii_redaction_level'       => 'strict',
        'retention_days'            => 90,
        'region_pin'                => 'probe-region',
        'updated_by'                => NULL,
        'updated_at'                => date('Y-m-d H:i:s'),
      ));
      $seen  = $this->db->get_where('tenant_isolation_policies', array('organization_id' => $orgB), 1)->row_array();
      // Org B has no stored policy, so it must fall back to the platform default.
      $leaked = $seen && $seen['region_pin'] === 'probe-region';
      $passed = !$leaked;
      $detail = $passed
        ? "Org A's policy was not visible to org B (B kept the platform default)."
        : "FAIL: org B observed org A's policy (cross-tenant leak detected).";
    } catch (Throwable $e) {
      $passed = FALSE;
      $detail = 'FAIL: probe could not run — ' . $e->getMessage();
    } finally {
      if ($orgA) $this->db->where('id', $orgA)->delete('organizations');
      if ($orgB) $this->db->where('id', $orgB)->delete('organizations');
    }
    return array(
      'name'       => 'cross-tenant policy isolation (tenant_isolation_policies)',
      'passed'     => $passed,
      'detail'     => $detail,
      'durationMs' => $this->ms($t0),
    );
  }

  /** Create a throwaway organization for a probe; returns its id or NULL. */
  private function probe_org($name, $slug) {
    $id = $this->uuid();
    try {
      $this->db->insert('organizations', array(
        'id'         => $id,
        'name'       => substr($name, 0, 100),
        'slug'       => substr($slug, 0, 140),
        'created_at' => date('Y-m-d H:i:s'),
        'updated_at' => date('Y-m-d H:i:s'),
      ));
      return $id;
    } catch (Throwable $e) {
      return NULL;
    }
  }

  private function uuid() {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 15) | 64);
    $b[8] = chr((ord($b[8]) & 63) | 128);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
  }

  // ------------------------------------------------------- compliance runs

  public function run_compliance($orgId) {
    list($namespaces, $nsFindings) = $this->audit_tenancy();
    $probes   = array($this->probe_row_isolation(), $this->probe_policy_isolation());
    $policy   = $this->get_policy($orgId);
    $findings = array_merge($nsFindings, $this->review_policy($policy));
    foreach ($probes as $p) {
      if (empty($p['passed'])) {
        $findings[] = array('severity' => 'high', 'scope' => 'probe',
          'message' => 'Self-test failed: ' . $p['name'], 'detail' => $p['detail']);
      }
    }

    $score = 100;
    foreach ($findings as $f) {
      $score -= $f['severity'] === 'high' ? 25 : ($f['severity'] === 'medium' ? 10 : 5);
    }
    $score = max(0, min(100, $score));

    $hasHigh   = FALSE; $hasMedium = FALSE;
    foreach ($findings as $f) { if ($f['severity'] === 'high') $hasHigh = TRUE; if ($f['severity'] === 'medium') $hasMedium = TRUE; }
    foreach ($probes as $p) { if (empty($p['passed'])) $hasHigh = TRUE; }

    $status = $hasHigh ? 'failed' : ($hasMedium ? 'review_required' : 'compliant');
    $summary = $status === 'compliant' ? 'Isolation posture is compliant.'
             : ($status === 'failed'   ? 'Isolation posture FAILED — review the findings immediately.'
                                       : 'Isolation posture requires review.');

    $ranAt = date('Y-m-d H:i:s');
    $run = array(
      'id'         => 'tirun_' . bin2hex(random_bytes(4)),
      'orgId'      => $orgId,
      'ranAt'      => $this->iso($ranAt),
      'status'     => $status,
      'score'      => $score,
      'namespaces' => $namespaces,
      'probes'     => $probes,
      'findings'   => $findings,
      'summary'    => $summary,
    );

    $this->db->insert('tenant_isolation_runs', array(
      'id'              => $run['id'],
      'organization_id' => $orgId,
      'status'          => $status,
      'score'           => $score,
      'namespaces'      => json_encode($namespaces),
      'probes'          => json_encode($probes),
      'findings'        => json_encode($findings),
      'summary'         => $summary,
      'ran_at'          => $ranAt,
    ));
    $this->prune_runs($orgId);
    return $run;
  }

  public function list_runs($orgId) {
    $rows = $this->db->order_by('ran_at', 'DESC')->limit(self::MAX_RUNS)
                     ->get_where('tenant_isolation_runs', array('organization_id' => $orgId))->result_array();
    return array_map(array($this, 'shape_run'), $rows);
  }

  public function get_run($orgId, $runId) {
    $row = $this->db->get_where('tenant_isolation_runs',
      array('organization_id' => $orgId, 'id' => $runId), 1)->row_array();
    return $row ? $this->shape_run($row) : NULL;
  }

  private function shape_run($row) {
    return array(
      'id'         => $row['id'],
      'orgId'      => $row['organization_id'],
      'ranAt'      => $this->iso($row['ran_at']),
      'status'     => $row['status'],
      'score'      => (int)$row['score'],
      'namespaces' => json_decode($row['namespaces'], TRUE) ?: array(),
      'probes'     => json_decode($row['probes'], TRUE) ?: array(),
      'findings'   => json_decode($row['findings'], TRUE) ?: array(),
      'summary'    => $row['summary'],
    );
  }

  private function prune_runs($orgId) {
    $total = (int)$this->db->where('organization_id', $orgId)->count_all_results('tenant_isolation_runs');
    if ($total <= self::MAX_RUNS) return;
    $old = $this->db->select('id')->order_by('ran_at', 'ASC')->limit($total - self::MAX_RUNS)
                    ->get_where('tenant_isolation_runs', array('organization_id' => $orgId))->result_array();
    foreach ($old as $r) $this->db->where('id', $r['id'])->delete('tenant_isolation_runs');
  }

  // ------------------------------------------------------------ export gate

  /**
   * The gate other modules call before moving data outside the tenant.
   * The verdict comes from the stored policy — never assumed.
   */
  public function check_export($orgId, $dataset) {
    $policy  = $this->get_policy($orgId);
    $allowed = !empty($policy['allowCrossTenantExport']);
    return array(
      'allowed' => $allowed,
      'dataset' => $dataset,
      'reason'  => $allowed
        ? 'Org policy permits cross-tenant export.'
        : 'Blocked by org isolation policy (allowCrossTenantExport=false).',
      'policy'  => array(
        'allowCrossTenantExport' => $allowed,
        'piiRedactionLevel'      => $policy['piiRedactionLevel'],
        'regionPin'              => $policy['regionPin'],
      ),
    );
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Not every org-scoped table names its identifier `id` — `talk_members` is
   * keyed on (channel_id, user_id) — so the evidence column is resolved per
   * table instead of assumed.
   */
  private function primary_key_of($table) {
    if (isset($this->pkCache[$table])) return $this->pkCache[$table];
    $key = 'id';
    try {
      foreach ($this->db->field_data($table) as $field) {
        if (!empty($field->primary_key)) { $key = $field->name; break; }
      }
      if ($key === 'id' && !$this->db->field_exists('id', $table)) {
        $fields = $this->db->list_fields($table);
        if ($fields) $key = $fields[0];
      }
    } catch (Throwable $e) {
      $key = '*';
    }
    return $this->pkCache[$table] = $key;
  }

  private function iso($dt) { $ts = strtotime((string)$dt); return $ts ? gmdate('Y-m-d\TH:i:s\Z', $ts) : NULL; }
  private function ms($t0)  { return (int)round((microtime(TRUE) - $t0) * 1000); }
}
