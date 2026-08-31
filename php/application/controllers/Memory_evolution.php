<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Memory_evolution — Session 47 Enterprise Memory Evolution Engine.
 *
 * Port of apps/api/src/http/routes/memoryEvolution.ts (6 routes):
 *
 *   GET  /api/v1/memory-evolution/dashboard/rollup
 *   GET  /api/v1/memory-evolution/memories
 *   POST /api/v1/memory-evolution/memories
 *   POST /api/v1/memory-evolution/consolidate
 *   GET  /api/v1/memory-evolution/consolidations
 *   POST /api/v1/memory-evolution/memories/:id/share
 *
 * The gate is copied from Node: `authenticate` plus an ORG_ADMIN check, which
 * Node answers with 403 "Admins only". Unlike the other ported modules this
 * one is NOT organization-scoped in Node — its Redis keys (`me:mems`,
 * `me:mem:<id>`, …) carry no organization segment, so every tenant shares one
 * register and the admin gate is the only thing in front of it.
 *
 * This port scopes the register by organization_id instead, because a memory
 * register holds enterprise knowledge (project plans, team rituals, user
 * preferences) and an admin of one organization reading another's memories is
 * a leak rather than a feature. The divergence is documented in migration
 * 009_memory_evolution_module.sql; everything the module actually does — the
 * nine types, the 1%-per-day decay, the 0.2 recall floor, the 0.05/0.5 forget
 * threshold, deduplication by content within a scope and the consolidation
 * kinds — is unchanged.
 */
