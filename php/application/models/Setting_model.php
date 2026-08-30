<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Setting_model extends CI_Model {
 public function __construct(){parent::__construct();$this->load->database();}
 public function all($org,$includePrivate=FALSE){$this->db->select('setting_key,setting_value,value_type,is_public');if(!$includePrivate)$this->db->where('is_public',1);$global=$this->db->get('application_settings')->result_array();$orgRows=$org?$this->db->select('setting_key,setting_value,value_type')->where('organization_id',$org)->get('organization_settings')->result_array():array();$out=array();foreach($global as $r)$out[$r['setting_key']]=$this->cast($r['setting_value'],$r['value_type']);foreach($orgRows as $r)$out[$r['setting_key']]=$this->cast($r['setting_value'],$r['value_type']);return $out;}
 public function update_org($org,$actor,$changes){$this->db->trans_start();foreach($changes as $key=>$item){$row=array('organization_id'=>$org,'setting_key'=>$key,'setting_value'=>$this->encode($item['value'],$item['type']),'value_type'=>$item['type'],'updated_by'=>$actor,'updated_at'=>date('Y-m-d H:i:s'));$this->db->replace('organization_settings',$row);}$this->db->trans_complete();return $this->db->trans_status();}
 public function public_settings(){return $this->all(NULL,FALSE);}
 private function cast($v,$t){if($t==='boolean')return in_array(strtolower((string)$v),array('1','true','yes'),TRUE);if($t==='integer')return (int)$v;if($t==='json')return json_decode($v,TRUE);return $v;}
 private function encode($v,$t){if($t==='boolean')return $v?'true':'false';if($t==='integer')return (string)(int)$v;if($t==='json')return json_encode($v,JSON_UNESCAPED_SLASHES);return (string)$v;}
}
