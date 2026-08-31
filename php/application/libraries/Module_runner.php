<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_runner — signed adapter to the isolated WINDELS Module Runner.
 *
 * Ports apps/api/src/moduleCenter/runner.service.ts.
 *
 * The runner is a *separate* deployment plane: it is the only component that is
 * allowed to unpack and execute an uploaded module package. This API never
 * includes, requires or evals uploaded code -- it only stores it, verifies it,
 * and asks the runner to act on it over an HMAC-signed HTTP call.
 *
 * When VP_MODULE_RUNNER_URL / VP_MODULE_RUNNER_HMAC_SECRET are not configured
 * this returns the same NOT_CONFIGURED result Node does. It does not fake a
 * pass: an unverifiable install would leave a module marked ACTIVE that no
 * runtime is actually serving.
 */
class Module_runner {

  const PROTOCOL = 'windels-module-runner/v1';

  public function configured() {
    $url = getenv('VP_MODULE_RUNNER_URL');
    $secret = getenv('VP_MODULE_RUNNER_HMAC_SECRET');
    if ($url === FALSE || $secret === FALSE) return NULL;
    $url = rtrim(trim($url), '/');
    $secret = trim($secret);
    if ($url === '' || strlen($secret) < 32) return NULL;
    // Node refuses a plaintext runner URL in production; do the same.
    if (defined('ENVIRONMENT') && ENVIRONMENT === 'production' && strpos($url, 'https://') !== 0) return NULL;
    return array('url' => $url, 'secret' => $secret);
  }

  public function is_configured() { return $this->configured() !== NULL; }

