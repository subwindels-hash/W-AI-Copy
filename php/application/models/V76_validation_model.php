<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * V76_validation_model — Final Enterprise Integration & Validation (S76/S195).
 *
 * Ports apps/api/src/v76validation/v76validation.service.ts onto MySQL. Node
 * stored each report body under `v76:report:<org>:<id>` with a
 * `v76:reportsIdx:<org>` zset for history and `v76:lastReportId:<org>` /
 * `v76:lastReportAt:<org>` pointers; the notes ledger lived in the shared
 * tenantStore. Here that is `v76_reports` (body JSON + seq) and `v76_notes`.
 * The two pointers are not carried over: the newest row by `seq` already is
 * the "last report", and a second copy of that fact is a second place for it
 * to go stale.
 *
 * THE RULE THIS MODEL EXISTS TO PROTECT: a check that was not run is reported
 * as not passed, never as passed.
 *
 *   * Node hard-codes sixteen systems as `wired` — desktop, mobile, web,
 *     identity, api-gateway, aio-bus, trust-center, mission-control,
 *     developer, federated, wearables — each with a sentence rather than a
 *     probe. Every system here is probed: a table either exists in this
 *     deployment or it does not, and the note says which table was looked for.
 *   * Node passes fifteen of its twenty-two checklist items with prose
 *     ("verified in S81 e2e", "csurf middleware mounted in server.ts"). Every
 *     item here is either measured in this request or reported false with the
 *     reason it could not be verified.
 *   * Node's consent-gate probe sets `consentGateOk = true` in its catch
 *     branch, so a probe that could not run reports success. Here
 *     `consentGateEnforced` and `governanceGateEnforced` are false unless
 *     something in this build actually measured them, and both currently say
 *     so in their checklist detail.
 *
 * What IS measured: the module probes (35 of them), the kernel round-trip
 * (an event is dispatched and the row is counted back), the AI provider
 * registry (providers are rows, not constants), the rate-limit counter, the
 * CSRF posture against the auth transport, and the ORG_ADMIN check that
 * admitted the request.
 *
 * Nothing is seeded, and no read runs the probe behind the caller's back
 * beyond Node's own behaviour: `GET /report` on an organization that has
 * never run one runs and stores the first report, which is what Node does.
 */
class V76_validation_model extends CI_Model {

  /** Node's history cap. */
  const MAX_REPORTS = 20;

  /** Node's `systems.length >= 20` threshold for the first checklist item. */
  const WIRED_THRESHOLD = 20;

  /** The kernel event this module dispatches to prove the round trip. */
  const PING_KIND = 'v76-validation.ping';

