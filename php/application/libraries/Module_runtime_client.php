<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_runtime_client — signed reverse proxy for ACTIVE module backends.
 *
 * Ports the `router.all("/:moduleKey/*")` handler of
 * apps/api/src/http/routes/moduleRuntime.ts.
 *
 * A module backend is never contacted by the browser. Every call goes through
 * this gateway, which has already established that the module is ACTIVE and
 * enabled, that the caller's role is in the manifest's accessRoles, that the
 * method and path were declared by that manifest, and that the caller holds the
 * permission the manifest attached to the route. What this class adds is the
 * last two things: an HMAC-signed context header so the module can trust who is
 * calling, and a hard cap on how big a module's answer may be.
 *
 * Node lets a fetch failure escape to the Express error handler (a 500 with a
 * stack-shaped body). This returns 502 MODULE_RUNTIME_UNREACHABLE with the
 * transport error instead, which is both more accurate and safer to show.
 */
class Module_runtime_client {

  /** HMAC-SHA256 signing secret for the module context header. */
  public function signing_secret() {
    $secret = getenv('VP_MODULE_RUNNER_HMAC_SECRET');
    if ($secret === FALSE) return NULL;
    $secret = trim($secret);
    return strlen($secret) >= 32 ? $secret : NULL;
  }

  /** Build the base64url module context the upstream service receives. */
  public function context($actor, $module_key, $request_id) {
    $payload = json_encode(array(
      'userId'         => $actor['userId'],
      'organizationId' => $actor['organizationId'],
      'role'           => $actor['role'],
      'moduleId'       => $module_key,
      'requestId'      => $request_id,
    ), JSON_UNESCAPED_SLASHES);
    return rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
  }

  /** HMAC over `<timestamp>.<context>.<method>.<path>` — the Node header order. */
  public function signature($secret, $timestamp, $context, $method, $path) {
    return hash_hmac('sha256', $timestamp . '.' . $context . '.' . $method . '.' . $path, $secret);
  }

  /**
   * Resolve `/relative/path` against the registered service base URL.
   * Returns NULL when the base is not a usable absolute http(s) URL.
   */
  public function target_url($base, $relative_path, $query) {
    $base = trim((string) $base);
    if ($base === '') return NULL;
    $parts = @parse_url($base);
    if (!$parts || !isset($parts['scheme']) || !isset($parts['host'])) return NULL;
    if (!in_array(strtolower($parts['scheme']), array('http', 'https'), TRUE)) return NULL;
    if (isset($parts['user']) || isset($parts['pass'])) return NULL;
    $root = rtrim($base, '/') . '/';
    $path = ltrim((string) $relative_path, '/');
    $url = $root . $path;
    if (is_array($query) && count($query)) {
      $separator = strpos($url, '?') === FALSE ? '?' : '&';
      $url .= $separator . http_build_query($query);
    }
    return $url;
  }

  /**
   * @return array(status, body, contentType, error) — error is set only when
   *         the upstream could not be reached at all.
   */
  public function proxy($input) {
    $secret = $this->signing_secret();
    if (!$secret) return array('status' => 0, 'body' => NULL, 'contentType' => NULL, 'error' => 'MODULE_RUNNER_HMAC_SECRET is not configured');
    if (!function_exists('curl_init')) return array('status' => 0, 'body' => NULL, 'contentType' => NULL, 'error' => 'The curl extension is required to reach a module backend');

    $url = $this->target_url($input['serviceUrl'], $input['path'], isset($input['query']) ? $input['query'] : array());
    if (!$url) return array('status' => 0, 'body' => NULL, 'contentType' => NULL, 'error' => 'The registered module service URL is not usable');

    $timestamp = gmdate('c');
    $context = $this->context($input['actor'], $input['moduleKey'], $input['requestId']);
    $signature = $this->signature($secret, $timestamp, $context, $input['method'], $input['path']);
    $max_bytes = max(1, (int) (getenv('VP_MODULE_RUNTIME_RESPONSE_MAX_BYTES') ?: 5 * 1024 * 1024));
    $timeout_ms = max(1, (int) (getenv('VP_MODULE_RUNTIME_TIMEOUT_MS') ?: 15000));

    $headers = array(
      'accept: application/json',
      'content-type: application/json',
      'x-windels-module-context: ' . $context,
      'x-windels-timestamp: ' . $timestamp,
      'x-windels-signature: v1=' . $signature,
      'x-request-id: ' . $input['requestId'],
    );
    $body = in_array($input['method'], array('GET', 'HEAD'), TRUE) ? NULL : json_encode(isset($input['body']) ? $input['body'] : new stdClass());

    $handle = curl_init($url);
    $response_headers = array();
    curl_setopt_array($handle, array(
      CURLOPT_CUSTOMREQUEST  => $input['method'],
      CURLOPT_RETURNTRANSFER => TRUE,
      CURLOPT_FOLLOWLOCATION => FALSE,
      CURLOPT_TIMEOUT_MS     => $timeout_ms,
      CURLOPT_CONNECTTIMEOUT => 10,
      CURLOPT_HTTPHEADER     => $headers,
      CURLOPT_HEADERFUNCTION => function ($curl, $header) use (&$response_headers) {
        $parts = explode(':', $header, 2);
        if (count($parts) === 2) $response_headers[strtolower(trim($parts[0]))] = trim($parts[1]);
        return strlen($header);
      },
    ));
    if ($body !== NULL) curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
    $response = curl_exec($handle);
    $error = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $declared = (int) curl_getinfo($handle, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    curl_close($handle);

    if ($response === FALSE) {
      return array('status' => 0, 'body' => NULL, 'contentType' => NULL, 'error' => $error !== '' ? $error : 'Module backend was unreachable');
    }
    if ($declared > $max_bytes || strlen($response) > $max_bytes) {
      return array('status' => 0, 'body' => NULL, 'contentType' => NULL, 'error' => 'MODULE_RESPONSE_TOO_LARGE', 'tooLarge' => TRUE);
    }
    $content_type = isset($response_headers['content-type']) ? $response_headers['content-type'] : 'application/octet-stream';
    return array('status' => $status, 'body' => $response, 'contentType' => $content_type, 'error' => NULL);
  }
}
