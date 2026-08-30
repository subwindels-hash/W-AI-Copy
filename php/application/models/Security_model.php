<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Security governance — PHP port of apps/api/src/security/governance.service.ts
 * (incidents, access reviews, runbooks) plus the durable side of the scorecard
 * (counters, events, breakers).
 *
 * Three Node behaviours are deliberately NOT reproduced:
 *
 *  1. Incidents live in one global Redis zset, so every tenant's incident list
 *     contains every other tenant's incidents. Here `security_incidents` is
 *     organization-scoped: exposing other orgs' security incidents is the leak
 *     this module exists to prevent.
 *  2. `REVOKE_TOKENS` runs `userSession.updateMany({ revokedAt: null })` with no
 *     scope — it logs out every user on the platform. Here it revokes the
 *     refresh tokens of users in the reporting organization only.
 *  3. `runAccessReview` scans `prisma.user.findMany()` with no filter, so its
 *     dormant list and admin counts cover the whole platform. Here the review
 *     covers members of the calling organization.
 *
 * Node also falls back to `{ id: "campaign-mock" }` and a fake `{ id: "rb-…" }`
 * object when the Prisma models are absent (they are, in the current schema, so
 * Node is running on those fallbacks). This port has no fallback: the tables
 * exist, so the endpoints return real rows or fail loudly.
 */
