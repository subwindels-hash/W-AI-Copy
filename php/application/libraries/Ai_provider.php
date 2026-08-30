<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * AI provider registry — PHP port of apps/api/src/services/ai/registry.ts.
 *
 * Five real transports are supported (OpenAI, any OpenAI-compatible endpoint,
 * Ollama, Anthropic, Gemini) plus the Windels Echo demo assistant. Each is
 * configured entirely from .env, so a host can pick a provider without code
 * changes:
 *
 *   VP_OPENAI_API_KEY / VP_OPENAI_BASE_URL / VP_OPENAI_MODEL
 *   VP_OPENAI_COMPAT_API_KEY / VP_OPENAI_COMPAT_BASE_URL / VP_OPENAI_COMPAT_MODEL
 *   VP_OLLAMA_BASE_URL / VP_OLLAMA_MODEL
 *   VP_ANTHROPIC_API_KEY / VP_ANTHROPIC_MODEL
 *   VP_GEMINI_API_KEY / VP_GEMINI_MODEL
 *
 * Strict mode matches Node: in the production environment a missing real
 * provider is an error (AI_PROVIDER_CONFIGURATION_REQUIRED) and the Echo demo
 * assistant is never registered. Outside production Echo may be used, and
 * every string it returns is prefixed with a demo banner so the UI can never
 * mistake it for real inference.
 *
 * Backwards compatibility: complete($messages, $model) keeps the signature and
 * return shape the Workflows / App_builder / Canvases controllers already use.
 */
class Ai_provider {

  const ECHO_BANNER = '[WINDELS ECHO DEMO — no AI provider configured] ';
  const TIMEOUT     = 120;

  // ------------------------------------------------------------- registry

  /** @return array<int,array> every provider, configured or not */
  public function providers() {
    $out = array();
    foreach ($this->definitions() as $id => $d) {
      $out[] = array(
        'id'          => $id,
        'displayName' => $d['name'],
        'isReal'      => TRUE,
        'configured'  => $this->is_configured($id),
        'model'       => $this->model_for($id),
        'baseUrl'     => $this->base_for($id),
        'supportsEmbeddings' => !empty($d['embed']),
      );
    }
    $out[] = array(
      'id'          => 'echo',
      'displayName' => 'Windels Echo (demo)',
      'isReal'      => FALSE,
      'configured'  => $this->echo_allowed(),
      'model'       => 'windels-echo-demo',
      'baseUrl'     => NULL,
      'supportsEmbeddings' => TRUE,
    );
    return $out;
  }

  /** Ids of the real providers that have credentials. */
  public function real_providers() {
    $out = array();
    foreach ($this->providers() as $p) { if ($p['isReal'] && $p['configured']) $out[] = $p['id']; }
    return $out;
  }

  public function has_real_provider() { return count($this->real_providers()) > 0; }

  /** Node's strict mode: production never falls back to the demo assistant. */
  public function echo_allowed() { return ENVIRONMENT !== 'production'; }

  public function configured() { return $this->has_real_provider(); }

  // ------------------------------------------------------------ completion

  /**
   * @param array  $messages  [{role, content}, ...]
   * @param string $model     requested model id (optional)
   * @param string $providerId force a provider (optional)
   * @return array ok/code/content/model/durationMs/tokensIn/tokensOut
   */
  public function complete($messages, $requestedModel = NULL, $providerId = NULL) {
    $messages = $this->normalize_messages($messages);
    if (!$messages) return array('ok' => FALSE, 'code' => 'VALIDATION_ERROR', 'message' => 'At least one message with content is required.');

    $id = $providerId ?: $this->resolve_provider($requestedModel);
    if ($id === 'echo') {
      if (!$this->echo_allowed()) {
        return array('ok' => FALSE, 'code' => 'AI_PROVIDER_CONFIGURATION_REQUIRED', 'message' => $this->configuration_message());
      }
      return $this->echo_complete($messages, $requestedModel);
    }
    if (!$id) {
      return array('ok' => FALSE, 'code' => 'AI_PROVIDER_CONFIGURATION_REQUIRED', 'message' => $this->configuration_message());
    }

    $result = $this->call($id, $messages, $requestedModel ?: $this->model_for($id));

    // Node retries a failed real provider; here we simply surface the error so
    // callers can decide. A misconfiguration must never be masked as content.
    return $result;
  }

