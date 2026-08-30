<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Health extends MY_Controller {
 /**
  * /healthz — used after a deployment to confirm, without any Terminal, that
  * the database connection works and whether the first administrator still has
  * to be created.
  */
 public function index(){
  $db='ok'; $error=NULL;
  try{ $this->load->database(); $this->db->query('SELECT 1'); }
  catch(Throwable $e){ $db='error'; $error='Database connection failed: '.$e->getMessage(); }

  $bootstrap='unknown';
  if($db==='ok'){
   try{ $bootstrap=((int)$this->db->count_all('users')>0) ? 'complete' : 'pending'; }
   catch(Throwable $e){ $bootstrap='unknown'; }
  }

  $payload=array(
   'service'=>'windels-php-api',
   'status'=>$db==='ok'?'ok':'degraded',
   'version'=>'1.0.0',
   'timestamp'=>gmdate('c'),
   'checks'=>array('db'=>$db),
   'bootstrap'=>$bootstrap
  );
  if($error!==NULL) $payload['error']=$error;
  if($bootstrap==='pending') $payload['nextStep']='Create the first administrator at /setup?key=YOUR_VP_SETUP_KEY, or import database/seed-admin.sql.';
  return $this->respond($payload,$db==='ok'?200:503);
 }

 public function deep(){ return $this->index(); }
}