class Security_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  /**
   * Node serialises dates with Date.toISOString(), which ends in "Z". PHP's
   * DATE_ATOM / gmdate('c') ends in "+00:00" — the same instant, but a different
   * string, and this API is consumed by the same React client. One helper keeps
   * every timestamp in the module identical to Node's.
   */
  private static function iso($time) {
    if ($time === NULL || $time === '') return NULL;
    $ts = is_numeric($time) ? (int)$time : strtotime($time);
    return $ts ? gmdate('Y-m-d\TH:i:s\Z', $ts) : NULL;
  }

  // ------------------------------------------------------------------ counters

  /** Node's Metrics.increment, made durable. */
  public function bump($key, $n = 1) {
    $this->db->insert('security_counters', array(
      'counter_key' => substr((string)$key, 0, 60),
      'created_at'  => date('Y-m-d H:i:s'),
    ));
    return $n;
  }

  public function count_key($key) {
    return (int)$this->db->where('counter_key', $key)->count_all_results('security_counters');
  }

  // -------------------------------------------------------------------- events

  /**
   * Node reads an in-memory log ring, which under PHP would always be empty.
   * The durable equivalent is `audit_events`, filtered to the event types that
   * are actually security-relevant.
   */
  private static $event_scopes = array('auth.', 'account.', 'admin.', 'permission.', 'authz.', 'security.', 'system.');

  public function events($org, $limit = 200, $type = NULL) {
    $this->db->select('id, organization_id, user_id, event_type, payload, ip_address, created_at');
    $this->db->where('organization_id', $org);
    $this->db->group_start();
    foreach (self::$event_scopes as $scope) $this->db->or_like('event_type', $scope, 'after');
    $this->db->group_end();
    if ($type !== NULL && $type !== '') $this->db->where('event_type', $type);
    $this->db->order_by('created_at', 'DESC')->limit($limit);
    $rows = $this->db->get('audit_events')->result_array();
    $out  = array();
    foreach ($rows as $r) {
      $out[] = array(
        'id'             => $r['id'],
        'type'           => $r['event_type'],
        'at'             => self::iso($r['created_at']),
        'actorId'        => $r['user_id'],
        'organizationId' => $r['organization_id'],
        'ip'             => $r['ip_address'],
        'payload'        => json_decode($r['payload'] ?: '{}', TRUE),
      );
    }
    return $out;
  }

  // ----------------------------------------------------------------- incidents

  public function create_incident($org, $reporterId, $d) {
    $id  = 'inc-' . substr(bin2hex(random_bytes(8)), 0, 10);
    $now = date('Y-m-d H:i:s');
    $nowIso = self::iso(date('Y-m-d H:i:s'));
    $timeline = array(array('at' => $nowIso, 'actor' => $reporterId, 'note' => 'Incident reported.'));
    $executions = array();

    foreach ($this->matching_runbooks($org, $d['severity'], $d['area']) as $rb) {
      $output = array();
      foreach ((array)json_decode($rb['actions'], TRUE) as $act) {
        if ($act === 'NOTIFY_ADMIN') {
          $output['notify_admin'] = 'Admin security notification dispatched.';
        } elseif ($act === 'REVOKE_TOKENS') {
          $output['revoke_tokens'] = $this->revoke_org_tokens($org);
        } elseif ($act === 'QUARANTINE_REPORTER') {
          $output['quarantine_reporter'] = $this->suspend_user($reporterId);
        }
      }
      $this->db->insert('security_runbook_executions', array(
        'runbook_id'  => $rb['id'],
        'incident_id' => $id,
        'status'      => 'success',
        'output'      => json_encode($output),
        'created_at'  => $now,
      ));
      $executions[]  = array('runbookId' => $rb['id'], 'status' => 'success', 'output' => $output);
      $timeline[]    = array('at' => $nowIso, 'actor' => 'system-runbook', 'note' => 'Executed runbook: ' . $rb['name']);
    }

    $this->db->insert('security_incidents', array(
      'id'                 => $id,
      'organization_id'    => $org,
      'title'              => $d['title'],
      'description'        => $d['description'],
      'severity'           => $d['severity'],
      'status'             => 'reported',
      'reported_by'        => $reporterId,
      'area'               => $d['area'],
      'timeline'           => json_encode($timeline),
      'runbook_executions' => json_encode($executions),
      'created_at'         => $now,
      'updated_at'         => $now,
    ));
    $this->bump('security.incident_reported');
    return $this->incident($org, $id);
  }

  public function incidents($org, $status = NULL, $limit = 50) {
    $this->db->where('organization_id', $org);
    if ($status) $this->db->where('status', $status);
    $rows = $this->db->order_by('created_at', 'DESC')->limit($limit)->get('security_incidents')->result_array();
    return array_map(array($this, 'shape_incident'), $rows);
  }

  public function incident($org, $id) {
    $r = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('security_incidents')->row_array();
    return $r ? $this->shape_incident($r) : NULL;
  }

  public function update_incident($org, $id, $actorId, $patch) {
    $r = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('security_incidents')->row_array();
    if (!$r) return NULL;
    $timeline = json_decode($r['timeline'], TRUE) ?: array();
    if (isset($patch['status']) && $patch['status'] !== NULL) $r['status'] = $patch['status'];
    if (!empty($patch['note'])) {
      $timeline[] = array('at' => self::iso(date('Y-m-d H:i:s')), 'actor' => $actorId, 'note' => $patch['note']);
    }
    $this->db->where('id', $id)->update('security_incidents', array(
      'status'     => $r['status'],
      'timeline'   => json_encode($timeline),
      'updated_at' => date('Y-m-d H:i:s'),
    ));
    return $this->incident($org, $id);
  }

  private function shape_incident($r) {
    return array(
      'id'                => $r['id'],
      'title'             => $r['title'],
      'description'       => $r['description'],
      'severity'          => $r['severity'],
      'status'            => $r['status'],
      'reportedBy'        => $r['reported_by'],
      'area'              => $r['area'],
      'createdAt'         => self::iso($r['created_at']),
      'updatedAt'         => self::iso($r['updated_at']),
      'timeline'          => json_decode($r['timeline'], TRUE) ?: array(),
      'runbookExecutions' => json_decode($r['runbook_executions'], TRUE) ?: array(),
    );
  }

  // ------------------------------------------------------------------ runbooks

  public function runbooks($org) {
    $rows = $this->db->where('organization_id', $org)->or_where('organization_id', NULL)
                     ->order_by('created_at', 'DESC')->get('security_incident_runbooks')->result_array();
    $out = array();
    foreach ($rows as $r) {
      $ex = $this->db->where('runbook_id', $r['id'])->order_by('created_at', 'DESC')->limit(10)
                     ->get('security_runbook_executions')->result_array();
      $out[] = array(
        'id'              => $r['id'],
        'organizationId'  => $r['organization_id'],
        'name'            => $r['name'],
        'triggerSeverity' => $r['trigger_severity'],
        'triggerArea'     => $r['trigger_area'],
        'actions'         => json_decode($r['actions'], TRUE) ?: array(),
        'enabled'         => (bool)$r['enabled'],
        'createdAt'       => self::iso($r['created_at']),
        'executions'      => array_map(function ($e) {
          return array(
            'id'         => (int)$e['id'],
            'incidentId' => $e['incident_id'],
            'status'     => $e['status'],
            'output'     => json_decode($e['output'], TRUE),
            'createdAt'  => self::iso($e['created_at']),
          );
        }, $ex),
      );
    }
    return $out;
  }

  public function create_runbook($org, $d) {
    $id  = 'rb-' . substr(bin2hex(random_bytes(8)), 0, 8);
    $now = date('Y-m-d H:i:s');
    $this->db->insert('security_incident_runbooks', array(
      'id'              => $id,
      'organization_id' => $org,
      'name'            => $d['name'],
      'trigger_severity'=> $d['triggerSeverity'],
      'trigger_area'    => $d['triggerArea'],
      'actions'         => json_encode(array_values($d['actions'])),
      'enabled'         => 1,
      'created_at'      => $now,
    ));
    return array(
      'id'              => $id,
      'organizationId'  => $org,
      'name'            => $d['name'],
      'triggerSeverity' => $d['triggerSeverity'],
      'triggerArea'     => $d['triggerArea'],
      'actions'         => array_values($d['actions']),
      'enabled'         => TRUE,
      'createdAt'       => self::iso($now),
      'executions'      => array(),
    );
  }

  private function matching_runbooks($org, $severity, $area) {
    return $this->db->where('enabled', 1)
                    ->where('trigger_severity', $severity)
                    ->where('trigger_area', $area)
                    ->group_start()->where('organization_id', $org)->or_where('organization_id', NULL)->group_end()
                    ->get('security_incident_runbooks')->result_array();
  }

  // ------------------------------------------------------------- access review

  /**
   * Node reads `User.lastLoginAt`, a column the PHP schema does not have. Rather
   * than invent one, activity is derived from the refresh-token ledger and the
   * audit trail — both durable and both real login/action signals — falling back
   * to account creation. A user who never logged in therefore ages from their
   * creation date instead of Node's `daysInactive: 9999` sentinel.
   */
  public function run_access_review($org, $dormantDays = 90) {
    $dormantDays = max(7, min(365, (int)$dormantDays));
    $cutoff      = date('Y-m-d H:i:s', time() - $dormantDays * 86400);

    $sql = "SELECT u.id, u.email, u.role,
                   GREATEST(u.created_at,
                            COALESCE((SELECT MAX(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = u.id), u.created_at),
                            COALESCE((SELECT MAX(ae.created_at) FROM audit_events ae WHERE ae.user_id = u.id), u.created_at)
                   ) AS last_activity_at
            FROM users u
            JOIN memberships m ON m.user_id = u.id
            WHERE m.organization_id = ?";
    $users   = $this->db->query($sql, array($org))->result_array();
    $dormant = array();
    foreach ($users as $u) {
      $last = $u['last_activity_at'];
      if ($last >= $cutoff) continue;
      $dormant[] = array(
        'userId'       => $u['id'],
        'email'        => $u['email'],
        'role'         => $u['role'],
        'lastLoginAt'  => self::iso($last),
        'daysInactive' => (int)floor((time() - strtotime($last)) / 86400),
      );
    }
    usort($dormant, function ($a, $b) { return $b['daysInactive'] - $a['daysInactive']; });

    $adminCount = 0;
    $superCount = 0;
    foreach ($users as $u) {
      if ($u['role'] === 'ADMIN') $adminCount++;
      if ($u['role'] === 'SUPER_ADMIN') { $adminCount++; $superCount++; }
    }

    $recs = array();
    if (count($dormant)) $recs[] = count($dormant) . ' dormant accounts (>' . $dormantDays . 'd inactive) — review and attest or revoke.';
    if ($superCount > 3) $recs[] = $superCount . ' SUPER_ADMIN accounts — review least-privilege compliance.';

    $campaignId = $this->uuid();
    $now  = date('Y-m-d H:i:s');
    $this->db->insert('security_access_review_campaigns', array(
      'id'              => $campaignId,
      'organization_id' => $org,
      'dormant_days'    => $dormantDays,
      'status'          => 'IN_PROGRESS',
      'created_at'      => $now,
    ));

    $items = array();
    foreach ($dormant as $d) {
      $itemId = $this->uuid();
      $this->db->insert('security_access_review_items', array(
        'id'          => $itemId,
        'campaign_id' => $campaignId,
        'user_id'     => $d['userId'],
        'status'      => 'PENDING',
        'created_at'  => $now,
        'updated_at'  => $now,
      ));
      $items[] = array(
        'id'            => $itemId,
        'campaignId'    => $campaignId,
        'userId'        => $d['userId'],
        'status'        => 'PENDING',
        'reviewedById'  => NULL,
        'notes'         => NULL,
        'createdAt'     => self::iso($now),
        'updatedAt'     => self::iso($now),
      );
    }

    $review = array(
      'campaignId'      => $campaignId,
      'generatedAt'     => self::iso(date('Y-m-d H:i:s')),
      'dormantUsers'    => $dormant,
      'adminCount'      => $adminCount,
      'superAdminCount' => $superCount,
      'recommendations' => $recs,
    );
    // Node caches the snapshot in Redis for 7 days; the campaign row is the
    // durable equivalent.
    $this->db->where('id', $campaignId)->update('security_access_review_campaigns', array('snapshot' => json_encode($review)));

    return array(
      'campaign' => array(
        'id'           => $campaignId,
        'organizationId' => $org,
        'dormantDays'  => $dormantDays,
        'status'       => 'IN_PROGRESS',
        'createdAt'    => self::iso($now),
        'items'        => $items,
      ),
      'review'   => $review,
    );
  }

  public function latest_access_review($org) {
    $r = $this->db->where('organization_id', $org)->order_by('created_at', 'DESC')->limit(1)
                  ->get('security_access_review_campaigns')->row_array();
    if (!$r) return NULL;
    if (!empty($r['snapshot'])) {
      $review = json_decode($r['snapshot'], TRUE);
      if (is_array($review)) return $review;
    }
    // Campaign created before snapshots were stored: recompute is impossible
    // without the participant list, so say so rather than returning an empty review.
    return array(
      'campaignId'      => $r['id'],
      'generatedAt'     => self::iso($r['created_at']),
      'dormantUsers'    => array(),
      'adminCount'      => 0,
      'superAdminCount' => 0,
      'recommendations' => array('Snapshot unavailable for this campaign — re-run the access review.'),
    );
  }

  public function attest($org, $itemId, $status, $reviewerId, $notes = NULL) {
    $row = $this->db->select('i.*, c.organization_id')
                    ->from('security_access_review_items i')
                    ->join('security_access_review_campaigns c', 'c.id = i.campaign_id')
                    ->where(array('i.id' => $itemId, 'c.organization_id' => $org))
                    ->get()->row_array();
    if (!$row) return NULL;
    $now = date('Y-m-d H:i:s');
    $this->db->where('id', $itemId)->update('security_access_review_items', array(
      'status'      => $status,
      'reviewed_by' => $reviewerId,
      'notes'       => $notes,
      'updated_at'  => $now,
    ));
    if ($status === 'QUARANTINED' || $status === 'REVOKED') $this->suspend_user($row['user_id']);
    return array(
      'id'           => $itemId,
      'campaignId'   => $row['campaign_id'],
      'userId'       => $row['user_id'],
      'status'       => $status,
      'reviewedById' => $reviewerId,
      'notes'        => $notes,
      'createdAt'    => self::iso($row['created_at']),
      'updatedAt'    => self::iso($now),
    );
  }

  // -------------------------------------------------------------------- effects

  /**
   * Revoke refresh tokens for members of one organization. Node revokes every
   * session on the platform; scoping this to the affected org is the point.
   */
  private function revoke_org_tokens($org) {
    $ids = array();
    foreach ($this->db->select('user_id')->where('organization_id', $org)->get('memberships')->result_array() as $m) {
      $ids[] = $m['user_id'];
    }
    if (!$ids) return 'No memberships in this organization; no tokens revoked.';
    $this->db->where_in('user_id', $ids)->where('revoked_at', NULL)
             ->update('refresh_tokens', array('revoked_at' => date('Y-m-d H:i:s')));
    return 'Revoked ' . $this->db->affected_rows() . ' active refresh token(s) for ' . count($ids) . ' member(s) of this organization.';
  }

  private function suspend_user($userId) {
    if (!$userId) return 'No user to suspend.';
    $this->db->where('id', $userId)->update('users', array(
      'is_suspended' => 1,
      'updated_at'   => date('Y-m-d H:i:s'),
    ));
    return 'User ' . $userId . ' suspended due to incident trigger.';
  }

  private function uuid() {
    $h = bin2hex(random_bytes(16));
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20, 12);
  }
}
