<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_center_model — Module Center persistence.
 *
 * Straight port of the Prisma access in
 * apps/api/src/moduleCenter/moduleCenter.service.ts onto CI's query builder,
 * plus the small helpers that service keeps as module-level functions
 * (packageRoot, moveArtifact, audit, operation, finishOperation).
 */
class Module_center_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  // ---------------------------------------------------------------------------
  // Identity / storage
  // ---------------------------------------------------------------------------

  public function uuid() {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0F) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3F) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
  }

  /**
   * Artifacts live outside the web root by default. Under cPanel the operator
   * can point VP_MODULE_PACKAGE_ROOT anywhere the account can write; the
   * directory is created on first use and chmod-ed so only the account can read
   * quarantined third-party code.
   */
  public function package_root() {
    $root = getenv('VP_MODULE_PACKAGE_ROOT');
    if ($root !== FALSE && trim($root) !== '') return rtrim(trim($root), '/');
    return rtrim(APPPATH, '/') . '/storage/module-packages';
  }

  public function ensure_package_root() {
    $root = $this->package_root();
    foreach (array('', 'incoming', 'quarantine', 'verified') as $bucket) {
      $dir = $root . ($bucket === '' ? '' : '/' . $bucket);
      if (!is_dir($dir)) @mkdir($dir, 0700, TRUE);
    }
    return $root;
  }

  public function move_artifact($temp_path, $bucket, $checksum) {
    $root = $this->ensure_package_root();
    $target = $root . '/' . $bucket . '/' . $checksum . '.wmod';
    if (!@rename($temp_path, $target)) {
      if (!@copy($temp_path, $target)) return NULL;
      @unlink($temp_path);
    }
    @chmod($target, 0600);
    return $target;
  }

  /** Move an uploaded file into the intake bucket, returning its sha256. */
  public function store_incoming($tmp_name) {
    $root = $this->ensure_package_root();
    $checksum = hash_file('sha256', $tmp_name);
    $size = @filesize($tmp_name);
    $target = $root . '/incoming/' . $checksum . '.wmod';
    if (!@move_uploaded_file($tmp_name, $target)) {
      if (!@rename($tmp_name, $target)) return NULL;
    }
    @chmod($target, 0600);
    return array('path' => $target, 'checksum' => $checksum, 'size' => (int) $size);
  }

  // ---------------------------------------------------------------------------
  // Modules
  // ---------------------------------------------------------------------------

  private function json_fields($row, $fields) {
    if (!$row) return $row;
    foreach ($fields as $field) {
      if (array_key_exists($field, $row)) {
        $decoded = json_decode($row[$field], TRUE);
        $row[$field] = ($row[$field] === NULL || $decoded === NULL) ? array() : $decoded;
      }
    }
    return $row;
  }

  private function module_row($row) {
    return $this->json_fields($row, array('manifest', 'dependencies', 'permissions', 'runtime_registration'));
  }

  private function release_row($row) {
    return $this->json_fields($row, array('manifest', 'verification_report', 'sandbox_report', 'health_report', 'rollback_metadata'));
  }

  private function upload_row($row) {
    return $this->json_fields($row, array('report'));
  }

  public function user_role($user_id) {
    $row = $this->db->select('role')->where('id', $user_id)->get('users')->row_array();
    return $row ? $row['role'] : NULL;
  }

  public function module_by_key($key) {
    return $this->module_row($this->db->where('module_key', $key)->get('platform_modules')->row_array());
  }

  public function module($id) {
    return $this->module_row($this->db->where('id', $id)->get('platform_modules')->row_array());
  }

  public function create_module($manifest) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'            => $this->uuid(),
      'module_key'    => $manifest['id'],
      'name'          => $manifest['name'],
      'package_type'  => $manifest['packageType'],
      'description'   => $manifest['description'],
      'vendor'        => $manifest['vendor'],
      'status'        => 'UPLOADED',
      'health'        => 'UNKNOWN',
      'enabled'       => 0,
      'manifest'      => json_encode($manifest),
      'dependencies'  => json_encode($manifest['dependencies']),
      'permissions'   => json_encode($manifest['permissions']),
      'runtime_registration' => json_encode(array()),
      'created_at'    => $now,
      'updated_at'    => $now,
    );
    $this->db->insert('platform_modules', $row);
    return $this->module($row['id']);
  }

  public function update_module($id, $data) {
    $allowed = array('name', 'package_type', 'description', 'vendor', 'status', 'health', 'enabled',
      'current_version', 'active_release_id', 'manifest', 'dependencies', 'permissions',
      'runtime_registration', 'installed_by_id', 'installed_at', 'last_health_check_at', 'last_error');
    $update = array();
    foreach ($data as $key => $value) {
      if (!in_array($key, $allowed, TRUE)) continue;
      $update[$key] = is_array($value) ? json_encode($value) : $value;
    }
    if (!count($update)) return $this->module($id);
    $update['updated_at'] = date('Y-m-d H:i:s');
    $this->db->where('id', $id)->update('platform_modules', $update);
    return $this->module($id);
  }

  public function all_modules() {
    $rows = $this->db->order_by('updated_at', 'DESC')->get('platform_modules')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->module_row($row);
    return $out;
  }

  /** Modules that count as installed, keyed by module key (dependency/conflict checks). */
  public function installed_modules() {
    $rows = $this->db->where_in('status', array('ACTIVE', 'DISABLED'))->get('platform_modules')->result_array();
    $out = array();
    foreach ($rows as $row) {
      $module = $this->module_row($row);
      $out[$module['module_key']] = array(
        'moduleKey'      => $module['module_key'],
        'currentVersion' => $module['current_version'],
        'status'         => $module['status'],
        'capabilities'   => is_array($module['manifest']) && isset($module['manifest']['capabilities']) ? $module['manifest']['capabilities'] : array(),
      );
    }
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Releases
  // ---------------------------------------------------------------------------

  public function release($id) {
    return $this->release_row($this->db->where('id', $id)->get('platform_module_releases')->row_array());
  }

  public function release_by_version($module_id, $version) {
    return $this->release_row($this->db->where(array('module_registry_id' => $module_id, 'version' => $version))->get('platform_module_releases')->row_array());
  }

  public function releases_for($module_id, $limit = 200) {
    $rows = $this->db->where('module_registry_id', $module_id)->order_by('created_at', 'DESC')->limit($limit)->get('platform_module_releases')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->release_row($row);
    return $out;
  }

  public function create_release($module, $manifest, $checksum, $artifact_path, $size, $signature_key_id, $actor_id) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'                => $this->uuid(),
      'module_registry_id' => $module['id'],
      'version'           => $manifest['version'],
      'status'            => 'UPLOADED',
      'checksum'          => $checksum,
      'artifact_path'     => $artifact_path,
      'package_size_bytes' => (int) $size,
      'manifest'          => json_encode($manifest),
      'signature_key_id'  => $signature_key_id,
      'signature_verified' => 0,
      'verification_report' => json_encode(array()),
      'sandbox_report'    => json_encode(array()),
      'health_report'     => json_encode(array()),
      'rollback_metadata' => json_encode(array()),
      'previous_release_id' => isset($module['active_release_id']) ? $module['active_release_id'] : NULL,
      'uploaded_by_id'    => $actor_id,
      'created_at'        => $now,
      'updated_at'        => $now,
    );
    $this->db->insert('platform_module_releases', $row);
    return $this->release($row['id']);
  }

  public function update_release($id, $data) {
    $allowed = array('version', 'status', 'artifact_path', 'package_size_bytes', 'manifest', 'signature_key_id',
      'signature_verified', 'scan_status', 'compatibility_status', 'sandbox_status', 'approval_status',
      'migration_status', 'verification_report', 'sandbox_report', 'health_report', 'rollback_metadata',
      'previous_release_id', 'verified_at', 'sandboxed_at', 'approved_by_id', 'approved_at',
      'installed_by_id', 'installed_at');
    $update = array();
    foreach ($data as $key => $value) {
      if (!in_array($key, $allowed, TRUE)) continue;
      $update[$key] = is_array($value) ? json_encode($value) : $value;
    }
    if (!count($update)) return $this->release($id);
    $update['updated_at'] = date('Y-m-d H:i:s');
    $this->db->where('id', $id)->update('platform_module_releases', $update);
    return $this->release($id);
  }

  public function all_releases() {
    return $this->db->get('platform_module_releases')->result_array();
  }

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  public function upload_by_checksum($checksum) {
    return $this->upload_row($this->db->where('checksum', $checksum)->get('platform_module_uploads')->row_array());
  }

  public function upload_by_release($release_id) {
    return $this->upload_row($this->db->where('release_id', $release_id)->get('platform_module_uploads')->row_array());
  }

  public function create_upload($data) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'               => isset($data['id']) ? $data['id'] : $this->uuid(),
      'original_name'    => $data['original_name'],
      'checksum'         => $data['checksum'],
      'size_bytes'       => (int) $data['size_bytes'],
      'artifact_path'    => isset($data['artifact_path']) ? $data['artifact_path'] : NULL,
      'status'           => $data['status'],
      'manifest_id'      => isset($data['manifest_id']) ? $data['manifest_id'] : NULL,
      'manifest_version' => isset($data['manifest_version']) ? $data['manifest_version'] : NULL,
      'signature_key_id' => isset($data['signature_key_id']) ? $data['signature_key_id'] : NULL,
      'report'           => json_encode(isset($data['report']) ? $data['report'] : array()),
      'release_id'       => isset($data['release_id']) ? $data['release_id'] : NULL,
      'uploaded_by_id'   => isset($data['uploaded_by_id']) ? $data['uploaded_by_id'] : NULL,
      'created_at'       => $now,
      'updated_at'       => $now,
    );
    $this->db->insert('platform_module_uploads', $row);
    return $this->upload_row($this->db->where('id', $row['id'])->get('platform_module_uploads')->row_array());
  }

  public function update_upload($id, $data) {
    $allowed = array('status', 'artifact_path', 'report', 'release_id', 'manifest_id', 'manifest_version', 'signature_key_id');
    $update = array();
    foreach ($data as $key => $value) {
      if (!in_array($key, $allowed, TRUE)) continue;
      $update[$key] = is_array($value) ? json_encode($value) : $value;
    }
    if (!count($update)) return $this->upload_row($this->db->where('id', $id)->get('platform_module_uploads')->row_array());
    $update['updated_at'] = date('Y-m-d H:i:s');
    $this->db->where('id', $id)->update('platform_module_uploads', $update);
    return $this->upload_row($this->db->where('id', $id)->get('platform_module_uploads')->row_array());
  }

  public function uploads($limit = 100) {
    $limit = max(1, min(200, (int) $limit));
    $rows = $this->db->order_by('created_at', 'DESC')->limit($limit)->get('platform_module_uploads')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->upload_row($row);
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  public function operation($input) {
    $existing = $this->db->where('idempotency_key', $input['idempotencyKey'])->get('platform_module_operations')->row_array();
    if ($existing) return array('row' => $existing, 'duplicate' => TRUE);
    $now = date('Y-m-d H:i:s');
    $row = array(
      'id'                => $this->uuid(),
      'module_registry_id' => $input['moduleRegistryId'],
      'release_id'        => isset($input['releaseId']) ? $input['releaseId'] : NULL,
      'operation_type'    => $input['type'],
      'status'            => 'RUNNING',
      'idempotency_key'   => $input['idempotencyKey'],
      'correlation_id'    => $this->uuid(),
      'from_version'      => isset($input['fromVersion']) ? $input['fromVersion'] : NULL,
      'to_version'        => isset($input['toVersion']) ? $input['toVersion'] : NULL,
      'requested_by_id'   => $input['actorId'],
      'request'           => json_encode(array()),
      'result'            => json_encode(array()),
      'logs'              => json_encode(array()),
      'started_at'        => $now,
      'created_at'        => $now,
      'updated_at'        => $now,
    );
    $this->db->insert('platform_module_operations', $row);
    return array('row' => $row, 'duplicate' => FALSE);
  }

  public function finish_operation($id, $ok, $result, $logs = array(), $error = NULL) {
    $now = date('Y-m-d H:i:s');
    $update = array(
      'status'      => $ok ? 'SUCCEEDED' : 'FAILED',
      'result'      => json_encode($result ? $result : array()),
      'logs'        => json_encode(array_values(array_slice(is_array($logs) ? $logs : array(), -200))),
      'error_code'  => $error ? $error['code'] : NULL,
      'error_message' => $error ? $error['message'] : NULL,
      'finished_at' => $now,
      'updated_at'  => $now,
    );
    $this->db->where('id', $id)->update('platform_module_operations', $update);
    return $ok;
  }

  public function operations($limit = 200) {
    $limit = max(1, min(500, (int) $limit));
    $rows = $this->db
      ->select('o.*, m.module_key, m.name AS module_name, u.email AS requested_by_email, r.version AS release_version')
      ->from('platform_module_operations o')
      ->join('platform_modules m', 'm.id = o.module_registry_id', 'left')
      ->join('users u', 'u.id = o.requested_by_id', 'left')
      ->join('platform_module_releases r', 'r.id = o.release_id', 'left')
      ->order_by('o.created_at', 'DESC')->limit($limit)->get()->result_array();
    $out = array();
    foreach ($rows as $row) {
      foreach (array('request', 'result', 'logs') as $field) {
        $decoded = json_decode($row[$field], TRUE);
        $decoded = $decoded === NULL ? array() : $decoded;
        // request/result are objects in the Node API; an empty PHP array would
        // encode to [] and break `op.result?.something` in the web client.
        if (in_array($field, array('request', 'result'), TRUE) && !count($decoded)) $decoded = (object) array();
        $row[$field] = $decoded;
      }
      $out[] = $row;
    }
    return $out;
  }

  public function operations_for($module_id, $limit = 200) {
    $rows = $this->db->where('module_registry_id', $module_id)->order_by('created_at', 'DESC')->limit($limit)->get('platform_module_operations')->result_array();
    $out = array();
    foreach ($rows as $row) {
      foreach (array('request', 'result', 'logs') as $field) {
        $decoded = json_decode($row[$field], TRUE);
        $decoded = $decoded === NULL ? array() : $decoded;
        // request/result are objects in the Node API; an empty PHP array would
        // encode to [] and break `op.result?.something` in the web client.
        if (in_array($field, array('request', 'result'), TRUE) && !count($decoded)) $decoded = (object) array();
        $row[$field] = $decoded;
      }
      $out[] = $row;
    }
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Audit + permissions catalog
  // ---------------------------------------------------------------------------

  public function audit($actor, $event, $entity, $entity_id, $metadata = array()) {
    $meta = is_array($metadata) ? $metadata : array();
    $meta['resourceId'] = $entity_id;
    $meta['entity'] = $entity;
    $this->db->insert('audit_events', array(
      'organization_id' => isset($actor['organizationId']) ? $actor['organizationId'] : NULL,
      'user_id'         => $actor['userId'],
      'event_type'      => $event,
      'payload'         => json_encode($meta),
      'ip_address'      => $this->input->ip_address(),
      'created_at'      => date('Y-m-d H:i:s'),
    ));
  }

  /** Node compares against Object.values(Permission); the PHP catalog is the permissions table. */
  public function known_permissions() {
    $rows = $this->db->select('code')->get('permissions')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $row['code'];
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Public shapes (camelCase, matching the TypeScript API)
  // ---------------------------------------------------------------------------

  public function public_release($release) {
    if (!$release) return NULL;
    return array(
      'id'                 => $release['id'],
      'moduleRegistryId'   => $release['module_registry_id'],
      'moduleId'           => isset($release['module_key']) ? $release['module_key'] : NULL,
      'version'            => $release['version'],
      'status'             => $release['status'],
      'checksum'           => $release['checksum'],
      'packageSizeBytes'   => (int) $release['package_size_bytes'],
      'artifactPath'       => $release['artifact_path'],
      'signatureKeyId'     => $release['signature_key_id'],
      'signatureVerified'  => (bool) $release['signature_verified'],
      'scanStatus'         => $release['scan_status'],
      'compatibilityStatus' => $release['compatibility_status'],
      'sandboxStatus'      => $release['sandbox_status'],
      'approvalStatus'     => $release['approval_status'],
      'migrationStatus'    => $release['migration_status'],
      'verificationReport' => $release['verification_report'],
      'sandboxReport'      => $release['sandbox_report'],
      'healthReport'       => $release['health_report'],
      'rollbackMetadata'   => $release['rollback_metadata'],
      'previousReleaseId'  => $release['previous_release_id'],
      'uploadedById'       => $release['uploaded_by_id'],
      'approvedById'       => $release['approved_by_id'],
      'installedById'      => $release['installed_by_id'],
      'verifiedAt'         => $release['verified_at'],
      'sandboxedAt'        => $release['sandboxed_at'],
      'approvedAt'         => $release['approved_at'],
      'installedAt'        => $release['installed_at'],
      'uploadedAt'         => $release['created_at'],
      'createdAt'          => $release['created_at'],
      'updatedAt'          => $release['updated_at'],
    );
  }

  public function public_upload($upload) {
    if (!$upload) return NULL;
    return array(
      'id'              => $upload['id'],
      'originalName'    => $upload['original_name'],
      'checksum'        => $upload['checksum'],
      'sizeBytes'       => (int) $upload['size_bytes'],
      'status'          => $upload['status'],
      'manifestId'      => $upload['manifest_id'],
      'manifestVersion' => $upload['manifest_version'],
      'signatureKeyId'  => $upload['signature_key_id'],
      'releaseId'       => $upload['release_id'],
      'uploadedById'    => $upload['uploaded_by_id'],
      'report'          => $upload['report'],
      'createdAt'       => $upload['created_at'],
      'updatedAt'       => $upload['updated_at'],
    );
  }

  public function public_module($module, $releases = NULL, $operations = NULL) {
    if (!$module) return NULL;
    return array(
      'id'                  => $module['id'],
      'moduleKey'           => $module['module_key'],
      'name'                => $module['name'],
      'packageType'         => $module['package_type'],
      'description'         => $module['description'],
      'vendor'              => $module['vendor'],
      'status'              => $module['status'],
      'health'              => $module['health'],
      'enabled'             => (bool) $module['enabled'],
      'currentVersion'      => $module['current_version'],
      'activeReleaseId'     => $module['active_release_id'],
      'manifest'            => $module['manifest'],
      'dependencies'        => $module['dependencies'],
      'permissions'         => $module['permissions'],
      'runtimeRegistration' => $module['runtime_registration'],
      'installedAt'         => $module['installed_at'],
      'lastHealthCheckAt'   => $module['last_health_check_at'],
      'lastError'           => $module['last_error'],
      'createdAt'           => $module['created_at'],
      'updatedAt'           => $module['updated_at'],
      'releases'            => $releases === NULL ? array() : $releases,
      'operations'          => $operations === NULL ? array() : $operations,
    );
  }

  public function get($id) {
    $module = $this->module($id);
    if (!$module) return NULL;
    $releases = array();
    foreach ($this->releases_for($id) as $release) $releases[] = $this->public_release($release);
    $operations = array();
    foreach ($this->operations_for($id, 200) as $operation) $operations[] = $this->operation_public($operation);
    return $this->public_module($module, $releases, $operations);
  }

  public function listing() {
    $out = array();
    foreach ($this->all_modules() as $module) {
      $releases = array();
      foreach ($this->releases_for($module['id']) as $release) $releases[] = $this->public_release($release);
      $operations = array();
      foreach ($this->operations_for($module['id'], 10) as $operation) $operations[] = $this->operation_public($operation);
      $out[] = $this->public_module($module, $releases, $operations);
    }
    return $out;
  }

  public function operation_public($row) {
    $out = array(
      'id'              => $row['id'],
      'moduleRegistryId' => $row['module_registry_id'],
      'releaseId'       => $row['release_id'],
      'operationType'   => $row['operation_type'],
      'status'          => $row['status'],
      'idempotencyKey'  => $row['idempotency_key'],
      'correlationId'   => $row['correlation_id'],
      'fromVersion'     => $row['from_version'],
      'toVersion'       => $row['to_version'],
      'requestedById'   => $row['requested_by_id'],
      'request'         => $row['request'],
      'result'          => $row['result'],
      'logs'            => $row['logs'],
      'errorCode'       => $row['error_code'],
      'errorMessage'    => $row['error_message'],
      'startedAt'       => $row['started_at'],
      'finishedAt'      => $row['finished_at'],
      'completedAt'     => $row['finished_at'],
      'createdAt'       => $row['created_at'],
      'updatedAt'       => $row['updated_at'],
    );
    // The web client renders op.moduleRegistry.moduleKey, op.release.version and
    // op.requestedBy.email, so flatten the joins into the same nested shape the
    // Node API returns instead of leaking snake_case columns.
    if (isset($row['module_key'])) $out['moduleRegistry'] = array('id' => $row['module_registry_id'], 'moduleKey' => $row['module_key'], 'name' => $row['module_name']);
    if (isset($row['release_version'])) $out['release'] = array('id' => $row['release_id'], 'version' => $row['release_version']);
    if (isset($row['requested_by_email'])) $out['requestedBy'] = array('id' => $row['requested_by_id'], 'email' => $row['requested_by_email']);
    return $out;
  }

  /**
   * Runtime registrations visible to $role, for apps/api/src/http/routes/moduleRuntime.ts.
   * The upstream serviceUrl is stripped: it is an internal address and the
   * browser must reach module backends through this gateway, not around it.
   */
  public function runtime_registrations($role) {
    $rows = $this->db->where(array('status' => 'ACTIVE', 'enabled' => 1))->get('platform_modules')->result_array();
    $out = array();
    foreach ($rows as $row) {
      $module = $this->module_row($row);
      $registration = is_array($module['runtime_registration']) ? $module['runtime_registration'] : array();
      if (!isset($registration['moduleId'])) continue;
      $roles = isset($registration['accessRoles']) && is_array($registration['accessRoles']) ? $registration['accessRoles'] : array();
      if (!in_array($role, $roles, TRUE)) continue;
      unset($registration['serviceUrl'], $registration['instanceId'], $registration['imageDigest']);
      $out[] = $registration;
    }
    return $out;
  }

  /** One module row keyed for the gateway: manifest, registration and status. */
  public function runtime_module($module_key) {
    $module = $this->module_by_key($module_key);
    if (!$module) return NULL;
    if ($module['status'] !== 'ACTIVE' || !$module['enabled']) return NULL;
    return $module;
  }

  public function dashboard($runner_configured, $scanner_configured, $signature_keys) {
    $modules = $this->all_modules();
    $releases = $this->all_releases();
    $count = function ($status) use ($modules) {
      $total = 0;
      foreach ($modules as $module) if ($module['status'] === $status) $total++;
      return $total;
    };
    $awaiting = 0;
    foreach ($releases as $release) if ($release['status'] === 'VALIDATED') $awaiting++;
    $updates = 0;
    foreach ($modules as $module) {
      foreach ($releases as $release) {
        if ($release['module_registry_id'] === $module['id'] && $release['status'] === 'APPROVED' && $release['version'] !== $module['current_version']) { $updates++; break; }
      }
    }
    return array(
      'total'                  => count($modules),
      'active'                 => $count('ACTIVE'),
      'disabled'               => $count('DISABLED'),
      'failed'                 => $count('FAILED'),
      'quarantined'            => $count('QUARANTINED'),
      'awaitingApproval'       => $awaiting,
      'updatesAvailable'       => $updates,
      'runnerConfigured'       => (bool) $runner_configured,
      'scannerConfigured'      => (bool) $scanner_configured,
      'signatureKeysConfigured' => (int) $signature_keys,
    );
  }
}
