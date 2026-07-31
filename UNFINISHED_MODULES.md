# Unfinished modules — audit baseline

Generated from `audit/module-inventory.json` in the supplied archive. Status reflects the audit snapshot and should be revalidated before each implementation; some later completion notes may supersede an entry.

## MISSING (5)
- ~~Admin Utilities (`admin`)~~ — **completed in this workspace**: scoped operational stats/user search, suspension controls, super-admin role changes, validation, RBAC, and audit records.
- ~~Message Attachments (`attachments`, S4)~~ — **completed in this workspace**: authenticated upload, download, list/search, safe deletion, organization-scoped access, and chat-message linking. Needs runtime/integration testing after dependencies are installed.
- Canvas Collab (`canvas`, S22) — `/api/v1/canvas`
- ~~Mobile PWA (`mobile`, S21)~~ — **already complete in the supplied codebase**: installable manifest, service worker, offline app shell and queue, push, biometrics, safe areas, mobile route shell, and native-style mobile pages. Audit entry was stale.
- ~~Prompt Template Library (`promptTemplates`, S23)~~ — **completed in this workspace**: organization-scoped template CRUD, built-ins, safe rendering/use tracking, validation, and repaired agent-runtime renderer.

## STUB (17)
- Agent Communication (`agentComm`) — `/api/v1/agentComm`
- ~~Agent Framework (`agents`, S7–8)~~ — **completed in this workspace**: validated CRUD, skills/tool controls, lifecycle transitions/history, memories, knowledge, events, organization scoping, and corrected static route precedence.
- ~~AI Economy/GPU (`aiEconomy`, S71)~~ — **internal-ledger scope completed in this workspace**: organization-scoped recorded usage/allocation ledger and non-synthetic rollup. Cloud provider connectors remain a future integration.
- ~~Autonomous Org (`autonomous`, S72)~~ — **approval-first scope completed in this workspace**: organization-scoped proposals, mandatory human resolution, immutable decision timestamps, and no autonomous execution.
- Billing & Subscriptions (`billing`, S20) — `/api/v1/billing`
- ~~Cognitive/World (`cognitive`, S69)~~ — **observability scope completed in this workspace**: organization-scoped real platform counts/health rollup; synthetic predictions, federation, and world-model claims removed.
- ~~Command Center (`command`, S70)~~ — **internal operations scope completed in this workspace**: organization-scoped counts for members, agents, workflows, tasks, and conversations; all fake global/revenue/incident metrics removed.
- ~~Conversations/Messaging (`conversations`, S2–4)~~ — **completed in this workspace**: participant-scoped access, CUID/query validation, paginated message retrieval, agent/parent validation, attachment linkage, and SSE chat flow.
- Core Integration (`coreIntegration`, S45) — `/api/v1/core-integration`
- Developers Public Pages (`developers`) — `/api/v1/developers`
- Industry Packs (`industry`, S74) — `/api/v1/industry`
- Infrastructure Monitoring (`infrastructure`) — `/api/v1/infrastructure`
- ~~OpEx/Trust/Safety (`opex`, S73)~~ — **safety-register scope completed in this workspace**: organization-scoped safety findings with administrator acknowledgement/resolution; all simulated trust/compliance claims removed.
- ~~Public API (`publicApi`)~~ — **completed in this workspace**: API-key authenticated REST v1 gateway with tenant scoping, scopes, key hashing/revocation/expiry, validated workflow and Talk operations, and no query-string key support.
- ~~Sustainability/ESG (`sustainability`, S64)~~ — **measurement-ledger scope completed in this workspace**: organization-scoped activity/emissions records with disclosed factors; all fabricated ESG, supplier, offset, and compliance claims removed.
- ~~Talk / Voice Channels (`talk`, S5–6)~~ — **completed in this workspace**: persisted channels, DMs, messages, threads, reactions, meetings, action items, polling, AI participants, and organization/uploader-scoped attachment claiming.
- ~~Usage Intel (`usage`, S55)~~ — **completed in this workspace**: organization-scoped, database-derived 30-day activity rollup; fabricated cost, ROI, carbon, productivity, and infrastructure claims removed.

## PARTIAL (10)
- ~~Benchmarks (`benchmarks`, S50)~~ — **result-registry scope completed in this workspace**: tenant-scoped imported/manual benchmark records with evaluator, evidence, metrics, and explicit pass criteria; random evaluation results removed.
- Developer Portal (`devportal`, S27)
- ~~Education (`education`, S67)~~ — **Lecturer AI scope completed in this workspace**: adaptive tutor sessions, mastery tracking, assessments, follow-ups, provider/fallback disclosure, and validated session routes. Legacy course catalog remains starter content.
- Engineering/Observability (`engineering`, S26)
- Gift Cards WMPC (`giftCards`, S79)
- Legal Research (`legal`, S66)
- Media Generation (`mediaGen`, S42)
- Release Pipeline (`release`)
- ~~Security (`security`)~~ — **completed in this workspace**: admin-gated scorecards, security self-tests, prompt guard, encryption and rate-limit visibility, circuit breakers, incident response, and access reviews; incident IDs validated.
- Spatial (`spatial`, S58)

## DEMO DATA (43)
- AI Ecosystem (`aiEcosystem`)
- Architecture ESI (`architecture`, S37)
- Biomedical (`biomedical`, S65)
- Collaboration Primitives (`collaboration`, S22)
- Composer/Workflows (`composer`, S49)
- Constitution (`constitution`, S48)
- Crypto Intel (`cryptoIntelligence`, S35)
- Cyber Academy (`cyber`, S82)
- Data Marketplace (`dataMarketplace`, S61)
- Deployment (`deployment`, S52)
- Digital Humans (`digitalHumans`, S62)
- DR/BCP (`disasterRecovery`, S53)
- Enterprise Foundation (`enterpriseFoundation`)
- Experts (`expertsPlatform`, S77a)
- Plugin System (`extensions`)
- Intelligence Fabric (`fabric`, S56)
- Global Currency (`globalCurrency`, S80)
- Governance Engine (`governance`, S48/S73)
- Health V10 (`healthEcosystem`, S75)
- Hybrid Execution (`hybridExec`, S43)
- Licensing (`licensing`, S51)
- Plugin Marketplace (`marketplace`)
- Media Factory (`mediaFactory`, S77b)
- Memory Evolution (`memoryEvolution`, S47)
- ML Ops (`mlOps`)
- Model Factory (`modelFactory`, S46)
- Platform Services (`platformServices`)
- Program Management (`program`, S25)
- QA Engine (`qa`)
- Quantum (`quantum`, S63)
- Robotics (`robotics`, S57)
- Scientific Research (`scientific`, S68)
- SDK (`sdk`, S59)
- Self-Hosted Inference (`selfHosted`, S38)
- Trading Intel (`tradingIntel`, S81)
- Training/LoRA (`training`, S60)
- OTA Updates (`updates`, S54)
- UX Intel (`uxIntelligence`, S78)
- S76 Validation (`v76validation`, S76)
- Voice Foundry (`voiceFoundry`, S41)
- Voice Ownership/Consent (`voiceOwnership`, S44)
- Voice Studio (`voiceStudio`, S40)
- Wake-word Intel (`wakeIntel`)
