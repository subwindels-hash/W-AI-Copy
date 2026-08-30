<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Account_model extends CI_Model {
 public function __construct(){parent::__construct();$this->load->database();}
 public function snapshot($id){$u=$this->db->where('id',$id)->get('users')->row_array();if(!$u)return NULL;$now=time();return array('id'=>$u['id'],'publicUserId'=>$u['public_user_id'],'username'=>$u['username'],'email'=>$u['email'],'emailPending'=>$u['pending_email'],'displayName'=>$u['display_name'],'avatarUrl'=>$u['avatar_url'],'role'=>strtolower($u['role']),'isActive'=>(bool)$u['is_active'],'isSuspended'=>(bool)$u['is_suspended'],'pinSet'=>!empty($u['pin_hash']),'pinExpired'=>!empty($u['pin_expires_at'])&&strtotime($u['pin_expires_at'])<$now,'pinExpiresAt'=>$u['pin_expires_at']?gmdate('c',strtotime($u['pin_expires_at'])):NULL,'pinIssuedPending'=>!empty($u['issued_pin_cipher'])&&strtotime($u['issued_pin_expires_at'])>$now);}
 public function user($id){return $this->db->where('id',$id)->get('users')->row_array();}
 public function update($id,$data){$data['updated_at']=date('Y-m-d H:i:s');$this->db->where('id',$id)->update('users',$data);if($this->db->affected_rows()<0)throw new RuntimeException('Update failed');return $this->snapshot($id);}
 public function username_exists($v,$except){return $this->db->where('username',$v)->where('id !=',$except)->count_all_results('users')>0;}
 public function email_exists($v,$except){return $this->db->group_start()->where('email',$v)->or_where('pending_email',$v)->group_end()->where('id !=',$except)->count_all_results('users')>0;}
 public function audit($uid,$org,$type,$payload=array()){$this->db->insert('audit_events',array('organization_id'=>$org,'user_id'=>$uid,'event_type'=>$type,'payload'=>json_encode($payload),'ip_address'=>$this->input->ip_address(),'created_at'=>date('Y-m-d H:i:s')));}
}
