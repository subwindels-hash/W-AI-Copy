<?php defined('BASEPATH') OR exit('No direct script access allowed');
class Notifications extends MY_Controller {
 private $c;private $channels=array('in_app','push','email','sms');public function __construct(){parent::__construct();$this->c=$this->require_auth();if(!$this->c){$this->output->_display();exit;}$this->load->model('Notification_model','notifications');}
 public function index(){$limit=min(100,max(1,(int)($this->input->get('limit')?:20)));$offset=max(0,(int)($this->input->get('offset')?:0));$unread=$this->input->get('unreadOnly')==='true';return $this->respond(array('notifications'=>$this->notifications->all($this->c['sub'],$unread,$limit,$offset),'unreadCount'=>$this->notifications->unread($this->c['sub'])));}
 public function unread_count(){return $this->respond(array('count'=>$this->notifications->unread($this->c['sub'])));}
 public function read($id){if(!$this->notifications->read($id,$this->c['sub']))return $this->fail('NOT_FOUND','Notification not found',404);return $this->respond(array('markedAsRead'=>TRUE));}
 public function read_all(){return $this->respond(array('markedAsReadCount'=>$this->notifications->read_all($this->c['sub'])));}
 public function preferences(){if(in_array($this->input->method(TRUE),array('PATCH','PUT'),TRUE))return $this->update_preference();return $this->respond($this->notifications->preferences($this->c['sub']));}
 public function dismiss($id){if(!$this->notifications->dismiss($id,$this->c['sub']))return $this->fail('NOT_FOUND','Notification not found',404);return $this->respond(array('dismissed'=>TRUE));}
 private function update_preference(){$d=$this->body();$category=trim($d['category']??'');if($category===''||strlen($category)>100||!isset($d['channels'])||!is_array($d['channels'])||array_diff($d['channels'],$this->channels)||!isset($d['enabled'])||!is_bool($d['enabled']))return $this->fail('VALIDATION_ERROR','Valid category, channels, and enabled flag are required',422);$this->notifications->preference($this->c['sub'],$category,array_values(array_unique($d['channels'])),$d['enabled']);return $this->respond(array('updated'=>TRUE));}
}
