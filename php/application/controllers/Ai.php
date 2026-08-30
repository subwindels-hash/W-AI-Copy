<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * AI provider routes — PHP port of apps/api/src/http/routes/ai.ts.
 *
 *   GET  /api/v1/ai/models           — routable models (registry + .env)
 *   GET  /api/v1/ai/providers        — providers with configuration state
 *   GET  /api/v1/ai/health           — is at least one real provider configured?
 *   GET  /api/v1/ai/usage            — telemetry for the caller's organisation
 *   POST /api/v1/ai/complete         — non-streaming chat completion
 *   POST /api/v1/ai/embed            — embeddings
 *   POST /api/v1/ai/test-providers   — admin: live-probe every real provider
 *
 * Responses use the Node envelopes: CompletionResult
 * {content, usage:{tokensIn,tokensOut,costMicros,model}, model, provider,
 * durationMs, modelSource} and EmbeddingResult
 * {embeddings, model, tokensIn, costMicros, durationMs}.
 */
class Ai extends MY_Controller {

  private $c;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->load->library('Ai_provider');
    $this->load->model('Ai_model', 'registry');
  }

  private function org() { return $this->c['organizationId'] ?? NULL; }

  // ------------------------------------------------------------------- reads

  public function models() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->registry->list_models($this->org(), $this->ai_provider->providers()));
  }

  public function providers() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $out = array();
    foreach ($this->ai_provider->providers() as $p) {
      $out[] = array(
        'id'          => $p['id'],
        'displayName' => $p['displayName'],
        'healthy'     => $p['configured'] ? NULL : FALSE,
        'latencyMs'   => 0,
        'checkedAt'   => time(),
        'error'       => $p['configured'] ? NULL : 'Provider is not configured in .env',
        'isReal'      => $p['isReal'],
        'configured'  => $p['configured'],
      );
    }
    return $this->respond($out);
  }

  public function health() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $hasReal = $this->ai_provider->has_real_provider();
    return $this->respond(array(
      'hasRealProvider' => $hasReal,
      'providers'       => $this->ai_provider->providers(),
      'configMessage'   => $hasReal ? NULL : $this->ai_provider->configuration_message(),
    ));
  }

  public function usage() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $periodDays = (int)($this->input->get('periodDays') ?: 30);
    return $this->respond($this->registry->usage($this->org(), $periodDays));
  }

  // ----------------------------------------------------------------- writes

  public function complete() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d = is_array($this->body()) ? $this->body() : array();

    if (!isset($d['messages']) || !is_array($d['messages']) || !$d['messages']) {
      return $this->fail('VALIDATION_ERROR', 'messages is required and must contain at least one message', 422);
    }
    $allowed = array('system', 'user', 'assistant', 'tool');
    $messages = array();
    foreach ($d['messages'] as $m) {
      if (!is_array($m) || !isset($m['role'], $m['content'])) return $this->fail('VALIDATION_ERROR', 'each message requires role and content', 422);
      if (!in_array((string)$m['role'], $allowed, TRUE))     return $this->fail('VALIDATION_ERROR', 'invalid message role', 422);
      $content = (string)$m['content'];
      if (trim($content) === '')                              return $this->fail('VALIDATION_ERROR', 'message content must not be empty', 422);
      if (strlen($content) > 100000)                          return $this->fail('VALIDATION_ERROR', 'message content exceeds 100000 characters', 422);
      $messages[] = array('role' => (string)$m['role'], 'content' => $content);
    }
    if (count($messages) > 200) return $this->fail('VALIDATION_ERROR', 'at most 200 messages per request', 422);

    $model   = isset($d['model']) ? trim((string)$d['model']) : NULL;
    $system  = isset($d['system']) ? trim((string)$d['system']) : NULL;
    if ($system !== NULL && $system !== '') $messages[] = array('role' => 'system', 'content' => $system);

    if (isset($d['temperature']) && (!is_numeric($d['temperature']) || (float)$d['temperature'] < 0 || (float)$d['temperature'] > 2)) {
      return $this->fail('VALIDATION_ERROR', 'temperature must be between 0 and 2', 422);
    }
    if (isset($d['maxTokens']) && (!is_numeric($d['maxTokens']) || (int)$d['maxTokens'] < 1 || (int)$d['maxTokens'] > 128000)) {
      return $this->fail('VALIDATION_ERROR', 'maxTokens must be between 1 and 128000', 422);
    }
    if (isset($d['responseFormat'])) {
      $rf = $d['responseFormat'];
      if (!is_array($rf) || !isset($rf['type']) || !in_array($rf['type'], array('text', 'json_object'), TRUE)) {
        return $this->fail('VALIDATION_ERROR', 'responseFormat.type must be text or json_object', 422);
      }
      // JSON mode is only available on providers that support it; the request is
      // still honoured by appending an instruction rather than silently ignored.
      if ($rf['type'] === 'json_object') $messages[] = array('role' => 'system', 'content' => 'Respond with valid JSON only.');
    }
    if (isset($d['requiredCapabilities']) && !is_array($d['requiredCapabilities'])) {
      return $this->fail('VALIDATION_ERROR', 'requiredCapabilities must be an array of strings', 422);
    }

    $result = $this->ai_provider->complete($messages, $model);
    $this->telemetry('complete', $result, $model);

    if (!$result['ok']) {
      $status = ($result['code'] === 'AI_PROVIDER_CONFIGURATION_REQUIRED') ? 503 : 502;
      return $this->fail($result['code'], $result['message'], $status);
    }

    $modelId = $result['model'] ?? ($model ?: 'unknown');
    return $this->respond(array(
      'content'     => $result['content'],
      'usage'       => array(
        'tokensIn'   => (int)($result['tokensIn'] ?? 0),
        'tokensOut'  => (int)($result['tokensOut'] ?? 0),
        'costMicros' => 0,
        'model'      => $modelId,
      ),
      'model'       => $modelId,
      'provider'    => $result['provider'] ?? 'unknown',
      'durationMs'  => (int)($result['durationMs'] ?? 0),
      'modelSource' => ($result['source'] ?? 'real') === 'echo-demo' ? 'echo-demo' : 'real',
    ));
  }

  public function embed() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $d    = is_array($this->body()) ? $this->body() : array();
    $in   = $d['input'] ?? NULL;
    $ok   = is_string($in) ? (trim($in) !== '')
          : (is_array($in) && count($in) > 0 && count($in) <= 2048 && count(array_filter($in, 'is_string')) === count($in));
    if (!$ok) return $this->fail('VALIDATION_ERROR', 'input must be a non-empty string or an array of 1-2048 strings', 422);

    $model  = isset($d['model']) ? trim((string)$d['model']) : NULL;
    $result = $this->ai_provider->embed($in, $model);
    $this->telemetry('embed', $result, $model, TRUE);

    if (!$result['ok']) {
      $status = ($result['code'] === 'AI_PROVIDER_CONFIGURATION_REQUIRED') ? 503 : 502;
      return $this->fail($result['code'], $result['message'], $status);
    }
    return $this->respond(array(
      'embeddings' => $result['embeddings'],
      'model'      => $result['model'],
      'tokensIn'   => (int)($result['tokensIn'] ?? 0),
      'costMicros' => (int)($result['costMicros'] ?? 0),
      'durationMs' => (int)($result['durationMs'] ?? 0),
      'source'     => $result['source'] ?? 'real',
      'warning'    => $result['warning'] ?? NULL,
    ));
  }

  public function test_providers() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $role = strtolower((string)($this->c['role'] ?? ''));
    if (!in_array($role, array('super_admin', 'admin', 'owner'), TRUE)) {
      return $this->fail('FORBIDDEN', 'Only admins can run provider tests', 403);
    }
    return $this->respond($this->ai_provider->test_providers());
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Record telemetry for one AI call. Mirrors recordAiRequest(): always
   * recorded, including failures, and never allowed to break the response.
   */
  private function telemetry($feature, $result, $requestedModel = NULL, $isEmbed = FALSE) {
    $ok       = !empty($result['ok']);
    $provider = $result['provider'] ?? ($ok ? NULL : 'none');
    $modelId  = $result['model'] ?? $requestedModel ?? 'unknown';
    $row      = $this->registry->registry_row($this->org(), (string)$provider, (string)$modelId);
    $this->registry->record(array(
      'organizationId'   => $this->org(),
      'userId'           => $this->c['sub'] ?? NULL,
      'channel'          => 'api',
      'provider'         => (string)($provider ?: 'none'),
      'modelId'          => (string)$modelId,
      'modelRegistryId'  => $row['id'] ?? NULL,
      'feature'          => $feature,
      'durationMs'       => (int)($result['durationMs'] ?? 0),
      'promptTokens'     => $isEmbed ? (int)($result['tokensIn'] ?? 0) : (int)($result['tokensIn'] ?? 0),
      'completionTokens' => $isEmbed ? 0 : (int)($result['tokensOut'] ?? 0),
      'status'           => $ok ? 'succeeded' : 'failed',
      'error'            => $ok ? NULL : ($result['message'] ?? $result['code'] ?? 'unknown error'),
    ));
  }
}
