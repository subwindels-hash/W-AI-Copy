<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Response security headers — emitted once per request and RECORDED so the
 * scorecard can report what actually went out on the wire.
 *
 * Node's /scorecard hardcodes `{ hsts: true, csp: true, noSniff: true,
 * xFrame: "DENY", referrerPolicy: "strict-origin-when-cross-origin" }` — those
 * are literals about server.ts, not measurements of the running app. Copying
 * them into the PHP port would be the same lie: the PHP build emitted none of
 * these headers before this file existed. Here the scorecard reads back what
 * was really sent, so the numbers can move.
 *
 * Defaults are deliberately conservative:
 *   - nosniff and Referrer-Policy are always on (nothing depends on sniffing).
 *   - HSTS is only sent on HTTPS requests and never with includeSubDomains,
 *     because a too-broad HSTS on a shared host is unrecoverable for max-age.
 *   - CSP is opt-in (VP_SECURITY_CSP). The built SPA ships an inline boot
 *     script and inline styles in index.html, so a default `script-src 'self'`
 *     would silently break the splash screen. Set it once you know which
 *     directives the bundle needs.
 *   - Framing headers are opt-in (VP_SECURITY_FRAME_ANCESTORS). This app is
 *     routinely embedded in dashboard/preview iframes; emitting `DENY` by
 *     default would break every embedding host.
 *
 * Static assets (the SPA in /assets) are served by Apache, not PHP, so they
 * need the same headers from .htaccess — see php/CPANEL_DEPLOYMENT.md.
 */
class Security_headers {

  /** @var array<string,string> lowercase header name => value, sent this request */
  private static $sent = array();

  /**
   * Emit the configured headers. Idempotent within a request.
   * @return array<string,string> what was sent
   */
  public function apply() {
    if (self::$sent) return self::$sent;

    $this->emit('X-Content-Type-Options', 'nosniff');

    $referrer = trim((string)getenv('VP_SECURITY_REFERRER_POLICY'));
    $this->emit('Referrer-Policy', $referrer !== '' ? $referrer : 'strict-origin-when-cross-origin');

    if ($this->is_https()) {
      $maxAge = (int)(getenv('VP_SECURITY_HSTS_MAX_AGE') ?: 15552000); // 180 days
      if ($maxAge > 0) $this->emit('Strict-Transport-Security', 'max-age=' . $maxAge);
    }

    $csp = trim((string)getenv('VP_SECURITY_CSP'));
    if ($csp !== '') $this->emit('Content-Security-Policy', $csp);

    $frames = strtolower(trim((string)getenv('VP_SECURITY_FRAME_ANCESTORS')));
    if ($frames !== '') {
      if ($frames === 'none' || $frames === 'deny') {
        $this->emit('X-Frame-Options', 'DENY');
        $this->emit('Content-Security-Policy', "frame-ancestors 'none'");
      } elseif ($frames === 'self') {
        $this->emit('X-Frame-Options', 'SAMEORIGIN');
        $this->emit('Content-Security-Policy', "frame-ancestors 'self'");
      } else {
        $this->emit('Content-Security-Policy', 'frame-ancestors ' . $frames);
      }
    }

    return self::$sent;
  }

  /** @return array<string,string> */
  public function sent() { return self::$sent; }

  /** @return string|null */
  public function value($name) {
    $k = strtolower($name);
    return isset(self::$sent[$k]) ? self::$sent[$k] : NULL;
  }

  public function has($name) { return array_key_exists(strtolower($name), self::$sent); }

  private function emit($name, $value) {
    if (!headers_sent()) header($name . ': ' . $value);
    $k = strtolower($name);
    // A CSP set from VP_SECURITY_CSP is a full policy; frame-ancestors is
    // appended rather than overwriting it.
    if ($k === 'content-security-policy' && isset(self::$sent[$k])) {
      self::$sent[$k] = self::$sent[$k] . '; ' . $value;
      return;
    }
    self::$sent[$k] = $value;
  }

  private function is_https() {
    $https = isset($_SERVER['HTTPS']) ? strtolower((string)$_SERVER['HTTPS']) : '';
    if ($https !== '' && $https !== 'off') return TRUE;
    $proto = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) : '';
    return strpos($proto, 'https') !== FALSE;
  }
}
