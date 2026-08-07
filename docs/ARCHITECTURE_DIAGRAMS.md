# WINDELS AI OS — Architecture Diagrams

**Version:** 4.0  
**Date:** 2026-08-07  

This document contains architecture diagrams in Mermaid format (renderable in GitHub) and ASCII format (for plain text).

See also:
- `docs/MODULE_ARCHITECTURE.md` — Full module specification
- `docs/MODULE_DEPENDENCY_MAP.md` — Dependency graph

---

## Diagram 1: Overall System Architecture

```mermaid
graph TB
    subgraph CLIENT_LAYER["👤 Client Layer"]
        Web[Web App<br/>React 19 + Vite]
        Desktop[Desktop Shell<br/>Electron 33]
        Mobile[Mobile/PWA<br/>Service Workers]
    end

    subgraph API_GATEWAY["🌐 API Gateway Layer"]
        Express[Express Server<br/>Node.js 20]
        AuthMW[Auth Middleware<br/>JWT Validation]
        OrgMW[Org Scoping<br/>Tenant Isolation]
    end

    subgraph CORE_PLATFORM["⚙️ Core Platform (AI OS Orchestration)"]
        Auth[Auth<br/>Authentication]
        MFA[MFA<br/>TOTP + Policies]
        Kernel[AI Kernel<br/>Provider Registry<br/>Prompt Guard]
        Security[Security<br/>Encryption<br/>PII Redaction]
        Permissions[Permissions<br/>RBAC]
        Audit[Audit<br/>Centralized Logging]
        Notifications[Notifications<br/>Multi-Channel]
    end

    subgraph AI_PLATFORM["🤖 AI Platform (AI Employees Execution)"]
        Agents[Agents<br/>Lifecycle<br/>Skills]
        AgentComm[Agent Comm<br/>Messaging<br/>Teams<br/>Handoffs]
        AgentMemory[Agent Memory<br/>Memory<br/>Knowledge]
        AIPlatform[AI Platform<br/>Providers<br/>Models<br/>Routing]
        AIEconomy[AI Economy<br/>GPU Ledger<br/>Usage]
        Experts[Experts Platform<br/>Domain Experts]
        AIEng[AI Engineering<br/>18 Engineers<br/>GitHub]
    end

    subgraph INFRA_PLATFORM["🏗️ Infrastructure & Platform"]
        Platform[Platform Admin<br/>Regions<br/>CDN<br/>DR]
        Infra[Infrastructure<br/>Monitoring<br/>Cluster]
        Engineering[Engineering<br/>Metrics<br/>Deployments]
        Releases[Releases<br/>Environments<br/>Canary]
    end

    subgraph VOICE_MEDIA["🎤 Voice & Media Layer"]
        Voice[Voice<br/>Synthesis<br/>Creation]
        VoiceOwner[Voice Ownership<br/>Consent<br/>Audit]
        WakeIntel[Wake Intel<br/>Wake Word<br/>Emergency]
        MediaFactory[Media Factory<br/>Video<br/>Publishing]
        MusicGen[Music Gen<br/>Track Generation]
        WebsiteBuilder[Website Builder<br/>Sites<br/>Pages]
        SocialPlatform[Social Platform<br/>Feed<br/>Posts]
    end

    subgraph BUSINESS_APP["💼 Business Applications Layer"]
        CRM[CRM<br/>Contacts<br/>Deals]
        LeadDiscovery[Lead Discovery<br/>Leads<br/>Pipeline]
        Helpdesk[Helpdesk<br/>Tickets<br/>SLA]
        EmailIntel[Email Intel<br/>Mailboxes<br/>AI Drafting]
        ERP[ERP<br/>Products<br/>Orders]
        Billing[Billing<br/>Subscriptions<br/>Invoices]
        Payments[Payments<br/>Gateways<br/>Crypto]
    end

    subgraph COLLABORATION["🤝 Collaboration Layer"]
        Conversations[Conversations<br/>Chat<br/>Messaging]
        Talk[Talk<br/>Voice Channels<br/>Meetings]
        Composer[Composer<br/>Workflow Engine]
        Extensions[Extensions<br/>Plugin System]
    end

    subgraph PERSISTENCE["💾 Persistence Layer"]
        PostgreSQL[(PostgreSQL 17<br/>Prisma ORM)]
        Redis[(Redis 8<br/>Cache<br/>Pub/Sub)]
        FileStorage[File Storage<br/>Audio<br/>Video]
    end

    Web --> Express
    Desktop --> Express
    Mobile --> Express

    Express --> AuthMW
    AuthMW --> OrgMW
    OrgMW --> CORE_PLATFORM

    CORE_PLATFORM --> AI_PLATFORM
    CORE_PLATFORM --> INFRA_PLATFORM
    CORE_PLATFORM --> VOICE_MEDIA
    CORE_PLATFORM --> BUSINESS_APP
    CORE_PLATFORM --> COLLABORATION

    AI_PLATFORM --> PERSISTENCE
    INFRA_PLATFORM --> PERSISTENCE
    VOICE_MEDIA --> PERSISTENCE
    BUSINESS_APP --> PERSISTENCE
    COLLABORATION --> PERSISTENCE

    classDef client fill:#e3f2fd,stroke:#1976d2
    classDef gateway fill:#fff3e0,stroke:#f57c00
    classDef core fill:#f3e5f5,stroke:#7b1fa2
    classDef ai fill:#e8f5e9,stroke:#388e3c
    classDef infra fill:#fce4ec,stroke:#c2185b
    classDef voice fill:#e0f7fa,stroke:#00838f
    classDef business fill:#fff8e1,stroke:#ff8f00
    classDef collab fill:#f1f8e9,stroke:#558b2f
    classDef persistence fill:#ffebee,stroke:#b71c1c

    class Web,Desktop,Mobile client
    class Express,AuthMW,OrgMW gateway
    class Auth,MFA,Kernel,Security,Permissions,Audit,Notifications core
    class Agents,AgentComm,AgentMemory,AIPlatform,AIEconomy,Experts,AIEng ai
    class Platform,Infra,Engineering,Releases infra
    class Voice,VoiceOwner,WakeIntel,MediaFactory,MusicGen,WebsiteBuilder,SocialPlatform voice
    class CRM,LeadDiscovery,Helpdesk,EmailIntel,ERP,Billing,Payments business
    class Conversations,Talk,Composer,Extensions collab
    class PostgreSQL,Redis,FileStorage persistence
```
