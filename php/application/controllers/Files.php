<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Files extends MY_Controller {
 public function index(){ $c=$this->require_auth();if(!$c)return;if($this->input->method(TRUE)!=='POST')return $this->fail('METHOD_NOT_ALLOWED','POST required',405);$max=(int)(getenv('VP_UPLOAD_MAX_KB')?:10240);$config=array('upload_path'=>FCPATH.'assets/uploads/','allowed_types'=>'jpg|jpeg|png|gif|webp|pdf|txt|csv|doc|docx|xls|xlsx','max_size'=>$max,'encrypt_name'=>TRUE);$this->load->library('upload',$config);if(!$this->upload->do_upload('file'))return $this->fail('UPLOAD_FAILED',strip_tags($this->upload->display_errors('','')),422);$f=$this->upload->data();return $this->respond(array('id'=>$f['raw_name'],'name'=>$f['client_name'],'size'=>$f['file_size']*1024,'mime'=>$f['file_type'],'url'=>rtrim(base_url(),'/').'/assets/uploads/'.$f['file_name']),201); }
 /**
  * Download an uploaded file. POST /api/v1/files returns `raw_name` as the id,
  * which has no extension, so look for a stored file with any extension before
  * giving up — otherwise the id the upload returned could never be fetched.
  */
 public function show($name){if(!$this->require_auth())return;$safe=basename($name);$path=FCPATH.'assets/uploads/'.$safe;if(!is_file($path)){$matches=glob(FCPATH.'assets/uploads/'.$safe.'.*');if($matches&&is_file($matches[0]))$path=$matches[0];}if(!is_file($path))return $this->fail('NOT_FOUND','File not found',404);$this->output->set_content_type(mime_content_type($path)?:'application/octet-stream')->set_output(file_get_contents($path));}
}
