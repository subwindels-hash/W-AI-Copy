-- ─── Database Initialization Script ─────────────────────────────────────────
-- WINDELS AI OS
-- 
-- This script initializes the database with required extensions, schemas, and
-- default data.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS windels;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set search path
SET search_path TO windels, public;

-- ─── Utility Functions ────────────────────────────────────────────────────────

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to generate UUID
CREATE OR REPLACE FUNCTION generate_uuid()
RETURNS UUID AS $$
BEGIN
    RETURN uuid_generate_v4();
END;
$$ language 'plpgsql';

-- ─── Base Tables ──────────────────────────────────────────────────────────────

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(50) DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Models table
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    model_type VARCHAR(100) NOT NULL,
    framework VARCHAR(100),
    status VARCHAR(50) DEFAULT 'draft',
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

-- Model versions table
CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    artifact_url VARCHAR(500),
    artifact_size BIGINT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(model_id, version)
);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    environment VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    endpoint_url VARCHAR(500),
    configuration JSONB DEFAULT '{}',
    deployed_by UUID REFERENCES users(id),
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON organization_members(role);

CREATE INDEX IF NOT EXISTS idx_models_org ON models(organization_id);
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
CREATE INDEX IF NOT EXISTS idx_models_type ON models(model_type);

CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions(status);

CREATE INDEX IF NOT EXISTS idx_deployments_version ON deployments(model_version_id);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_versions_updated_at BEFORE UPDATE ON model_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Audit Tables ─────────────────────────────────────────────────────────────

-- Audit log table
CREATE TABLE IF NOT EXISTS audit.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit.audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit.audit_log(created_at);

-- ─── Default Data ─────────────────────────────────────────────────────────────

-- Insert default organization (if not exists)
INSERT INTO organizations (id, name, slug, description, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Organization',
    'default',
    'Default organization for the platform',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- ─── Grants ───────────────────────────────────────────────────────────────────

-- Grant permissions to application user
GRANT USAGE ON SCHEMA windels TO windels;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA windels TO windels;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA windels TO windels;
GRANT USAGE ON SCHEMA audit TO windels;
GRANT INSERT, SELECT ON ALL TABLES IN SCHEMA audit TO windels;

-- Grant permissions to read-only user (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'windels_readonly') THEN
        GRANT USAGE ON SCHEMA windels TO windels_readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA windels TO windels_readonly;
        GRANT USAGE ON SCHEMA audit TO windels_readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA audit TO windels_readonly;
    END IF;
END $$;

-- ─── Completion Message ───────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '✅ Database initialization completed successfully';
    RAISE NOTICE '   - Extensions enabled';
    RAISE NOTICE '   - Schemas created';
    RAISE NOTICE '   - Tables created';
    RAISE NOTICE '   - Indexes created';
    RAISE NOTICE '   - Triggers created';
    RAISE NOTICE '   - Default data inserted';
    RAISE NOTICE '   - Permissions granted';
END $$;
