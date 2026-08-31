<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Tracing and metrics — PHP port of apps/api/src/observability/{tracer,metrics}.ts
 * (slices 104 and 106), made durable.
 *
 * Node keeps spans in a 500-entry ring and metrics in Maps, both of which die
 * with the process. Under PHP every request is a fresh process, so a faithful
 * port would report zero spans and zero metrics forever. Here:
 *
 *   * spans are written to `platform_spans` when they end, so a trace survives
 *     the request that produced it and can be retrieved by trace id afterwards —
 *     which is the entire point of `GET /platform/traces/:traceId`;
 *   * counters and histograms are aggregated into one-minute buckets
 *     (`platform_metric_counters` / `platform_metric_histograms`) with an
 *     upsert, so a busy route costs one row per minute, not one per request.
 *
 * W3C `traceparent` is honoured on the way in and echoed on the way out, same
 * format Node's tracer parses (`00-<32 hex>-<16 hex>-01`).
 */
class Telemetry {

  /** @var array|null current trace context */
  private static $ctx = NULL;
  /** @var array spanId => array{started:float, trace:string, parent:string|null, name:string, kind:string, attrs:array} */
  private static $open = array();
  /** @var string|null the root span of this request */
  private static $root = NULL;

  private function db() {
    $ci =& get_instance();
    return isset($ci->db) ? $ci->db : NULL;
  }

  // ------------------------------------------------------------------ request

  /**
   * Open the root span for this request. Reads an inbound `traceparent` header
   * so a client-supplied trace continues here instead of being replaced.
   */
  public function begin_request($name, $attrs = array()) {
    $parent = $this->traceparent();
    $spanId = $this->start_span($name, array(
      'kind'  => 'server',
      'parent'=> $parent,
      'attrs' => $attrs,
    ));
    self::$root = $spanId;
    self::$ctx  = array(
      'traceId'   => self::$open[$spanId]['trace'],
      'spanId'    => $spanId,
      'userId'    => NULL,
      'orgId'     => NULL,
    );
    if (!headers_sent()) {
      header('traceparent: 00-' . self::$open[$spanId]['trace'] . '-' . $spanId . '-01');
    }
    return $spanId;
  }

