<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_runtime — registration surface and guarded proxy for ACTIVE modules.
 *
 * Port of apps/api/src/http/routes/moduleRuntime.ts. Unlike the Module Center
 * these routes are open to any authenticated user: what restricts them is the
 * module's own manifest, which declares who may call it (accessRoles), which
 * methods and paths exist (backend.routes) and which platform permission each
 * route requires.
 *
 *   GET /api/v1/module-runtime/health
 *   GET /api/v1/module-runtime/modules
 *   GET /api/v1/module-runtime/registrations
 *   ANY /api/v1/module-runtime/:moduleKey/*
 *
 * No new tables: the registration is the `runtime_registration` JSON the Module
 * Center wrote when the release was activated.
 */
class Module_runtime extends MY_Controller {

  private $c;
  private $actor;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->actor = array(
      'userId'         => $this->c['sub'],
      'organizationId' => isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL,
      'role'           => isset($this->c['role']) ? strtolower($this->c['role']) : 'user',
    );
    $this->load->model('Module_center_model', 'mc');
    $this->load->model('Permission_model', 'permissions');
    $this->load->library('Module_runtime_client');
  }

  // ---------------------------------------------------------------------------
  // Registration surface
  // ---------------------------------------------------------------------------

  public function health() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond(array(
      'status'        => 'ok',
      'registrations' => count($this->mc->runtime_registrations($this->actor['role'])),
    ));
  }

  public function modules() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->mc->runtime_registrations($this->actor['role']));
  }

  public function registrations() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->mc->runtime_registrations($this->actor['role']));
  }

  // ---------------------------------------------------------------------------
  // Guarded proxy: /api/v1/module-runtime/:moduleKey/<path...>
  // ---------------------------------------------------------------------------
  public function proxy() {
    $args      = func_get_args();
    $moduleKey = (string) array_shift($args);
    $rest      = implode('/', $args);
    $method    = strtoupper($this->input->method(TRUE));
    $path      = '/' . ltrim((string) $rest, '/');

    $module = $this->mc->runtime_module($moduleKey);
    if (!$module) return $this->fail('NOT_FOUND', 'Active module not found', 404);

    $manifest = is_array($module['manifest']) ? $module['manifest'] : array();
    $access_roles = isset($manifest['accessRoles']) && is_array($manifest['accessRoles']) ? $manifest['accessRoles'] : array();
    if (!in_array($this->actor['role'], $access_roles, TRUE)) {
      return $this->fail('FORBIDDEN', 'Role is not allowed to access this module', 403);
    }

    $routes = isset($manifest['backend']['routes']) && is_array($manifest['backend']['routes']) ? $manifest['backend']['routes'] : array();
    $declared = NULL;
    foreach ($routes as $route) {
      if (isset($route['method'], $route['path']) && strtoupper($route['method']) === $method && $this->route_matches($route['path'], $path)) { $declared = $route; break; }
    }
    if (!$declared) {
      return $this->fail('MODULE_ROUTE_NOT_DECLARED', 'The requested method/path is not declared by the active module manifest', 404);
    }

    // The permission must exist in the platform catalog AND be held by the
    // caller. An unknown permission is refused: a manifest cannot invent one.
    $permission = isset($declared['permission']) ? (string) $declared['permission'] : '';
    if ($permission === '' || !in_array($permission, $this->mc->known_permissions(), TRUE)) {
      return $this->fail('FORBIDDEN', 'Module route declares a permission the platform does not define: ' . $permission, 403);
    }
    if (!$this->permissions->has($this->actor['userId'], $permission, $this->actor['organizationId'])) {
      return $this->fail('FORBIDDEN', 'Missing module route permission: ' . $permission, 403);
    }

    $registration = is_array($module['runtime_registration']) ? $module['runtime_registration'] : array();
    $service_url  = isset($registration['serviceUrl']) ? $registration['serviceUrl'] : NULL;
    if (!$service_url || !$this->module_runtime_client->signing_secret()) {
      return $this->fail('MODULE_RUNTIME_UNAVAILABLE', 'The module runtime registration is incomplete', 503);
    }

    $request_id = $this->request_id();
    $result = $this->module_runtime_client->proxy(array(
      'serviceUrl' => $service_url,
      'path'       => $path,
      'query'      => $this->input->get(),
      'method'     => $method,
      'body'       => $this->body(),
      'actor'      => $this->actor,
      'moduleKey'  => $moduleKey,
      'requestId'  => $request_id,
    ));

    if (!empty($result['tooLarge'])) {
      return $this->fail('MODULE_RESPONSE_TOO_LARGE', 'Module response exceeds platform policy', 502);
    }
    if ($result['error']) {
      // Node lets this escape as an unhandled 500; naming it is more useful.
      return $this->fail('MODULE_RUNTIME_UNREACHABLE', 'The module backend could not be reached: ' . $result['error'], 502);
    }

    $this->audit_runtime($module, $method, $path, $result['status'], $request_id);
    $content_type = stripos((string) $result['contentType'], 'json') !== FALSE ? 'application/json' : 'application/octet-stream';
    $this->response_status = $result['status'] >= 100 && $result['status'] < 600 ? $result['status'] : 502;
    return $this->output
      ->set_status_header($this->response_status)
      ->set_content_type($content_type)
      ->set_output((string) $result['body']);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Manifest route matching, ported from routes/moduleRuntime.ts: literal
   * segments must match, `:param` matches one segment, and a trailing `*` opens
   * the rest of the path.
   */
  private function route_matches($pattern, $actual) {
    $expected = array_values(array_filter(explode('/', (string) $pattern), function ($part) { return $part !== ''; }));
    $received = array_values(array_filter(explode('/', (string) $actual), function ($part) { return $part !== ''; }));
    $count = count($expected);
    if ($count === 0) return FALSE;
    if (end($expected) !== '*') {
      if ($count !== count($received)) return FALSE;
    } elseif (count($received) < $count - 1) {
      return FALSE;
    }
    foreach ($expected as $index => $part) {
      if ($part === '*') return TRUE;
      if ($part === '' || $part[0] === ':') continue;
      if (!isset($received[$index]) || $part !== $received[$index]) return FALSE;
    }
    return TRUE;
  }

  private function audit_runtime($module, $method, $path, $upstream_status, $request_id) {
    $this->db->insert('audit_events', array(
      'organization_id' => $this->actor['organizationId'],
      'user_id'         => $this->actor['userId'],
      'event_type'      => $method === 'GET' ? 'module.runtime_read' : 'module.runtime_write',
      'payload'         => json_encode(array(
        'resourceId'  => $module['id'],
        'moduleId'    => $module['module_key'],
        'method'      => $method,
        'path'        => $path,
        'status'      => (int) $upstream_status,
        'requestId'   => $request_id,
      )),
      'ip_address'      => $this->input->ip_address(),
      'request_id'      => $request_id,
      'created_at'      => date('Y-m-d H:i:s'),
    ));
  }
}