class Memory_evolution extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->org = isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL;
    if (!$this->org) {
      $this->fail('FORBIDDEN', 'The memory register is organization-scoped and this session carries no organization.', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Permission_model', 'permissions');
    if (!$this->permissions->has($this->c['sub'], 'ORG_ADMIN', $this->org)) {
      $this->fail('FORBIDDEN', 'Admins only', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Memory_evolution_model', 'me');
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/memory-evolution/dashboard/rollup
  // ---------------------------------------------------------------------------
  public function dashboard_rollup() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->me->dashboard($this->org));
  }

  // ---------------------------------------------------------------------------
  // GET  /api/v1/memory-evolution/memories
  // POST /api/v1/memory-evolution/memories
  // ---------------------------------------------------------------------------
  public function memories_dispatch() {
    $method = $this->input->method(TRUE);
    if ($method === 'GET') return $this->memories_recall();
    if ($method === 'POST') return $this->memories_add();
    return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
  }

  /**
   * Recall. Node validates the query with a loose schema — `type` is any
   * string, not an enum, so an unknown type is an empty result rather than a
   * 422; only `limit` has to be a positive integer.
   */
  private function memories_recall() {
    $limit = $this->input->get('limit');
    if ($limit !== NULL && $limit !== '' && (!is_numeric($limit) || (int) $limit < 1 || (string) (int) $limit !== (string) $limit)) {
      return $this->fail('VALIDATION_ERROR', 'limit must be a positive integer', 422);
    }
    return $this->respond($this->me->recall($this->org, array(
      'type'  => $this->input->get('type'),
      'scope' => $this->input->get('scope'),
      'query' => $this->input->get('query'),
      'limit' => $limit === NULL || $limit === '' ? 20 : (int) $limit,
    )));
  }

  private function memories_add() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_add($body);
    if ($input === NULL) return NULL;
    return $this->respond($this->me->add($this->org, $input));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/memory-evolution/consolidate
  // ---------------------------------------------------------------------------
  public function consolidate() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    $body = $this->body_array();
    if ($body === NULL) return NULL;

    // Node defaults the kind to "merge" when the body omits it.
    $kind = array_key_exists('kind', $body) ? $body['kind'] : 'merge';
    if (!is_string($kind) || !in_array($kind, $this->me::$KINDS, TRUE)) {
      return $this->fail('VALIDATION_ERROR', 'kind must be one of: ' . implode(', ', $this->me::$KINDS), 422);
    }

    $job = $this->me->consolidate($this->org, $kind);
    $this->emit_kernel('memory-evolution.consolidated', array('kind' => $kind, 'affected' => $job['affected']));
    return $this->respond($job);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/memory-evolution/consolidations
  // ---------------------------------------------------------------------------
  public function consolidations() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->me->list_consolidations($this->org, 50));
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/memory-evolution/memories/:id/share
  // ---------------------------------------------------------------------------
  public function memory_share($id = NULL) {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    if (!$this->valid_memory_id($id)) return NULL;

    $body = $this->body_array();
    if ($body === NULL) return NULL;
    // Node's schema is `z.object({ agentId: z.string() })` — any string,
    // including an empty one, and no length limit. The id is not stored, only
    // echoed back, so this mirrors that rather than tightening it.
    if (!array_key_exists('agentId', $body)) return $this->fail('VALIDATION_ERROR', 'agentId is required', 422);
    if (!is_string($body['agentId'])) return $this->fail('VALIDATION_ERROR', 'agentId must be a string', 422);

    $shared = $this->me->share($this->org, (string) $id, $body['agentId']);
    $this->emit_kernel('memory-evolution.shared', array('memoryId' => (string) $id, 'agentId' => $body['agentId']));
    return $this->respond($shared);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private function body_array() {
    $body = $this->body();
    if (!is_array($body) || ($body !== array() && array_is_list($body))) {
      $this->fail('VALIDATION_ERROR', 'A JSON object body is required', 422);
      return NULL;
    }
    return $body;
  }

  private function validate_add($body) {
    $errors = array();
    $input  = array();

    if (!isset($body['type']) || !is_string($body['type']) || !in_array($body['type'], $this->me::$TYPES, TRUE)) {
      $errors[] = 'type must be one of: ' . implode(', ', $this->me::$TYPES);
    } else {
      $input['type'] = $body['type'];
    }

    if (!isset($body['content']) || !is_string($body['content']) || strlen($body['content']) < 1) {
      $errors[] = 'content is required';
    } else {
      $input['content'] = $body['content'];
    }

    if (array_key_exists('tags', $body) && $body['tags'] !== NULL) {
      if (!is_array($body['tags']) || !array_is_list($body['tags'])) {
        $errors[] = 'tags must be an array of strings';
      } else {
        foreach ($body['tags'] as $tag) {
          if (!is_string($tag)) { $errors[] = 'tags must be an array of strings'; break; }
        }
        $input['tags'] = array_values($body['tags']);
      }
    }

    if (array_key_exists('scope', $body) && $body['scope'] !== NULL) {
      if (!is_string($body['scope']) || strlen($body['scope']) > 200) $errors[] = 'scope must be a string of at most 200 characters';
      else $input['scope'] = $body['scope'];
    }

    if (array_key_exists('confidence', $body) && $body['confidence'] !== NULL) {
      if (!is_numeric($body['confidence']) || !is_finite((float) $body['confidence'])) {
        $errors[] = 'confidence must be a number between 0 and 1';
      } else {
        $confidence = (float) $body['confidence'];
        if ($confidence < 0 || $confidence > 1) $errors[] = 'confidence must be between 0 and 1';
        else $input['confidence'] = $confidence;
      }
    }

    if (count($errors)) { $this->fail('VALIDATION_ERROR', implode('; ', $errors), 422); return NULL; }
    return $input;
  }

  private function valid_memory_id($id) {
    if (!is_string($id) || strlen($id) < 1 || strlen($id) > 64) {
      $this->fail('VALIDATION_ERROR', 'id must be between 1 and 64 characters', 422);
      return FALSE;
    }
    return TRUE;
  }

  /**
   * Node emits memory-evolution.* through the kernel service, best effort.
   * The PHP kernel records events in kernel_events (migration 002); if that
   * table is absent the consolidation still stands.
   */
  private function emit_kernel($kind, $payload) {
    try {
      if (!$this->db->table_exists('kernel_events')) return;
      $this->load->model('Kernel_model', 'kernel');
      $this->kernel->dispatch(
        array('kind' => $kind, 'source' => 'memory-evolution', 'payload' => $payload),
        $this->org,
        $this->c['sub']
      );
    } catch (Exception $error) { /* the register is authoritative */ }
  }
}