  private function call($id, $messages, $model) {
    $d        = $this->definitions()[$id];
    $base     = $this->base_for($id);
    $model    = $model ?: $this->model_for($id);
    $started  = microtime(TRUE);

    switch ($id) {
      case 'openai':
      case 'openai-compat':
        $res = $this->http($base . '/chat/completions', array(
          'Authorization: Bearer ' . $this->key_for($id),
          'Content-Type: application/json',
        ), array('model' => $model, 'messages' => $messages, 'stream' => FALSE));
        if (!$res['ok']) return $res;
        $body    = $res['body'];
        $content = $body['choices'][0]['message']['content'] ?? NULL;
        if (!is_string($content)) return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'AI provider returned no message content.');
        $usage   = $body['usage'] ?? array();
        return array(
          'ok' => TRUE, 'provider' => $id, 'content' => $content, 'model' => $body['model'] ?? $model,
          'durationMs' => $this->ms($started), 'tokensIn' => (int)($usage['prompt_tokens'] ?? 0), 'tokensOut' => (int)($usage['completion_tokens'] ?? 0),
        );

      case 'ollama':
        $res = $this->http($base . '/api/chat', array('Content-Type: application/json'), array(
          'model' => $model, 'messages' => $messages, 'stream' => FALSE,
        ));
        if (!$res['ok']) return $res;
        $content = $res['body']['message']['content'] ?? NULL;
        if (!is_string($content)) return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'Ollama returned no message content.');
        return array(
          'ok' => TRUE, 'provider' => $id, 'content' => $content, 'model' => $res['body']['model'] ?? $model,
          'durationMs' => $this->ms($started), 'tokensIn' => (int)($res['body']['prompt_eval_count'] ?? 0), 'tokensOut' => (int)($res['body']['eval_count'] ?? 0),
        );

