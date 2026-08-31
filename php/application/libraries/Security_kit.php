<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pure security primitives — PHP ports of apps/api/src/security/promptGuard.ts
 * (slice 114) and passwords.ts (slice 110), plus the AES-256-GCM envelope the
 * rest of the PHP build already uses.
 *
 * Kept as a library rather than a model because every function here is pure:
 * no database, no request state. That is what makes the self-tests meaningful.
 *
 * ENVELOPE NOTE — seal()/open() reproduce the `enc.v1|<base64>` format already
 * used privately by Mfa_model, Account, Integration_model and
 * Email_mailbox_model. This library duplicates those three lines rather than
 * refactoring five call sites mid-port; consolidating them onto one shared
 * library is follow-up work, and the format is identical either way.
 */
class Security_kit {

  // ------------------------------------------------------------ prompt guard

  /**
   * Heuristic prompt-injection rules: [PCRE pattern, weight, reason].
   * Weights and reasons are Node's, so a score means the same thing on both
   * runtimes. Consumers block at >= 80 and warn at >= 40.
   */
  private static $rules = array(
    array('~\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?|context|system\s+message|system\s+prompt)\b~i', 95, 'role-confusion / jailbreak phrase'),
    array('~\byou\s+are\s+now\s+(dan|a|an|developer\s+mode|jailbroken|unrestricted|free\s+from\s+restrictions)~i', 90, 'identity override (DAN-style)'),
    array('~\b(system\s*:?\s*prompt|system\s*message|developer\s*:|assistant\s*prefill|prefix\s+before)\b~i', 60, 'attempt to read/modify system prompt'),
    array('~\b(show|reveal|output|print|echo|leak|repeat)\b.{0,40}\b(system\s*prompt|api[_\s-]?key|secret|password|credentials?|your\s+initial\s+instructions?|hidden\s+instructions?)\b~i', 90, 'secret exfiltration request'),
    array('~<\|\s*(im_start|im_end|begin_of_text|end_of_text|start_of_turn|end_of_turn|system|assistant|user)\s*\|>~i', 70, 'chat-template delimiter injection'),
    array('~```\s*(system|developer)\b~i', 50, 'markdown system/developer fence'),
    array('~\b(send|post|upload|transmit|forward|exfiltrate|paste)\b.{0,40}\b(https?://[^\s)]+|www\.[^\s)]+)~i', 80, 'data-exfil URL'),
    array('~\beval\s*\(|function\s*\(\s*\)\s*\{\s*return\b|atob\(|btoa\(|string\.fromCharCode~i', 50, 'code execution / obfuscation'),
    array('~(?:[a-z0-9+/]{40,}={0,2})~', 15, 'long base64-looking blob (possible obfuscation)'),
    array('~\b(disable\s+(content\s+)?safety|remove\s+(all\s+)?(content\s+filters?|safety\s+guidelines?|guardrails?|restrictions?|ethics))\b~i', 90, 'safety-bypass attempt'),
    array('~\b(act\s+as\s+(a|an)\s+(unrestricted|uncensored|nsfw|hacker|malicious|illegal|unfiltered))~i', 80, 'unrestricted role request'),
  );

  /** Phrases that match a rule but are benign in normal support traffic. */
  private static $allowlist = array('i forgot my password', 'forgot my password', 'reset my password');

  /** @return array{safe:bool,score:int,reasons:string[]} */
  public function scan_prompt($input) {
    $text = trim((string)$input);
    if ($text === '') return array('safe' => TRUE, 'score' => 0, 'reasons' => array());
    $lower = strtolower($text);
    foreach (self::$allowlist as $phrase) {
      if (strpos($lower, $phrase) !== FALSE) return array('safe' => TRUE, 'score' => 0, 'reasons' => array());
    }
    $reasons = array();
    $score   = 0;
    foreach (self::$rules as $rule) {
      if (preg_match($rule[0], $text)) { $score = min(100, $score + $rule[1]); $reasons[] = $rule[2]; }
    }
    if (strlen($text) > 8000) { $score = min(100, $score + 20); $reasons[] = 'excessive prompt length'; }
    return array('safe' => $score < 50, 'score' => $score, 'reasons' => array_values(array_unique($reasons)));
  }

