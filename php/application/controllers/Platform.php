<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Global Platform — PHP port of apps/api/src/http/routes/platform.ts (15 routes).
 *
 *   GET    /api/v1/platform/metrics
 *   GET    /api/v1/platform/logs
 *   GET    /api/v1/platform/traces
 *   GET    /api/v1/platform/traces/:traceId
 *   GET    /api/v1/platform/spans/:spanId
 *   GET    /api/v1/platform/ai-observability
 *   GET    /api/v1/platform/regions
 *   GET    /api/v1/platform/dr
 *   POST   /api/v1/platform/failover
 *   DELETE /api/v1/platform/failover
 *   GET    /api/v1/platform/cdn
 *   PUT    /api/v1/platform/cdn/rules
 *   POST   /api/v1/platform/cdn/purge
 *   POST   /api/v1/platform/cdn/sign-url
 *   GET    /api/v1/platform/overview
 *
 * All routes require authenticate + ORG_ADMIN, as in Node. (Infrastructure is
 * a separate Node module with its own 30 routes and is ported separately.)
 *
 * Node serves all of this out of process memory: metric Maps, a 2000-entry log
 * ring, a 500-span ring, four module-level variables for failover state, and
 * two arrays for CDN rules and purges. Under PHP none of that survives the
 * request, so it lives in MySQL instead — see the model for what each table
 * holds and for the two numbers Node invents that this build reports as null.
 */
