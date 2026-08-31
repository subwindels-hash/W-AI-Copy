<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Autonomous_model — the board-decision approval register.
 *
 * Ports apps/api/src/autonomous/autonomous.service.ts onto MySQL. Node stored
 * one Redis hash per decision plus a per-organization sorted-set index; here
 * every query carries organization_id, which is the same tenancy boundary the
 * key namespacing provided.
 *
 * The dashboard maths is copied rather than re-imagined, including its
 * deliberate zeros (see Autonomous::dashboard()).
 */
class Autonomous_model extends CI_Model {

  public function __construct() { parent::__construct(); $this->load->database(); }

  public function uuid() {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0F) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3F) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  public function public_decision($row) {
    if (!$row) return NULL;
    return array(
      'id'                => $row['id'],
      'title'             => $row['title'],
      'department'        => $row['department'],
      'recommendation'    => $row['recommendation'],
      // JSON numbers, not strings: the web client renders `${confidence * 100}%`.
      'confidence'        => (float) $row['confidence'],
      'riskLevel'         => $row['risk_level'],
      'estimatedImpactUsd' => (float) $row['estimated_impact_usd'],
      'status'            => $row['status'],
      'humanApprover'     => $row['human_approver'],
      'reasoning'         => $row['reasoning'],
      'decisionNote'      => $row['decision_note'],
      'createdAt'         => $this->iso($row['created_at']),
      'decidedAt'         => $this->iso($row['decided_at']),
    );
  }

  private function iso($value) { return $value ? gmdate('c', strtotime($value)) : NULL; }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  public function get_decision($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('autonomous_decisions')->row_array();
    return $row ? $this->public_decision($row) : NULL;
  }

  /** Newest first, then by id descending — Node's tie-break. */
  public function list_decisions($org, $filters = array()) {
    $this->db->where('organization_id', $org);
    if (!empty($filters['status'])) $this->db->where('status', $filters['status']);
    if (!empty($filters['department'])) $this->db->where('department', $filters['department']);
    $limit = isset($filters['limit']) ? max(1, min(100, (int) $filters['limit'])) : 50;
    $rows = $this->db->order_by('created_at', 'DESC')->order_by('id', 'DESC')->limit($limit)->get('autonomous_decisions')->result_array();
    $out = array();
    foreach ($rows as $row) $out[] = $this->public_decision($row);
    return $out;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  public function propose($org, $input) {
    $now = date('Y-m-d H:i:s');
    $row = array(
      // Node mints `decision-<uuid>`; keep the same shape so ids are comparable
      // across the two backends.
      'id'                   => 'decision-' . $this->uuid(),
      'organization_id'      => $org,
      'title'                => $input['title'],
      'department'           => $input['department'],
      'recommendation'       => $input['recommendation'],
      'confidence'           => (float) $input['confidence'],
      'risk_level'           => $input['riskLevel'],
      'estimated_impact_usd' => (float) $input['estimatedImpactUsd'],
      'status'               => 'awaiting_human',
      'human_approver'       => NULL,
      'reasoning'            => $input['reasoning'],
      'decision_note'        => NULL,
      'created_at'           => $now,
      'decided_at'           => NULL,
      'updated_at'           => $now,
    );
    $this->db->insert('autonomous_decisions', $row);
    return $this->public_decision($this->db->where('id', $row['id'])->get('autonomous_decisions')->row_array());
  }

  public function decide($org, $id, $approver_id, $approved, $note) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('autonomous_decisions')->row_array();
    if (!$row) return NULL;
    if ($row['status'] !== 'awaiting_human') return FALSE; // already resolved
    $now = date('Y-m-d H:i:s');
    $this->db->where('id', $id)->update('autonomous_decisions', array(
      'status'        => $approved ? 'approved' : 'rejected',
      'human_approver' => $approver_id,
      'decision_note' => $note === NULL ? NULL : $note,
      'decided_at'    => $now,
      'updated_at'    => $now,
    ));
    return $this->public_decision($this->db->where('id', $id)->get('autonomous_decisions')->row_array());
  }

  public function delete_decision($org, $id) {
    $row = $this->db->where(array('id' => $id, 'organization_id' => $org))->get('autonomous_decisions')->row_array();
    if (!$row) return NULL;
    if ($row['status'] !== 'awaiting_human') return FALSE; // resolved decisions are immutable
    $this->db->where('id', $id)->delete('autonomous_decisions');
    return TRUE;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Approval-register rollup. `limit` is 100 in Node (it slices the last 100
   * decisions before computing), which is reproduced here.
   */
  public function dashboard($org) {
    $decisions = $this->list_decisions($org, array('limit' => 100));
    $pending = array();
    $resolved = array();
    $approved = array();
    $rejected = array();
    foreach ($decisions as $decision) {
      if ($decision['status'] === 'awaiting_human') $pending[] = $decision;
      else $resolved[] = $decision;
      if ($decision['status'] === 'approved') $approved[] = $decision;
      if ($decision['status'] === 'rejected') $rejected[] = $decision;
    }
    $today = gmdate('Y-m-d');
    $since = time() - 30 * 86400;
    $approved_recent = array();
    foreach ($approved as $decision) {
      $stamp = strtotime($decision['decidedAt'] ? $decision['decidedAt'] : $decision['createdAt']);
      if ($stamp >= $since) $approved_recent[] = $decision;
    }

    $by_department = array();
    foreach ($decisions as $decision) {
      $name = $decision['department'];
      if (!isset($by_department[$name])) $by_department[$name] = array('proposals' => 0, 'approved' => 0, 'impactUsd' => 0);
      $by_department[$name]['proposals']++;
      if ($decision['status'] === 'approved') {
        $by_department[$name]['approved']++;
        $by_department[$name]['impactUsd'] += $decision['estimatedImpactUsd'];
      }
    }

    $approved_impact = 0;
    foreach ($approved_recent as $decision) $approved_impact += $decision['estimatedImpactUsd'];

    $departments = array();
    foreach ($by_department as $name => $summary) {
      $pending_for_department = 0;
      foreach ($decisions as $decision) if ($decision['department'] === $name && $decision['status'] === 'awaiting_human') $pending_for_department++;
      $departments[] = array(
        // Node lowercases first, then strips anything outside [a-z0-9].
        'id'                   => 'dept-' . preg_replace('/[^a-z0-9]+/', '-', strtolower($name)),
        'name'                 => $name,
        'autonomyLevel'        => 'recommend',
        'health'               => $summary['proposals'] ? (int) round(($summary['approved'] / $summary['proposals']) * 100) : 0,
        'decisionsPending'     => $pending_for_department,
        'decisionsExecuted30d' => $summary['approved'],
        'budgetUsd'            => 0,
        'spendYtdUsd'          => 0,
        'headcount'            => 0,
        'aiAgents'             => 0,
      );
    }
    // Node sorts by decisionsExecuted30d desc, then name asc.
    usort($departments, function ($a, $b) {
      if ($a['decisionsExecuted30d'] !== $b['decisionsExecuted30d']) return $b['decisionsExecuted30d'] <=> $a['decisionsExecuted30d'];
      return strcmp($a['name'], $b['name']);
    });

    $decisions_today = 0;
    foreach ($decisions as $decision) if (substr($decision['createdAt'], 0, 10) === $today) $decisions_today++;

    return array(
      'autonomyIndex'          => count($decisions) ? (int) round((count($resolved) / count($decisions)) * 100) : 0,
      'decisionsToday'         => $decisions_today,
      'humanOverrideRatePct'   => count($resolved) ? (int) round((count($rejected) / count($resolved)) * 100) : 0,
      'governanceCompliancePct' => count($decisions) ? 100 : 0,
      'budgetsTotalUsd'        => 0,
      'budgetsSpentYtdPct'     => 0,
      'departmentsCount'       => count($by_department),
      'boardSeats'             => 0,
      'aiExecutives'           => 0,
      'decisions'              => array_slice($decisions, 0, 50),
      'departments'            => $departments,
      'plans'                  => array(),
      'guardrails'             => array(array(
        'id'                => 'human-approval-required',
        'policy'            => 'No autonomous action is executed by this module. Every proposal requires an authenticated human decision.',
        'violations30d'     => 0,
        'blockedActions30d' => count($pending),
      )),
      'openApprovals'          => count($pending),
      'constitutionEnforced'   => count($decisions) ? 1 : 0,
      'autonomousSavings30dUsd' => (int) round($approved_impact),
      'impactKind'             => count($approved_recent) ? 'approved_estimate' : 'none',
    );
  }
}