      case 'anthropic':
        $system = NULL; $turns = array();
        foreach ($messages as $m) { if ($m['role'] === 'system') { $system = ($system === NULL ? '' : $system . "\n") . $m['content']; } else { $turns[] = $m; } }
        if (!$turns) $turns = $messages;
        $payload = array('model' => $model, 'messages' => $turns, 'max_tokens' => 4096);
        if ($system !== NULL) $payload['system'] = $system;
        $res = $this->http($base . '/messages', array(
          'x-api-key: ' . $this->key_for($id),
          'anthropic-version: 2023-06-01',
          'Content-Type: application/json',
        ), $payload);
        if (!$res['ok']) return $res;
        $blocks = $res['body']['content'] ?? array();
        $content = '';
        foreach ($blocks as $b) { if (($b['type'] ?? '') === 'text') $content .= $b['text']; }
        if ($content === '') return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'Anthropic returned no text content.');
        $usage = $res['body']['usage'] ?? array();
        return array(
          'ok' => TRUE, 'provider' => $id, 'content' => $content, 'model' => $res['body']['model'] ?? $model,
          'durationMs' => $this->ms($started), 'tokensIn' => (int)($usage['input_tokens'] ?? 0), 'tokensOut' => (int)($usage['output_tokens'] ?? 0),
        );

      case 'gemini':
        $contents = array(); $system = NULL;
        foreach ($messages as $m) {
          if ($m['role'] === 'system') { $system = ($system === NULL ? '' : $system . "\n") . $m['content']; continue; }
          $contents[] = array('role' => $m['role'] === 'assistant' ? 'model' : 'user', 'parts' => array(array('text' => $m['content'])));
        }
        $payload = array('contents' => $contents);
        if ($system !== NULL) $payload['systemInstruction'] = array('parts' => array(array('text' => $system)));
        $url = $base . '/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($this->key_for($id));
        $res = $this->http($url, array('Content-Type: application/json'), $payload);
        if (!$res['ok']) return $res;
        $parts = $res['body']['candidates'][0]['content']['parts'] ?? array();
        $content = '';
        foreach ($parts as $p) { if (isset($p['text'])) $content .= $p['text']; }
        if ($content === '') return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'Gemini returned no text content.');
        $usage = $res['body']['usageMetadata'] ?? array();
        return array(
          'ok' => TRUE, 'provider' => $id, 'content' => $content, 'model' => $model,
          'durationMs' => $this->ms($started), 'tokensIn' => (int)($usage['promptTokenCount'] ?? 0), 'tokensOut' => (int)($usage['candidatesTokenCount'] ?? 0),
        );
    }
    return array('ok' => FALSE, 'code' => 'AI_PROVIDER_UNSUPPORTED', 'message' => 'Unknown AI provider: ' . $id);
  }

  // ------------------------------------------------------------ embeddings

  /**
   * @param string|array $input one string or a list of strings
   * @param string       $model optional model override
   *
   * Node runs a deterministic hash fallback outside production and requires a
   * real provider in strict mode. This port does the same, and labels the
   * fallback in the response so it can never be mistaken for a real embedding.
   */
  public function embed($input, $model = NULL) {
    $inputs = is_array($input) ? array_values($input) : array((string)$input);
    $inputs = array_values(array_filter($inputs, function ($s) { return is_string($s) && trim($s) !== ''; }));
    if (!$inputs) return array('ok' => FALSE, 'code' => 'VALIDATION_ERROR', 'message' => 'input must be a non-empty string or array of strings.');
    if (count($inputs) > 2048) return array('ok' => FALSE, 'code' => 'VALIDATION_ERROR', 'message' => 'input accepts at most 2048 strings.');

    $id = NULL;
    foreach ($this->real_providers() as $candidate) { if (!empty($this->definitions()[$candidate]['embed'])) { $id = $candidate; break; } }

    if ($id === NULL) {
      if (!$this->echo_allowed()) {
        return array('ok' => FALSE, 'code' => 'AI_PROVIDER_CONFIGURATION_REQUIRED', 'message' => $this->configuration_message());
      }
      return $this->echo_embed($inputs, $model);
    }

    $d       = $this->definitions()[$id];
    $model   = $model ?: ($d['embed_model'] ?? 'text-embedding-3-small');
    $started = microtime(TRUE);

    if ($id === 'ollama') {
      $vectors = array();
      $tokens  = 0;
      foreach ($inputs as $text) {
        $res = $this->http($this->base_for($id) . '/api/embeddings', array('Content-Type: application/json'), array('model' => $model, 'prompt' => $text));
        if (!$res['ok']) return $res;
        if (!isset($res['body']['embedding'])) return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'Ollama returned no embedding.');
        $vectors[] = $res['body']['embedding'];
        $tokens   += (int)($res['body']['prompt_eval_count'] ?? 0);
      }
      return array('ok' => TRUE, 'provider' => $id, 'model' => $model, 'embeddings' => $vectors,
        'tokensIn' => $tokens, 'costMicros' => 0, 'durationMs' => $this->ms($started), 'source' => 'real');
    }

    // OpenAI and OpenAI-compatible
    $res = $this->http($this->base_for($id) . '/embeddings', array(
      'Authorization: Bearer ' . $this->key_for($id),
      'Content-Type: application/json',
    ), array('model' => $model, 'input' => $inputs));
    if (!$res['ok']) return $res;
    $rows = $res['body']['data'] ?? array();
    usort($rows, function ($a, $b) { return (int)($a['index'] ?? 0) - (int)($b['index'] ?? 0); });
    $vectors = array();
    foreach ($rows as $row) { if (isset($row['embedding'])) $vectors[] = $row['embedding']; }
    if (count($vectors) !== count($inputs)) return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'Embedding provider returned ' . count($vectors) . ' of ' . count($inputs) . ' vectors.');
    $usage = $res['body']['usage'] ?? array();
    return array('ok' => TRUE, 'provider' => $id, 'model' => $model, 'embeddings' => $vectors,
      'tokensIn' => (int)($usage['prompt_tokens'] ?? 0), 'costMicros' => 0, 'durationMs' => $this->ms($started), 'source' => 'real');
  }

  // ---------------------------------------------------------------- health

  /** Probe every configured real provider with a trivial completion. */
  public function test_providers() {
    $out = array();
    foreach ($this->real_providers() as $id) {
      $started = microtime(TRUE);
      $res     = $this->call($id, array(array('role' => 'user', 'content' => 'ping')), $this->model_for($id));
      $out[] = array(
        'id'          => $id,
        'displayName' => $this->definitions()[$id]['name'],
        'healthy'     => !empty($res['ok']),
        'latencyMs'   => $this->ms($started),
        'checkedAt'   => time(),
        'error'       => empty($res['ok']) ? ($res['message'] ?? $res['code'] ?? 'unknown error') : NULL,
      );
    }
    if (!$out) {
      $out[] = array(
        'id' => 'none', 'displayName' => 'No configured provider', 'healthy' => FALSE,
        'latencyMs' => 0, 'checkedAt' => time(), 'error' => $this->configuration_message(),
      );
    }
    return $out;
  }

  public function configuration_message() {
    return 'No real AI provider is configured. Set VP_OPENAI_API_KEY (or VP_OPENAI_COMPAT_API_KEY + VP_OPENAI_COMPAT_BASE_URL, VP_OLLAMA_BASE_URL, VP_ANTHROPIC_API_KEY, VP_GEMINI_API_KEY) in .env.';
  }

  // ------------------------------------------------------------- internals

  private function definitions() {
    return array(
      'openai' => array(
        'name' => 'OpenAI', 'key' => 'VP_OPENAI_API_KEY', 'base' => 'VP_OPENAI_BASE_URL', 'default_base' => 'https://api.openai.com/v1',
        'model' => 'VP_OPENAI_MODEL', 'default_model' => 'gpt-4o-mini', 'embed' => TRUE, 'embed_model' => 'text-embedding-3-small',
      ),
      'openai-compat' => array(
        'name' => 'OpenAI-compatible', 'key' => 'VP_OPENAI_COMPAT_API_KEY', 'base' => 'VP_OPENAI_COMPAT_BASE_URL', 'default_base' => NULL,
        'model' => 'VP_OPENAI_COMPAT_MODEL', 'default_model' => 'default', 'embed' => TRUE, 'embed_model' => 'text-embedding-3-small',
      ),
      'anthropic' => array(
        'name' => 'Anthropic', 'key' => 'VP_ANTHROPIC_API_KEY', 'base' => 'VP_ANTHROPIC_BASE_URL', 'default_base' => 'https://api.anthropic.com/v1',
        'model' => 'VP_ANTHROPIC_MODEL', 'default_model' => 'claude-3-5-sonnet-latest', 'embed' => FALSE,
      ),
      'gemini' => array(
        'name' => 'Google Gemini', 'key' => 'VP_GEMINI_API_KEY', 'base' => 'VP_GEMINI_BASE_URL', 'default_base' => 'https://generativelanguage.googleapis.com/v1beta',
        'model' => 'VP_GEMINI_MODEL', 'default_model' => 'gemini-1.5-flash', 'embed' => FALSE,
      ),
      'ollama' => array(
        'name' => 'Ollama (local)', 'key' => NULL, 'base' => 'VP_OLLAMA_BASE_URL', 'default_base' => 'http://127.0.0.1:11434',
        'model' => 'VP_OLLAMA_MODEL', 'default_model' => 'llama3', 'embed' => TRUE, 'embed_model' => 'nomic-embed-text',
        // Ollama needs no API key, so the "is it configured?" question is
        // "did the operator point us at a server?" Node registers Ollama only
        // when OLLAMA_BASE_URL or OLLAMA_MODEL is set; the default localhost
        // URL is what to connect to, not evidence that it exists.
        'detect' => array('VP_OLLAMA_BASE_URL', 'VP_OLLAMA_MODEL'),
      ),
    );
  }

  private function env($name) { $v = getenv($name); return ($v === FALSE || $v === '') ? NULL : $v; }

  private function key_for($id) { $d = $this->definitions()[$id]; return $d['key'] ? (string)$this->env($d['key']) : ''; }

  private function base_for($id) {
    $d = $this->definitions()[$id];
    return rtrim((string)($this->env($d['base']) ?: $d['default_base']), '/');
  }

  private function model_for($id) {
    if ($id === 'echo') return 'windels-echo-demo';
    $d = $this->definitions()[$id];
    return (string)($this->env($d['model']) ?: $d['default_model']);
  }

  private function is_configured($id) {
    $d = $this->definitions()[$id];
    if ($d['key']) {
      if (!$this->env($d['key'])) return FALSE;
      $base = $this->env($d['base']) ?: $d['default_base'];
      return (bool)$base;
    }
    // Keyless provider (Ollama): configured only when the operator named it.
    if (!empty($d['detect'])) {
      foreach ($d['detect'] as $name) { if ($this->env($name)) return TRUE; }
      return FALSE;
    }
    return FALSE;
  }

  /** Prefer OpenAI, then compat, Anthropic, Gemini, Ollama; else echo/strict. */
  private function resolve_provider($requestedModel = NULL) {
    $real = $this->real_providers();
    foreach (array('openai', 'openai-compat', 'anthropic', 'gemini', 'ollama') as $id) {
      if (in_array($id, $real, TRUE)) return $id;
    }
    return $real ? $real[0] : 'echo';
  }

  private function normalize_messages($messages) {
    if (!is_array($messages)) return array();
    $allowed = array('system', 'user', 'assistant', 'tool');
    $out = array();
    foreach ($messages as $m) {
      if (!is_array($m)) continue;
      $role    = isset($m['role']) ? (string)$m['role'] : 'user';
      $content = isset($m['content']) ? (string)$m['content'] : '';
      if (!in_array($role, $allowed, TRUE) || trim($content) === '') continue;
      $out[] = array('role' => $role, 'content' => $content);
    }
    return $out;
  }

  private function echo_complete($messages, $model = NULL) {
    $last = '...';
    foreach ($messages as $m) { if (($m['role'] ?? '') === 'user') $last = $m['content']; }
    return array(
      'ok' => TRUE, 'provider' => 'echo', 'source' => 'echo-demo',
      'content' => self::ECHO_BANNER . 'Echoing: ' . $last,
      'model' => 'windels-echo-demo', 'durationMs' => 0, 'tokensIn' => 0, 'tokensOut' => 0,
    );
  }

  /**
   * Deterministic bag-of-words hash embedding. Clearly labelled and only ever
   * reachable outside the production environment — it is a placeholder for
   * wiring, not a semantic embedding, and nothing should train or retrieve on
   * it as if it were one.
   */
  private function echo_embed($inputs, $model = NULL) {
    $vectors = array();
    $tokens  = 0;
    foreach ($inputs as $text) {
      $vec = array_fill(0, 64, 0.0);
      foreach (preg_split('/\s+/', strtolower($text)) as $word) {
        if ($word === '') continue;
        $vec[crc32($word) % 64] += 1.0;
        $tokens++;
      }
      $norm = sqrt(array_reduce($vec, function ($c, $v) { return $c + $v * $v; }, 0.0));
      if ($norm > 0) foreach ($vec as $i => $v) $vec[$i] = $v / $norm;
      $vectors[] = $vec;
    }
    return array(
      'ok' => TRUE, 'provider' => 'echo', 'model' => $model ?: 'windels-echo-hash-64',
      'embeddings' => $vectors, 'tokensIn' => $tokens, 'costMicros' => 0, 'durationMs' => 0,
      'source' => 'echo-demo',
      'warning' => 'Deterministic hash placeholder, not a semantic embedding. Configure a real provider for production retrieval.',
    );
  }

  /**
   * One JSON round trip. cURL when available, otherwise PHP streams, so hosts
   * without the curl extension still work.
   * @return array ok/body|code/message
   */
  private function http($url, $headers, $payload, $timeout = NULL) {
    $timeout = $timeout ?: self::TIMEOUT;
    $body    = json_encode($payload, JSON_UNESCAPED_SLASHES);

    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt_array($ch, array(
        CURLOPT_POST           => TRUE,
        CURLOPT_RETURNTRANSFER => TRUE,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_POSTFIELDS     => $body,
      ));
      $raw    = curl_exec($ch);
      $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      $error  = curl_error($ch);
      curl_close($ch);
    } else {
      $headerLines = array();
      foreach ($headers as $h) $headerLines[] = $h;
      $ctx  = stream_context_create(array('http' => array(
        'method' => 'POST', 'timeout' => $timeout, 'ignore_errors' => TRUE,
        'header' => implode("\r\n", $headerLines), 'content' => $body,
      )));
      $raw = @file_get_contents($url, FALSE, $ctx);
      $status = 0;
      if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $status = (int)$m[1];
      $error = ($raw === FALSE) ? 'HTTP transport failed' : '';
    }

    if ($raw === FALSE || $raw === NULL) {
      return array('ok' => FALSE, 'code' => 'AI_PROVIDER_NETWORK_ERROR', 'message' => $error ?: 'AI provider did not respond.');
    }
    $decoded = json_decode($raw, TRUE);
    if ($status < 200 || $status >= 300) {
      $message = is_array($decoded) ? ($decoded['error']['message'] ?? json_encode($decoded)) : $raw;
      return array('ok' => FALSE, 'code' => 'AI_PROVIDER_ERROR', 'message' => 'AI provider returned HTTP ' . $status . ': ' . substr((string)$message, 0, 500));
    }
    if (!is_array($decoded)) {
      return array('ok' => FALSE, 'code' => 'AI_PROVIDER_INVALID_RESPONSE', 'message' => 'AI provider returned a non-JSON response.');
    }
    return array('ok' => TRUE, 'body' => $decoded, 'status' => $status);
  }

  private function ms($started) { return (int)round((microtime(TRUE) - $started) * 1000); }
}
