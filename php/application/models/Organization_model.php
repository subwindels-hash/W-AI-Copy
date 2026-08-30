<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Organization_model extends CI_Model {
 public function __construct(){parent::__construct();$this->load->database();}
 public function get_for_user($uid,$oid){$member=$this->db->where(array('user_id'=>$uid,'organization_id'=>$oid))->count_all_results('memberships');if(!$member)return NULL;return $this->db->where('id',$oid)->get('organizations')->row_array();}
 public function update($id,$set){$set['updated_at']=date('Y-m-d H:i:s');$this->db->where('id',$id)->update('organizations',$set);return $this->db->where('id',$id)->get('organizations')->row_array();}
 public function view($o){return array('id'=>$o['id'],'name'=>$o['name'],'slug'=>$o['slug'],'logoUrl'=>$o['logo_url'],'whiteLabel'=>json_decode($o['white_label']?:'{}',TRUE)?:array(),'createdAt'=>$o['created_at']);}
}