class Platform extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->model('Permission_model', 'permissions');
    if (!$this->permissions->has($this->c['sub'], 'ORG_ADMIN', $this->c['organizationId'] ?? NULL)) {
      $this->fail('FORBIDDEN', 'Administrator access required', 403);
      $this->output->_display();
      exit;
    }
    $this->org = $this->c['organizationId'] ?? NULL;
    $this->load->model('Platform_model', 'plat');
  }

  // ------------------------------------------------------------ observability

  public function metrics() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return $this->respond($this->plat->metrics_snapshot());
  }

  public function logs() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $level  = $this->input->get('level');
    if ($level !== NULL && $level !== '') {
      if (!in_array($level, array('debug', 'info', 'warn', 'error', 'fatal'), TRUE)) {
        return $this->fail('VALIDATION_ERROR', "Invalid level. Use 'debug', 'info', 'warn', 'error', or 'fatal'", 400);
      }
    } else {
      $level = NULL;
    }
    $limit = $this->limit_param('limit', 200, 1, 500);
    if ($limit === FALSE) return $this->fail('VALIDATION_ERROR', 'limit must be an integer between 1 and 500', 400);
    $search = $this->input->get('search');
    return $this->respond($this->plat->logs($level, $limit, $search !== '' ? $search : NULL));
  }

  public function traces() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $limit = $this->limit_param('limit', 50, 1, 200);
    if ($limit === FALSE) return $this->fail('VALIDATION_ERROR', 'limit must be an integer between 1 and 200', 400);
    return $this->respond($this->plat->traces($limit));
  }

  public function trace($traceId = NULL) {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    if (!preg_match('/^[0-9a-fA-F]{32}$/', (string)$traceId)) {
      return $this->fail('NOT_FOUND', 'Trace not found', 404);
    }
    $spans = $this->plat->trace($traceId);
    if (!$spans) return $this->fail('NOT_FOUND', 'Trace not found', 404);
    return $this->respond($spans);
  }

  public function span($spanId = NULL) {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    if (!preg_match('/^[0-9a-fA-F]{16}$/', (string)$spanId)) {
      return $this->fail('NOT_FOUND', 'Span not found', 404);
    }
    $span = $this->plat->span($spanId);
    if (!$span) return $this->fail('NOT_FOUND', 'Span not found', 404);
    return $this->respond($span);
  }

  public function ai_observability() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $minutes = $this->limit_param('minutes', 60, 5, 10080);
    if ($minutes === FALSE) return $this->fail('VALIDATION_ERROR', 'minutes must be an integer between 5 and 10080', 400);
    return $this->respond($this->plat->ai_observability($this->org, $minutes));
  }

  // ------------------------------------------------------------- regions / DR

  public function regions() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return $this->respond($this->plat->regions());
  }

  public function dr() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return $this->respond($this->plat->dr());
  }

  /** POST to trigger, DELETE to clear — Node registers both on one path. */
  public function failover() {
    $method = $this->input->method(TRUE);
    if ($method === 'POST')   return $this->failover_post();
    if ($method === 'DELETE') return $this->failover_delete();
    return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  private function failover_post() {
    $d = $this->body();
    $toRegion = isset($d['toRegion']) && is_string($d['toRegion']) ? trim($d['toRegion']) : NULL;
    $reason   = isset($d['reason']) && is_string($d['reason']) ? trim($d['reason']) : NULL;
    if ($toRegion === NULL || $toRegion === '' || $reason === NULL || $reason === '') {
      return $this->fail('VALIDATION_ERROR', 'toRegion and reason are required', 400);
    }
    if (strlen($reason) > 500) $reason = substr($reason, 0, 500);
    $state = $this->plat->set_failover($toRegion, $reason);
    if (!$state) return $this->fail('VALIDATION_ERROR', 'Unknown failover target region: ' . $toRegion, 400);
    $this->audit('platform.failover_activated', array('toRegion' => $toRegion, 'reason' => $reason));
    return $this->respond($state);
  }

  private function failover_delete() {
    $out = $this->plat->clear_failover();
    $this->audit('platform.failover_cleared', array('previousRegion' => $out['previousRegion']));
    return $this->respond($out['state']);
  }

  // ---------------------------------------------------------------------- CDN

  public function cdn() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return $this->respond($this->plat->cdn_config());
  }

  public function cdn_rules() {
    if ($this->input->method(TRUE) !== 'PUT') return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $d = $this->body();
    if (!isset($d['rules']) || !is_array($d['rules']) || !$d['rules']) {
      return $this->fail('VALIDATION_ERROR', 'rules must be a non-empty array', 400);
    }
    if (count($d['rules']) > 50) return $this->fail('VALIDATION_ERROR', 'At most 50 rules are allowed', 400);
    $details = array();
    $rules   = array();
    foreach ($d['rules'] as $i => $r) {
      if (!is_array($r)) { $details[] = array('path' => "rules[$i]", 'message' => 'must be an object'); continue; }
      $bad = FALSE;
      $pattern = isset($r['pathPattern']) && is_string($r['pathPattern']) ? trim($r['pathPattern']) : '';
      if ($pattern === '') { $details[] = array('path' => "rules[$i].pathPattern", 'message' => 'must be a non-empty string'); $bad = TRUE; }
      elseif (strlen($pattern) > 200) { $details[] = array('path' => "rules[$i].pathPattern", 'message' => 'must be 200 characters or fewer'); $bad = TRUE; }

      $ttl = $r['ttlSeconds'] ?? NULL;
      if (!is_int($ttl) || $ttl < 0 || $ttl > 31536000) {
        $details[] = array('path' => "rules[$i].ttlSeconds", 'message' => 'must be an integer between 0 and 31536000'); $bad = TRUE;
      }
      $swr = $r['staleWhileRevalidate'] ?? 0;
      if (!is_int($swr) || $swr < 0 || $swr > 86400) {
        $details[] = array('path' => "rules[$i].staleWhileRevalidate", 'message' => 'must be an integer between 0 and 86400'); $bad = TRUE;
      }
      $includes = $r['cacheKeyIncludes'] ?? array();
      if (!is_array($includes)) { $details[] = array('path' => "rules[$i].cacheKeyIncludes", 'message' => 'must be an array of strings'); $bad = TRUE; }
      else {
        foreach ($includes as $inc) {
          if (!is_string($inc)) { $details[] = array('path' => "rules[$i].cacheKeyIncludes", 'message' => 'entries must be strings'); $bad = TRUE; break; }
        }
      }
      if (!array_key_exists('enabled', $r) || !is_bool($r['enabled'])) {
        $details[] = array('path' => "rules[$i].enabled", 'message' => 'must be a boolean'); $bad = TRUE;
      }
      if ($bad) continue;
      $rules[] = array(
        'pathPattern'          => $pattern,
        'ttlSeconds'           => $ttl,
        'staleWhileRevalidate' => $swr,
        'cacheKeyIncludes'     => array_values($includes),
        'enabled'              => $r['enabled'],
      );
    }
    if ($details) return $this->fail('VALIDATION_ERROR', 'Invalid cache rules', 400, $details);
    if (!$rules) return $this->fail('VALIDATION_ERROR', 'rules must be a non-empty array', 400);
    $saved = $this->plat->update_cdn_rules($rules);
    $this->audit('platform.cdn_rules_updated', array('count' => count($saved)));
    return $this->respond($saved);
  }

  public function cdn_purge() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $d = $this->body();
    if (!isset($d['paths']) || !is_array($d['paths']) || !$d['paths']) {
      return $this->fail('VALIDATION_ERROR', 'paths must be a non-empty array', 400);
    }
    if (count($d['paths']) > 500) return $this->fail('VALIDATION_ERROR', 'At most 500 paths may be purged at once', 400);
    $paths = array();
    foreach ($d['paths'] as $i => $p) {
      if (!is_string($p) || trim($p) === '') {
        return $this->fail('VALIDATION_ERROR', 'paths must be non-empty strings', 400, array(array('path' => "paths[$i]", 'message' => 'must be a non-empty string')));
      }
      if (strlen($p) > 500) return $this->fail('VALIDATION_ERROR', 'Each path must be 500 characters or fewer', 400);
      $paths[] = trim($p);
    }
    $entry = $this->plat->purge($paths, $this->c['sub'] ?? NULL);
    $this->audit('platform.cdn_purge_requested', array('id' => $entry['id'], 'paths' => count($paths), 'status' => $entry['status']));
    return $this->respond($entry, 202);
  }

  public function cdn_sign_url() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    $d = $this->body();
    $url = isset($d['url']) && is_string($d['url']) ? trim($d['url']) : '';
    if ($url === '' || strlen($url) > 2000) {
      return $this->fail('VALIDATION_ERROR', 'url is required and must be 2000 characters or fewer', 400);
    }
    if (!preg_match('#^https?://#i', $url)) {
      return $this->fail('VALIDATION_ERROR', 'url must be an absolute http(s) URL', 400);
    }
    $ttl = $d['ttlSeconds'] ?? 3600;
    if (!is_int($ttl) || $ttl < 60 || $ttl > 604800) {
      return $this->fail('VALIDATION_ERROR', 'ttlSeconds must be an integer between 60 and 604800', 400);
    }
    return $this->respond($this->plat->sign_url($url, $ttl));
  }

  // ----------------------------------------------------------------- overview

  public function overview() {
    if (!$this->is_get()) return $this->fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return $this->respond(array(
      'regions' => $this->plat->regions(),
      'dr'      => $this->plat->dr(),
      'cdn'     => $this->plat->cdn_config(),
      'metrics' => $this->plat->metrics_snapshot(),
    ));
  }

  // ----------------------------------------------------------------- helpers

  private function is_get() {
    $m = $this->input->method(TRUE);
    return $m === 'GET' || $m === 'HEAD';
  }

  /** Integer query parameter; FALSE when supplied but out of range. */
  private function limit_param($name, $default, $min, $max) {
    $raw = $this->input->get($name);
    if ($raw === NULL || $raw === '') return $default;
    if (!is_numeric($raw) || (string)(int)$raw !== (string)$raw) return FALSE;
    $v = (int)$raw;
    return ($v < $min || $v > $max) ? FALSE : $v;
  }

  private function audit($type, $payload) {
    $this->db->insert('audit_events', array(
      'organization_id' => $this->org,
      'user_id'         => $this->c['sub'] ?? NULL,
      'event_type'      => $type,
      'payload'         => json_encode($payload),
      'ip_address'      => $this->input->ip_address(),
      'user_agent'      => substr((string)$this->input->user_agent(), 0, 500),
      'created_at'      => date('Y-m-d H:i:s'),
    ));
  }
}
