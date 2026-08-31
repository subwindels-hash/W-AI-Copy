<?php defined('BASEPATH') OR exit('No direct script access allowed');
class MY_Controller extends CI_Controller {
 protected $started; protected $identity;
 protected $response_status = 200;
 public function __construct(){ parent::__construct(); $this->started=microtime(TRUE); $this->output->set_content_type('application/json'); $this->load->library('security_headers'); $this->security_headers->apply();
  // Every request opens a root span and increments the request counters. This
  // is what makes GET /api/v1/platform/metrics and /traces report real data
  // instead of the empty shapes they would show if nothing ever recorded
  // anything. Failures here are swallowed: telemetry must never break a
  // request.
  try { $this->load->library('telemetry'); $this->telemetry->begin_request($this->span_name(), array(
    'method' => (string)($_SERVER['REQUEST_METHOD'] ?? 'GET'),
    'route'  => substr((string)$this->uri->uri_string(), 0, 120),
    'requestId' => $this->request_id(),
  )); } catch (Throwable $e) { /* no telemetry for this request */ }
 }
 /** Close the root span and record duration + status once the response exists. */
 public function __destruct(){
  try {
   if (isset($this->telemetry)) {
    $this->telemetry->end_request($this->response_status, array(
      'userId'         => is_array($this->identity) ? ($this->identity['sub'] ?? NULL) : NULL,
      'organizationId' => is_array($this->identity) ? ($this->identity['organizationId'] ?? NULL) : NULL,
      'route'          => trim((string)$this->uri->uri_string(), '/'),
    ));
   }
  } catch (Throwable $e) { /* never let telemetry break the response */ }
 }
 private function span_name(){
  $method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
  $route  = trim((string)$this->uri->uri_string(), '/');
  return $method . ' /' . $route;
 }
 protected function body(){ $raw=$this->input->raw_input_stream; $data=json_decode($raw,TRUE); return is_array($data)?$data:$this->input->post(NULL,TRUE); }
 protected function respond($data,$status=200){ $this->response_status=$status; return $this->output->set_status_header($status)->set_output(json_encode(array('ok'=>TRUE,'data'=>$data,'meta'=>array('requestId'=>$this->request_id(),'tookMs'=>(int)((microtime(TRUE)-$this->started)*1000))),JSON_UNESCAPED_SLASHES)); }
 protected function fail($code,$message,$status=400,$details=NULL){ $this->response_status=$status; $e=array('code'=>$code,'message'=>$message); if($details!==NULL)$e['details']=$details; return $this->output->set_status_header($status)->set_output(json_encode(array('ok'=>FALSE,'error'=>$e,'meta'=>array('requestId'=>$this->request_id())))); }
 protected function request_id(){ return isset($_SERVER['HTTP_X_REQUEST_ID'])?substr($_SERVER['HTTP_X_REQUEST_ID'],0,100):bin2hex(random_bytes(12)); }
 protected function token($claims,$ttl=900){ $now=time(); $claims+=array('iat'=>$now,'exp'=>$now+$ttl,'iss'=>getenv('JWT_ISSUER')?:'windels-php'); $h=$this->b64(json_encode(array('alg'=>'HS256','typ'=>'JWT'))); $p=$this->b64(json_encode($claims)); return $h.'.'.$p.'.'.$this->b64(hash_hmac('sha256',$h.'.'.$p,$this->secret(),TRUE)); }
 protected function require_auth(){ $header=$this->input->get_request_header('Authorization',TRUE); if(!preg_match('/^Bearer\s+(.+)$/i',(string)$header,$m)) { $this->fail('UNAUTHORIZED','Authentication required',401); return FALSE; } $parts=explode('.',$m[1]); if(count($parts)!==3) { $this->fail('INVALID_TOKEN','Invalid access token',401); return FALSE; } $expected=$this->b64(hash_hmac('sha256',$parts[0].'.'.$parts[1],$this->secret(),TRUE)); if(!hash_equals($expected,$parts[2])) { $this->fail('INVALID_TOKEN','Invalid access token',401); return FALSE; } $claims=json_decode($this->unb64($parts[1]),TRUE); if(!$claims || ($claims['exp']??0)<time()) { $this->fail('TOKEN_EXPIRED','Access token expired',401); return FALSE; } $this->identity=$claims; return $claims; }
 protected function secret(){ $s=getenv('VP_AUTH_SECRET'); if(!$s || strlen($s)<32) { if(ENVIRONMENT==='production') throw new RuntimeException('JWT_SECRET must be at least 32 characters'); $s='development-only-secret-change-me-now'; } return $s; }
 protected function b64($v){ return rtrim(strtr(base64_encode($v),'+/','-_'),'='); } protected function unb64($v){ return base64_decode(strtr($v,'-_','+/')); }
 protected function optional_auth(){ $header=$this->input->get_request_header('Authorization',TRUE); if(!preg_match('/^Bearer\s+(.+)$/i',(string)$header,$m))return NULL;$parts=explode('.',$m[1]);if(count($parts)!==3)return NULL;$expected=$this->b64(hash_hmac('sha256',$parts[0].'.'.$parts[1],$this->secret(),TRUE));if(!hash_equals($expected,$parts[2]))return NULL;$claims=json_decode($this->unb64($parts[1]),TRUE);return $claims&&($claims['exp']??0)>=time()?$claims:NULL;}
}