  /**
   * @param array $input action, moduleId, releaseId, version, checksum,
   *                     artifactPath, manifest, actorId, correlationId,
   *                     previousVersion, previousReleaseId
   * @return array ModuleRunnerResult
   */
  public function run($input) {
    $config = $this->configured();
    $action = $input['action'];
    if (!$config) {
      return array(
        'ok'      => FALSE,
        'action'  => $action,
        'status'  => 'NOT_CONFIGURED',
        'checks'  => array(array(
          'code'     => 'MODULE_RUNNER_NOT_CONFIGURED',
          'category' => 'sandbox',
          'status'   => 'NOT_CONFIGURED',
          'severity' => 'critical',
          'message'  => 'VP_MODULE_RUNNER_URL and a 32+ character VP_MODULE_RUNNER_HMAC_SECRET are required. Uploaded code remains inactive.',
        )),
        'logs'     => array(),
        'evidence' => array(),
      );
    }
    if (!function_exists('curl_init')) {
      return $this->failed($action, 'RUNNER_UNAVAILABLE', 'The curl extension is required to call the Module Runner.');
    }

    $correlation = isset($input['correlationId']) && $input['correlationId'] ? $input['correlationId'] : $this->uuid();
    $artifact_base = getenv('VP_MODULE_RUNNER_ARTIFACT_BASE_URL');
    $artifact_base = $artifact_base ? rtrim(trim($artifact_base), '/') : '';
    $artifact = array('sha256' => $input['checksum']);
    if ($artifact_base !== '') $artifact['uri'] = $artifact_base . '/' . $input['releaseId'] . '.wmod';
    else $artifact['sharedPath'] = $input['artifactPath'];

    $payload = array(
      'protocol'   => self::PROTOCOL,
      'action'     => $action,
      'correlationId' => $correlation,
      'actor'      => array('id' => $input['actorId'], 'authority' => 'super_admin'),
      'module'     => array(
        'id'        => $input['moduleId'],
        'releaseId' => $input['releaseId'],
        'version'   => $input['version'],
        'checksum'  => $input['checksum'],
        'manifest'  => $input['manifest'],
      ),
      'artifact'   => $artifact,
      'previous'   => array(
        'version'  => isset($input['previousVersion']) ? $input['previousVersion'] : NULL,
        'releaseId' => isset($input['previousReleaseId']) ? $input['previousReleaseId'] : NULL,
      ),
      'policy'     => array(
        'networkDefault' => 'deny', 'readOnlyRoot' => TRUE, 'noNewPrivileges' => TRUE,
        'requireHealth' => TRUE, 'requireRollbackOnFailure' => TRUE,
      ),
    );
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $timestamp = gmdate('c');
    $signature = hash_hmac('sha256', $timestamp . '.' . $body, $config['secret']);
    $timeout_ms = (int) (getenv('VP_MODULE_RUNNER_TIMEOUT_MS') ?: 180000);

    $handle = curl_init($config['url'] . '/v1/module-actions');
    $headers = array();
    $response_body = '';
    curl_setopt_array($handle, array(
      CURLOPT_POST           => TRUE,
      CURLOPT_POSTFIELDS     => $body,
      CURLOPT_RETURNTRANSFER => TRUE,
      CURLOPT_TIMEOUT_MS     => $timeout_ms,
      CURLOPT_CONNECTTIMEOUT => 10,
      CURLOPT_HTTPHEADER     => array(
        'content-type: application/json',
        'x-windels-timestamp: ' . $timestamp,
        'x-windels-signature: v1=' . $signature,
        'x-correlation-id: ' . $correlation,
      ),
      CURLOPT_HEADERFUNCTION => function ($curl, $header) use (&$headers) {
        $parts = explode(':', $header, 2);
        if (count($parts) === 2) $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
        return strlen($header);
      },
    ));
    $response_body = curl_exec($handle);
    $error = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    if ($response_body === FALSE) {
      $timed_out = $error !== '' && stripos($error, 'timed out') !== FALSE;
      return $this->failed($action, $timed_out ? 'RUNNER_TIMEOUT' : 'RUNNER_UNAVAILABLE', $error !== '' ? $error : 'Module Runner was unreachable');
    }
    if (!$this->verify_signature(isset($headers['x-windels-timestamp']) ? $headers['x-windels-timestamp'] : '', $response_body, isset($headers['x-windels-signature']) ? $headers['x-windels-signature'] : '')) {
      return $this->failed($action, 'RUNNER_RESPONSE_SIGNATURE_INVALID', 'Module Runner response signature is missing, stale, or invalid.');
    }
    if ($status < 200 || $status >= 300) {
      return $this->failed($action, 'RUNNER_HTTP_ERROR', "Module Runner returned HTTP {$status}.", array(substr($response_body, -2000)), array('status' => $status));
    }
    $parsed = json_decode($response_body, TRUE);
    if (!is_array($parsed)) return $this->failed($action, 'RUNNER_RESPONSE_INVALID', 'Module Runner returned invalid JSON.');
    if (!isset($parsed['action']) || $parsed['action'] !== $action || !isset($parsed['correlationId']) || $parsed['correlationId'] !== $correlation) {
      return $this->failed($action, 'RUNNER_RESPONSE_MISMATCH', 'Runner response action/correlation does not match the request.', $this->sanitize_logs(isset($parsed['logs']) ? $parsed['logs'] : array()));
    }
    $runtime = NULL;
    if (isset($parsed['runtime']) && is_array($parsed['runtime'])) {
      $runtime = array();
      foreach (array('serviceUrl', 'instanceId', 'imageDigest') as $key) {
        if (isset($parsed['runtime'][$key]) && is_string($parsed['runtime'][$key])) $runtime[$key] = $parsed['runtime'][$key];
      }
    }
    return array(
      'ok'                => isset($parsed['ok']) && $parsed['ok'] === TRUE,
      'action'            => $action,
      'status'            => (isset($parsed['ok']) && $parsed['ok'] === TRUE) ? 'PASSED' : 'FAILED',
      'checks'            => (isset($parsed['checks']) && is_array($parsed['checks'])) ? array_slice($parsed['checks'], 0, 200) : array(),
      'logs'              => $this->sanitize_logs(isset($parsed['logs']) ? $parsed['logs'] : array()),
      'evidence'          => (isset($parsed['evidence']) && is_array($parsed['evidence'])) ? $parsed['evidence'] : array(),
      'runtime'           => $runtime,
      'rollbackPerformed' => isset($parsed['rollbackPerformed']) && $parsed['rollbackPerformed'] === TRUE,
    );
  }

  private function failed($action, $code, $message, $logs = array(), $evidence = array()) {
    return array(
      'ok'      => FALSE,
      'action'  => $action,
      'status'  => 'FAILED',
      'checks'  => array(array('code' => $code, 'category' => 'sandbox', 'status' => 'FAILED', 'severity' => 'critical', 'message' => $message, 'evidence' => $evidence)),
      'logs'    => $logs,
      'evidence' => $evidence,
    );
  }

  public function sanitize_logs($value) {
    if (!is_array($value)) return array();
    $out = array();
    foreach (array_slice($value, -200) as $line) {
      $out[] = substr(preg_replace('/(token|secret|password|authorization)\s*[=:]\s*\S+/i', '$1=[REDACTED]', (string) $line), 0, 2000);
    }
    return $out;
  }

  public function verify_signature($timestamp, $body, $provided) {
    $config = $this->configured();
    if (!$config || strpos($provided, 'v1=') !== 0) return FALSE;
    $then = strtotime($timestamp);
    if ($then === FALSE || abs(time() - $then) > 300) return FALSE;
    $expected = hash_hmac('sha256', $timestamp . '.' . $body, $config['secret']);
    return hash_equals($expected, substr($provided, 3));
  }

  private function uuid() {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0F) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3F) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
  }
}
