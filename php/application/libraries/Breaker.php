<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Circuit breaker — PHP port of apps/api/src/security/reliability.ts (slice 118).
 *
 * Node keeps breaker state in a process-lifetime `Map`. Under PHP every request
 * starts with an empty map, so a faithful port would report "closed" forever and
 * `POST /breakers/:name/reset` would reset nothing. State therefore lives in
 * `security_breakers`, which also makes it shared across workers — closer to the
 * intent of a breaker than per-process memory was.
 *
 * One behaviour is NOT ported: Node aborts a slow call after `timeoutMs` using
 * an AbortSignal. PHP cannot interrupt an arbitrary callable, so `timeoutMs` is
 * not offered rather than being accepted and ignored. Enforce timeouts on the
 * HTTP client itself (CURLOPT_TIMEOUT / stream timeout) where they apply.
 */
class Breaker {

  private $db;
  private $defaults = array('threshold' => 5, 'cooldownMs' => 30000, 'probeSuccess' => 2);

  public function __construct() {
    $ci =& get_instance();
    $this->db = $ci->db;
  }

  /**
   * Run $fn behind the breaker named $name.
   *
   * @return mixed whatever $fn returned
   * @throws Breaker_open when the circuit is open and still cooling down
   */
  public function wrap($name, $fn, $opts = array()) {
    $opt  = array_merge($this->defaults, $opts);
    $name = substr((string)$name, 0, 80);
    $b    = $this->row($name);
    $now  = time();

    if ($b['state'] === 'open') {
      if ($b['next_probe'] !== NULL && strtotime($b['next_probe']) > $now) {
        $this->save($name, $b);
        throw new Breaker_open('Circuit breaker OPEN for ' . $name);
      }
      $b['state']     = 'half-open';
      $b['successes'] = 0;
    }

    try {
      $value = call_user_func($fn);
    } catch (Throwable $e) {
      $b['failures'] = (int)$b['failures'] + 1;
      // A single failure while probing re-opens the circuit immediately;
      // otherwise it takes `threshold` consecutive failures.
      if ($b['state'] === 'half-open' || $b['failures'] >= $opt['threshold']) {
        $b['state']      = 'open';
        $b['opened_at']  = date('Y-m-d H:i:s', $now);
        $b['next_probe'] = date('Y-m-d H:i:s', $now + (int)round($opt['cooldownMs'] / 1000));
      }
      $this->save($name, $b);
      throw $e;
    }

    $b['failures'] = 0;
    if ($b['state'] === 'half-open') {
      $b['successes'] = (int)$b['successes'] + 1;
      if ($b['successes'] >= $opt['probeSuccess']) {
        $b['state']      = 'closed';
        $b['successes']  = 0;
        $b['opened_at']  = NULL;
        $b['next_probe'] = NULL;
      }
    }
    $this->save($name, $b);
    return $value;
  }

  /** @return array[] every known breaker, newest first */
  public function status() {
    $rows = $this->db->order_by('updated_at', 'DESC')->get('security_breakers')->result_array();
    $out  = array();
    foreach ($rows as $r) {
      $out[] = array(
        'name'      => $r['name'],
        'state'     => $r['state'],
        'failures'  => (int)$r['failures'],
        'successes' => (int)$r['successes'],
        // Trailing "Z", matching Date.toISOString() on the Node side.
        'openedAt'  => $r['opened_at'] ? gmdate('Y-m-d\TH:i:s\Z', strtotime($r['opened_at'])) : NULL,
        'nextProbe' => $r['next_probe'] ? gmdate('Y-m-d\TH:i:s\Z', strtotime($r['next_probe'])) : NULL,
      );
    }
    return $out;
  }

  /** Reset one breaker to its closed state. Returns TRUE when it existed. */
  public function reset($name) {
    $name = substr((string)$name, 0, 80);
    if (!$this->db->where('name', $name)->count_all_results('security_breakers')) return FALSE;
    $this->db->where('name', $name)->update('security_breakers', array(
      'state'      => 'closed',
      'failures'   => 0,
      'successes'  => 0,
      'opened_at'  => NULL,
      'next_probe' => NULL,
      'updated_at' => date('Y-m-d H:i:s'),
    ));
    return TRUE;
  }

  private function row($name) {
    $r = $this->db->where('name', $name)->get('security_breakers')->row_array();
    if ($r) return $r;
    return array(
      'name' => $name, 'state' => 'closed', 'failures' => 0, 'successes' => 0,
      'opened_at' => NULL, 'next_probe' => NULL,
    );
  }

  private function save($name, $b) {
    $set = array(
      'name'       => $name,
      'state'      => $b['state'],
      'failures'   => (int)$b['failures'],
      'successes'  => (int)$b['successes'],
      'opened_at'  => $b['opened_at'],
      'next_probe' => $b['next_probe'],
      'updated_at' => date('Y-m-d H:i:s'),
    );
    $this->db->replace('security_breakers', $set);
  }
}

class Breaker_open extends RuntimeException {}
