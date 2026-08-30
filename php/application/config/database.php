<?php defined('BASEPATH') OR exit('No direct script access allowed');
$active_group = 'default'; $query_builder = TRUE;
$db['default'] = array(
 'dsn'=>'','port'=>(int)(getenv('VP_DB_PORT') ?: 3306),'hostname'=>getenv('VP_DB_HOST') ?: 'mysql','username'=>getenv('VP_DB_USER') ?: 'windels',
 'password'=>getenv('VP_DB_PASS') ?: 'windels','database'=>getenv('VP_DB_NAME') ?: 'windels',
 'dbdriver'=>'mysqli','dbprefix'=>'','pconnect'=>FALSE,'db_debug'=>(ENVIRONMENT !== 'production'),
 'cache_on'=>FALSE,'cachedir'=>'','char_set'=>'utf8mb4','dbcollat'=>'utf8mb4_unicode_ci',
 'swap_pre'=>'','encrypt'=>FALSE,'compress'=>FALSE,'stricton'=>TRUE,'failover'=>array(),'save_queries'=>ENVIRONMENT !== 'production'
);