  // -------------------------------------------------------- password policy

  private static $common = array(
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
    'qwerty', 'qwerty123', 'letmein', 'admin', 'welcome', 'monkey', 'dragon',
    'windels', 'windelsai', 'changeme', 'changeme!', 'changeme!234',
  );

  private static $labels = array('very weak', 'weak', 'fair', 'strong', 'very strong');

  /** @return array{score:int,label:string,issues:string[],meetsPolicy:bool} */
  public function assess_password($pw) {
    $pw     = (string)$pw;
    $issues = array();
    if (strlen($pw) < 10)                       $issues[] = 'at least 10 characters';
    if (!preg_match('/[A-Z]/', $pw))            $issues[] = 'an uppercase letter';
    if (!preg_match('/[a-z]/', $pw))            $issues[] = 'a lowercase letter';
    if (!preg_match('/\d/', $pw))               $issues[] = 'a digit';
    if (!preg_match('/[^A-Za-z0-9]/', $pw))     $issues[] = 'a symbol (e.g. !@#$%)';
    $isCommon = in_array(strtolower($pw), self::$common, TRUE);
    if ($isCommon)                              $issues[] = 'not be a common password';

    $score = 0;
    if (strlen($pw) >= 10) $score++;
    if (preg_match('/[A-Z]/', $pw) && preg_match('/[a-z]/', $pw)) $score++;
    if (preg_match('/\d/', $pw) && preg_match('/[^A-Za-z0-9]/', $pw)) $score++;
    if (strlen($pw) >= 14 && !$isCommon) $score = min(4, $score + 1);
    if (!$issues) $score = 4;
    if ($isCommon) $score = 0;
    $score = max(0, min(4, $score));

    return array(
      'score'       => $score,
      'label'       => self::$labels[$score],
      'issues'      => $issues,
      'meetsPolicy' => count($issues) === 0,
    );
  }

  // -------------------------------------------------------------- encryption

  /** AES-256-GCM seal into the `enc.v1` envelope used across the PHP build. */
  public function seal($value) {
    $iv  = random_bytes(12);
    $tag = '';
    $c   = openssl_encrypt((string)$value, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($c === FALSE) throw new RuntimeException('encryption failed');
    return 'enc.v1|' . base64_encode($iv . $tag . $c);
  }

  /** Returns NULL when the envelope cannot be authenticated or decoded. */
  public function open($envelope) {
    if (!is_string($envelope) || strpos($envelope, 'enc.v1|') !== 0) return NULL;
    $raw = base64_decode(substr($envelope, 7), TRUE);
    if ($raw === FALSE || strlen($raw) < 29) return NULL;
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === FALSE ? NULL : $plain;
  }

  /**
   * Node's listKeyInfo() reports {id, createdAt, primary} from a key file. This
   * build derives one key from VP_ENCRYPTION_KEY and keeps no key metadata, so:
   *
   *   - `id` is a fingerprint of the configured key, not an invented identifier,
   *     and it changes when the key is rotated;
   *   - `createdAt` is null because nothing records when this key was first
   *     used. A fabricated date would be worse than an absent one — it would
   *     make key age look measurable.
   */
  public function list_key_info() {
    return array(array(
      'id'        => 'kfp-' . substr(hash('sha256', (string)getenv('VP_ENCRYPTION_KEY')), 0, 12),
      'createdAt' => NULL,
      'primary'   => TRUE,
    ));
  }

  public function key_loaded() {
    $v = (string)getenv('VP_ENCRYPTION_KEY');
    return strlen($v) > 0;
  }

  private function key() { return hash('sha256', (string)getenv('VP_ENCRYPTION_KEY'), TRUE); }
}
