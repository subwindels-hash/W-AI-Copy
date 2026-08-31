<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * V76_validation — Session 76 Final Enterprise Integration & Validation.
 *
 * Port of apps/api/src/http/routes/v76validation.ts (7 routes):
 *
 *   POST   /api/v1/validation/run
 *   GET    /api/v1/validation/report
 *   GET    /api/v1/validation/history
 *   GET    /api/v1/validation/notes
 *   POST   /api/v1/validation/notes
 *   PATCH  /api/v1/validation/notes/:id
 *   DELETE /api/v1/validation/notes/:id
 *
 * Node puts `authenticate` and an ORG_ADMIN check on the whole router, so
 * every route is administrator-only — 403 "Admins only" for a plain member.
 *
 * THE RULE THIS CONTROLLER EXISTS TO PROTECT: a check that did not run is
 * reported as not passed.
 *
 * Node's report hard-codes sixteen of its thirty-five systems as `wired`
 * because someone once wrote a sentence describing them, and passes fifteen of
 * its twenty-two checklist items the same way — "verified in S81 e2e", "csurf
 * middleware mounted in server.ts". Worst of all, its consent-gate probe sets
 * `consentGateOk = true` inside the catch block, so a probe whose dependency
 * failed to import reports success with the detail "verified in prior e2e
 * run". A validation report like that is worse than no report: it is a
 * compliance artefact that says everything is fine because nothing was
 * measured.
 *
 * This port measures what a request can measure — table presence for every
 * module, a kernel dispatch counted back, the provider registry, the rate-limit
 * counter, the CSRF posture against the auth transport, and the ORG_ADMIN
 * check that admitted the request — and reports every other item as not passed
 * with the reason. On this build that means roughly a dozen systems wired,
 * four stub, the rest missing, and a checklist that fails closed. That is the
 * truthful picture of a build with 40 of 156 modules ported, and it is the
 * only picture worth showing.
 *
 * Nothing is seeded. `GET /report` on an organization with no report runs the
 * first one and stores it, which is Node's behaviour, and every other read
 * returns what is on file.
 */
class V76_validation extends MY_Controller {

  private $c;
  private $org;