  public function end_request($statusCode = 200, $attrs = array(), $errorMessage = NULL) {
    if (self::$root === NULL) return;
    // Node records these two names in http/middleware/observability.ts, and the
    // admin dashboard keys its panels off them, so the PHP build records the
    // same names rather than inventing new ones.
    $tags = array(
      'method' => strtolower((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')),
      'route'  => substr(trim((string)($attrs['route'] ?? ''), '/'), 0, 80),
    );
    $this->counter('http.request.count', 1, $tags);
    $spanId = self::$root;
    self::$root = NULL;
    $record = $this->end_span($spanId, (int)$statusCode >= 500 ? 'error' : 'ok', $errorMessage, $attrs);
    // Node records the timing under this name too; its `_ms` series is what the
    // latency panel charts.
    if ($record) $this->histogram('http.request.duration_ms', $record['durationMs'], $tags);
    self::$ctx = NULL;
  }

  /** Current trace id, for stamping onto log rows. */
  public function trace_id() { return self::$ctx['traceId'] ?? NULL; }
  public function span_id()  { return self::$ctx['spanId'] ?? NULL; }

  // -------------------------------------------------------------------- spans

  /**
   * @param array{parent?:?array,kind?:string,attrs?:array} $opts
   * @return string span id
   */
  public function start_span($name, $opts = array()) {
    $parent  = array_key_exists('parent', $opts) ? $opts['parent'] : self::$ctx;
    $traceId = ($parent['traceId'] ?? NULL) ?: bin2hex(random_bytes(16));
    $spanId  = bin2hex(random_bytes(8));
    self::$open[$spanId] = array(
      'started' => microtime(TRUE),
      'trace'   => $traceId,
      'parent'  => $parent['spanId'] ?? NULL,
      'name'    => substr((string)$name, 0, 120),
      'kind'    => in_array(($opts['kind'] ?? 'internal'), array('server', 'client', 'internal', 'producer', 'consumer'), TRUE)
                     ? $opts['kind'] : 'internal',
      'attrs'   => $opts['attrs'] ?? array(),
    );
    return $spanId;
  }

  public function end_span($spanId, $status = 'ok', $errorMessage = NULL, $extraAttrs = array()) {
    if (!isset(self::$open[$spanId])) return NULL;
    $o     = self::$open[$spanId];
    $ended = microtime(TRUE);
    $ms    = (int)round(($ended - $o['started']) * 1000);
    unset(self::$open[$spanId]);

    $attrs  = array_merge((array)$o['attrs'], (array)$extraAttrs);
    $db     = $this->db();
    $record = array(
      'spanId'        => $spanId,
      'traceId'       => $o['trace'],
      'parentSpanId'  => $o['parent'],
      'name'          => $o['name'],
      'kind'          => $o['kind'],
      'startedAt'     => $this->iso($o['started']),
      'endedAt'       => $this->iso($ended),
      'durationMs'    => $ms,
      'status'        => $status === 'error' ? 'error' : 'ok',
      'errorMessage'  => $errorMessage,
      'attrs'         => $attrs,
    );
    if ($db) {
      try {
        $db->replace('platform_spans', array(
          'span_id'        => $spanId,
          'trace_id'       => $o['trace'],
          'parent_span_id' => $o['parent'],
          'name'           => $o['name'],
          'kind'           => $o['kind'],
          'organization_id'=> $attrs['organizationId'] ?? NULL,
          'user_id'        => $attrs['userId'] ?? NULL,
          'status'         => $record['status'],
          'started_at'     => date('Y-m-d H:i:s', (int)floor($o['started'])),
          'ended_at'       => date('Y-m-d H:i:s', (int)floor($ended)),
          'duration_ms'    => $ms,
          'error_message'  => $errorMessage !== NULL ? substr((string)$errorMessage, 0, 500) : NULL,
          'attributes'     => json_encode($attrs),
          'created_at'     => date('Y-m-d H:i:s'),
        ));
      } catch (Throwable $e) { /* telemetry must never break a request */ }
    }
    return $record;
  }

  // ------------------------------------------------------------------ metrics

  /** Increment a counter into the current minute bucket. */
  public function counter($name, $n = 1, $tags = array()) {
    $db = $this->db();
    if (!$db) return;
    $bucket = date('Y-m-d H:i:00');
    $sql = "INSERT INTO platform_metric_counters (name, tag_key, bucket_at, value, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE value = value + VALUES(value), updated_at = VALUES(updated_at)";
    try {
      $db->query($sql, array(substr((string)$name, 0, 80), $this->tag_key($tags), $bucket, (int)$n, date('Y-m-d H:i:s')));
    } catch (Throwable $e) { /* ignore */ }
  }

  /** Record one observation (milliseconds) into a histogram bucket. */
  public function histogram($name, $ms, $tags = array()) {
    $db = $this->db();
    if (!$db) return;
    $bucket = date('Y-m-d H:i:00');
    $sql = "INSERT INTO platform_metric_histograms (name, tag_key, bucket_at, count, `sum`, `min`, `max`, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE count = count + 1,
              `sum` = `sum` + VALUES(`sum`),
              `min` = LEAST(`min`, VALUES(`min`)),
              `max` = GREATEST(`max`, VALUES(`max`)),
              updated_at = VALUES(updated_at)";
    try {
      $db->query($sql, array(substr((string)$name, 0, 80), $this->tag_key($tags), $bucket, (float)$ms, (float)$ms, (float)$ms, date('Y-m-d H:i:s')));
    } catch (Throwable $e) { /* ignore */ }
  }

  /** Node's tagKey(): sorted `k=v` pairs joined with commas. */
  private function tag_key($tags) {
    if (!is_array($tags) || !$tags) return '';
    $parts = array();
    foreach ($tags as $k => $v) {
      if ($v === NULL || $v === '') continue;
      $parts[] = $k . '=' . (is_bool($v) ? ($v ? 'true' : 'false') : $v);
    }
    sort($parts);
    return implode(',', $parts);
  }

  private function traceparent() {
    $h = NULL;
    foreach (array('HTTP_TRACEPARENT', 'traceparent') as $key) {
      if (!empty($_SERVER[$key])) { $h = $_SERVER[$key]; break; }
    }
    if (!$h) return NULL;
    if (preg_match('/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i', $h, $m)) {
      return array('traceId' => strtolower($m[2]), 'spanId' => strtolower($m[3]));
    }
    return NULL;
  }

  private function iso($microtime) {
    $t = (int)floor($microtime);
    $ms = (int)round(($microtime - $t) * 1000);
    return gmdate('Y-m-d\TH:i:s', $t) . '.' . str_pad((string)$ms, 3, '0', STR_PAD_LEFT) . 'Z';
  }
}