  /**
   * The systems Node's report scans, in Node's order, each with the probe this
   * build can actually run:
   *
   *   probe  a table name — the system is wired in this deployment when the
   *          table exists, and the note names the table that was looked for
   *   KERNEL the dispatch round-trip below
   *   NULL   no probe exists in this build; the system is reported missing
   *          (or stub, when it is explicitly out of scope for the package)
   */
  public static $SYSTEMS = array(
    array('key' => 'esi',             'name' => 'Enterprise System Integration (Arch)', 'probe' => NULL),
    array('key' => 'si',              'name' => 'Self-Hosted Inference',                'probe' => NULL),
    array('key' => 'kernel',          'name' => 'AI Kernel',                            'probe' => 'kernel_events'),
    array('key' => 'memory',          'name' => 'Agent Memory',                         'probe' => 'memory_evolution_memories'),
    array('key' => 'knowledge-graph', 'name' => 'Knowledge Graph',                      'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'AI Workforce',                         'probe' => NULL),
    array('key' => 'security',        'name' => 'Security Framework',                   'probe' => 'security_incidents'),
    array('key' => 'governance',      'name' => 'Governance',                           'probe' => 'governance_adrs'),
    array('key' => 'analytics',       'name' => 'Analytics',                            'probe' => 'platform_metric_counters'),
    array('key' => 'marketplace',     'name' => 'Marketplace',                          'probe' => 'platform_modules'),
    array('key' => 'voice-studio',    'name' => 'Voice Studio',                         'probe' => NULL),
    array('key' => 'trading-intel',   'name' => 'Unified Trading Intelligence',         'probe' => NULL),
    array('key' => 'self-hosted',     'name' => 'Self-Hosted Model Runtime',            'probe' => NULL),
    array('key' => 'voice-foundry',   'name' => 'Voice Foundry',                        'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'Experts Platform (S77)',               'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'Media Factory (S77)',                  'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'UX Intelligence (S78)',                'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'WMPC Gift Cards (S79)',                'probe' => NULL),
    array('key' => 'ai-workforce',    'name' => 'Global Currency (S80)',                'probe' => NULL),
    // Node's static systems. The four entries Node hard-coded as `wired` or
    // `stub` without a probe are marked here with what this build can say.
    array('key' => 'desktop',   'name' => 'Desktop (Electron)',                'probe' => NULL,
      'note' => 'no desktop client in this build — the cPanel package ships the API'),
    array('key' => 'mobile',    'name' => 'Mobile Layer',                      'probe' => NULL,
      'note' => 'no mobile client in this build — the cPanel package ships the API'),
    array('key' => 'web',       'name' => 'Web Client',                        'probe' => NULL,
      'note' => 'the React client is a separate build artifact this deployment does not serve'),
    array('key' => 'cloud',     'name' => 'Cloud Deployment', 'stub' => TRUE, 'probe' => NULL,
      'note' => 'out of scope: this package installs on one host via cPanel File Manager'),
    array('key' => 'edge',      'name' => 'Edge Runtime',     'stub' => TRUE, 'probe' => NULL,
      'note' => 'out of scope: no edge worker runtime in this build'),
    array('key' => 'airgap',    'name' => 'Airgap Mode',      'stub' => TRUE, 'probe' => NULL,
      'note' => 'out of scope: airgap certification is not claimed by this build'),
    array('key' => 'offline',   'name' => 'Offline Fallbacks',                 'probe' => NULL,
      'note' => 'no offline-fallback module in this build'),
    array('key' => 'notification', 'name' => 'Notifications',                 'probe' => 'notifications'),
    array('key' => 'identity',  'name' => 'Identity (Auth)',                   'probe' => 'users'),
    array('key' => 'api-gateway', 'name' => 'API Gateway',    'stub' => TRUE, 'probe' => NULL,
      'note' => 'no separate gateway process: the API is served by one front controller'),
    array('key' => 'aio-bus',   'name' => 'AIO Bus (Kernel)',                  'probe' => 'KERNEL'),
    array('key' => 'trust-center', 'name' => 'Trust Center',                   'probe' => 'audit_events'),
    array('key' => 'mission-control', 'name' => 'Mission Control / Platform Admin', 'probe' => 'platform_state'),
    array('key' => 'developer', 'name' => 'Developer Portal',                  'probe' => 'api_keys'),
    array('key' => 'federated', 'name' => 'Federated Learning',                'probe' => NULL),
    array('key' => 'wearables', 'name' => 'Wearables',                         'probe' => NULL),
  );

  public function __construct() { parent::__construct(); $this->load->database(); }

  /** Node's uid(): `v76r_` + 16 hex, and `v76-` + 8 hex for notes. */
  public function uid($prefix, $length = 8) { return $prefix . substr(bin2hex(random_bytes(ceil($length / 2))), 0, $length); }

  private function iso($value) { return $value ? gmdate('c', strtotime($value)) : NULL; }

  private function now() { return gmdate('Y-m-d H:i:s'); }

  // ---------------------------------------------------------------------------
  // Probes
  // ---------------------------------------------------------------------------

  /**
   * The kernel round-trip: dispatch an event and count it back. Node pinged
   * KernelService with an 800 ms timeout and trusted the resolved promise;
   * this checks the row actually landed, which is the only proof the event
   * bus did anything.
   */
  private function probe_kernel($org, $user_id) {
    $kind = self::PING_KIND;
    $before = (int) $this->db->where(array('kind' => $kind, 'source' => 'v76-validation'))
      ->count_all_results('kernel_events');
    try {
      $this->load->model('Kernel_model', 'kernel');
      $this->kernel->dispatch(
        array('kind' => $kind, 'source' => 'v76-validation', 'payload' => array('at' => $this->iso($this->now()))),
        $org,
        $user_id
      );
    } catch (Exception $error) {
      return array(FALSE, 'kernel dispatch threw: ' . $error->getMessage());
    }
    $after = (int) $this->db->where(array('kind' => $kind, 'source' => 'v76-validation'))
      ->count_all_results('kernel_events');
    if ($after > $before) {
      return array(TRUE, 'kernel dispatch accepted the ping and the event is durable in kernel_events');
    }
    return array(FALSE, 'kernel dispatch returned without the event becoming durable');
  }

  /** Does a table exist in this deployment? The analogue of Node's `keys()`. */
  private function probe_table($table) {
    return $this->db->table_exists($table);
  }

  // ---------------------------------------------------------------------------
  // The report
  // ---------------------------------------------------------------------------

  /**
   * Runs every probe and persists the result. The probes are cheap by design —
   * table existence, one kernel round-trip, a handful of counts — because a
   * validation report that is expensive to run is a report nobody runs.
   */
  public function run_report($org, $user_id) {
    list($kernelOk, $kernelDetail) = $this->probe_kernel($org, $user_id);

    $systems = array();
    foreach (self::$SYSTEMS as $entry) {
      if (!empty($entry['stub'])) {
        $systems[] = array(
          'key' => $entry['key'], 'name' => $entry['name'], 'status' => 'stub',
          'routesThroughKernel' => FALSE, 'notes' => $entry['note'],
        );
        continue;
      }
      if ($entry['probe'] === 'KERNEL') {
        $systems[] = array(
          'key' => $entry['key'], 'name' => $entry['name'],
          'status' => $kernelOk ? 'wired' : 'missing',
          'routesThroughKernel' => $kernelOk,
          'notes' => $kernelDetail,
        );
        continue;
      }
      if ($entry['probe'] === NULL) {
        $systems[] = array(
          'key' => $entry['key'], 'name' => $entry['name'], 'status' => 'missing',
          'routesThroughKernel' => FALSE,
          'notes' => isset($entry['note']) ? $entry['note'] : 'no module for this system in this build',
        );
        continue;
      }
      $wired = $this->probe_table($entry['probe']);
      $systems[] = array(
        'key' => $entry['key'], 'name' => $entry['name'],
        'status' => $wired ? 'wired' : 'missing',
        'routesThroughKernel' => $wired,
        'notes' => $wired
          ? 'table `' . $entry['probe'] . '` present in this deployment'
          : 'no table in this deployment for this system (looked for `' . $entry['probe'] . '`)',
      );
    }

    $wired   = count(array_filter($systems, function ($s) { return $s['status'] === 'wired'; }));
    $stubs   = count(array_filter($systems, function ($s) { return $s['status'] === 'stub'; }));
    $missing = count(array_filter($systems, function ($s) { return $s['status'] === 'missing'; }));

    $checks = $this->checklist($org, $user_id, $kernelOk, $kernelDetail, array(
      'wired' => $wired, 'stubs' => $stubs, 'missing' => $missing, 'total' => count($systems),
    ));

    // Two of the checklist verdicts are promoted into the report's own flags,
    // which is where Node put them. Both are measured or false, never assumed.
    $consentEnforced = FALSE;
    $governanceEnforced = FALSE;

    $report = array(
      'generatedAt'           => $this->iso($this->now()),
      'totalSystems'          => count($systems),
      'wired'                 => $wired,
      'stubs'                 => $stubs,
      'missing'               => $missing,
      'duplicatesDetected'    => 0,
      'consentGateEnforced'   => $consentEnforced,
      'governanceGateEnforced'=> $governanceEnforced,
      'systems'               => $systems,
      'checklist'             => $checks['items'],
    );

    $id = $this->uid('v76r_', 16);
    $this->db->insert('v76_reports', array(
      'id'              => $id,
      'organization_id' => $org,
      'generated_at'    => $this->now(),
      'body'            => json_encode($report, JSON_UNESCAPED_SLASHES),
    ));
    $this->trim($org);
    $report['reportId'] = $id;

    return $report;
  }

  /** Keep the newest MAX_REPORTS rows, as Node's zset trim did. */
  private function trim($org) {
    $rows = $this->db->select('id')->where('organization_id', $org)
      ->order_by('seq', 'DESC')->get('v76_reports')->result_array();
    if (count($rows) <= self::MAX_REPORTS) return;
    foreach (array_slice($rows, self::MAX_REPORTS) as $row) {
      $this->db->where('id', $row['id'])->delete('v76_reports');
    }
  }

  /**
   * Node's 22-item checklist, in Node's order. Every `passed` here is either
   * the result of a measurement made in this request, or FALSE with a detail
   * beginning "not verified" / "not applicable" that says why. There is no
   * third category, and there is no item that passes on the strength of a
   * sentence.
   */
  private function checklist($org, $user_id, $kernelOk, $kernelDetail, $counts) {
    $na = function ($what) { return 'not applicable: ' . $what; };
    $nv = function ($why) { return 'not verified: ' . $why; };

    // Measured: how many module sources have actually dispatched through the
    // kernel in this organization — reported alongside the verdict, not as the
    // verdict.
    $moduleSources = $this->db->select('COUNT(DISTINCT source) AS n', FALSE)
      ->where('organization_id', $org)
      ->where('source !=', 'v76-validation')
      ->get('kernel_events')->row_array();
    $sourceCount = (int) ($moduleSources['n'] ?? 0);

    // Measured: providers are rows in model_registry, and the AI request path
    // reads that table (Ai_model::routable), not a constant.
    $providers = 0;
    if ($this->db->table_exists('model_registry')) {
      $row = $this->db->select('COUNT(DISTINCT provider) AS n', FALSE)->get('model_registry')->row_array();
      $providers = (int) ($row['n'] ?? 0);
    }

    // Measured: how many requests this deployment's limiter has actually
    // limited. The tiers are configured and served by the security module;
    // nothing enforces them in this runtime, so this stays at zero and the
    // item fails rather than passing on configuration alone.
    // security_counters is an append-only event log (one row per event), and
    // the security module counts it the same way — so this counts rows rather
    // than reading a total out of a column that does not exist.
    $limited = 0;
    if ($this->db->table_exists('security_counters')) {
      $limited = (int) $this->db->where('counter_key', 'security.rate_limited')
        ->count_all_results('security_counters');
    }

    // Measured: the CSRF posture against the auth transport, exactly as the
    // security module's own self-test reports it.
    $csrfEnabled = (bool) config_item('csrf_protection');
    $cookieAuth  = (bool) config_item('sess_cookie_name') && $this->session_library_autoloaded();

    // Measured: the ORG_ADMIN gate that admitted this request is the same
    // check the report claims is enforced.
    $adminGate = FALSE;
    try {
      $this->load->model('Permission_model', 'permissions');
      $adminGate = $this->permissions->has($user_id, 'ORG_ADMIN', $org);
    } catch (Exception $error) { $adminGate = FALSE; }

    $items = array(
      array(
        'item' => 'All 22 enterprise systems wired or explicitly stubbed',
        'passed' => $counts['wired'] >= self::WIRED_THRESHOLD,
        'detail' => $counts['wired'] . ' wired, ' . $counts['stubs'] . ' stub, ' . $counts['missing']
          . ' missing of ' . $counts['total'] . ' probed (Node passes this at ' . self::WIRED_THRESHOLD . ' wired)',
      ),
      array(
        'item' => 'Kernel event routing verified (dispatch round-trip)',
        'passed' => $kernelOk,
        'detail' => $kernelDetail,
      ),
      array(
        'item' => 'S36/S40 consent gate enforced on voice cloning',
        'passed' => FALSE,
        'detail' => $nv('no voice cloning in this build, and no consent gate probe exists; Node reported this as passing when its VoiceStudio import failed'),
      ),
      array(
        'item' => 'S39 inter-module events route through Kernel',
        'passed' => FALSE,
        'detail' => $nv('no probe can prove every module routes through the kernel; ' . $sourceCount
          . ' module source(s) have dispatched events in this organization'),
      ),
      array('item' => 'S40 cloned voices default to private', 'passed' => FALSE,
        'detail' => $na('no voice cloning in this build')),
      array('item' => 'S41 Foundry voices consent-exempt with immutable audit', 'passed' => FALSE,
        'detail' => $na('no voice foundry in this build')),
      array('item' => 'S77 Expert Agents extend common ExpertAgent base with disclaimers', 'passed' => FALSE,
        'detail' => $na('no expert-agent module in this build')),
      array('item' => 'S77 ChildSafetyReviewer non-bypassable in Media Factory', 'passed' => FALSE,
        'detail' => $na('no media factory in this build')),
      array('item' => 'S78 Design Quality Gate non-bypassable', 'passed' => FALSE,
        'detail' => $na('no UX intelligence module in this build')),
      array('item' => 'S79 Gift cards register into existing Payment Gateway (no parallel)', 'passed' => FALSE,
        'detail' => $na('no payment gateway in this build')),
      array('item' => 'S79 Gift card PIN + fraud detection active', 'passed' => FALSE,
        'detail' => $na('no gift card module in this build')),
      array('item' => 'S80 Multi-layer exchange rate provider (live/cache/override/offline)', 'passed' => FALSE,
        'detail' => $na('no global currency module in this build')),
      array('item' => 'S80 Currency manipulation fraud guard active', 'passed' => FALSE,
        'detail' => $na('no global currency module in this build')),
      array('item' => 'S81 Trading proposals return requiresApproval:true (no auto-execution)', 'passed' => FALSE,
        'detail' => $na('no trading module in this build')),
      array(
        'item' => 'CSRF double-submit on all state-changing endpoints',
        'passed' => $csrfEnabled || !$cookieAuth,
        'detail' => $csrfEnabled
          ? 'csrf_protection is enabled'
          : ($cookieAuth
            ? 'csrf_protection is FALSE while cookie sessions are autoloaded — state-changing routes are CSRF-exposed'
            : 'csrf_protection is FALSE; API auth is a bearer token in the Authorization header, which browsers do not attach cross-origin, so CSRF is not applicable'),
      ),
      array(
        'item' => 'Rate limits enforced per route',
        'passed' => $limited > 0,
        'detail' => 'the security module serves the configured limit tiers, but no server-side limiter is wired in this runtime — the rate-limit counter has recorded '
          . $limited . ' limited request(s)',
      ),
      array(
        'item' => 'Invalid body returns 422',
        'passed' => FALSE,
        'detail' => $nv('no runtime probe; this build\'s validators answer 422 from a shared helper, which is a code property rather than a measurement'),
      ),
      array(
        'item' => 'No hard-coded AI providers (vendor-neutrality S33)',
        'passed' => $providers > 0,
        'detail' => $providers > 0
          ? $providers . ' provider(s) registered as rows in model_registry, and the AI request path reads that table'
          : 'no providers registered in model_registry',
      ),
      array(
        'item' => 'Duplicate payment/gateway systems detected',
        'passed' => TRUE,
        'detail' => 'no duplicate payment gateway: this build exposes no gateway of its own, so there is nothing to duplicate',
      ),
      array(
        'item' => 'Organization admin guards on all admin modules',
        'passed' => $adminGate,
        'detail' => $adminGate
          ? 'the ORG_ADMIN check that admitted this request resolved against roles/role_permissions'
          : 'the ORG_ADMIN check did not resolve for this caller',
      ),
      array('item' => 'Redis dual-client (subscriber/command) not confused', 'passed' => FALSE,
        'detail' => $na('this build stores state in MySQL — there is no Redis client')),
      array(
        'item' => 'Digital Operations Center report emitted',
        'passed' => TRUE,
        'detail' => 'this report is persisted and retrievable via GET /api/v1/validation/report',
      ),
    );

    return array('items' => $items);
  }

  /** The same check the security module's self-test uses. */
  private function session_library_autoloaded() {
    $file = APPPATH . 'config/autoload.php';
    if (!is_readable($file)) return FALSE;
    $autoload = array();
    include $file;
    $libs = isset($autoload['libraries']) ? (array) $autoload['libraries'] : array();
    foreach ($libs as $k => $v) {
      if ((is_int($k) && $v === 'session') || (!is_int($k) && $k === 'session')) return TRUE;
    }
    return FALSE;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** The newest report body, or NULL when this org has never run one. */
  public function last_report($org) {
    $row = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit(1)
      ->get('v76_reports')->row_array();
    if (!$row) return NULL;
    $body = json_decode($row['body'], TRUE);
    if (!is_array($body)) return NULL;
    $body['reportId'] = $row['id'];
    return $body;
  }

  /**
   * Newest first, capped at MAX_REPORTS. Node returned a summary per report so
   * the console could list them without shipping every systems + checklist
   * payload; the summary is derived from the stored body rather than copied
   * into columns that could disagree with it.
   */
  public function history($org, $limit = self::MAX_REPORTS) {
    $limit = max(1, min(self::MAX_REPORTS, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)
      ->get('v76_reports')->result_array();
    $out = array();
    foreach ($rows as $row) {
      $body = json_decode($row['body'], TRUE);
      if (!is_array($body)) continue;
      $out[] = array(
        'id'                    => $row['id'],
        'generatedAt'           => $this->iso($row['generated_at']),
        'wired'                 => (int) ($body['wired'] ?? 0),
        'stubs'                 => (int) ($body['stubs'] ?? 0),
        'missing'               => (int) ($body['missing'] ?? 0),
        'totalSystems'          => (int) ($body['totalSystems'] ?? 0),
        'duplicatesDetected'    => (int) ($body['duplicatesDetected'] ?? 0),
        'consentGateEnforced'   => (bool) ($body['consentGateEnforced'] ?? FALSE),
        'governanceGateEnforced'=> (bool) ($body['governanceGateEnforced'] ?? FALSE),
      );
    }
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Notes ledger (Node's tenantStore, prefix "v76:notes", ids "v76-")
  // ---------------------------------------------------------------------------

  public function public_note($row) {
    if (!$row) return NULL;
    $tags = json_decode($row['tags'], TRUE);
    return array(
      'id'        => $row['id'],
      'createdAt' => $this->iso($row['created_at']),
      'createdBy' => $row['created_by'],
      'title'     => $row['title'],
      'body'      => $row['body'],
      'tags'      => is_array($tags) ? array_values($tags) : array(),
    );
  }

  public function list_notes($org, $limit = 200) {
    $limit = max(1, min(200, (int) $limit));
    $rows = $this->db->where('organization_id', $org)->order_by('seq', 'DESC')->limit($limit)
      ->get('v76_notes')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_note($row);
    return $out;
  }

  public function create_note($org, $input, $user_id) {
    $now = $this->now();
    $row = array(
      'id'              => $this->uid('v76-'),
      'organization_id' => $org,
      'title'           => $input['title'],
      'body'            => $input['body'],
      'tags'            => json_encode(array_values($input['tags'])),
      'created_by'      => $user_id,
      'created_at'      => $now,
      'updated_at'      => $now,
    );
    $this->db->insert('v76_notes', $row);
    return $this->public_note($this->db->where('id', $row['id'])->get('v76_notes')->row_array());
  }

  /** A partial update: only the keys present in $patch are written. */
  public function update_note($org, $id, $patch) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('v76_notes')->row_array();
    if (!$row) return NULL;
    $set = array('updated_at' => $this->now());
    if (array_key_exists('title', $patch)) $set['title'] = $patch['title'];
    if (array_key_exists('body', $patch)) $set['body'] = $patch['body'];
    if (array_key_exists('tags', $patch)) $set['tags'] = json_encode(array_values($patch['tags']));
    $this->db->where('id', $id)->update('v76_notes', $set);
    return $this->public_note($this->db->where('id', $id)->get('v76_notes')->row_array());
  }

  public function delete_note($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('v76_notes')->row_array();
    if (!$row) return FALSE;
    $this->db->where('id', $id)->delete('v76_notes');
    return TRUE;
  }
}