  public function __construct() {
    parent::__construct();
    $this->c = $this->require_auth();
    if (!$this->c) { $this->output->_display(); exit; }
    $this->org = isset($this->c['organizationId']) ? $this->c['organizationId'] : NULL;
    if (!$this->org) {
      $this->fail('FORBIDDEN', 'The validation register is organization-scoped and this session carries no organization.', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('Permission_model', 'permissions');
    if (!$this->permissions->has($this->c['sub'], 'ORG_ADMIN', $this->org)) {
      $this->fail('FORBIDDEN', 'Admins only', 403);
      $this->output->_display();
      exit;
    }
    $this->load->model('V76_validation_model', 'v76');
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/validation/run — re-run every probe
  // ---------------------------------------------------------------------------
  public function run() {
    if ($this->input->method(TRUE) !== 'POST') return $this->fail('METHOD_NOT_ALLOWED', 'POST required', 405);
    return $this->respond($this->v76->run_report($this->org, $this->c['sub']));
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/validation/report
  //
  // Node returns the last persisted report, and runs the first one when the
  // organization has none — that is what the legacy /validation/report caller
  // and the e2e suite expect. Kept: a read that seeds itself is unusual, but
  // changing it would make a fresh organization's console empty in a way the
  // client does not handle.
  // ---------------------------------------------------------------------------
  public function report() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    $last = $this->v76->last_report($this->org);
    if ($last !== NULL) return $this->respond($last);
    return $this->respond($this->v76->run_report($this->org, $this->c['sub']));
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/validation/history
  // ---------------------------------------------------------------------------
  public function history() {
    if ($this->input->method(TRUE) !== 'GET') return $this->fail('METHOD_NOT_ALLOWED', 'GET required', 405);
    return $this->respond($this->v76->history($this->org));
  }

  // ---------------------------------------------------------------------------
  // GET    /api/v1/validation/notes
  // POST   /api/v1/validation/notes
  // PATCH  /api/v1/validation/notes/:id
  // DELETE /api/v1/validation/notes/:id
  //
  // CodeIgniter routes on URI only, so all four arrive here and the verb
  // decides. Node defines no GET /notes/:id — Express simply has no such route
  // — so that combination is a 404 here, not a 405.
  // ---------------------------------------------------------------------------
  public function notes_dispatch($id = NULL) {
    $method = $this->input->method(TRUE);

    if ($id === NULL) {
      if ($method === 'GET') return $this->respond($this->v76->list_notes($this->org, 200));
      if ($method === 'POST') return $this->notes_create();
      return $this->fail('METHOD_NOT_ALLOWED', 'GET or POST required', 405);
    }

    if (!$this->valid_note_id($id)) return NULL;
    if ($method === 'PATCH') return $this->notes_update((string) $id);
    if ($method === 'DELETE') return $this->notes_delete((string) $id);
    if ($method === 'GET') return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->fail('METHOD_NOT_ALLOWED', 'PATCH or DELETE required', 405);
  }

  private function notes_create() {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, FALSE);
    if ($input === NULL) return NULL;
    return $this->respond($this->v76->create_note($this->org, $input, $this->c['sub']), 201);
  }

  private function notes_update($id) {
    $body = $this->body_array();
    if ($body === NULL) return NULL;
    $input = $this->validate_note($body, TRUE);
    if ($input === NULL) return NULL;
    // An empty patch is a no-op that still returns the note, as Node does.
    $note = $this->v76->update_note($this->org, $id, $input);
    return $note ? $this->respond($note) : $this->fail('NOT_FOUND', 'Note not found', 404);
  }

  private function notes_delete($id) {
    if (!$this->v76->delete_note($this->org, $id)) return $this->fail('NOT_FOUND', 'Note not found', 404);
    return $this->output->set_status_header(204)->set_output('');
  }

  // ---------------------------------------------------------------------------
  // Validation — the note schema from the route file
  // ---------------------------------------------------------------------------

  /** The body must be a JSON object; anything else is a 422, not a 500. */
  private function body_array() {
    $body = $this->body();
    if (!is_array($body) || ($body !== array() && array_is_list($body))) {
      $this->fail('VALIDATION_ERROR', 'A JSON object body is required', 422);
      return NULL;
    }
    return $body;
  }

  private function fail_fields($errors) {
    return $this->fail('VALIDATION_ERROR', implode('; ', $errors), 422);
  }

  private function opt_string($body, $field, &$errors, $min, $max) {
    if (!array_key_exists($field, $body)) return NULL;
    $value = $body[$field];
    if (!is_string($value) || strlen($value) < $min || strlen($value) > $max) {
      $errors[] = $field . ' must be a string of ' . $min . ' to ' . $max . ' characters';
      return NULL;
    }
    return $value;
  }

  /** POST and PATCH /notes — the tenantStore note schema. */
  private function validate_note($body, $partial) {
    $errors = array();
    $input  = array();

    $has_title = array_key_exists('title', $body);
    $has_body  = array_key_exists('body', $body);
    $has_tags  = array_key_exists('tags', $body);

    if ($has_title) {
      $title = $this->opt_string($body, 'title', $errors, 2, 200);
      if ($title !== NULL) $input['title'] = $title;
    } elseif (!$partial) {
      $errors[] = 'title is required';
    }

    if ($has_body) {
      $text = $this->opt_string($body, 'body', $errors, 2, 4000);
      if ($text !== NULL) $input['body'] = $text;
    } elseif (!$partial) {
      $errors[] = 'body is required';
    }

    if ($has_tags) {
      $tags = $body['tags'];
      if (!is_array($tags) || array_is_list($tags) === FALSE || count($tags) > 20) {
        $errors[] = 'tags must be an array of at most 20 strings';
      } else {
        $bad = FALSE;
        foreach ($tags as $tag) {
          if (!is_string($tag) || strlen($tag) > 40) { $bad = TRUE; break; }
        }
        if ($bad) $errors[] = 'each tag must be a string of at most 40 characters';
        else $input['tags'] = array_values($tags);
      }
    } elseif (!$partial) {
      // z.array(...).default([]): a note created without tags gets none.
      $input['tags'] = array();
    }

    if (count($errors)) { $this->fail_fields($errors); return NULL; }
    return $input;
  }

  /** Node validates the note id: 3 to 64 characters, else 422. */
  private function valid_note_id($id) {
    if (!is_string($id) || strlen($id) < 3 || strlen($id) > 64) {
      $this->fail('VALIDATION_ERROR', 'id must be between 3 and 64 characters', 422);
      return FALSE;
    }
    return TRUE;
  }
}
