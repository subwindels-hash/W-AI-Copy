# WINDELS AI OS — Architecture Diagrams (ASCII)

## Diagram 4: Module Dependency Graph

```
[Clients] --> [API Gateway] --> [Core Platform] --> [All Other Layers]
                                                        |
                      +--------------------------------+
                      |                                |
                      v                                v
            [Persistence Layer]              [Cross-Module Events via Redis]
                      |                                |
              +-------+-------+                +-------+-------+
              |               |                |               |
         PostgreSQL        Redis           Event Bus        File Storage
```

### Layer Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                               │
│   Web (React)    Desktop (Electron)    Mobile (PWA)           │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY LAYER                            │
│   Express + Auth Middleware + Org Scoping + Rate Limiting      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CORE PLATFORM LAYER                           │
│   (AI OS Orchestration - provides services to all other layers)│
│                                                                 │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│   │  Auth   │ │   MFA   │ │ Kernel  │ │Security │ │Permiss.│ │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘ │
│   ┌─────────┐ ┌─────────┐                                     │
│   │  Audit  │ │Notifcns │                                     │
│   └─────────┘ └─────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
            +---------------+---------------+
            |               |               |
            v               v               v
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  AI PLATFORM     │ │INFRASTRUCTURE    │ │ VOICE & MEDIA    │
│  (AI Employees)  │ │& PLATFORM        │ │                  │
│                  │ │                  │ │                  │
│  Agents          │ │ Platform         │ │ Voice            │
│  AgentComm       │ │ Infrastructure   │ │ VoiceOwnership   │
│  AgentMemory     │ │ Engineering      │ │ WakeIntel        │
│  AI Platform     │ │ Releases         │ │ MediaGen         │
│  AI Economy      │ │ DR               │ │ MediaFactory     │
│  Experts         │ │ Updates          │ │ MusicGen         │
│  AI Engineering  │ │                  │ │ MusicVideo       │
│                  │ │                  │ │ WebsiteBuilder   │
│                  │ │                  │ │ SocialPlatform   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
            │               │               |
            +---------------+---------------+
                            |
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                BUSINESS APPLICATIONS LAYER                     │
│   CRM | LeadDiscovery | Helpdesk | EmailIntel | ERP |        │
│   Marketing | Billing | Payments | GiftCards | GlobalCurrency │
│   EnterpriseFinOps | GeoBilling                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   COLLABORATION LAYER                          │
│   Conversations | Talk | CanvasCollab | Composer | Extensions │
│   Marketplace                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DATA & INTELLIGENCE LAYER                     │
│   EnterpriseSearch | Cognitive | IdentityKnowledge | BI |     │
│   Usage | DataMarketplace                                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              ENTERPRISE SERVICES LAYER                         │
│   Enterprise | EnterpriseFoundation | TenantIsolation         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               DOMAIN INTELLIGENCE LAYER                       │
│   TradingIntel | Derivatives | BrokerIntegration | CryptoIntel│
│   HealthEco | Biomedical | Legal | Scientific | Education    │
│   Cyber | Quantum | Robotics | Spatial | Sustainability      │
│   OpEx | Constitution | Autonomous | Industry                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  OPERATIONS & GOVERNANCE                       │
│   Command | Program | QA | Benchmarks | Architecture         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                           │
│   PostgreSQL 17 (Prisma) | Redis 8 | File Storage            │
└─────────────────────────────────────────────────────────────────┘
```
