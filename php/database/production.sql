SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS organizations (id CHAR(36) PRIMARY KEY,name VARCHAR(100) NOT NULL,slug VARCHAR(140) NOT NULL UNIQUE,logo_url TEXT NULL,white_label JSON NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS users (id CHAR(36) PRIMARY KEY,email VARCHAR(191) NOT NULL UNIQUE,username VARCHAR(30) NULL UNIQUE,public_user_id VARCHAR(24) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,display_name VARCHAR(100) NULL,avatar_url TEXT NULL,bio TEXT NULL,pending_email VARCHAR(191) NULL,email_change_token_hash CHAR(64) NULL,email_change_expires_at DATETIME NULL,pin_hash VARCHAR(255) NULL,pin_expires_at DATETIME NULL,issued_pin_cipher TEXT NULL,issued_pin_expires_at DATETIME NULL,mfa_secret_cipher TEXT NULL,mfa_recovery_hashes JSON NULL,mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,mfa_enrollment_state ENUM('none','pending','confirmed','unrecorded') NOT NULL DEFAULT 'none',mfa_started_at DATETIME NULL,mfa_confirmed_at DATETIME NULL,mfa_last_verified_at DATETIME NULL,mfa_last_method ENUM('totp','recovery') NULL,mfa_last_counter BIGINT NULL,mfa_failures TINYINT UNSIGNED NOT NULL DEFAULT 0,mfa_first_failure_at DATETIME NULL,mfa_last_failure_at DATETIME NULL,mfa_locked_at DATETIME NULL,mfa_locked_until DATETIME NULL,role ENUM('USER','ADMIN','SUPER_ADMIN') NOT NULL DEFAULT 'USER',locale VARCHAR(16) NOT NULL DEFAULT 'en-US',timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',theme VARCHAR(20) NOT NULL DEFAULT 'dark',is_active TINYINT(1) NOT NULL DEFAULT 1,is_suspended TINYINT(1) NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS memberships (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,organization_id CHAR(36) NOT NULL,role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',joined_at DATETIME NOT NULL,UNIQUE KEY uq_membership(user_id,organization_id),CONSTRAINT fk_membership_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_membership_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS refresh_tokens (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,expires_at DATETIME NOT NULL,revoked_at DATETIME NULL,created_at DATETIME NOT NULL,KEY idx_refresh_user(user_id),CONSTRAINT fk_refresh_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,organization_id CHAR(36) NULL,user_id CHAR(36) NULL,event_type VARCHAR(100) NOT NULL,payload JSON NULL,ip_address VARCHAR(45) NULL,user_agent VARCHAR(500) NULL,request_id VARCHAR(100) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_audit_org_time(organization_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS permissions (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY(role_id,permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS application_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NULL,
  value_type ENUM('string','integer','boolean','json') NOT NULL DEFAULT 'string',
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NULL,
  body MEDIUMTEXT NOT NULL,
  format ENUM('text','html','markdown') NOT NULL DEFAULT 'html',
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS schema_versions (
  version VARCHAR(40) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles(code,name) VALUES ('USER','User'),('ADMIN','Administrator'),('SUPER_ADMIN','Super Administrator');
INSERT IGNORE INTO permissions(code,description) VALUES
 ('account.read','View own account'),('account.update','Update own account'),('files.upload','Upload files'),
 ('organization.read','View organization'),('organization.manage','Manage organization'),('users.manage','Manage organization users'),
 ('settings.manage','Manage application settings'),('audit.read','View audit history'),('system.manage','Manage the platform');
INSERT IGNORE INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='SUPER_ADMIN';
INSERT IGNORE INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('account.read','account.update','files.upload','organization.read','organization.manage','users.manage','audit.read') WHERE r.code='ADMIN';
INSERT IGNORE INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('account.read','account.update','files.upload','organization.read') WHERE r.code='USER';
INSERT IGNORE INTO application_settings(setting_key,setting_value,value_type,is_public) VALUES
 ('application.name','WINDELS AI OS','string',1),('application.version','1.0.0','string',1),
 ('registration.enabled','true','boolean',1),('uploads.enabled','true','boolean',0),('uploads.max_kb','10240','integer',0),
 ('security.password_min_length','10','integer',0),('security.access_token_ttl','900','integer',0),
 ('security.refresh_token_ttl','604800','integer',0),('mail.from_name','WINDELS AI OS','string',0);
INSERT IGNORE INTO templates(code,name,subject,body,format) VALUES
 ('password-reset','Password reset','Reset your password','Use the secure password reset link supplied in this message.','text'),
 ('welcome','Welcome','Welcome to WINDELS AI OS','Your account is ready.','text');
INSERT IGNORE INTO schema_versions(version) VALUES ('2026.08-cpanel-initial');

CREATE TABLE IF NOT EXISTS workspaces (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE KEY uq_workspace_slug(organization_id,slug),
 CONSTRAINT fk_workspace_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tasks (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, workspace_id CHAR(36) NULL, creator_id CHAR(36) NOT NULL,
 assignee_id CHAR(36) NULL, agent_id CHAR(36) NULL, title VARCHAR(200) NOT NULL, description TEXT NULL,
 status ENUM('TODO','IN_PROGRESS','BLOCKED','DONE','CANCELLED') NOT NULL DEFAULT 'TODO', priority ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
 progress TINYINT UNSIGNED NOT NULL DEFAULT 0, due_date DATETIME NULL, completed_at DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_task_org_status(organization_id,status), KEY idx_task_workspace(workspace_id), CONSTRAINT fk_task_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_task_workspace FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL, CONSTRAINT fk_task_creator FOREIGN KEY(creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS activities (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id CHAR(36) NOT NULL, workspace_id CHAR(36) NULL, user_id CHAR(36) NULL,
 type VARCHAR(40) NOT NULL, message VARCHAR(500) NOT NULL, metadata JSON NULL, created_at DATETIME NOT NULL,
 KEY idx_activity_org_time(organization_id,created_at), CONSTRAINT fk_activity_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_permissions (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, permission_id SMALLINT UNSIGNED NOT NULL, resource_id CHAR(36) NULL,
 granted_by CHAR(36) NOT NULL, created_at DATETIME NOT NULL,
 UNIQUE KEY uq_user_permission_resource(user_id,permission_id,resource_id), KEY idx_user_permissions_user(user_id),
 CONSTRAINT fk_up_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_up_permission FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
 CONSTRAINT fk_up_actor FOREIGN KEY(granted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
('ORG_READ','View organization'),('ORG_WRITE','Update organization'),('ORG_ADMIN','Administer organization'),
('WORKFLOW_READ','View workflows'),('WORKFLOW_WRITE','Update workflows'),('WORKFLOW_RUN','Run workflows'),
('AGENT_READ','View agents'),('AGENT_WRITE','Update agents'),('TALK_READ','View talk'),('TALK_WRITE','Use talk'),
('CANVAS_READ','View canvases'),('CANVAS_WRITE','Update canvases'),('BILLING_READ','View billing'),('BILLING_WRITE','Manage billing'),
('DEVELOPER_READ','View developer tools'),('DEVELOPER_WRITE','Manage developer tools'),('AUDIT_READ','View audit history'),
('NFC_READ','View NFC'),('NFC_WRITE','Manage NFC'),('NFC_DESTRUCTIVE','Perform destructive NFC operations'),('NFC_ADMIN','Administer NFC'),
('CLOUD_ANDROID_READ','View Cloud Android'),('CLOUD_ANDROID_CONTROL','Control Cloud Android'),('CLOUD_ANDROID_MANAGE','Manage Cloud Android'),
('CLOUD_ANDROID_APP','Manage Cloud Android apps'),('CLOUD_ANDROID_FILE','Manage Cloud Android files'),('CLOUD_ANDROID_SENSITIVE','Use sensitive Cloud Android operations'),
('CLOUD_ANDROID_ADMIN','Administer Cloud Android'),('ADMIN_STAR','Full platform access');
INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='SUPER_ADMIN';
INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code <> 'ADMIN_STAR' WHERE r.code='ADMIN';
INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN
('ORG_READ','WORKFLOW_READ','WORKFLOW_WRITE','WORKFLOW_RUN','AGENT_READ','AGENT_WRITE','TALK_READ','TALK_WRITE','CANVAS_READ','CANVAS_WRITE','NFC_READ','NFC_WRITE','CLOUD_ANDROID_READ','CLOUD_ANDROID_CONTROL','CLOUD_ANDROID_APP','CLOUD_ANDROID_FILE') WHERE r.code='USER';

CREATE TABLE IF NOT EXISTS organization_settings (
 organization_id CHAR(36) NOT NULL, setting_key VARCHAR(100) NOT NULL, setting_value TEXT NULL,
 value_type ENUM('string','integer','boolean','json') NOT NULL DEFAULT 'string', updated_by CHAR(36) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,setting_key), CONSTRAINT fk_org_setting_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_org_setting_user FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO application_settings(setting_key,setting_value,value_type,is_public) VALUES
('organization.default_locale','en-US','string',0),('organization.default_timezone','UTC','string',0),
('organization.allow_member_invites','true','boolean',0),('organization.audit_retention_days','365','integer',0),
('security.session_idle_minutes','120','integer',0),('security.require_mfa_admin','false','boolean',0);

CREATE TABLE IF NOT EXISTS model_registry (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NULL, provider VARCHAR(40) NOT NULL, model_id VARCHAR(100) NOT NULL,
 name VARCHAR(100) NOT NULL, version VARCHAR(40) NOT NULL DEFAULT '1.0', description VARCHAR(1000) NULL,
 capabilities JSON NOT NULL, context_window INT UNSIGNED NOT NULL DEFAULT 128000, max_output_tokens INT UNSIGNED NOT NULL DEFAULT 4096,
 cost_input_per_1k DECIMAL(14,8) NOT NULL DEFAULT 0, cost_output_per_1k DECIMAL(14,8) NOT NULL DEFAULT 0,
 is_default TINYINT(1) NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, config JSON NOT NULL,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_model_org_provider_version(organization_id,provider,model_id,version), KEY idx_model_registry_org(organization_id,enabled),
 CONSTRAINT fk_model_registry_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO model_registry(id,organization_id,provider,model_id,name,version,description,capabilities,context_window,max_output_tokens,cost_input_per_1k,cost_output_per_1k,is_default,enabled,config,created_at,updated_at) VALUES
('00000000-0000-4000-8000-000000000101',NULL,'windels','windels-assistant','Windels Assistant','1.0','Default Windels assistant model','["chat","tools","vision"]',128000,4096,0,0,1,1,'{}',NOW(),NOW()),
('00000000-0000-4000-8000-000000000102',NULL,'echo','echo','Echo (test)','1.0','Echo provider for testing','["chat"]',16000,1024,0,0,0,1,'{}',NOW(),NOW());

CREATE TABLE IF NOT EXISTS ai_requests (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, user_id CHAR(36) NULL, agent_id CHAR(36) NULL,
 conversation_id CHAR(36) NULL, workflow_run_id CHAR(36) NULL, channel ENUM('chat','agent','workflow','api','talk') NOT NULL,
 provider VARCHAR(40) NOT NULL, model_id VARCHAR(100) NOT NULL, model_registry_id CHAR(36) NULL, feature VARCHAR(100) NULL,
 duration_ms INT UNSIGNED NOT NULL, prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0, completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
 status ENUM('succeeded','failed') NOT NULL DEFAULT 'succeeded', error TEXT NULL, created_at DATETIME NOT NULL,
 KEY idx_ai_request_org_time(organization_id,created_at), KEY idx_ai_request_org_model(organization_id,model_id),
 CONSTRAINT fk_ai_request_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_ai_request_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT fk_ai_request_model FOREIGN KEY(model_registry_id) REFERENCES model_registry(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugins (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NULL, slug VARCHAR(100) NOT NULL, name VARCHAR(100) NOT NULL,
 description VARCHAR(1000) NULL, version VARCHAR(40) NOT NULL DEFAULT '1.0.0', author VARCHAR(100) NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 1, hooks JSON NOT NULL, config JSON NOT NULL, is_system TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_plugin_org_slug(organization_id,slug), KEY idx_plugins_org(organization_id),
 CONSTRAINT fk_plugin_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plugin_overrides (
 organization_id CHAR(36) NOT NULL, plugin_id CHAR(36) NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1, updated_at DATETIME NOT NULL,
 PRIMARY KEY(organization_id,plugin_id), CONSTRAINT fk_plugin_override_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_plugin_override_plugin FOREIGN KEY(plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO plugins(id,organization_id,slug,name,description,version,author,enabled,hooks,config,is_system,created_at,updated_at) VALUES
('00000000-0000-4000-8000-000000000201',NULL,'markdown-export','Markdown Export','Export conversations and canvases to Markdown','1.0.0','Windels',1,'["export.markdown"]','{}',1,NOW(),NOW()),
('00000000-0000-4000-8000-000000000202',NULL,'quick-actions','Quick Actions','Adds AI-powered quick actions to the composer and toolbar','1.0.0','Windels',1,'["composer.quick-actions","toolbar.actions"]','{}',1,NOW(),NOW()),
('00000000-0000-4000-8000-000000000203',NULL,'template-gallery','Template Gallery','Library of workflow and prompt templates','1.0.0','Windels',1,'["workflow.templates","prompt.templates"]','{}',1,NOW(),NOW());

CREATE TABLE IF NOT EXISTS integrations (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, type VARCHAR(60) NOT NULL, name VARCHAR(100) NOT NULL,
 config JSON NOT NULL, credentials MEDIUMTEXT NOT NULL, status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
 last_sync_at DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_integration_org_type(organization_id,type), KEY idx_integration_org(organization_id,status),
 CONSTRAINT fk_integration_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sso_configs (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL UNIQUE,
 provider ENUM('saml','oidc','google','microsoft') NOT NULL, entry_point TEXT NULL, issuer VARCHAR(255) NULL,
 certificate MEDIUMTEXT NULL, client_id VARCHAR(255) NULL, client_secret MEDIUMTEXT NULL, domains JSON NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_sso_enabled(enabled), CONSTRAINT fk_sso_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS governance_adrs (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, adr_number INT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL,
 status ENUM('proposed','accepted','superseded','deprecated','rejected') NOT NULL DEFAULT 'proposed', context TEXT NOT NULL,
 decision TEXT NOT NULL, consequences TEXT NOT NULL, authors JSON NOT NULL, tags JSON NOT NULL, superseded_by CHAR(36) NULL,
 created_by CHAR(36) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_adr_org_number(organization_id,adr_number), KEY idx_adr_org_status(organization_id,status),
 CONSTRAINT fk_adr_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_adr_creator FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS governance_standards (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NULL, code VARCHAR(30) NOT NULL, category ENUM('api','security','data','ui','infra','naming','testing') NOT NULL,
 title VARCHAR(255) NOT NULL, description TEXT NOT NULL, severity ENUM('must','should','may') NOT NULL,
 enforcement ENUM('manual','automated','advisory') NOT NULL, link TEXT NULL, created_at DATETIME NOT NULL,
 UNIQUE KEY uq_standard_org_code(organization_id,code), KEY idx_standard_category(category),
 CONSTRAINT fk_standard_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS governance_reviews (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, kind ENUM('adr','service','event','api','deployment') NOT NULL,
 target_id VARCHAR(255) NOT NULL, requested_by CHAR(36) NOT NULL, reviewers JSON NOT NULL,
 status ENUM('pending','approved','changes_requested','rejected') NOT NULL DEFAULT 'pending', created_at DATETIME NOT NULL, decided_at DATETIME NULL,
 KEY idx_review_org_status(organization_id,status), CONSTRAINT fk_review_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_review_requester FOREIGN KEY(requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS governance_review_comments (
 id CHAR(36) PRIMARY KEY, review_id CHAR(36) NOT NULL, author_id CHAR(36) NOT NULL, body TEXT NOT NULL, created_at DATETIME NOT NULL,
 KEY idx_review_comment(review_id,created_at), CONSTRAINT fk_review_comment_review FOREIGN KEY(review_id) REFERENCES governance_reviews(id) ON DELETE CASCADE,
 CONSTRAINT fk_review_comment_author FOREIGN KEY(author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO governance_standards(id,organization_id,code,category,title,description,severity,enforcement,created_at) VALUES
('00000000-0000-4000-8000-000000000301',NULL,'API-001','api','Envelope format','All REST responses use the standard API envelope.','must','automated',NOW()),
('00000000-0000-4000-8000-000000000302',NULL,'API-002','api','Versioned paths','API paths are versioned under /api/v1.','must','automated',NOW()),
('00000000-0000-4000-8000-000000000303',NULL,'API-003','api','Validate input','All endpoints validate request input.','must','automated',NOW()),
('00000000-0000-4000-8000-000000000304',NULL,'SEC-001','security','Protected routes','Protected routes require authentication.','must','automated',NOW()),
('00000000-0000-4000-8000-000000000305',NULL,'SEC-003','security','Encryption at rest','Credentials use authenticated encryption at rest.','must','manual',NOW()),
('00000000-0000-4000-8000-000000000306',NULL,'DATA-001','data','Schema changes','Every schema change is included in production.sql.','must','manual',NOW()),
('00000000-0000-4000-8000-000000000307',NULL,'DATA-002','data','Parameterized SQL','Database access uses parameterized query-builder operations.','must','manual',NOW()),
('00000000-0000-4000-8000-000000000308',NULL,'OBS-001','infra','Structured logs','Services use structured application logs.','should','automated',NOW()),
('00000000-0000-4000-8000-000000000309',NULL,'OBS-002','infra','Health endpoints','The application exposes health checks.','must','automated',NOW()),
('00000000-0000-4000-8000-000000000310',NULL,'NAME-001','naming','Naming conventions','Classes use PascalCase and methods use descriptive names.','should','manual',NOW()),
('00000000-0000-4000-8000-000000000311',NULL,'TEST-001','testing','Module tests','Every migrated module requires parity validation.','should','manual',NOW());

CREATE TABLE IF NOT EXISTS service_registry (
 instance_id VARCHAR(100) PRIMARY KEY, service_id VARCHAR(100) NOT NULL, organization_id CHAR(36) NULL, name VARCHAR(150) NOT NULL,
 version VARCHAR(40) NOT NULL, base_url TEXT NOT NULL, health_url TEXT NULL,
 status ENUM('starting','healthy','degraded','unhealthy','offline') NOT NULL DEFAULT 'healthy', capabilities JSON NOT NULL,
 region VARCHAR(80) NULL, metadata JSON NOT NULL, started_at DATETIME NOT NULL, last_heartbeat DATETIME NOT NULL,
 KEY idx_service_registry_service(service_id,status), KEY idx_service_registry_org(organization_id),
 CONSTRAINT fk_service_registry_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS service_dependencies (
 organization_id CHAR(36) NOT NULL, source_service_id VARCHAR(100) NOT NULL, target_service_id VARCHAR(100) NOT NULL,
 kind ENUM('http','event','grpc','internal') NOT NULL DEFAULT 'http', criticality ENUM('required','optional') NOT NULL DEFAULT 'required', created_at DATETIME NOT NULL,
 PRIMARY KEY(organization_id,source_service_id,target_service_id), CONSTRAINT fk_service_dependency_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO service_registry(instance_id,service_id,organization_id,name,version,base_url,health_url,status,capabilities,region,metadata,started_at,last_heartbeat) VALUES
('windels-php-default','windels-api',NULL,'WINDELS PHP API','1.0.0','/','/api/v1/health','healthy','["auth","files","governance","discovery","monitoring"]','local','{"runtime":"php","framework":"codeigniter-3"}',NOW(),NOW());

CREATE TABLE IF NOT EXISTS event_schemas (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NULL, event_type VARCHAR(150) NOT NULL, version VARCHAR(40) NOT NULL,
 description TEXT NOT NULL, producer VARCHAR(100) NOT NULL, consumers JSON NOT NULL, schema_json JSON NOT NULL,
 examples JSON NULL, deprecated TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL,
 UNIQUE KEY uq_event_schema_org_type_version(organization_id,event_type,version), KEY idx_event_schema_type(event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS enterprise_events (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, event_type VARCHAR(150) NOT NULL, schema_version VARCHAR(40) NOT NULL,
 producer VARCHAR(100) NOT NULL, correlation_id CHAR(36) NOT NULL, causation_id CHAR(36) NULL, trace_id VARCHAR(100) NULL,
 payload JSON NOT NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL,
 KEY idx_event_org_time(organization_id,created_at), KEY idx_event_correlation(correlation_id), KEY idx_event_type(event_type),
 CONSTRAINT fk_event_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS event_dead_letters (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, event_id CHAR(36) NOT NULL, failed_consumer VARCHAR(100) NOT NULL,
 error TEXT NOT NULL, attempts TINYINT UNSIGNED NOT NULL DEFAULT 1, status ENUM('pending','replayed','discarded') NOT NULL DEFAULT 'pending',
 first_failed_at DATETIME NOT NULL, last_failed_at DATETIME NOT NULL,
 KEY idx_dlq_org_status(organization_id,status,last_failed_at), CONSTRAINT fk_dlq_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_dlq_event FOREIGN KEY(event_id) REFERENCES enterprise_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO event_schemas(id,organization_id,event_type,version,description,producer,consumers,schema_json,deprecated,created_at) VALUES
('00000000-0000-4000-8000-000000000401',NULL,'user.created','1.0.0','Fired when a user registers.','windels-api','["audit","billing","notifications"]','{"type":"object","required":["userId"]}',0,NOW()),
('00000000-0000-4000-8000-000000000402',NULL,'workflow.run.started','1.0.0','Fired when a workflow run begins.','windels-api','["audit","analytics","notifications"]','{"type":"object","required":["workflowId","runId"]}',0,NOW()),
('00000000-0000-4000-8000-000000000403',NULL,'workflow.run.succeeded','1.0.0','Fired when a workflow run succeeds.','windels-api','["audit","analytics"]','{"type":"object","required":["workflowId","runId"]}',0,NOW()),
('00000000-0000-4000-8000-000000000404',NULL,'workflow.run.failed','1.0.0','Fired when a workflow run fails.','windels-api','["audit","notifications"]','{"type":"object","required":["workflowId","runId","error"]}',0,NOW()),
('00000000-0000-4000-8000-000000000405',NULL,'service.registered','1.0.0','Fired when a service registers.','discovery','["audit","discovery"]','{"type":"object","required":["serviceId"]}',0,NOW()),
('00000000-0000-4000-8000-000000000406',NULL,'message.created','1.0.0','Fired when a message is created.','windels-api','["audit","analytics","notifications"]','{"type":"object","required":["conversationId","messageId"]}',0,NOW());

CREATE TABLE IF NOT EXISTS api_versions (
 version VARCHAR(20) PRIMARY KEY, introduced_at DATETIME NOT NULL, sunset_at DATETIME NULL,
 status ENUM('current','supported','deprecated','sunset') NOT NULL DEFAULT 'supported'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO api_versions(version,introduced_at,status) VALUES ('v1',NOW(),'current');

CREATE TABLE IF NOT EXISTS api_keys (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, created_by_id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL,
 key_prefix VARCHAR(20) NOT NULL, key_hash CHAR(64) NOT NULL UNIQUE, scopes JSON NOT NULL, granular_scopes JSON NOT NULL,
 app_id CHAR(36) NULL, environment ENUM('development','test','production') NOT NULL DEFAULT 'production', ip_restrictions JSON NOT NULL,
 last_used_at DATETIME NULL, expires_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_api_key_org(organization_id), KEY idx_api_key_app(app_id), CONSTRAINT fk_api_key_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_api_key_creator FOREIGN KEY(created_by_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS api_usage_records (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, api_key_id CHAR(36) NULL, organization_id CHAR(36) NOT NULL,
 method VARCHAR(10) NOT NULL, path VARCHAR(500) NOT NULL, status SMALLINT UNSIGNED NOT NULL, tokens_in INT UNSIGNED NOT NULL DEFAULT 0,
 tokens_out INT UNSIGNED NOT NULL DEFAULT 0, ai_cost_micros BIGINT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME NOT NULL,
 KEY idx_api_usage_key(api_key_id,created_at), KEY idx_api_usage_org(organization_id,created_at),
 CONSTRAINT fk_api_usage_key FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
 CONSTRAINT fk_api_usage_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL,
 KEY idx_password_reset_user(user_id,expires_at), CONSTRAINT fk_password_reset_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfa_policies (
 organization_id CHAR(36) PRIMARY KEY, mode ENUM('optional','required_admins','required_all') NOT NULL DEFAULT 'optional',
 enforcement ENUM('report_only','block_after_grace') NOT NULL DEFAULT 'report_only', grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 14,
 recovery_code_floor TINYINT UNSIGNED NOT NULL DEFAULT 2, allow_recovery_codes TINYINT(1) NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL, updated_by CHAR(36) NOT NULL,
 CONSTRAINT fk_mfa_policy_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_mfa_policy_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfa_exemptions (
 organization_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, reason VARCHAR(500) NOT NULL, granted_by CHAR(36) NOT NULL,
 granted_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, revoked_at DATETIME NULL,
 PRIMARY KEY(organization_id,user_id), KEY idx_mfa_exemption_expiry(organization_id,expires_at),
 CONSTRAINT fk_mfa_exemption_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_mfa_exemption_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_mfa_exemption_actor FOREIGN KEY(granted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS mfa_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(50) NOT NULL, user_id CHAR(36) NULL, organization_id CHAR(36) NULL,
 actor_id CHAR(36) NULL, method ENUM('totp','recovery') NULL, reason VARCHAR(255) NULL, detail JSON NULL, created_at DATETIME NOT NULL,
 KEY idx_mfa_event_org(organization_id,created_at), KEY idx_mfa_event_user(user_id,created_at),
 CONSTRAINT fk_mfa_event_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_mfa_event_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, organization_id CHAR(36) NULL, type VARCHAR(40) NOT NULL,
 title VARCHAR(255) NOT NULL, body TEXT NOT NULL, icon VARCHAR(80) NULL, url TEXT NULL, data JSON NOT NULL,
 push_delivered TINYINT(1) NOT NULL DEFAULT 0, read_at DATETIME NULL, dismissed_at DATETIME NULL, created_at DATETIME NOT NULL,
 KEY idx_notification_user_time(user_id,created_at), KEY idx_notification_unread(user_id,read_at),
 CONSTRAINT fk_notification_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_notification_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id CHAR(36) NOT NULL, category VARCHAR(100) NOT NULL, channels JSON NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL, PRIMARY KEY(user_id,category),
 CONSTRAINT fk_notification_preference_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, workspace_id CHAR(36) NULL, title VARCHAR(200) NOT NULL,
 summary TEXT NULL, created_by_id CHAR(36) NOT NULL, pinned TINYINT(1) NOT NULL DEFAULT 0, pinned_at DATETIME NULL,
 is_archived TINYINT(1) NOT NULL DEFAULT 0, archived_at DATETIME NULL, model_id VARCHAR(100) NULL, metadata JSON NOT NULL,
 last_message_at DATETIME NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, deleted_at DATETIME NULL,
 KEY idx_conversation_org_time(organization_id,last_message_at), KEY idx_conversation_owner(created_by_id),
 CONSTRAINT fk_conversation_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_conversation_workspace FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
 CONSTRAINT fk_conversation_creator FOREIGN KEY(created_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS agents (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, name VARCHAR(64) NOT NULL, role VARCHAR(64) NOT NULL,
 color VARCHAR(32) NOT NULL DEFAULT 'azure', emoji VARCHAR(8) NOT NULL DEFAULT '🤖', description VARCHAR(500) NULL,
 system_prompt TEXT NULL, department VARCHAR(64) NULL DEFAULT 'General', capabilities JSON NOT NULL, cloud_android_requirements JSON NOT NULL,
 model_id VARCHAR(160) NULL, temperature DECIMAL(3,2) NOT NULL DEFAULT 0.70, max_tokens INT UNSIGNED NOT NULL DEFAULT 2048,
 is_built_in TINYINT(1) NOT NULL DEFAULT 0, avatar_style VARCHAR(64) NULL,
 status ENUM('IDLE','ONLINE','WORKING','ERROR','PAUSED','OFFLINE') NOT NULL DEFAULT 'IDLE', last_activity_at DATETIME NOT NULL,
 active_task_id CHAR(36) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_agents_org_status(organization_id,status), CONSTRAINT fk_agents_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS conversation_participants (
 id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, user_id CHAR(36) NULL, agent_id CHAR(36) NULL, joined_at DATETIME NOT NULL, last_read_at DATETIME NULL,
 UNIQUE KEY uq_conversation_user(conversation_id,user_id), KEY idx_participant_user(user_id),
 CONSTRAINT fk_participant_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
 CONSTRAINT fk_participant_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_participant_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS messages (
 id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, role ENUM('USER','ASSISTANT','SYSTEM','TOOL') NOT NULL,
 content MEDIUMTEXT NOT NULL, user_id CHAR(36) NULL, agent_id CHAR(36) NULL, parent_id CHAR(36) NULL, model_id VARCHAR(100) NULL,
 tokens_in INT UNSIGNED NULL, tokens_out INT UNSIGNED NULL, cost_micros BIGINT UNSIGNED NULL, duration_ms INT UNSIGNED NULL,
 status ENUM('PENDING','STREAMING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING', error TEXT NULL,
 citations JSON NOT NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_message_conversation(conversation_id,created_at), KEY idx_message_user(user_id),
 CONSTRAINT fk_message_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
 CONSTRAINT fk_message_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT fk_message_parent FOREIGN KEY(parent_id) REFERENCES messages(id) ON DELETE SET NULL,
 CONSTRAINT fk_message_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_shares (
 id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, created_by_id CHAR(36) NOT NULL, token CHAR(64) NOT NULL UNIQUE,
 access_mode ENUM('anyone_with_link','organization','restricted','specific') NOT NULL DEFAULT 'anyone_with_link',
 permissions ENUM('view','comment','edit') NOT NULL DEFAULT 'view', allowed JSON NOT NULL, password_hash VARCHAR(255) NULL,
 expires_at DATETIME NULL, revoked_at DATETIME NULL, last_accessed_at DATETIME NULL, access_count INT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, KEY idx_share_conversation(conversation_id), KEY idx_share_expiry(expires_at),
 CONSTRAINT fk_share_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
 CONSTRAINT fk_share_creator FOREIGN KEY(created_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS conversation_share_access (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, share_id CHAR(36) NOT NULL, user_id CHAR(36) NULL, ip_address VARCHAR(45) NULL,
 user_agent VARCHAR(500) NULL, granted TINYINT(1) NOT NULL, reason VARCHAR(100) NULL, created_at DATETIME NOT NULL,
 KEY idx_share_access(share_id,created_at), CONSTRAINT fk_share_access_share FOREIGN KEY(share_id) REFERENCES conversation_shares(id) ON DELETE CASCADE,
 CONSTRAINT fk_share_access_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_attachments (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, conversation_id CHAR(36) NULL, message_id CHAR(36) NULL,
 talk_message_id CHAR(36) NULL, uploader_id CHAR(36) NOT NULL, filename VARCHAR(120) NOT NULL, mime_type VARCHAR(150) NOT NULL,
 size_bytes INT UNSIGNED NOT NULL, storage_key VARCHAR(500) NOT NULL, checksum CHAR(64) NOT NULL, extracted_text MEDIUMTEXT NULL,
 created_at DATETIME NOT NULL, KEY idx_attachment_org_created(organization_id,created_at), KEY idx_attachment_conversation(conversation_id),
 KEY idx_attachment_checksum(organization_id,checksum), CONSTRAINT fk_attachment_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_attachment_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
 CONSTRAINT fk_attachment_message FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
 CONSTRAINT fk_attachment_uploader FOREIGN KEY(uploader_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_events (
 id CHAR(36) PRIMARY KEY, agent_id CHAR(36) NOT NULL, type VARCHAR(64) NOT NULL, message VARCHAR(500) NOT NULL,
 metadata JSON NOT NULL, created_at DATETIME NOT NULL, KEY idx_agent_events_agent(agent_id,created_at),
 CONSTRAINT fk_agent_events_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_lifecycle (
 agent_id CHAR(36) PRIMARY KEY, state ENUM('ONBOARDING','ACTIVE','TRAINING','RETIRED','ARCHIVED') NOT NULL, since_at DATETIME NOT NULL,
 metadata JSON NOT NULL, CONSTRAINT fk_agent_lifecycle_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS agent_lifecycle_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, agent_id CHAR(36) NOT NULL, from_state VARCHAR(20) NULL, to_state VARCHAR(20) NOT NULL,
 reason VARCHAR(500) NOT NULL, user_id CHAR(36) NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL,
 KEY idx_lifecycle_history(agent_id,created_at), CONSTRAINT fk_lifecycle_history_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,
 CONSTRAINT fk_lifecycle_history_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS agent_skills (
 id CHAR(36) PRIMARY KEY, agent_id CHAR(36) NOT NULL, name VARCHAR(64) NOT NULL, description VARCHAR(500) NULL, tool_name VARCHAR(64) NOT NULL,
 config JSON NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_agent_skill(agent_id,name), CONSTRAINT fk_agent_skill_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_memories (
 id CHAR(36) PRIMARY KEY, agent_id CHAR(36) NOT NULL, type ENUM('FACT','PREFERENCE','PROCEDURE','CONVERSATION','TASK','FEEDBACK') NOT NULL DEFAULT 'FACT',
 content TEXT NOT NULL, source VARCHAR(64) NULL, source_ref VARCHAR(128) NULL, importance DECIMAL(3,2) NOT NULL DEFAULT 0.50,
 tags JSON NOT NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_agent_memory(agent_id,type,importance), CONSTRAINT fk_agent_memory_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS agent_knowledge (
 id CHAR(36) PRIMARY KEY, agent_id CHAR(36) NOT NULL, type ENUM('DOCUMENT','URL','SNIPPET','FILE') NOT NULL DEFAULT 'SNIPPET',
 title VARCHAR(200) NOT NULL, content MEDIUMTEXT NOT NULL, source VARCHAR(500) NULL, mime_type VARCHAR(128) NULL, tokens INT UNSIGNED NOT NULL DEFAULT 0,
 metadata JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, KEY idx_agent_knowledge(agent_id,type,created_at),
 CONSTRAINT fk_agent_knowledge_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prompt_templates (
 id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, title VARCHAR(200) NOT NULL, description VARCHAR(500) NULL,
 content TEXT NOT NULL, category VARCHAR(40) NOT NULL DEFAULT 'general', icon VARCHAR(32) NULL, created_by_id CHAR(36) NOT NULL,
 is_built_in TINYINT(1) NOT NULL DEFAULT 0, usage_count INT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
 KEY idx_prompt_org_category(organization_id,category), CONSTRAINT fk_prompt_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_prompt_creator FOREIGN KEY(created_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS prompt_template_uses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id CHAR(36) NOT NULL, template_id CHAR(36) NULL, user_id CHAR(36) NULL, used_at DATETIME NOT NULL,
 KEY idx_prompt_uses_org_time(organization_id,used_at), KEY idx_prompt_uses_template(template_id,used_at),
 CONSTRAINT fk_prompt_use_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
 CONSTRAINT fk_prompt_use_template FOREIGN KEY(template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL,
 CONSTRAINT fk_prompt_use_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canvases (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,workspace_id CHAR(36) NULL,title VARCHAR(200) NOT NULL,description VARCHAR(500) NULL,access_mode ENUM('PRIVATE','WORKSPACE','ORGANIZATION') NOT NULL DEFAULT 'WORKSPACE',created_by_id CHAR(36) NOT NULL,background_color VARCHAR(32) NULL DEFAULT '#0A0F1A',is_template TINYINT(1) NOT NULL DEFAULT 0,metadata JSON NOT NULL,viewport_x DECIMAL(12,3) NOT NULL DEFAULT 0,viewport_y DECIMAL(12,3) NOT NULL DEFAULT 0,viewport_zoom DECIMAL(6,3) NOT NULL DEFAULT 1,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,deleted_at DATETIME NULL,KEY idx_canvas_org(organization_id,updated_at),CONSTRAINT fk_canvas_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_canvas_creator FOREIGN KEY(created_by_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS canvas_blocks (id CHAR(36) PRIMARY KEY,canvas_id CHAR(36) NOT NULL,type ENUM('TEXT','STICKY','AI','EMBED','HEADING','TODO') NOT NULL,x DECIMAL(12,3) NOT NULL DEFAULT 0,y DECIMAL(12,3) NOT NULL DEFAULT 0,width DECIMAL(12,3) NOT NULL DEFAULT 280,height DECIMAL(12,3) NOT NULL DEFAULT 140,z_index INT NOT NULL DEFAULT 0,content JSON NOT NULL,style JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_canvas_block(canvas_id),CONSTRAINT fk_canvas_block FOREIGN KEY(canvas_id) REFERENCES canvases(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS canvas_connections (id CHAR(36) PRIMARY KEY,canvas_id CHAR(36) NOT NULL,from_id CHAR(36) NOT NULL,to_id CHAR(36) NOT NULL,label VARCHAR(200) NULL,color VARCHAR(32) NULL DEFAULT 'azure',style JSON NOT NULL,created_at DATETIME NOT NULL,KEY idx_canvas_conn(canvas_id),CONSTRAINT fk_canvas_conn_canvas FOREIGN KEY(canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,CONSTRAINT fk_canvas_conn_from FOREIGN KEY(from_id) REFERENCES canvas_blocks(id) ON DELETE CASCADE,CONSTRAINT fk_canvas_conn_to FOREIGN KEY(to_id) REFERENCES canvas_blocks(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canvas_presence (canvas_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,display_name VARCHAR(120) NOT NULL,avatar_color VARCHAR(32) NULL,joined_at DATETIME NOT NULL,last_seen_at DATETIME NOT NULL,PRIMARY KEY(canvas_id,user_id),KEY idx_presence_seen(last_seen_at),CONSTRAINT fk_presence_canvas FOREIGN KEY(canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,CONSTRAINT fk_presence_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS canvas_cursors (canvas_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,display_name VARCHAR(120) NOT NULL,x DECIMAL(12,3) NOT NULL,y DECIMAL(12,3) NOT NULL,updated_at DATETIME NOT NULL,PRIMARY KEY(canvas_id,user_id),KEY idx_cursor_updated(updated_at),CONSTRAINT fk_cursor_canvas FOREIGN KEY(canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,CONSTRAINT fk_cursor_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS talk_channels (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,workspace_id CHAR(36) NULL,type ENUM('DM','CHANNEL') NOT NULL,access_mode ENUM('PUBLIC','PRIVATE') NOT NULL DEFAULT 'PUBLIC',name VARCHAR(200) NOT NULL,topic VARCHAR(500) NULL,dm_peer_id CHAR(36) NULL,created_by_id CHAR(36) NOT NULL,is_archived TINYINT(1) NOT NULL DEFAULT 0,last_message_at DATETIME NOT NULL,metadata JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_talk_org(organization_id,type,last_message_at),CONSTRAINT fk_talk_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_talk_creator FOREIGN KEY(created_by_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS talk_members (id CHAR(36) PRIMARY KEY,channel_id CHAR(36) NOT NULL,user_id CHAR(36) NULL,agent_id CHAR(36) NULL,joined_at DATETIME NOT NULL,last_read_at DATETIME NULL,is_muted TINYINT(1) NOT NULL DEFAULT 0,is_pinned TINYINT(1) NOT NULL DEFAULT 0,KEY idx_talk_member_user(user_id),CONSTRAINT fk_talk_member_channel FOREIGN KEY(channel_id) REFERENCES talk_channels(id) ON DELETE CASCADE,CONSTRAINT fk_talk_member_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,CONSTRAINT fk_talk_member_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS talk_messages (id CHAR(36) PRIMARY KEY,channel_id CHAR(36) NOT NULL,type VARCHAR(30) NOT NULL DEFAULT 'TEXT',content TEXT NOT NULL,user_id CHAR(36) NULL,agent_id CHAR(36) NULL,thread_parent_id CHAR(36) NULL,reply_count INT UNSIGNED NOT NULL DEFAULT 0,last_reply_at DATETIME NULL,reactions JSON NOT NULL,meeting_id CHAR(36) NULL,edited_at DATETIME NULL,deleted_at DATETIME NULL,metadata JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_talk_msg_channel(channel_id,created_at),CONSTRAINT fk_talk_msg_channel FOREIGN KEY(channel_id) REFERENCES talk_channels(id) ON DELETE CASCADE,CONSTRAINT fk_talk_msg_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,CONSTRAINT fk_talk_msg_agent FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE SET NULL,CONSTRAINT fk_talk_msg_parent FOREIGN KEY(thread_parent_id) REFERENCES talk_messages(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meetings (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,channel_id CHAR(36) NULL,title VARCHAR(200) NOT NULL,description VARCHAR(500) NULL,status ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',scheduled_start DATETIME NULL,started_at DATETIME NULL,ended_at DATETIME NULL,created_by_id CHAR(36) NOT NULL,notetaker_agent_id CHAR(36) NULL,notetaker_status VARCHAR(30) NOT NULL DEFAULT 'IDLE',transcript MEDIUMTEXT NULL,summary MEDIUMTEXT NULL,decisions JSON NOT NULL,metadata JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_meeting_org(organization_id,status,scheduled_start),CONSTRAINT fk_meeting_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_meeting_channel FOREIGN KEY(channel_id) REFERENCES talk_channels(id) ON DELETE SET NULL,CONSTRAINT fk_meeting_creator FOREIGN KEY(created_by_id) REFERENCES users(id),CONSTRAINT fk_meeting_agent FOREIGN KEY(notetaker_agent_id) REFERENCES agents(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS action_items (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,meeting_id CHAR(36) NULL,channel_id CHAR(36) NULL,title VARCHAR(200) NOT NULL,description VARCHAR(1000) NULL,status ENUM('OPEN','IN_PROGRESS','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN',priority ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',due_date DATETIME NULL,assignee_id CHAR(36) NULL,agent_assignee_id CHAR(36) NULL,created_by_id CHAR(36) NOT NULL,source_message_id CHAR(36) NULL,completed_at DATETIME NULL,metadata JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_action_org(organization_id,status),CONSTRAINT fk_action_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_action_meeting FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,CONSTRAINT fk_action_channel FOREIGN KEY(channel_id) REFERENCES talk_channels(id) ON DELETE SET NULL,CONSTRAINT fk_action_creator FOREIGN KEY(created_by_id) REFERENCES users(id),CONSTRAINT fk_action_assignee FOREIGN KEY(assignee_id) REFERENCES users(id) ON DELETE SET NULL,CONSTRAINT fk_action_agent FOREIGN KEY(agent_assignee_id) REFERENCES agents(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflows (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,workspace_id CHAR(36) NULL,name VARCHAR(120) NOT NULL,description VARCHAR(500) NULL,status ENUM('DRAFT','ACTIVE','PAUSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',nodes JSON NOT NULL,edges JSON NOT NULL,settings JSON NOT NULL,triggers JSON NOT NULL,created_by_id CHAR(36) NOT NULL,last_run_at DATETIME NULL,runs_count INT UNSIGNED NOT NULL DEFAULT 0,success_count INT UNSIGNED NOT NULL DEFAULT 0,failure_count INT UNSIGNED NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,deleted_at DATETIME NULL,KEY idx_workflow_org(organization_id,status),CONSTRAINT fk_workflow_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_workflow_creator FOREIGN KEY(created_by_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workflow_runs (id CHAR(36) PRIMARY KEY,workflow_id CHAR(36) NOT NULL,trigger_type VARCHAR(30) NOT NULL DEFAULT 'manual',trigger_data JSON NOT NULL,status ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','WAITING_APPROVAL','CANCELLED') NOT NULL DEFAULT 'QUEUED',started_at DATETIME NULL,ended_at DATETIME NULL,input_data JSON NOT NULL,output_data JSON NOT NULL,error TEXT NULL,node_runs JSON NOT NULL,created_by_id CHAR(36) NULL,approval_feedback VARCHAR(1000) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_workflow_run(workflow_id,created_at),CONSTRAINT fk_workflow_run_workflow FOREIGN KEY(workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,CONSTRAINT fk_workflow_run_user FOREIGN KEY(created_by_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inbound_webhooks (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,source VARCHAR(100) NOT NULL,event_type VARCHAR(200) NULL,payload JSON NOT NULL,verified TINYINT(1) NOT NULL DEFAULT 0,status ENUM('RECEIVED','REPLAYED','FAILED') NOT NULL DEFAULT 'RECEIVED',replay_count INT UNSIGNED NOT NULL DEFAULT 0,last_replayed_at DATETIME NULL,created_at DATETIME NOT NULL,KEY idx_inbound_org(organization_id,created_at),KEY idx_inbound_source(source),CONSTRAINT fk_inbound_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_endpoints (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,created_by_id CHAR(36) NOT NULL,url VARCHAR(2048) NOT NULL,description VARCHAR(500) NULL,secret VARCHAR(255) NOT NULL,events JSON NOT NULL,active TINYINT(1) NOT NULL DEFAULT 1,last_delivery_at DATETIME NULL,last_status SMALLINT UNSIGNED NULL,failure_count INT UNSIGNED NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_webhook_org(organization_id),CONSTRAINT fk_webhook_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_webhook_creator FOREIGN KEY(created_by_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS webhook_deliveries (id CHAR(36) PRIMARY KEY,webhook_id CHAR(36) NOT NULL,event VARCHAR(200) NOT NULL,payload JSON NOT NULL,status SMALLINT UNSIGNED NULL,response_body TEXT NULL,attempts INT UNSIGNED NOT NULL DEFAULT 1,delivered_at DATETIME NULL,next_retry_at DATETIME NULL,created_at DATETIME NOT NULL,KEY idx_delivery_webhook(webhook_id,created_at),KEY idx_delivery_retry(next_retry_at),CONSTRAINT fk_delivery_webhook FOREIGN KEY(webhook_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_requests (id CHAR(36) PRIMARY KEY,request_number VARCHAR(40) NOT NULL UNIQUE,organization_id CHAR(36) NULL,user_id CHAR(36) NULL,name VARCHAR(120) NOT NULL,email VARCHAR(255) NOT NULL,phone VARCHAR(50) NULL,country VARCHAR(100) NULL,company VARCHAR(200) NULL,category VARCHAR(80) NOT NULL,subject VARCHAR(200) NOT NULL,message TEXT NOT NULL,preferred_contact_method VARCHAR(30) NOT NULL DEFAULT 'email',ai_conversation_id CHAR(36) NULL,ai_summary TEXT NULL,priority VARCHAR(30) NOT NULL DEFAULT 'normal',status VARCHAR(30) NOT NULL DEFAULT 'new',department VARCHAR(80) NOT NULL DEFAULT 'general',assigned_user_id CHAR(36) NULL,assigned_agent_id CHAR(36) NULL,source VARCHAR(30) NOT NULL DEFAULT 'web',resolved_at DATETIME NULL,closed_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_contact_user(user_id),KEY idx_contact_status(status,created_at),CONSTRAINT fk_contact_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS contact_messages (id CHAR(36) PRIMARY KEY,request_id CHAR(36) NOT NULL,author_type VARCHAR(20) NOT NULL DEFAULT 'user',author_id CHAR(36) NULL,author_name VARCHAR(120) NULL,body TEXT NOT NULL,is_internal TINYINT(1) NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,KEY idx_contact_message(request_id,created_at),CONSTRAINT fk_contact_message_request FOREIGN KEY(request_id) REFERENCES contact_requests(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS contact_ai_sessions (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NULL,name VARCHAR(120) NULL,email VARCHAR(255) NULL,messages JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS contact_status_history (id CHAR(36) PRIMARY KEY,request_id CHAR(36) NOT NULL,from_status VARCHAR(30) NULL,to_status VARCHAR(30) NOT NULL,changed_by_user_id CHAR(36) NULL,created_at DATETIME NOT NULL,KEY idx_contact_history(request_id,created_at),CONSTRAINT fk_contact_history_request FOREIGN KEY(request_id) REFERENCES contact_requests(id) ON DELETE CASCADE,CONSTRAINT fk_contact_history_user FOREIGN KEY(changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS billing_subscriptions (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL UNIQUE,plan VARCHAR(30) NOT NULL DEFAULT 'starter',status VARCHAR(30) NOT NULL DEFAULT 'active',seats INT UNSIGNED NOT NULL DEFAULT 5,cycle ENUM('monthly','annual') NOT NULL DEFAULT 'monthly',current_period_start DATETIME NOT NULL,current_period_end DATETIME NOT NULL,customer_email VARCHAR(255) NULL,external_id VARCHAR(200) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,CONSTRAINT fk_billing_sub_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS invoices (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,subscription_id CHAR(36) NULL,number VARCHAR(64) NOT NULL UNIQUE,amount_cents INT UNSIGNED NOT NULL DEFAULT 0,currency CHAR(3) NOT NULL DEFAULT 'USD',status VARCHAR(30) NOT NULL DEFAULT 'draft',due_date DATETIME NULL,paid_at DATETIME NULL,hosted_url VARCHAR(2048) NULL,pdf_url VARCHAR(2048) NULL,`lines` JSON NOT NULL,void_reason VARCHAR(500) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_invoice_org(organization_id),CONSTRAINT fk_invoice_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_invoice_sub FOREIGN KEY(subscription_id) REFERENCES billing_subscriptions(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payment_records (id CHAR(36) PRIMARY KEY,event_id VARCHAR(200) NOT NULL UNIQUE,invoice_id CHAR(36) NULL,status VARCHAR(30) NOT NULL,amount_cents INT UNSIGNED NULL,currency CHAR(3) NULL,meta JSON NOT NULL,created_at DATETIME NOT NULL,CONSTRAINT fk_payment_invoice FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS platform_reviews (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL UNIQUE,user_name VARCHAR(120) NOT NULL,rating TINYINT UNSIGNED NOT NULL,title VARCHAR(120) NOT NULL DEFAULT '',content TEXT NOT NULL,status ENUM('published','hidden') NOT NULL DEFAULT 'published',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_reviews_status(status,created_at),CONSTRAINT fk_review_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS crm_companies (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(140) NOT NULL,domain VARCHAR(200) NULL,industry VARCHAR(100) NULL,size_band VARCHAR(30) NOT NULL DEFAULT 'unknown',website VARCHAR(300) NULL,city VARCHAR(100) NULL,country VARCHAR(80) NULL,tags JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_crm_company_org(organization_id,name),CONSTRAINT fk_crm_company_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS crm_contacts (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,first_name VARCHAR(80) NOT NULL,last_name VARCHAR(80) NOT NULL,email VARCHAR(254) NULL,phone VARCHAR(40) NULL,company_id CHAR(36) NULL,title VARCHAR(120) NULL,source VARCHAR(30) NOT NULL DEFAULT 'other',status VARCHAR(30) NOT NULL DEFAULT 'lead',tags JSON NOT NULL,owner_id CHAR(36) NULL,notes TEXT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_crm_contact_org(organization_id,status),CONSTRAINT fk_crm_contact_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_crm_contact_company FOREIGN KEY(company_id) REFERENCES crm_companies(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS crm_deals (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(160) NOT NULL,company_id CHAR(36) NOT NULL,contact_id CHAR(36) NULL,amount_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,currency CHAR(3) NOT NULL DEFAULT 'USD',stage VARCHAR(30) NOT NULL DEFAULT 'lead',probability_pct TINYINT UNSIGNED NOT NULL DEFAULT 10,expected_close_at DATETIME NULL,tags JSON NOT NULL,owner_id CHAR(36) NULL,stage_changed_at DATETIME NULL,won_at DATETIME NULL,lost_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_crm_deal_org(organization_id,stage),CONSTRAINT fk_crm_deal_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_crm_deal_company FOREIGN KEY(company_id) REFERENCES crm_companies(id),CONSTRAINT fk_crm_deal_contact FOREIGN KEY(contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS crm_activities (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,kind VARCHAR(30) NOT NULL,subject VARCHAR(200) NOT NULL,body TEXT NULL,contact_id CHAR(36) NULL,deal_id CHAR(36) NULL,company_id CHAR(36) NULL,due_at DATETIME NULL,completed_at DATETIME NULL,created_at DATETIME NOT NULL,created_by CHAR(36) NULL,KEY idx_crm_activity_org(organization_id,created_at),CONSTRAINT fk_crm_activity_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_products (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,sku VARCHAR(80) NOT NULL,name VARCHAR(160) NOT NULL,description TEXT NULL,category VARCHAR(80) NULL,unit VARCHAR(20) NOT NULL DEFAULT 'each',price_cents BIGINT UNSIGNED NOT NULL,cost_cents BIGINT UNSIGNED NOT NULL,tax_rate_pct DECIMAL(6,3) NOT NULL DEFAULT 0,reorder_level INT UNSIGNED NOT NULL DEFAULT 0,tags JSON NOT NULL,is_active TINYINT(1) NOT NULL DEFAULT 1,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_erp_sku(organization_id,sku),CONSTRAINT fk_erp_product_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_warehouses (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(120) NOT NULL,code VARCHAR(40) NOT NULL,city VARCHAR(100) NULL,country VARCHAR(80) NULL,is_default TINYINT(1) NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_erp_warehouse_code(organization_id,code),CONSTRAINT fk_erp_warehouse_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_movements (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,product_id CHAR(36) NOT NULL,warehouse_id CHAR(36) NOT NULL,kind VARCHAR(30) NOT NULL,quantity INT NOT NULL,unit_cost_cents BIGINT UNSIGNED NULL,reference VARCHAR(160) NULL,note VARCHAR(500) NULL,occurred_at DATETIME NOT NULL,created_at DATETIME NOT NULL,created_by CHAR(36) NULL,KEY idx_erp_movement(organization_id,occurred_at),CONSTRAINT fk_erp_move_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_erp_move_product FOREIGN KEY(product_id) REFERENCES erp_products(id),CONSTRAINT fk_erp_move_warehouse FOREIGN KEY(warehouse_id) REFERENCES erp_warehouses(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_suppliers (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(160) NOT NULL,contact_email VARCHAR(254) NULL,phone VARCHAR(40) NULL,payment_terms VARCHAR(120) NULL,lead_time_days INT UNSIGNED NOT NULL DEFAULT 0,tags JSON NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_erp_supplier_org(organization_id,name),CONSTRAINT fk_erp_supplier_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_purchase_orders (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,supplier_id CHAR(36) NOT NULL,status ENUM('draft','submitted','received','cancelled') NOT NULL DEFAULT 'draft',items JSON NOT NULL,total_cents BIGINT UNSIGNED NOT NULL,expected_at DATETIME NULL,received_at DATETIME NULL,note VARCHAR(1000) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_erp_po_org(organization_id,status),CONSTRAINT fk_erp_po_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_erp_po_supplier FOREIGN KEY(supplier_id) REFERENCES erp_suppliers(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS erp_sales_orders (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,customer_company_id CHAR(36) NULL,status ENUM('draft','confirmed','fulfilled','cancelled') NOT NULL DEFAULT 'draft',items JSON NOT NULL,total_cents BIGINT UNSIGNED NOT NULL,order_date DATE NOT NULL,fulfilled_at DATETIME NULL,note VARCHAR(1000) NULL,crm_deal_id CHAR(36) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_erp_so_org(organization_id,status),CONSTRAINT fk_erp_so_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_erp_so_company FOREIGN KEY(customer_company_id) REFERENCES crm_companies(id) ON DELETE SET NULL,CONSTRAINT fk_erp_so_deal FOREIGN KEY(crm_deal_id) REFERENCES crm_deals(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS email_mailboxes (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(80) NOT NULL,email_address VARCHAR(254) NOT NULL,provider VARCHAR(30) NOT NULL DEFAULT 'custom',imap_host VARCHAR(200) NULL,imap_port SMALLINT UNSIGNED NULL,smtp_host VARCHAR(200) NULL,smtp_port SMALLINT UNSIGNED NULL,username VARCHAR(200) NULL,password_enc TEXT NULL,status VARCHAR(30) NOT NULL DEFAULT 'pending',last_sync_at DATETIME NULL,error VARCHAR(1000) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_email_mailbox_org(organization_id),CONSTRAINT fk_email_mailbox_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS email_messages (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,mailbox_id CHAR(36) NOT NULL,thread_id VARCHAR(64) NOT NULL,message_id VARCHAR(320) NOT NULL,direction ENUM('inbound','outbound') NOT NULL,from_name VARCHAR(160) NULL,from_address VARCHAR(254) NOT NULL,to_addresses JSON NOT NULL,cc_addresses JSON NOT NULL,subject VARCHAR(500) NOT NULL,body_text MEDIUMTEXT NOT NULL,body_html MEDIUMTEXT NULL,sent_at DATETIME NULL,received_at DATETIME NOT NULL,labels JSON NOT NULL,is_read TINYINT(1) NOT NULL DEFAULT 0,attachments_count INT UNSIGNED NOT NULL DEFAULT 0,in_reply_to VARCHAR(320) NULL,reference_ids JSON NOT NULL,contact_id CHAR(36) NULL,deal_id CHAR(36) NULL,company_id CHAR(36) NULL,outbox_status VARCHAR(30) NOT NULL DEFAULT 'none',outbox_error TEXT NULL,smtp_response TEXT NULL,delivered_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_email_message_org(organization_id,received_at),KEY idx_email_thread(organization_id,thread_id,received_at),CONSTRAINT fk_email_message_mailbox FOREIGN KEY(mailbox_id) REFERENCES email_mailboxes(id) ON DELETE CASCADE,CONSTRAINT fk_email_message_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_builder_projects(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(140) NOT NULL,description TEXT NULL,target_type VARCHAR(30) NOT NULL,tech_stack JSON NOT NULL,system_prompt TEXT NOT NULL,created_by_id CHAR(36) NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_ab_project(organization_id,created_at),CONSTRAINT fk_ab_project_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_builder_tasks(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,project_id CHAR(36) NOT NULL,assigned_agent VARCHAR(80) NOT NULL,agent_group VARCHAR(40) NOT NULL,title VARCHAR(200) NOT NULL,description TEXT NULL,is_completed TINYINT(1) NOT NULL DEFAULT 0,output_code MEDIUMTEXT NULL,generation_source VARCHAR(20) NOT NULL DEFAULT 'manual',completed_at DATETIME NULL,created_at DATETIME NOT NULL,KEY idx_ab_task(project_id,created_at),CONSTRAINT fk_ab_task_project FOREIGN KEY(project_id) REFERENCES app_builder_projects(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_builder_runs(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,project_id CHAR(36) NOT NULL,version VARCHAR(30) NOT NULL,status VARCHAR(30) NOT NULL,logs JSON NOT NULL,error_log JSON NOT NULL,artifact_id CHAR(36) NULL,requested_by CHAR(36) NULL,started_at DATETIME NULL,finalized_at DATETIME NULL,created_at DATETIME NOT NULL,KEY idx_ab_version(project_id,version),KEY idx_ab_run(organization_id,status,created_at),CONSTRAINT fk_ab_run_project FOREIGN KEY(project_id) REFERENCES app_builder_projects(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_builder_artifacts(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,project_id CHAR(36) NOT NULL,run_id CHAR(36) NOT NULL,version VARCHAR(30) NOT NULL,name VARCHAR(200) NOT NULL,target_type VARCHAR(30) NOT NULL,manifest_json MEDIUMTEXT NOT NULL,sbom JSON NOT NULL,sha256 CHAR(64) NOT NULL,size_bytes BIGINT UNSIGNED NOT NULL,published TINYINT(1) NOT NULL DEFAULT 0,released_at DATETIME NULL,created_by_id CHAR(36) NULL,created_at DATETIME NOT NULL,KEY idx_ab_artifact(organization_id,published,created_at),CONSTRAINT fk_ab_artifact_project FOREIGN KEY(project_id) REFERENCES app_builder_projects(id) ON DELETE CASCADE,CONSTRAINT fk_ab_artifact_run FOREIGN KEY(run_id) REFERENCES app_builder_runs(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_builder_approvals(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,artifact_id CHAR(36) NOT NULL,project_id CHAR(36) NOT NULL,run_id CHAR(36) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'pending',requested_by CHAR(36) NULL,decided_by VARCHAR(120) NULL,decided_at DATETIME NULL,note VARCHAR(500) NULL,created_at DATETIME NOT NULL,KEY idx_ab_approval(organization_id,status,created_at),CONSTRAINT fk_ab_approval_artifact FOREIGN KEY(artifact_id) REFERENCES app_builder_artifacts(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gift_cards (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,type VARCHAR(30) NOT NULL,code VARCHAR(32) NOT NULL,initial_balance_cents BIGINT UNSIGNED NOT NULL,balance_cents BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,status VARCHAR(30) NOT NULL DEFAULT 'issued',pin_hash VARCHAR(255) NULL,issuer_id CHAR(36) NULL,recipient_id CHAR(36) NULL,issued_at DATETIME NOT NULL,expires_at DATETIME NULL,last_used_at DATETIME NULL,personal_message TEXT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_gift_card_code(code),KEY idx_gc_org_status(organization_id,status,created_at),CONSTRAINT fk_gc_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_gc_issuer FOREIGN KEY(issuer_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gift_card_transactions (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,card_id CHAR(36) NOT NULL,kind VARCHAR(20) NOT NULL,amount_cents BIGINT NOT NULL,currency CHAR(3) NOT NULL,order_id VARCHAR(190) NULL,created_at DATETIME NOT NULL,UNIQUE KEY uq_gc_order(card_id,order_id),KEY idx_gc_tx_org(organization_id,created_at),CONSTRAINT fk_gc_tx_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_gc_tx_card FOREIGN KEY(card_id) REFERENCES gift_cards(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gift_card_fraud_flags (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,card_id CHAR(36) NOT NULL,reason VARCHAR(500) NOT NULL,severity ENUM('low','medium','high') NOT NULL,flagged_at DATETIME NOT NULL,resolved TINYINT(1) NOT NULL DEFAULT 0,resolved_at DATETIME NULL,resolved_by CHAR(36) NULL,KEY idx_gc_fraud(organization_id,resolved,flagged_at),CONSTRAINT fk_gc_fraud_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_gc_fraud_card FOREIGN KEY(card_id) REFERENCES gift_cards(id) ON DELETE CASCADE,CONSTRAINT fk_gc_fraud_user FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gift_card_loyalty_programs (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,name VARCHAR(140) NOT NULL,multiplier DECIMAL(8,3) NOT NULL DEFAULT 1,points_issued BIGINT UNSIGNED NOT NULL DEFAULT 0,member_count INT UNSIGNED NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,KEY idx_gc_loyalty_org(organization_id,name),CONSTRAINT fk_gc_loyalty_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gift_card_invoice_allocations (id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,invoice_id CHAR(36) NOT NULL,card_id CHAR(36) NOT NULL,transaction_id CHAR(36) NOT NULL,amount_cents BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,created_at DATETIME NOT NULL,UNIQUE KEY uq_gc_invoice_card(invoice_id,card_id),KEY idx_gc_allocation_org(organization_id,created_at),CONSTRAINT fk_gc_alloc_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_gc_alloc_invoice FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,CONSTRAINT fk_gc_alloc_card FOREIGN KEY(card_id) REFERENCES gift_cards(id),CONSTRAINT fk_gc_alloc_tx FOREIGN KEY(transaction_id) REFERENCES gift_card_transactions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS helpdesk_sequences(organization_id CHAR(36) PRIMARY KEY,next_number INT UNSIGNED NOT NULL,CONSTRAINT fk_hd_seq_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS helpdesk_tickets(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,number VARCHAR(30) NOT NULL,subject VARCHAR(200) NOT NULL,description TEXT NULL,status VARCHAR(20) NOT NULL,priority VARCHAR(20) NOT NULL,channel VARCHAR(20) NOT NULL,requester_name VARCHAR(120) NOT NULL,requester_email VARCHAR(254) NULL,assignee_id CHAR(36) NULL,contact_id CHAR(36) NULL,company_id CHAR(36) NULL,tags JSON NOT NULL,sla_due_at DATETIME NULL,resolved_at DATETIME NULL,closed_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,UNIQUE KEY uq_hd_number(organization_id,number),KEY idx_hd_queue(organization_id,status,priority,created_at),CONSTRAINT fk_hd_org FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,CONSTRAINT fk_hd_contact FOREIGN KEY(contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL,CONSTRAINT fk_hd_company FOREIGN KEY(company_id) REFERENCES crm_companies(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS helpdesk_comments(id CHAR(36) PRIMARY KEY,organization_id CHAR(36) NOT NULL,ticket_id CHAR(36) NOT NULL,author_name VARCHAR(120) NOT NULL,author_id CHAR(36) NULL,body TEXT NOT NULL,internal TINYINT(1) NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,KEY idx_hd_comment(ticket_id,created_at),CONSTRAINT fk_hd_comment_ticket FOREIGN KEY(ticket_id) REFERENCES helpdesk_tickets(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Enterprise AI Kernel + AI provider registry (Node Session 39 parity).
-- Seeded here so a fresh install needs no post-import migration. Existing
-- installs get the identical objects from application/migrations/002_kernel_module.sql.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kernel_components (
  component_key VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('booting','online','degraded','offline','stub') NOT NULL DEFAULT 'online',
  message_rate INT UNSIGNED NOT NULL DEFAULT 0,
  error_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  last_heartbeat DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (component_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_events (
  id CHAR(11) NOT NULL,
  kind VARCHAR(80) NOT NULL,
  source VARCHAR(120) NOT NULL,
  target VARCHAR(120) NULL,
  payload JSON NULL,
  organization_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_kernel_events_time (created_at),
  KEY idx_kernel_events_kind (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_key VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_kernel_counter_time (counter_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_latencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  latency_ms INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_kernel_latency_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_state (
  state_key VARCHAR(60) NOT NULL,
  state_value TEXT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (state_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The 20 components seeded by Node's `KernelService.ensureStarted()`.
-- `INSERT IGNORE` so re-running this migration never resets a component that
-- has since taken a heartbeat.
INSERT IGNORE INTO kernel_components
  (component_key, name, status, message_rate, error_rate, last_heartbeat, updated_at)
VALUES
  ('comm-bus',  'AI Communication Bus',         'stub',   0, 0, NOW(), NOW()),
  ('compute',   'Compute Allocation',           'online', 0, 0, NOW(), NOW()),
  ('context',   'Universal Context Mgmt',       'online', 0, 0, NOW(), NOW()),
  ('diag',      'Self-Diagnostics',             'online', 0, 0, NOW(), NOW()),
  ('event-bus', 'Event Bus',                    'online', 0, 0, NOW(), NOW()),
  ('heal',      'Self-Healing',                 'online', 0, 0, NOW(), NOW()),
  ('health',    'Enterprise Health Monitoring', 'online', 0, 0, NOW(), NOW()),
  ('kg-sync',   'Knowledge Synchronization',    'stub',   0, 0, NOW(), NOW()),
  ('media',     'Media Orchestration',          'stub',   0, 0, NOW(), NOW()),
  ('memory',    'Global Memory Coordination',   'stub',   0, 0, NOW(), NOW()),
  ('model-sel', 'Intelligent Model Selection',  'online', 0, 0, NOW(), NOW()),
  ('perf',      'Performance Optimization',     'online', 0, 0, NOW(), NOW()),
  ('policy',    'Policy Enforcement',           'online', 0, 0, NOW(), NOW()),
  ('reasoning', 'Global Reasoning Engine (lite)','online', 0, 0, NOW(), NOW()),
  ('res-agent', 'Agent Scheduling',             'online', 0, 0, NOW(), NOW()),
  ('res-ai',    'AI Resource Scheduling',       'online', 0, 0, NOW(), NOW()),
  ('security',  'Security Enforcement',         'online', 0, 0, NOW(), NOW()),
  ('self-opt',  'Autonomous Self-Optimization', 'online', 0, 0, NOW(), NOW()),
  ('voice',     'Voice Orchestration',          'stub',   0, 0, NOW(), NOW()),
  ('workflow',  'Workflow Orchestration',       'online', 0, 0, NOW(), NOW());

-- ---------------------------------------------------------------------------
-- Tenant Isolation (Node Session 89) + Usage Intelligence (Session 55/123).
-- Seeded here so a fresh install needs no post-import migration. Existing
-- installs get the identical objects from
-- application/migrations/003_tenant_isolation_and_usage.sql.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_isolation_policies (
  organization_id CHAR(36) NOT NULL,
  allow_cross_tenant_export TINYINT(1) NOT NULL DEFAULT 0,
  allow_external_sharing TINYINT(1) NOT NULL DEFAULT 0,
  pii_redaction_level ENUM('none','basic','strict') NOT NULL DEFAULT 'basic',
  retention_days INT NOT NULL DEFAULT 365,
  region_pin VARCHAR(64) NULL,
  updated_at DATETIME NOT NULL,
  updated_by CHAR(36) NULL,
  PRIMARY KEY (organization_id),
  CONSTRAINT fk_ti_policy_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_isolation_runs (
  id CHAR(14) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  status ENUM('compliant','review_required','failed') NOT NULL,
  score SMALLINT NOT NULL,
  namespaces JSON NOT NULL,
  probes JSON NOT NULL,
  findings JSON NOT NULL,
  summary VARCHAR(500) NOT NULL,
  ran_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ti_runs_org_time (organization_id, ran_at),
  CONSTRAINT fk_ti_run_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sentinel rows for the cross-tenant self-test. Deliberately NOT foreign-keyed
-- to organizations: the probe invents a throwaway organization id that must not
-- exist, because the thing being proved is that another tenant's scope cannot
-- see it. A foreign key here would make the probe unrepresentable.
CREATE TABLE IF NOT EXISTS tenant_isolation_probes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  probe_key VARCHAR(64) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_ti_probe_org (organization_id, probe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_events (
  id CHAR(22) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  feature VARCHAR(64) NOT NULL,
  actor VARCHAR(120) NOT NULL,
  quantity DECIMAL(20,4) NOT NULL DEFAULT 0,
  unit VARCHAR(24) NOT NULL,
  meta JSON NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_usage_events_org_time (organization_id, created_at),
  CONSTRAINT fk_usage_event_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Security & governance (Node slices 110/114/118 + governance.service.ts).
-- Seeded here so a fresh install needs no post-import migration. Existing
-- installs get the identical objects from
-- application/migrations/004_security_module.sql.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS security_counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_key VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_sec_counter_time (counter_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_breakers (
  name VARCHAR(80) NOT NULL,
  state ENUM('closed','open','half-open') NOT NULL DEFAULT 'closed',
  failures INT UNSIGNED NOT NULL DEFAULT 0,
  successes INT UNSIGNED NOT NULL DEFAULT 0,
  opened_at DATETIME NULL,
  next_probe DATETIME NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_incidents (
  id CHAR(14) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL,
  status ENUM('reported','investigating','contained','resolved','postmortem') NOT NULL DEFAULT 'reported',
  reported_by CHAR(36) NULL,
  area ENUM('auth','data','ai','billing','infra','abuse','other') NOT NULL,
  timeline JSON NOT NULL,
  runbook_executions JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_incident_org_time (organization_id, created_at),
  KEY idx_sec_incident_status (status),
  CONSTRAINT fk_sec_incident_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_incident_runbooks (
  id CHAR(11) NOT NULL,
  organization_id CHAR(36) NULL,
  name VARCHAR(100) NOT NULL,
  trigger_severity ENUM('low','medium','high','critical') NOT NULL,
  trigger_area ENUM('auth','data','ai','billing','infra','abuse','other') NOT NULL,
  actions JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_runbook_org (organization_id, trigger_severity, trigger_area),
  CONSTRAINT fk_sec_runbook_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_runbook_executions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  runbook_id CHAR(11) NOT NULL,
  incident_id CHAR(14) NOT NULL,
  status VARCHAR(20) NOT NULL,
  output JSON NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_sec_rbexec_runbook (runbook_id, created_at),
  KEY idx_sec_rbexec_incident (incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_access_review_campaigns (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  dormant_days INT UNSIGNED NOT NULL DEFAULT 90,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  snapshot JSON NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_campaign_org_time (organization_id, created_at),
  CONSTRAINT fk_sec_campaign_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_access_review_items (
  id CHAR(36) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('PENDING','APPROVED','REVOKED','QUARANTINED') NOT NULL DEFAULT 'PENDING',
  reviewed_by CHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sec_review_item (campaign_id, user_id),
  KEY idx_sec_review_campaign (campaign_id, status),
  CONSTRAINT fk_sec_review_campaign FOREIGN KEY (campaign_id) REFERENCES security_access_review_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sec_review_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Global Platform — observability, regions/DR, CDN control plane.
-- Seeded here so a fresh install needs no post-import migration. Existing
-- installs get the identical objects from
-- application/migrations/005_platform_module.sql.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_metric_counters (
  name VARCHAR(80) NOT NULL,
  tag_key VARCHAR(120) NOT NULL DEFAULT '',
  bucket_at DATETIME NOT NULL,
  value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name, tag_key, bucket_at),
  KEY idx_pmc_time (bucket_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_metric_histograms (
  name VARCHAR(80) NOT NULL,
  tag_key VARCHAR(120) NOT NULL DEFAULT '',
  bucket_at DATETIME NOT NULL,
  count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sum` DOUBLE NOT NULL DEFAULT 0,
  `min` DOUBLE NOT NULL DEFAULT 0,
  `max` DOUBLE NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name, tag_key, bucket_at),
  KEY idx_pmh_time (bucket_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_spans (
  span_id CHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  parent_span_id CHAR(16) NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('server','client','internal','producer','consumer') NOT NULL DEFAULT 'internal',
  organization_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  status ENUM('ok','error') NOT NULL DEFAULT 'ok',
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_ms INT UNSIGNED NULL,
  error_message VARCHAR(500) NULL,
  attributes JSON NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (span_id),
  KEY idx_pspan_trace (trace_id),
  KEY idx_pspan_time (started_at),
  CONSTRAINT fk_pspan_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_state (
  state_key VARCHAR(60) NOT NULL,
  value JSON NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (state_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_cdn_rules (
  id CHAR(36) NOT NULL,
  path_pattern VARCHAR(200) NOT NULL,
  ttl_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  stale_while_revalidate INT UNSIGNED NOT NULL DEFAULT 0,
  cache_key_includes JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pcdn_rule_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_cdn_purges (
  id CHAR(36) NOT NULL,
  paths JSON NOT NULL,
  status ENUM('pending','complete','skipped') NOT NULL DEFAULT 'pending',
  detail VARCHAR(500) NULL,
  requested_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_pcdn_purge_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cache rules are configuration, not measurement: these are the three defaults
-- cdn.service.ts ships, so an operator sees the same starting policy.
INSERT IGNORE INTO platform_cdn_rules (id, path_pattern, ttl_seconds, stale_while_revalidate, cache_key_includes, enabled, sort_order, updated_at) VALUES
('00000000-0000-4000-8000-000000000301', '/assets/*',       31536000, 0, '[]',                 1, 1, NOW()),
('00000000-0000-4000-8000-000000000302', '/api/rest/v1/*',         0, 0, '["Authorization"]',  0, 2, NOW()),
('00000000-0000-4000-8000-000000000303', '/*',                     0, 0, '[]',                 1, 3, NOW());

-- ---------------------------------------------------------------------------
-- Module Center — signed module package registry (.wmod) + lifecycle state
-- machine. Seeded here so a fresh install needs no post-import migration.
-- Existing installs get the identical objects from
-- application/migrations/006_module_center.sql.
--
-- Note: no seed rows. A module registry with zero modules is the correct empty
-- state; modules only appear when a Super Admin uploads a signed package.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_modules (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  module_key            VARCHAR(80)  NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  package_type          ENUM('module','plugin','integration','approved_software') NOT NULL DEFAULT 'module',
  description           TEXT         NULL,
  vendor                VARCHAR(120) NULL,
  status                ENUM('UPLOADED','SCANNING','VALIDATING','COMPATIBILITY_CHECK','SANDBOX_TEST','VALIDATED','APPROVED','INSTALLING','MIGRATING','HEALTH_CHECK','ACTIVE','DISABLED','FAILED','ROLLING_BACK','QUARANTINED','REMOVING','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  health                ENUM('UNKNOWN','HEALTHY','DEGRADED','UNHEALTHY','DISABLED','QUARANTINED') NOT NULL DEFAULT 'UNKNOWN',
  enabled               TINYINT(1)   NOT NULL DEFAULT 0,
  current_version       VARCHAR(40)  NULL,
  active_release_id     CHAR(36)     NULL,
  manifest              JSON         NULL,
  dependencies          JSON         NULL,
  permissions           JSON         NULL,
  runtime_registration  JSON         NULL,
  installed_by_id       CHAR(36)     NULL,
  installed_at          DATETIME     NULL,
  last_health_check_at  DATETIME     NULL,
  last_error            TEXT         NULL,
  created_at            DATETIME     NOT NULL,
  updated_at            DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_modules_key (module_key),
  KEY idx_platform_modules_status (status),
  KEY idx_platform_modules_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_releases (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  module_registry_id   CHAR(36)     NOT NULL,
  version              VARCHAR(40)  NOT NULL,
  status               ENUM('UPLOADED','SCANNING','VALIDATING','COMPATIBILITY_CHECK','SANDBOX_TEST','VALIDATED','APPROVED','INSTALLING','MIGRATING','HEALTH_CHECK','ACTIVE','DISABLED','FAILED','ROLLING_BACK','QUARANTINED','REMOVING','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  checksum             CHAR(64)     NOT NULL,
  artifact_path        VARCHAR(500) NOT NULL,
  package_size_bytes   BIGINT       NOT NULL DEFAULT 0,
  manifest             JSON         NULL,
  signature_key_id     VARCHAR(120) NULL,
  signature_verified   TINYINT(1)   NOT NULL DEFAULT 0,
  scan_status          ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  compatibility_status ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  sandbox_status       ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  approval_status      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  migration_status     ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_REQUIRED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  verification_report  JSON         NULL,
  sandbox_report       JSON         NULL,
  health_report        JSON         NULL,
  rollback_metadata    JSON         NULL,
  previous_release_id  CHAR(36)     NULL,
  uploaded_by_id       CHAR(36)     NULL,
  verified_at          DATETIME     NULL,
  sandboxed_at         DATETIME     NULL,
  approved_by_id       CHAR(36)     NULL,
  approved_at          DATETIME     NULL,
  installed_by_id      CHAR(36)     NULL,
  installed_at         DATETIME     NULL,
  created_at           DATETIME     NOT NULL,
  updated_at           DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_module_releases_version (module_registry_id, version),
  KEY idx_platform_module_releases_module (module_registry_id),
  KEY idx_platform_module_releases_status (status),
  KEY idx_platform_module_releases_checksum (checksum),
  CONSTRAINT fk_platform_module_releases_module FOREIGN KEY (module_registry_id) REFERENCES platform_modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_uploads (
  id               CHAR(36)      NOT NULL PRIMARY KEY,
  original_name    VARCHAR(255)  NOT NULL,
  checksum         CHAR(64)      NOT NULL,
  size_bytes       BIGINT        NOT NULL DEFAULT 0,
  artifact_path    VARCHAR(500)  NULL,
  status           ENUM('UPLOADED','SCANNING','VALIDATED','INSTALLING','ACTIVE','DISABLED','FAILED','QUARANTINED','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  manifest_id      VARCHAR(80)   NULL,
  manifest_version VARCHAR(40)   NULL,
  signature_key_id VARCHAR(120)  NULL,
  report           JSON          NULL,
  release_id       CHAR(36)      NULL,
  uploaded_by_id   CHAR(36)      NULL,
  created_at       DATETIME      NOT NULL,
  updated_at       DATETIME      NOT NULL,
  KEY idx_platform_module_uploads_checksum (checksum),
  KEY idx_platform_module_uploads_release (release_id),
  KEY idx_platform_module_uploads_created (created_at),
  CONSTRAINT fk_platform_module_uploads_release FOREIGN KEY (release_id) REFERENCES platform_module_releases (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_operations (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  module_registry_id CHAR(36)    NOT NULL,
  release_id        CHAR(36)     NULL,
  operation_type    ENUM('UPLOAD','VERIFY','SANDBOX_TEST','APPROVE','INSTALL','UPDATE','ENABLE','DISABLE','RESTART','HEALTH_CHECK','ROLLBACK','REMOVE') NOT NULL,
  status            ENUM('RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'RUNNING',
  idempotency_key   VARCHAR(180) NOT NULL,
  correlation_id    VARCHAR(100) NULL,
  from_version      VARCHAR(40)  NULL,
  to_version        VARCHAR(40)  NULL,
  requested_by_id   CHAR(36)     NULL,
  request           JSON         NULL,
  result            JSON         NULL,
  logs              JSON         NULL,
  error_code        VARCHAR(80)  NULL,
  error_message     TEXT         NULL,
  started_at        DATETIME     NULL,
  finished_at       DATETIME     NULL,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_module_operations_key (idempotency_key),
  KEY idx_platform_module_operations_module (module_registry_id),
  KEY idx_platform_module_operations_type (operation_type),
  KEY idx_platform_module_operations_created (created_at),
  CONSTRAINT fk_platform_module_operations_module FOREIGN KEY (module_registry_id) REFERENCES platform_modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Autonomous Organization — board-decision approval register. Seeded here so a
-- fresh install needs no post-import migration. Existing installs get the
-- identical table from application/migrations/007_autonomous_module.sql.
--
-- No seed rows: an organization with no proposals is the correct empty state.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS autonomous_decisions (
  -- Node mints ids as `decision-<uuid>` (autonomous.service.ts: uid()).
  id                   CHAR(45)      NOT NULL PRIMARY KEY,
  organization_id      CHAR(36)      NOT NULL,
  title                VARCHAR(200)  NOT NULL,
  department           VARCHAR(64)   NOT NULL,
  recommendation       TEXT          NOT NULL,
  confidence           DECIMAL(4,3)  NOT NULL DEFAULT 0,
  risk_level           ENUM('low','med','high','critical') NOT NULL DEFAULT 'low',
  estimated_impact_usd DECIMAL(20,2) NOT NULL DEFAULT 0,
  status               ENUM('drafted','awaiting_human','approved','rejected','executing','executed') NOT NULL DEFAULT 'awaiting_human',
  human_approver       CHAR(36)      NULL,
  reasoning            TEXT          NOT NULL,
  decision_note        VARCHAR(2000) NULL,
  created_at           DATETIME      NOT NULL,
  decided_at           DATETIME      NULL,
  updated_at           DATETIME      NOT NULL,
  KEY idx_autonomous_decisions_org (organization_id, created_at),
  KEY idx_autonomous_decisions_status (organization_id, status),
  KEY idx_autonomous_decisions_department (organization_id, department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
