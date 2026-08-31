<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_center — Super Admin control plane for signed module packages.
 *
 * Port of apps/api/src/http/routes/moduleCenter.ts (13 routes) and its service.
 * Every route requires an authenticated user whose role is SUPER_ADMIN, which
 * is the PHP equivalent of Node's authenticate + requireSuperAdmin.
 *
 * Lifecycle: upload -> verify -> sandbox-test -> approve -> install, then
 * enable / disable / restart / health-check, with rollback and remove.
 *
 * Two honest boundaries, both inherited from the Node design rather than
 * invented here:
 *
 *   1. VERIFICATION FAILS CLOSED. A detached publisher signature and a
 *      configured malware scanner are both required; without them the report
 *      carries a critical NOT_CONFIGURED/FAILED check and the release is
 *      quarantined. Nothing here relaxes that.
 *   2. ANYTHING THAT WOULD RUN UPLOADED CODE is delegated to the isolated
 *      Module Runner (application/libraries/Module_runner.php). With no runner
 *      configured those actions do not succeed: they record the attempt and
 *      return NOT_CONFIGURED, leaving the package inactive.
 */
class Module_center extends MY_Controller {

  private $c;
  private $actor;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->model('Module_center_model', 'mc');
    if ($this->mc->user_role($this->c['sub']) !== 'SUPER_ADMIN') {
      $this->fail('FORBIDDEN', 'Super administrator access required', 403);
      $this->output->_display();
      exit;
    }
    $this->actor = array('userId' => $this->c['sub'], 'organizationId' => isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL);
    $this->load->library('Module_package');
    $this->load->library('Module_runner');
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/super-admin/module-center/dashboard
  // ---------------------------------------------------------------------------
  public function dashboard() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $scanner = getenv('VP_CLAMD_HOST');
    return $this->respond($this->mc->dashboard(
      $this->module_runner->is_configured(),
      $scanner !== FALSE && trim($scanner) !== '',
      count($this->module_package->publisher_keys())
    ));
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/super-admin/module-center/modules
  // GET /api/v1/super-admin/module-center/modules/:id
  // ---------------------------------------------------------------------------
  public function modules_index() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->mc->listing());
  }

  public function module_item($id = NULL) {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $module = $this->mc->get((string) $id);
    return $module ? $this->respond($module) : $this->fail('NOT_FOUND', 'Module not found', 404);
  }

  // ---------------------------------------------------------------------------
  // GET  /api/v1/super-admin/module-center/uploads
  // POST /api/v1/super-admin/module-center/uploads   (multipart: package)
  // ---------------------------------------------------------------------------
  /** CodeIgniter routes on URI only; split the two verbs here. */
  public function uploads_dispatch() {
    $method = $this->input->method(TRUE);
    if ($method === 'POST') return $this->uploads_create();
    if ($method === 'GET') return $this->uploads_index();
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  public function uploads_index() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $limit = (int) ($this->input->get('limit') ?: 100);
    $out = array();
    foreach ($this->mc->uploads($limit) as $upload) $out[] = $this->mc->public_upload($upload);
    return $this->respond($out);
  }

  public function uploads_create() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $max_bytes = max(1, (int) (getenv('VP_MODULE_MAX_PACKAGE_MB') ?: 50)) * 1024 * 1024;

    if (!isset($_FILES['package']) || !is_uploaded_file($_FILES['package']['tmp_name'])) {
      return $this->fail('VALIDATION_ERROR', 'A module package file field named "package" is required', 422);
    }
    $file = $_FILES['package'];
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
      return $this->fail('VALIDATION_ERROR', 'The module package could not be received', 422);
    }
    $original_name = substr((string) $file['name'], 0, 255);
    $size = (int) @filesize($file['tmp_name']);
    if ($size <= 0) return $this->fail('VALIDATION_ERROR', 'The module package is empty', 422);
    if ($size > $max_bytes) return $this->fail('VALIDATION_ERROR', "Module package exceeds {$max_bytes} bytes", 422);

    $stored = $this->mc->store_incoming($file['tmp_name']);
    if (!$stored) return $this->fail('UPLOAD_FAILED', 'The module package could not be stored', 500);

    $signature = substr((string) $this->input->post('signature'), 0, 2048);
    $signature_key_id = substr((string) $this->input->post('signatureKeyId'), 0, 120);
    if ($signature_key_id === '') $signature_key_id = NULL;

    // --- duplicate package: re-attach a new signature to the existing release
    $duplicate = $this->mc->upload_by_checksum($stored['checksum']);
    if ($duplicate) {
      @unlink($stored['path']);
      $release = isset($duplicate['release_id']) ? $this->mc->release($duplicate['release_id']) : NULL;
      if ($release && !in_array($release['status'], array('ACTIVE', 'INSTALLING', 'MIGRATING', 'HEALTH_CHECK'), TRUE)) {
        $report = is_array($duplicate['report']) ? $duplicate['report'] : array();
        $report['signature'] = $signature;
        $report['duplicateUploadDetected'] = TRUE;
        $report['signatureUpdatedAt'] = gmdate('c');
        $uploaded = $this->mc->update_upload($duplicate['id'], array('signature_key_id' => $signature_key_id, 'status' => 'UPLOADED', 'report' => $report));
        $release = $this->mc->update_release($release['id'], array(
          'signature_key_id' => $signature_key_id, 'signature_verified' => 0, 'status' => 'UPLOADED',
          'scan_status' => 'PENDING', 'compatibility_status' => 'PENDING', 'sandbox_status' => 'PENDING',
          'approval_status' => 'PENDING', 'verification_report' => array(), 'sandbox_report' => array(),
        ));
        $this->mc->update_module($release['module_registry_id'], array('status' => 'UPLOADED', 'health' => 'UNKNOWN', 'last_error' => NULL));
        $this->mc->audit($this->actor, 'module.signature_updated', 'module_upload', $duplicate['id'], array('releaseId' => $release['id'], 'checksum' => $stored['checksum'], 'duplicateDetected' => TRUE));
        return $this->respond(array(
          'upload'     => $this->mc->public_upload($uploaded),
          'release'    => $this->mc->public_release($release),
          'module'     => $this->mc->get($release['module_registry_id']),
          'nextAction' => 'VERIFY',
          'duplicateDetected' => TRUE,
        ), 200);
      }
      return $this->fail('CONFLICT', 'This exact package was already uploaded as ' . $duplicate['id'], 409);
    }

    // --- new package: quarantine first, inspect before anything is registered
    $artifact = $this->mc->move_artifact($stored['path'], 'quarantine', $stored['checksum']);
    if (!$artifact) return $this->fail('UPLOAD_FAILED', 'The module package could not be quarantined', 500);

    try {
      $inspection = $this->module_package->inspect($artifact);
    } catch (Module_package_error $error) {
      $row = $this->mc->create_upload(array(
        'original_name' => $original_name, 'checksum' => $stored['checksum'], 'size_bytes' => $size,
        'artifact_path' => $artifact, 'status' => 'QUARANTINED', 'uploaded_by_id' => $this->actor['userId'],
        'signature_key_id' => $signature_key_id,
        'report' => array('accepted' => FALSE, 'error' => $error->getMessage()),
      ));
      $this->mc->audit($this->actor, 'module.upload_rejected', 'module_upload', $row['id'], array('checksum' => $stored['checksum'], 'reason' => $error->getMessage()));
      return $this->fail('VALIDATION_ERROR', 'Module package was quarantined during structural validation', 422, array('uploadId' => $row['id'], 'reason' => $error->getMessage()));
    }

    $manifest = $inspection['manifest'];
    $module = $this->mc->module_by_key($manifest['id']);
    if ($module) {
      if ($this->mc->release_by_version($module['id'], $manifest['version'])) {
        $row = $this->mc->create_upload(array(
          'original_name' => $original_name, 'checksum' => $stored['checksum'], 'size_bytes' => $size,
          'artifact_path' => $artifact, 'status' => 'QUARANTINED', 'uploaded_by_id' => $this->actor['userId'],
          'manifest_id' => $manifest['id'], 'manifest_version' => $manifest['version'],
          'signature_key_id' => $signature_key_id,
          'report' => array('accepted' => FALSE, 'error' => 'duplicate module version'),
        ));
        $this->mc->audit($this->actor, 'module.upload_rejected', 'module_upload', $row['id'], array('moduleId' => $manifest['id'], 'version' => $manifest['version'], 'reason' => 'duplicate version'));
        return $this->fail('CONFLICT', "Module {$manifest['id']} version {$manifest['version']} already exists", 409);
      }
    } else {
      $module = $this->mc->create_module($manifest);
    }

    $release = $this->mc->create_release($module, $manifest, $stored['checksum'], $artifact, $size, $signature_key_id, $this->actor['userId']);
    $upload_row = $this->mc->create_upload(array(
      'original_name' => $original_name, 'checksum' => $stored['checksum'], 'size_bytes' => $size,
      'artifact_path' => $artifact, 'status' => 'UPLOADED', 'manifest_id' => $manifest['id'],
      'manifest_version' => $manifest['version'], 'signature_key_id' => $signature_key_id,
      'uploaded_by_id' => $this->actor['userId'], 'release_id' => $release['id'],
      'report' => array(
        'accepted' => TRUE,
        'signature' => $signature,
        'archive' => array('fileCount' => $inspection['fileCount'], 'compressedBytes' => $inspection['compressedBytes'], 'uncompressedBytes' => $inspection['uncompressedBytes']),
      ),
    ));

    $op = $this->mc->operation(array(
      'moduleRegistryId' => $module['id'], 'releaseId' => $release['id'], 'type' => 'UPLOAD',
      'actorId' => $this->actor['userId'], 'idempotencyKey' => 'upload:' . $stored['checksum'], 'toVersion' => $release['version'],
    ));
    if (!$op['duplicate']) {
      $this->mc->finish_operation($op['row']['id'], TRUE, array('uploadId' => $upload_row['id'], 'checksum' => $stored['checksum'], 'executed' => FALSE), array('Package stored in quarantine; no uploaded code was executed.'));
    }
    $module = $this->mc->update_module($module['id'], array('status' => 'UPLOADED', 'name' => $manifest['name'], 'description' => $manifest['description'], 'vendor' => $manifest['vendor'], 'package_type' => $manifest['packageType']));
    $this->mc->audit($this->actor, 'module.uploaded', 'module_release', $release['id'], array('moduleId' => $manifest['id'], 'version' => $manifest['version'], 'checksum' => $stored['checksum'], 'executed' => FALSE));

    return $this->respond(array(
      'upload'     => $this->mc->public_upload($upload_row),
      'release'    => $this->mc->public_release($release),
      'module'     => $this->mc->get($module['id']),
      'nextAction' => 'VERIFY',
      'duplicateDetected' => FALSE,
    ), 201);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/super-admin/module-center/operations
  // ---------------------------------------------------------------------------
  public function operations_index() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $limit = (int) ($this->input->get('limit') ?: 200);
    $out = array();
    foreach ($this->mc->operations($limit) as $row) $out[] = $this->mc->operation_public($row);
    return $this->respond($out);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/releases/:id/verify
  // ---------------------------------------------------------------------------
  public function release_verify($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $release = $this->mc->release((string) $id);
    if (!$release) return $this->fail('NOT_FOUND', 'Module release not found', 404);

    $report = $release['verification_report'];
    $already = in_array($release['status'], array('ACTIVE', 'APPROVED', 'VALIDATED', 'SANDBOX_TEST'), TRUE)
      && is_array($report) && isset($report['passed']) && $report['passed'] === TRUE;
    if ($already) return $this->respond($this->mc->public_release($release));

    $op = $this->mc->operation(array('moduleRegistryId' => $release['module_registry_id'], 'releaseId' => $release['id'], 'type' => 'VERIFY', 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'toVersion' => $release['version']));
    if ($op['duplicate']) return $this->respond($this->mc->public_release($release));

    $this->mc->update_release($release['id'], array('status' => 'SCANNING', 'scan_status' => 'RUNNING'));
    $this->mc->update_module($release['module_registry_id'], array('status' => 'SCANNING'));

    try {
      $inspection = $this->module_package->inspect($release['artifact_path']);
      $upload = $this->mc->upload_by_release($release['id']);
      $upload_report = ($upload && is_array($upload['report'])) ? $upload['report'] : array();
      $report = $this->module_package->verify(array(
        'releaseId'      => $release['id'],
        'artifactPath'   => $release['artifact_path'],
        'checksum'       => $release['checksum'],
        'signatureKeyId' => $release['signature_key_id'],
        'signature'      => isset($upload_report['signature']) ? $upload_report['signature'] : NULL,
        'inspection'     => $inspection,
        'knownPermissions' => $this->mc->known_permissions(),
        'installedModules' => $this->mc->installed_modules(),
      ));
      $signature_verified = FALSE;
      $scanner_passed = FALSE;
      foreach ($report['checks'] as $item) {
        if ($item['code'] === 'SIGNATURE_VERIFIED' && $item['status'] === 'PASSED') $signature_verified = TRUE;
        if ($item['code'] === 'MALWARE_SCAN_CLEAN' && $item['status'] === 'PASSED') $scanner_passed = TRUE;
      }
      $artifact_path = $report['passed'] ? $this->mc->move_artifact($release['artifact_path'], 'verified', $release['checksum']) : $release['artifact_path'];
      if ($report['passed'] && !$artifact_path) $artifact_path = $release['artifact_path'];
      $status = $report['passed'] ? 'SANDBOX_TEST' : 'QUARANTINED';
      $updated = $this->mc->update_release($release['id'], array(
        'status' => $status, 'artifact_path' => $artifact_path, 'signature_verified' => $signature_verified,
        'scan_status' => $scanner_passed ? 'PASSED' : 'FAILED',
        'compatibility_status' => $report['passed'] ? 'PASSED' : 'FAILED',
        'verification_report' => $report, 'verified_at' => date('Y-m-d H:i:s'),
      ));
      if ($upload) $this->mc->update_upload($upload['id'], array('status' => $status, 'artifact_path' => $artifact_path, 'report' => array_merge($upload_report, array('verification' => $report))));
      $this->mc->update_module($release['module_registry_id'], array(
        'status' => $status, 'health' => $report['passed'] ? 'UNKNOWN' : 'QUARANTINED',
        'last_error' => $report['passed'] ? NULL : 'Package verification failed',
      ));
      $logs = array();
      foreach ($report['checks'] as $item) $logs[] = $item['status'] . ' ' . $item['code'] . ': ' . $item['message'];
      $this->mc->finish_operation($op['row']['id'], $report['passed'], array('report' => $report), $logs,
        $report['passed'] ? NULL : array('code' => 'MODULE_VERIFICATION_FAILED', 'message' => 'One or more critical verification checks failed'));
      $module = $this->mc->module($release['module_registry_id']);
      $this->mc->audit($this->actor, $report['passed'] ? 'module.verification_succeeded' : 'module.verification_failed', 'module_release', $release['id'], array('moduleId' => $module['module_key'], 'version' => $release['version'], 'checks' => count($report['checks'])));
      return $this->respond($this->mc->public_release($updated));
    } catch (Exception $error) {
      $this->mc->update_release($release['id'], array('status' => 'QUARANTINED', 'scan_status' => 'FAILED', 'compatibility_status' => 'FAILED'));
      $this->mc->update_module($release['module_registry_id'], array('status' => 'QUARANTINED', 'health' => 'QUARANTINED', 'last_error' => $error->getMessage()));
      $this->mc->finish_operation($op['row']['id'], FALSE, array(), array(), array('code' => 'MODULE_VERIFICATION_ERROR', 'message' => $error->getMessage()));
      return $this->fail('VALIDATION_ERROR', 'Module package could not be verified: ' . $error->getMessage(), 422);
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/releases/:id/sandbox-test
  // ---------------------------------------------------------------------------
  public function release_sandbox($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $release = $this->mc->release((string) $id);
    if (!$release) return $this->fail('NOT_FOUND', 'Module release not found', 404);
    if ($release['status'] !== 'SANDBOX_TEST') return $this->fail('CONFLICT', "Sandbox testing requires SANDBOX_TEST status, found {$release['status']}", 409);

    $op = $this->mc->operation(array('moduleRegistryId' => $release['module_registry_id'], 'releaseId' => $release['id'], 'type' => 'SANDBOX_TEST', 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'toVersion' => $release['version']));
    if ($op['duplicate']) return $this->respond($this->mc->public_release($release));

    $module = $this->mc->module($release['module_registry_id']);
    $result = $this->runner_call($module, $release, 'SANDBOX_TEST', $op['row']['correlation_id']);
    $contract = $this->sandbox_contract($result, $release['manifest']);
    if (count($contract['missing'])) {
      $result['checks'][] = array('code' => 'SANDBOX_EVIDENCE_INCOMPLETE', 'category' => 'sandbox', 'status' => 'FAILED', 'severity' => 'critical',
        'message' => 'Runner did not prove required stages: ' . implode(', ', $contract['missing']) . '.', 'evidence' => array('missing' => $contract['missing']));
    }
    $status = $contract['ok'] ? 'VALIDATED' : 'SANDBOX_TEST';
    $updated = $this->mc->update_release($release['id'], array(
      'status' => $status,
      'sandbox_status' => $contract['ok'] ? 'PASSED' : ($result['status'] === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED'),
      'sandbox_report' => $result,
      'sandboxed_at' => date('Y-m-d H:i:s'),
    ));
    $this->mc->update_module($release['module_registry_id'], array('status' => $status, 'last_error' => $contract['ok'] ? NULL : 'Sandbox validation did not pass'));
    $this->mc->finish_operation($op['row']['id'], $contract['ok'], array('runner' => $result), $result['logs'],
      $contract['ok'] ? NULL : array('code' => $result['status'] === 'NOT_CONFIGURED' ? 'MODULE_RUNNER_NOT_CONFIGURED' : 'SANDBOX_VALIDATION_FAILED', 'message' => 'Module remains inactive until every sandbox stage passes'));
    $this->mc->audit($this->actor, $contract['ok'] ? 'module.sandbox_succeeded' : 'module.sandbox_failed', 'module_release', $release['id'], array('moduleId' => $module['module_key'], 'version' => $release['version'], 'missing' => $contract['missing']));
    return $this->respond($this->mc->public_release($updated));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/releases/:id/approve
  // ---------------------------------------------------------------------------
  public function release_approve($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $release = $this->mc->release((string) $id);
    if (!$release) return $this->fail('NOT_FOUND', 'Module release not found', 404);
    $report = $release['verification_report'];
    if ($release['status'] !== 'VALIDATED' || !is_array($report) || empty($report['passed']) || $release['sandbox_status'] !== 'PASSED') {
      return $this->fail('CONFLICT', 'Only a verified release with complete sandbox evidence can be approved', 409);
    }
    $op = $this->mc->operation(array('moduleRegistryId' => $release['module_registry_id'], 'releaseId' => $release['id'], 'type' => 'APPROVE', 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'toVersion' => $release['version']));
    if ($op['duplicate']) return $this->respond($this->mc->public_release($release));
    $updated = $this->mc->update_release($release['id'], array('status' => 'APPROVED', 'approval_status' => 'APPROVED', 'approved_by_id' => $this->actor['userId'], 'approved_at' => date('Y-m-d H:i:s')));
    $this->mc->update_module($release['module_registry_id'], array('status' => 'APPROVED'));
    $this->mc->finish_operation($op['row']['id'], TRUE, array('approved' => TRUE), array('Super Admin approved the verified release. Uploaded code has still not executed in the API process.'));
    $module = $this->mc->module($release['module_registry_id']);
    $this->mc->audit($this->actor, 'module.approved', 'module_release', $release['id'], array('moduleId' => $module['module_key'], 'version' => $release['version']));
    return $this->respond($this->mc->public_release($updated));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/releases/:id/install
  // ---------------------------------------------------------------------------
  public function release_install($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $release = $this->mc->release((string) $id);
    if (!$release) return $this->fail('NOT_FOUND', 'Module release not found', 404);
    if ($release['status'] !== 'APPROVED') return $this->fail('CONFLICT', "Installation requires APPROVED status, found {$release['status']}", 409);

    $module = $this->mc->module($release['module_registry_id']);
    $manifest = $release['manifest'];
    if ($module['current_version'] && $this->module_package->semver_lt($release['version'], $module['current_version']) && empty($manifest['upgrade']['allowDowngrade'])) {
      return $this->fail('CONFLICT', 'Manifest does not permit downgrade; use rollback to a known-good release instead', 409);
    }
    if ($module['current_version'] && !empty($manifest['upgrade']['from'])) {
      $satisfied = FALSE;
      foreach ($manifest['upgrade']['from'] as $range) if ($this->module_package->semver_satisfies($module['current_version'], $range)) { $satisfied = TRUE; break; }
      if (!$satisfied) return $this->fail('CONFLICT', "Version {$module['current_version']} is not in the release upgrade.from ranges", 409);
    }
    $type = $module['current_version'] ? 'UPDATE' : 'INSTALL';
    $op = $this->mc->operation(array('moduleRegistryId' => $module['id'], 'releaseId' => $release['id'], 'type' => $type, 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'fromVersion' => $module['current_version'], 'toVersion' => $release['version']));
    if ($op['duplicate']) return $this->respond($this->mc->get($module['id']));

    $this->mc->update_release($release['id'], array('status' => 'INSTALLING'));
    $this->mc->update_module($module['id'], array('status' => 'INSTALLING', 'last_error' => NULL));

    $result = $this->runner_call($module, $release, 'INSTALL', $op['row']['correlation_id']);
    $evidence = is_array($result['evidence']) ? $result['evidence'] : array();
    $migration_needed = count($manifest['database']['migrations']) > 0;
    $backup_ok = !$migration_needed || $manifest['database']['backupRequired'] === FALSE || (isset($evidence['backup']['verified']) && $evidence['backup']['verified'] === TRUE);
    $migration_ok = !$migration_needed || (isset($evidence['migrations']['status']) && $evidence['migrations']['status'] === 'PASSED');
    $integrity_ok = !$migration_needed || (isset($evidence['databaseIntegrity']['passed']) && $evidence['databaseIntegrity']['passed'] === TRUE);
    $health_ok = isset($evidence['health']['passed']) && $evidence['health']['passed'] === TRUE;
    $changes_recorded = isset($evidence['changes']['recorded']) && $evidence['changes']['recorded'] === TRUE && isset($evidence['changes']['components']) && is_array($evidence['changes']['components']);
    $runtime_ok = empty($manifest['backend']['enabled']) || $this->runtime_url_allowed(isset($result['runtime']['serviceUrl']) ? $result['runtime']['serviceUrl'] : NULL);
    $ok = $result['ok'] && $backup_ok && $migration_ok && $integrity_ok && $health_ok && $changes_recorded && $runtime_ok;

    if ($ok && count($manifest['capabilities'])) {
      // Node publishes capabilities to the Plugin/Capability registry here.
      // Neither registry is ported to the PHP build, so say so instead of
      // silently advertising capabilities nothing backs.
      $result['logs'][] = 'Capability advertising is not available in this build: the Plugin and Capability registries are not ported. Declared capabilities: ' . implode(', ', $manifest['capabilities']) . '.';
    }

    if (!$ok) {
      $rollback = isset($result['rollbackPerformed']) && $result['rollbackPerformed'] === TRUE;
      if ($module['active_release_id'] && !$rollback) {
        $previous = $this->mc->release($module['active_release_id']);
        if ($previous) {
          $attempt = $this->runner_call($module, $release, 'ROLLBACK', $op['row']['correlation_id'], $previous);
          $rollback = (bool) $attempt['ok'];
          $result['logs'] = array_merge($result['logs'], $attempt['logs']);
        }
      }
      $this->mc->update_release($release['id'], array('status' => 'FAILED', 'migration_status' => $migration_ok ? 'PASSED' : 'FAILED', 'health_report' => $result, 'rollback_metadata' => array('rollbackPerformed' => $rollback)));
      $this->mc->update_module($module['id'], array(
        'status' => ($module['active_release_id'] && $rollback) ? 'ACTIVE' : 'FAILED',
        'health' => ($module['active_release_id'] && $rollback) ? $module['health'] : 'UNHEALTHY',
        'last_error' => 'Installation/upgrade validation failed',
      ));
      $this->mc->finish_operation($op['row']['id'], FALSE, array('runner' => $result, 'backupOk' => $backup_ok, 'migrationOk' => $migration_ok, 'integrityOk' => $integrity_ok, 'healthOk' => $health_ok, 'changesRecorded' => $changes_recorded, 'runtimeOk' => $runtime_ok, 'rollbackPerformed' => $rollback), $result['logs'],
        array('code' => 'MODULE_INSTALL_FAILED', 'message' => 'The release was not activated because installation evidence was incomplete or failed'));
      $this->mc->audit($this->actor, 'module.install_failed', 'platform_module', $module['id'], array('moduleId' => $module['module_key'], 'version' => $release['version'], 'rollbackPerformed' => $rollback));
      return $this->respond($this->mc->get($module['id']));
    }

    if ($module['active_release_id']) $this->mc->update_release($module['active_release_id'], array('status' => 'APPROVED'));
    $registration = array(
      'moduleId'     => $manifest['id'],
      'name'         => $manifest['name'],
      'version'      => $manifest['version'],
      'packageType'  => $manifest['packageType'],
      'permissions'  => $manifest['permissions'],
      'accessRoles'  => $manifest['accessRoles'],
      'capabilities' => $manifest['capabilities'],
      'backend'      => $manifest['backend'],
      'frontend'     => $manifest['frontend'],
      'health'       => 'HEALTHY',
    );
    if (isset($result['runtime']['serviceUrl'])) $registration['serviceUrl'] = $result['runtime']['serviceUrl'];
    if (isset($result['runtime']['instanceId'])) $registration['instanceId'] = $result['runtime']['instanceId'];
    if (isset($result['runtime']['imageDigest'])) $registration['imageDigest'] = $result['runtime']['imageDigest'];

    $this->mc->update_release($release['id'], array(
      'status' => 'ACTIVE', 'installed_by_id' => $this->actor['userId'], 'installed_at' => date('Y-m-d H:i:s'),
      'migration_status' => $migration_needed ? 'PASSED' : 'NOT_REQUIRED', 'health_report' => $result,
      'rollback_metadata' => array('previousReleaseId' => $module['active_release_id'], 'fromVersion' => $module['current_version'], 'changes' => isset($evidence['changes']) ? $evidence['changes'] : array()),
    ));
    $this->mc->update_module($module['id'], array(
      'status' => 'ACTIVE', 'health' => 'HEALTHY', 'current_version' => $release['version'], 'active_release_id' => $release['id'],
      'enabled' => 1, 'manifest' => $manifest, 'runtime_registration' => $registration, 'dependencies' => $manifest['dependencies'],
      'permissions' => $manifest['permissions'], 'installed_by_id' => $this->actor['userId'],
      'installed_at' => $module['installed_at'] ? $module['installed_at'] : date('Y-m-d H:i:s'),
      'last_health_check_at' => date('Y-m-d H:i:s'), 'last_error' => NULL,
    ));
    $this->mc->finish_operation($op['row']['id'], TRUE, array('runner' => $result, 'backupVerified' => $backup_ok, 'migrations' => $migration_ok, 'databaseIntegrity' => $integrity_ok, 'health' => $health_ok, 'changesRecorded' => $changes_recorded, 'activated' => TRUE), $result['logs']);
    $this->mc->audit($this->actor, $type === 'UPDATE' ? 'module.updated' : 'module.installed', 'platform_module', $module['id'], array('moduleId' => $module['module_key'], 'fromVersion' => $module['current_version'], 'toVersion' => $release['version']));
    $this->emit_kernel('module.activated', array('moduleId' => $module['module_key'], 'version' => $release['version'], 'releaseId' => $release['id']));
    return $this->respond($this->mc->get($module['id']));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle: enable / disable / restart / health-check
  // ---------------------------------------------------------------------------
  public function module_enable($id = NULL)     { return $this->lifecycle((string) $id, 'ENABLE'); }
  public function module_disable($id = NULL)    { return $this->lifecycle((string) $id, 'DISABLE'); }
  public function module_restart($id = NULL)    { return $this->lifecycle((string) $id, 'RESTART'); }
  public function module_health_check($id = NULL) { return $this->lifecycle((string) $id, 'HEALTH_CHECK'); }

  private function lifecycle($id, $action) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $module = $this->mc->module($id);
    if (!$module || !$module['active_release_id']) return $this->fail('NOT_FOUND', 'Active module not found', 404);
    $release = $this->mc->release($module['active_release_id']);
    if (!$release) return $this->fail('NOT_FOUND', 'Active module release not found', 404);
    $manifest = $release['manifest'];

    if ($action === 'RESTART' && empty($manifest['lifecycle']['reloadSupported'])) return $this->fail('CONFLICT', 'This module does not declare restart/reload support', 409);
    if ($action === 'ENABLE' && $module['status'] !== 'DISABLED') return $this->fail('CONFLICT', 'Only a disabled module can be enabled', 409);
    if ($action === 'DISABLE' && $module['status'] !== 'ACTIVE') return $this->fail('CONFLICT', 'Only an active module can be disabled', 409);

    $op = $this->mc->operation(array('moduleRegistryId' => $module['id'], 'releaseId' => $release['id'], 'type' => $action, 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'fromVersion' => $module['current_version'], 'toVersion' => $module['current_version']));
    if ($op['duplicate']) return $this->respond($this->mc->get($module['id']));

    $result = $this->runner_call($module, $release, $action, $op['row']['correlation_id']);
    $evidence = is_array($result['evidence']) ? $result['evidence'] : array();
    $health_ok = $action === 'DISABLE' ? $result['ok'] : ($result['ok'] && isset($evidence['health']['passed']) && $evidence['health']['passed'] === TRUE);

    if ($health_ok) {
      $status = $action === 'DISABLE' ? 'DISABLED' : 'ACTIVE';
      $health = $action === 'DISABLE' ? 'DISABLED' : 'HEALTHY';
      $this->mc->update_module($module['id'], array('status' => $status, 'health' => $health, 'enabled' => $action === 'DISABLE' ? 0 : 1, 'last_health_check_at' => date('Y-m-d H:i:s'), 'last_error' => NULL));
    } else {
      $this->mc->update_module($module['id'], array('health' => 'UNHEALTHY', 'last_health_check_at' => date('Y-m-d H:i:s'), 'last_error' => $action . ' failed health verification'));
    }
    $this->mc->finish_operation($op['row']['id'], $health_ok, array('runner' => $result), $result['logs'],
      $health_ok ? NULL : array('code' => 'MODULE_' . $action . '_FAILED', 'message' => $action . ' did not pass runner/health verification'));
    $this->mc->audit($this->actor, $health_ok ? 'module.' . strtolower($action) : 'module.lifecycle_failed', 'platform_module', $module['id'], array('moduleId' => $module['module_key'], 'action' => $action));
    if ($health_ok) $this->emit_kernel('module.' . strtolower($action), array('moduleId' => $module['module_key'], 'version' => $module['current_version']));
    return $this->respond($this->mc->get($module['id']));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/modules/:id/rollback
  // ---------------------------------------------------------------------------
  public function module_rollback($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $module = $this->mc->module((string) $id);
    if (!$module || !$module['active_release_id']) return $this->fail('NOT_FOUND', 'Active module not found', 404);
    $current = $this->mc->release($module['active_release_id']);
    if (!$current || !$current['previous_release_id']) return $this->fail('CONFLICT', 'No previous known-good release is recorded', 409);
    $target = $this->mc->release($current['previous_release_id']);
    if (!$target) return $this->fail('CONFLICT', 'Previous release artifact is unavailable', 409);
    if (empty($current['manifest']['upgrade']['rollbackSupported'])) return $this->fail('CONFLICT', 'Current release does not declare rollback support', 409);

    $op = $this->mc->operation(array('moduleRegistryId' => $module['id'], 'releaseId' => $current['id'], 'type' => 'ROLLBACK', 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'fromVersion' => $current['version'], 'toVersion' => $target['version']));
    if ($op['duplicate']) return $this->respond($this->mc->get($module['id']));

    $this->mc->update_module($module['id'], array('status' => 'ROLLING_BACK'));
    $result = $this->runner_call($module, $current, 'ROLLBACK', $op['row']['correlation_id'], $target);
    $evidence = is_array($result['evidence']) ? $result['evidence'] : array();
    $ok = $result['ok'] && isset($evidence['health']['passed']) && $evidence['health']['passed'] === TRUE
      && (!count($current['manifest']['database']['migrations']) || (isset($evidence['migrations']['rollbackStatus']) && $evidence['migrations']['rollbackStatus'] === 'PASSED'));

    if ($ok) {
      $this->mc->update_release($current['id'], array('status' => 'FAILED', 'rollback_metadata' => array('rolledBackAt' => gmdate('c'), 'targetReleaseId' => $target['id'])));
      $this->mc->update_release($target['id'], array('status' => 'ACTIVE'));
      $registration = is_array($module['runtime_registration']) ? $module['runtime_registration'] : array();
      $registration['version'] = $target['version'];
      if (isset($result['runtime']['serviceUrl'])) $registration['serviceUrl'] = $result['runtime']['serviceUrl'];
      $this->mc->update_module($module['id'], array(
        'status' => 'ACTIVE', 'health' => 'HEALTHY', 'enabled' => 1, 'current_version' => $target['version'],
        'active_release_id' => $target['id'], 'manifest' => $target['manifest'], 'runtime_registration' => $registration,
        'last_health_check_at' => date('Y-m-d H:i:s'), 'last_error' => NULL,
      ));
    } else {
      $this->mc->update_module($module['id'], array('status' => 'FAILED', 'health' => 'UNHEALTHY', 'enabled' => 0, 'last_error' => 'Rollback failed verification'));
    }
    $this->mc->finish_operation($op['row']['id'], $ok, array('runner' => $result, 'targetReleaseId' => $target['id']), $result['logs'],
      $ok ? NULL : array('code' => 'MODULE_ROLLBACK_FAILED', 'message' => 'Rollback target did not pass migration/health verification'));
    $this->mc->audit($this->actor, $ok ? 'module.rolled_back' : 'module.rollback_failed', 'platform_module', $module['id'], array('moduleId' => $module['module_key'], 'fromVersion' => $current['version'], 'toVersion' => $target['version']));
    return $this->respond($this->mc->get($module['id']));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/super-admin/module-center/modules/:id/remove
  // ---------------------------------------------------------------------------
  public function module_remove($id = NULL) {
    $key = $this->idempotency_key();
    if (!$key) return NULL;
    $module = $this->mc->module((string) $id);
    if (!$module || !$module['active_release_id']) return $this->fail('NOT_FOUND', 'Installed module not found', 404);
    if ($module['status'] !== 'DISABLED') return $this->fail('CONFLICT', 'Disable the module and verify the disabled state before removal', 409);
    $release = $this->mc->release($module['active_release_id']);
    if (!$release) return $this->fail('NOT_FOUND', 'Installed module release not found', 404);
    $manifest = $release['manifest'];
    if (empty($manifest['lifecycle']['removable'])) return $this->fail('CONFLICT', 'This module is protected from removal', 409);

    $dependents = array();
    foreach ($this->mc->all_modules() as $candidate) {
      if ($candidate['id'] === $module['id']) continue;
      if (!in_array($candidate['status'], array('ACTIVE', 'DISABLED'), TRUE)) continue;
      $deps = is_array($candidate['manifest']) && isset($candidate['manifest']['dependencies']) ? $candidate['manifest']['dependencies'] : array();
      foreach ($deps as $dependency) {
        if ($dependency['id'] === $module['module_key'] && empty($dependency['optional'])) { $dependents[] = $candidate['module_key']; break; }
      }
    }
    if (count($dependents)) return $this->fail('CONFLICT', 'Module is required by: ' . implode(', ', $dependents), 409);

    $op = $this->mc->operation(array('moduleRegistryId' => $module['id'], 'releaseId' => $release['id'], 'type' => 'REMOVE', 'actorId' => $this->actor['userId'], 'idempotencyKey' => $key, 'fromVersion' => $module['current_version']));
    if ($op['duplicate']) return $this->respond($this->mc->get($module['id']));

    $this->mc->update_module($module['id'], array('status' => 'REMOVING'));
    $result = $this->runner_call($module, $release, 'REMOVE', $op['row']['correlation_id']);
    $evidence = is_array($result['evidence']) ? $result['evidence'] : array();
    $ok = $result['ok'] && (!count($manifest['database']['migrations']) || (isset($evidence['migrations']['removalStatus']) && $evidence['migrations']['removalStatus'] === 'PASSED'));

    if ($ok) {
      $this->mc->update_release($release['id'], array('status' => 'REMOVED'));
      $this->mc->update_module($module['id'], array('status' => 'REMOVED', 'health' => 'DISABLED', 'enabled' => 0, 'active_release_id' => NULL, 'runtime_registration' => array(), 'last_error' => NULL));
    } else {
      $this->mc->update_module($module['id'], array('status' => 'DISABLED', 'last_error' => 'Removal did not pass runner/migration verification'));
    }
    $this->mc->finish_operation($op['row']['id'], $ok, array('runner' => $result), $result['logs'],
      $ok ? NULL : array('code' => 'MODULE_REMOVE_FAILED', 'message' => 'Safe removal could not be verified'));
    $this->mc->audit($this->actor, $ok ? 'module.removed' : 'module.remove_failed', 'platform_module', $module['id'], array('moduleId' => $module['module_key'], 'version' => $module['current_version']));
    return $this->respond($this->mc->get($module['id']));
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /** Node validates idempotencyKey as 12..180 characters. */
  private function idempotency_key() {
    $body = $this->body();
    $key = isset($body['idempotencyKey']) ? trim((string) $body['idempotencyKey']) : '';
    if (strlen($key) < 12 || strlen($key) > 180) {
      $this->fail('VALIDATION_ERROR', 'idempotencyKey must be between 12 and 180 characters', 422);
      return NULL;
    }
    return $key;
  }

  private function runner_call($module, $release, $action, $correlation_id, $target = NULL) {
    return $this->module_runner->run(array(
      'action'          => $action,
      'moduleId'        => $module['module_key'],
      'releaseId'       => $target ? $target['id'] : $release['id'],
      'version'         => $target ? $target['version'] : $release['version'],
      'checksum'        => $target ? $target['checksum'] : $release['checksum'],
      'artifactPath'    => $target ? $target['artifact_path'] : $release['artifact_path'],
      'manifest'        => ($target && isset($target['manifest'])) ? $target['manifest'] : $release['manifest'],
      'actorId'         => $this->actor['userId'],
      'correlationId'   => $correlation_id,
      'previousVersion' => $module['current_version'],
      'previousReleaseId' => $module['active_release_id'],
    ));
  }

  private function sandbox_contract($result, $manifest) {
    $stages = array('startup', 'health', 'permissions', 'resources', 'tests');
    if (!empty($manifest['backend']['enabled'])) $stages[] = 'api';
    if (count($manifest['database']['migrations'])) $stages[] = 'database';
    if (count($manifest['agents']['definitions'])) $stages[] = 'agents';
    if (count($manifest['workflows']['definitions'])) $stages[] = 'workflows';
    if (!empty($manifest['frontend']['enabled'])) $stages[] = 'frontend';
    $missing = array();
    $evidence = is_array($result['evidence']) ? $result['evidence'] : array();
    $stages_evidence = isset($evidence['stages']) && is_array($evidence['stages']) ? $evidence['stages'] : array();
    foreach ($stages as $stage) {
      $passed = (isset($stages_evidence[$stage]['passed']) && $stages_evidence[$stage]['passed'] === TRUE)
        || (isset($stages_evidence[$stage]) && $stages_evidence[$stage] === 'PASSED');
      if (!$passed) $missing[] = $stage;
    }
    return array('ok' => $result['ok'] && $result['status'] === 'PASSED' && count($missing) === 0, 'missing' => $missing);
  }

  private function runtime_url_allowed($url) {
    if (!$url || !is_string($url)) return FALSE;
    $parts = @parse_url($url);
    if (!$parts || !isset($parts['scheme']) || !isset($parts['host'])) return FALSE;
    if (isset($parts['user']) || isset($parts['pass'])) return FALSE;
    $allowed = array_filter(array_map('trim', explode(',', (string) getenv('VP_MODULE_RUNTIME_ALLOWED_ORIGINS'))));
    $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') return in_array($origin, $allowed, TRUE);
    if (!count($allowed)) return in_array($parts['scheme'], array('http', 'https'), TRUE);
    return in_array($origin, $allowed, TRUE);
  }

  /**
   * Node dispatches module.* events through the kernel service. The PHP kernel
   * records events in kernel_events (migration 002); failures are swallowed
   * there too, because the module tables are authoritative.
   */
  private function emit_kernel($kind, $payload) {
    try {
      if (!$this->mc->db->table_exists('kernel_events')) return;
      $this->load->model('Kernel_model', 'kernel');
      $this->kernel->dispatch(
        array('kind' => $kind, 'source' => 'module-center', 'payload' => $payload),
        $this->actor['organizationId'],
        $this->actor['userId']
      );
    } catch (Exception $error) { /* audit and DB remain authoritative */ }
  }
}
