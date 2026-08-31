# Unfinished modules — build code (current, 2026-08-30)

Enumerates every module whose build code is unfinished, in both builds in this repo.
Companion to `docs/UNFINISHED_MODULES.md`, which is the historical Sessions 155–197 defect audit
(closed 2026-08-16) and is retained for rationale, not as a live queue.

| | TypeScript / Node | PHP / cPanel |
|---|---|---|
| Source of truth | `audit/build-inventory.mjs` (re-run) | `php/application/controllers/` + `docs/PHP_MODULE_PARITY.md` |
| Modules considered | 156 | 155 (the 156 minus `_scaffolds`) |
| Finished | 155 `COMPLETE` | 37 ported |
| **Unfinished** | **1 STUB** | **2 partial + 116 not ported** |

**Completed since this ledger was written:** `kernel`, `tenantIsolation`, `usage`, `security` and `platform` (2026-08-30) — 58 endpoints, 22 new MySQL tables, migrations `002_kernel_module.sql`, `003_tenant_isolation_and_usage.sql`, `004_security_module.sql` and `005_platform_module.sql` — and `moduleCenter`, `moduleRuntime`, `autonomous` and `benchmarks` (2026-08-31) — 31 more endpoints, 8 new MySQL tables, migrations `006_module_center.sql`, `007_autonomous_module.sql` and `008_benchmarks_module.sql`. Eight parity specs under `tests/php-api/` cover them (81 + 77 + 153 + 146 + 124 + 54 + 157 + 146 checks). They are now listed as ported in `docs/PHP_MODULE_PARITY.md` and removed from §2.2 below.

> **The committed `audit/module-inventory.json` is stale** — 153 records, every status `COMPLETE`.
> It predates later modules and the `_scaffolds/` quarantine. Reproduce this document with:
>
> ```
> node audit/build-inventory.mjs    # -> 156 records; prints "MODULE COUNT BY STATUS"
> ```

Auditor status tally after that run: **COMPLETE 155**, **STUB 1**.

---

## 1. TypeScript / Node build — 1 unfinished module

| Module | Status | Routes | SLOC | Tests | Web client | Shared types |
|---|---|---|---|---|---|---|
| `_scaffolds` | STUB | 0 | 75 | 1 | no | no |

`apps/api/src/_scaffolds/` is a quarantine directory created in Session 212. Nothing under
`apps/api/src/http/` imports it, `tsconfig.orphans.json` excludes it from typechecking, and the
files were never executed. Its README: *"Do not import from this directory… Do not treat anything
here as verified."* The 75 SLOC the inventory counts is only `quarantine.test.ts`; the 262 drafts
themselves are **182,797 lines / 5.9 MB** of unwired code.

### 1.1 Every unfinished draft (262 names)

```
  1. adversarialDefense.service.ts
  2. agentAnalytics.service.ts
  3. agentMarketplace.service.ts
  4. agentOrchestration.service.ts
  5. agentPackaging.service.ts
  6. agentTraining.service.ts
  7. aiAccessControl.service.ts
  8. aiAlignmentRobustness.service.ts
  9. aiAuditOrchestration.service.ts
 10. aiAuditPreparation.service.ts
 11. aiAutoMLPipeline.service.ts
 12. aiAutoScaling.service.ts
 13. aiAutomatedRemediation.service.ts
 14. aiBackupManagement.service.ts
 15. aiBiasDetection.service.ts
 16. aiBiasMitigation.service.ts
 17. aiBottleneckAnalysis.service.ts
 18. aiCapacityPlanning.service.ts
 19. aiChangeImpactAnalysis.service.ts
 20. aiChangeTracking.service.ts
 21. aiCircuitBreaker.service.ts
 22. aiCollaborativeTraining.service.ts
 23. aiComplianceAutomation.service.ts
 24. aiCompressionBenchmarking.service.ts
 25. aiContractManagement.service.ts
 26. aiCostOptimization.service.ts
 27. aiCostTracking.service.ts
 28. aiCustomIntegration.service.ts
 29. aiDataGovernance.service.ts
 30. aiDataLineage.service.ts
 31. aiDataQuality.service.ts
 32. aiDataVersioning.service.ts
 33. aiDebuggingTools.service.ts
 34. aiDecisionTransparency.service.ts
 35. aiDeploymentAutomation.service.ts
 36. aiDeploymentOrchestration.service.ts
 37. aiDifferentialPrivacy.service.ts
 38. aiDistributedTracing.service.ts
 39. aiEdgeDeployment.service.ts
 40. aiErrorAnalysis.service.ts
 41. aiEthicalMonitoring.service.ts
 42. aiEthicsReviewBoard.service.ts
 43. aiExperimentAnalysis.service.ts
 44. aiExperimentReproducibility.service.ts
 45. aiExperimentSharing.service.ts
 46. aiExplainableAI.service.ts
 47. aiExplanationGeneration.service.ts
 48. aiFairnessAssessment.service.ts
 49. aiFeatureAttribution.service.ts
 50. aiFeatureRegistry.service.ts
 51. aiFeatureServing.service.ts
 52. aiFeatureStore.service.ts
 53. aiFederatedLearning.service.ts
 54. aiFederatedModelRegistry.service.ts
 55. aiFederatedModelTraining.service.ts
 56. aiGovernanceAnalytics.service.ts
 57. aiGracefulDegradation.service.ts
 58. aiHyperparameterOptimization.service.ts
 59. aiInferenceOptimization.service.ts
 60. aiKnowledgeDistillation.service.ts
 61. aiLiveDashboard.service.ts
 62. aiLoadTesting.service.ts
 63. aiModelABTesting.service.ts
 64. aiModelAPIGateway.service.ts
 65. aiModelAggregation.service.ts
 66. aiModelAutoDocumentation.service.ts
 67. aiModelAutoScaling.service.ts
 68. aiModelCanaryDeployment.service.ts
 69. aiModelCapacityPlanning.service.ts
 70. aiModelCertification.service.ts
 71. aiModelChaosEngineering.service.ts
 72. aiModelCodeReview.service.ts
 73. aiModelCollaboration.service.ts
 74. aiModelCommenting.service.ts
 75. aiModelCompatibilityTesting.service.ts
 76. aiModelComplianceAudit.service.ts
 77. aiModelCompression.service.ts
 78. aiModelCompressionOrchestration.service.ts
 79. aiModelCostOptimization.service.ts
 80. aiModelCostTracking.service.ts
 81. aiModelDebugging.service.ts
 82. aiModelDeployment.service.ts
 83. aiModelDeprecationPolicy.service.ts
 84. aiModelDisasterRecovery.service.ts
 85. aiModelDistributedTracing.service.ts
 86. aiModelDriftMonitoring.service.ts
 87. aiModelEndToEndTesting.service.ts
 88. aiModelEnsemble.service.ts
 89. aiModelExplanation.service.ts
 90. aiModelFederationManagement.service.ts
 91. aiModelFormatConversion.service.ts
 92. aiModelGovernance.service.ts
 93. aiModelIntegrationHub.service.ts
 94. aiModelIntegrationTesting.service.ts
 95. aiModelKnowledgeBase.service.ts
 96. aiModelLifecycle.service.ts
 97. aiModelLifecycleInsights.service.ts
 98. aiModelLifecycleManagement.service.ts
 99. aiModelLifecycleMetrics.service.ts
100. aiModelLoadTesting.service.ts
101. aiModelMarketplace.service.ts
102. aiModelMetadata.service.ts
103. aiModelMetricsCollection.service.ts
104. aiModelMigration.service.ts
105. aiModelMonitoring.service.ts
106. aiModelMultiRegionDeployment.service.ts
107. aiModelOptimization.service.ts
108. aiModelOptimizationRecommendations.service.ts
109. aiModelPerformanceBenchmarking.service.ts
110. aiModelPerformanceMonitoring.service.ts
111. aiModelPortfolio.service.ts
112. aiModelPrivacyControls.service.ts
113. aiModelProfiling.service.ts
114. aiModelRatingReview.service.ts
115. aiModelRegistry.service.ts
116. aiModelRegressionTesting.service.ts
117. aiModelRetrainingWorkflow.service.ts
118. aiModelRevenueSharing.service.ts
119. aiModelReview.service.ts
120. aiModelRollback.service.ts
121. aiModelSecurityPenetrationTesting.service.ts
122. aiModelSecurityScanning.service.ts
123. aiModelSelection.service.ts
124. aiModelSerialization.service.ts
125. aiModelShadowTesting.service.ts
126. aiModelSharingAccessControl.service.ts
127. aiModelSmokeTesting.service.ts
128. aiModelSunsetManagement.service.ts
129. aiModelTeamCollaboration.service.ts
130. aiModelTestAutomation.service.ts
131. aiModelTrialDemo.service.ts
132. aiModelValidation.service.ts
133. aiModelVersionControl.service.ts
134. aiModelVersioning.service.ts
135. aiMultiArmedBandit.service.ts
136. aiNeuralArchitectureSearch.service.ts
137. aiObservabilityAnalytics.service.ts
138. aiOperationsAutomation.service.ts
139. aiOperationsOrchestration.service.ts
140. aiPerformanceBenchmarking.service.ts
141. aiPerformanceProfiling.service.ts
142. aiPerformanceRegression.service.ts
143. aiPlatformIntelligence.service.ts
144. aiPluginManagement.service.ts
145. aiPolicyCompliance.service.ts
146. aiPolicyEnforcement.service.ts
147. aiPredictiveInsights.service.ts
148. aiPrivacyPreservingTraining.service.ts
149. aiRecoveryOrchestration.service.ts
150. aiRegulatoryReporting.service.ts
151. aiRetrainingTrigger.service.ts
152. aiRiskAssessment.service.ts
153. aiRiskMitigation.service.ts
154. aiScalingStrategy.service.ts
155. aiSecurityHardening.service.ts
156. aiSelfHealingWorkflows.service.ts
157. aiServiceMarketplace.service.ts
158. aiStreamProcessing.service.ts
159. aiSystemOptimization.service.ts
160. aiTaskScheduling.service.ts
161. aiTestAutomation.service.ts
162. aiTestOrchestration.service.ts
163. aiThreatDetection.service.ts
164. aiThreatIntelligence.service.ts
165. aiVendorAssessment.service.ts
166. aiWorkflowManagement.service.ts
167. alertManagement.service.ts
168. annotationProjectManagement.service.ts
169. apiAnalytics.service.ts
170. apiCaching.service.ts
171. apiDocumentationGenerator.service.ts
172. apiRateLimiting.service.ts
173. applicationCaching.service.ts
174. approvalRouting.service.ts
175. asset3DManagement.service.ts
176. automatedComplianceScanning.service.ts
177. automlPipeline.service.ts
178. backupVerification.service.ts
179. blockchainNetworkManagement.service.ts
180. collaborativeTask.service.ts
181. complianceFramework.service.ts
182. conceptDriftDetection.service.ts
183. consensus.service.ts
184. continualLearning.service.ts
185. continuousComplianceMonitoring.service.ts
186. dataAugmentation.service.ts
187. dataMasking.service.ts
188. databaseIndex.service.ts
189. ddosProtection.service.ts
190. decisionModel.service.ts
191. driftAnomalyDetection.service.ts
192. edgeDeployment.service.ts
193. edgeInference.service.ts
194. edgeNodeManagement.service.ts
195. entityExtraction.service.ts
196. ethicalComplianceImpactAssessment.service.ts
197. executiveDashboard.service.ts
198. experimentTracking.service.ts
199. explanationVisualization.service.ts
200. fairnessBiasDetection.service.ts
201. federatedLearning.service.ts
202. federatedQueryExecution.service.ts
203. forecasting.service.ts
204. globalScheduler.service.ts
205. goalDashboard.service.ts
206. goalManagement.service.ts
207. healthCheck.service.ts
208. humanApproval.service.ts
209. humanOverride.service.ts
210. hyperparameterOptimization.service.ts
211. imageRecognition.service.ts
212. inferenceEngine.service.ts
213. iotDataPipeline.service.ts
214. iotDeviceManagement.service.ts
215. labelQualityAssurance.service.ts
216. languageGenerationTranslation.service.ts
217. loadBalancing.service.ts
218. logAggregation.service.ts
219. mcda.service.ts
220. memoryConsolidation.service.ts
221. memoryToGraph.service.ts
222. modelCardsDocumentation.service.ts
223. modelCatalog.service.ts
224. modelDocumentationGenerator.service.ts
225. modelInstallation.service.ts
226. modelInterpretability.service.ts
227. modelMarketplace.service.ts
228. modelPackaging.service.ts
229. modelPruning.service.ts
230. modelQuantization.service.ts
231. modelValidationTesting.service.ts
232. motionPlanningControl.service.ts
233. ocrDocumentIntelligence.service.ts
234. piiDetection.service.ts
235. planning.service.ts
236. pointInTimeRecovery.service.ts
237. privacyPreservingAggregation.service.ts
238. quantumCircuitManagement.service.ts
239. quantumJobScheduling.service.ts
240. queryAnalysis.service.ts
241. realTimeModelMonitoring.service.ts
242. relationshipExtraction.service.ts
243. resourceQuotas.service.ts
244. robotTaskOrchestration.service.ts
245. ruleEngine.service.ts
246. sharedContext.service.ts
247. smartContractManagement.service.ts
248. spatialInteraction.service.ts
249. speechRecognition.service.ts
250. stateTransition.service.ts
251. syntheticDataGeneration.service.ts
252. tamperProofAudit.service.ts
253. textAnalysisUnderstanding.service.ts
254. timeSeries.service.ts
255. trafficRouting.service.ts
256. twinSimulationEngine.service.ts
257. twinSynchronization.service.ts
258. vectorStorage.service.ts
259. voiceConversationEngine.service.ts
260. vulnerabilityScanning.service.ts
261. webApplicationFirewall.service.ts
262. worldState.service.ts
```

### 1.2 Drafts that fabricate success

Guarded in place with `S212 SAFETY GUARD` — reviving one fails loudly rather than certifying a lie:

| Draft | What it fabricates |
|---|---|
| `automatedComplianceScanning.service.ts` | `checkPIIInLogs`, `checkEncryptionAtRest`, `checkDataExport`, `checkDataErasure` all return an empty `violations` array — a compliance scan that can never fail |
| `modelPackaging.service.ts` — `signPackage` | `sha256(checksum + privateKey)`: a keyed hash, not a signature. Symmetric, so anyone who can verify can forge; packages marked `signed: true` with no authenticity guarantee |
| `modelPackaging.service.ts` — `verifyPackage` | recomputes over the caller-supplied public key, so any caller can mint a value that "verifies"; comparison is not constant-time |
| `modelPackaging.service.ts` — `calculateChecksum` | hashes the URL string, not the file — stable no matter what the artifact becomes, so it detects neither corruption nor tampering |

Fabricating but inert — labelled, not guarded, and must not be revived as-is:

| Draft | Fabrication |
|---|---|
| `aiModelSelection.service.ts` | hardcoded GPT-4 entry with invented latency / cost / quality |
| `aiModelLifecycleInsights.service.ts` | fabricated "Validation Stage Bottleneck" with invented 5.2-day metrics |
| `queryAnalysis.service.ts` | `p95 = max × 0.8`, `p99 = max × 0.95` — percentiles invented from the max |
| `aiTaskScheduling.service.ts` | `setTimeout(..., 100)` standing in for a queue |
| `dataMasking.service.ts` | rules carrying a `condition` are silently skipped; conditional masking never applies |
| `aiFeatureServing.service.ts` | "would fetch from a feature store" / "would compare with baseline statistics" |
| `apiCaching.service.ts` | invalidation only logs |
| `planning.service.ts` | returns a template plan |

Also unfinished in the same directory but excluded from the audit gates: `tamperProofAudit.service.ts`
uses genuine `createSign`/`createVerify` and fails safe, but stores its private key in Redis — a
deployment concern (move the key to KMS/Vault), not a fabricated guarantee.

---

## 2. PHP / cPanel build — 116 unfinished modules

PHP ships 41 controllers and 47 models. Every path with no controller falls through
`application/config/routes.php` (`$route['api/v1/(:any)'] = 'api/dispatch/$1'`) to
`Api::dispatch()`, which returns **HTTP 501 `MODULE_NOT_MIGRATED`**.

### 2.1 Ported but partial (2)

| Module | Routes | SLOC | PHP controller | What is missing |
|---|---|---|---|---|
| `composer` (Composer / Workflows) | 27 | 2262 | `Workflows.php` | workflow engine only — task, action-item, Talk, condition, loop, delay, AI and approval nodes; other node types return HTTP 501 `NODE_NOT_IMPLEMENTED`; the Composer canvas is not ported |
| `collaboration` (Collaboration primitives) | 71 | 2722 | `Workspace.php` | workspace dashboard + tasks only; the other collaboration primitives have no PHP controller |

### 2.2 Not ported at all (116) — each returns 501 on the PHP build

#### AI / ML platform — 10

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `cognitive` | Cognitive / World Model (S69) | 27 | 2569 |
| 2 | `knowledge` | knowledge | 20 | 10986 |
| 3 | `memoryEvolution` | Memory Evolution (S47) | 6 | 463 |
| 4 | `mlOps` | ML Ops | 38 | 1733 |
| 5 | `modelFactory` | Model Factory (S46) | 13 | 373 |
| 6 | `nativeAi` | nativeAi | 7 | 1187 |
| 7 | `nativeAiApi` | nativeAiApi | 16 | 1798 |
| 8 | `scientific` | Scientific Research (S68) | 12 | 599 |
| 9 | `training` | Training / LoRA (S60) | 11 | 752 |
| 10 | `v76validation` | S76 Final Validation | 7 | 881 |

#### Media / creative — 16

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `camera` | camera | 11 | 424 |
| 2 | `cinematic` | Cinematic AI Video Studio | 20 | 1855 |
| 3 | `digitalHumans` | Digital Humans (S62) | 12 | 788 |
| 4 | `mediaFactory` | Media Factory (S77b) | 35 | 2877 |
| 5 | `mediaGen` | Media Generation (S42) | 6 | 874 |
| 6 | `musicGen` | musicGen | 12 | 1315 |
| 7 | `musicVideo` | musicVideo | 11 | 1578 |
| 8 | `publishing` | publishing | 20 | 188 |
| 9 | `spatial` | Spatial Computing (S58) | 9 | 1162 |
| 10 | `videoEngine` | Video Engine / AI Video Studio | 21 | 2877 |
| 11 | `videoTransform` | videoTransform | 20 | 3162 |
| 12 | `videoTransformer` | videoTransformer | 16 | 1544 |
| 13 | `voice` | voice | 15 | 1031 |
| 14 | `voiceFoundry` | Voice Foundry (S41) | 13 | 399 |
| 15 | `voiceOwnership` | Voice Ownership / Consent (S44) | 12 | 399 |
| 16 | `voiceStudio` | Voice Studio (S40) | 15 | 1806 |

#### Voice / wake — 1

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `wakeIntel` | Wake-word Intelligence | 40 | 1460 |

#### Commerce / payments — 13

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `aiCommerce` | AI Commerce (WMPC Shopping) | 23 | 4716 |
| 2 | `blockonomicsAdmin` | blockonomicsAdmin | 8 | 881 |
| 3 | `commerce` | commerce | 18 | 786 |
| 4 | `cryptoIntelligence` | Crypto Intelligence | 19 | 658 |
| 5 | `derivatives` | Derivatives & Fixed Income (S81/S113) | 21 | 2468 |
| 6 | `expertsPlatform` | Experts Platform (S77a) | 9 | 511 |
| 7 | `financial` | financial | 11 | 983 |
| 8 | `geoBilling` | geoBilling | 9 | 1488 |
| 9 | `globalCurrency` | Global Currency (S80) | 20 | 1644 |
| 10 | `marketplace` | Plugin / Extension Marketplace | 30 | 1565 |
| 11 | `payments` | payments | 23 | 5447 |
| 12 | `socialPlatform` | socialPlatform | 15 | 1080 |
| 13 | `tradingIntel` | Trading Intelligence (S81) | 25 | 8208 |

#### Industry / verticals — 15

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `biomedical` | Biomedical / Healthcare (S65) | 9 | 854 |
| 2 | `cyber` | Cyber Academy (S82) | 21 | 1220 |
| 3 | `cyberCloudAcademy` | cyberCloudAcademy | 5 | 168 |
| 4 | `education` | Education Platform (S67) | 17 | 2561 |
| 5 | `healthEcosystem` | Health Ecosystem V10 (S75) | 39 | 2802 |
| 6 | `industry` | Industry Packs (S74) | 7 | 719 |
| 7 | `legal` | Legal Research (S66) | 11 | 709 |
| 8 | `lifePrinciples` | lifePrinciples | 12 | 2472 |
| 9 | `politics` | politics | 21 | 7130 |
| 10 | `quantum` | Quantum (S63) | 13 | 638 |
| 11 | `religions` | religions | 24 | 9382 |
| 12 | `robotics` | Robotics (S57) | 16 | 964 |
| 13 | `sustainability` | Sustainability / ESG (S64) | 5 | 1148 |
| 14 | `university` | university | 9 | 486 |
| 15 | `universityEngine` | universityEngine | 16 | 364 |

#### Data / intelligence — 13

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `advancedLeadDiscovery` | advancedLeadDiscovery | 15 | 880 |
| 2 | `aiEconomy` | AI Economy / GPU Cloud (S71) | 11 | 683 |
| 3 | `aiEcosystem` | AI Ecosystem Directory | 36 | 2664 |
| 4 | `aiEngineering` | aiEngineering | 43 | 3362 |
| 5 | `businessIntelligence` | businessIntelligence | 19 | 1277 |
| 6 | `dataMarketplace` | Data Marketplace (S61) | 39 | 1620 |
| 7 | `enterpriseSearch` | enterpriseSearch | 5 | 1195 |
| 8 | `etl` | etl | 7 | 835 |
| 9 | `fabric` | Intelligence Fabric (S56) | 13 | 842 |
| 10 | `identityKnowledge` | identityKnowledge | 22 | 1812 |
| 11 | `leadDiscovery` | Lead Discovery & Pipeline (S85/S115) | 23 | 3791 |
| 12 | `marketing` | marketing | 21 | 1071 |
| 13 | `platformServices` | Platform Services (CDN/etc) | 43 | 2306 |

#### Platform / infra — 23

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `cronJobs` | cronJobs | 9 | 943 |
| 2 | `deployment` | Deployment Engine (S52) | 11 | 961 |
| 3 | `developerGateway` | Developer Gateway | 9 | 2116 |
| 4 | `developerPlatform` | developerPlatform | 13 | 954 |
| 5 | `developers` | Developers Public Pages | 9 | 497 |
| 6 | `devportal` | Developer Portal (S27) | 13 | 1745 |
| 7 | `disasterRecovery` | Disaster Recovery / BCP (S53) | 13 | 552 |
| 8 | `engineering` | Engineering / Observability (S26) | 16 | 1275 |
| 9 | `extensions` | Plugin System | 29 | 1525 |
| 10 | `infrastructure` | Infrastructure Monitoring | 30 | 1226 |
| 13 | `pluginOs` | pluginOs | 20 | 1838 |
| 14 | `projectContinuity` | projectContinuity | 5 | 1443 |
| 15 | `publicApi` | Public API | 8 | 2597 |
| 16 | `qa` | QA Engine | 13 | 1634 |
| 17 | `release` | Release Pipeline | 19 | 1278 |
| 18 | `sdk` | SDK Packages (S59) | 9 | 392 |
| 19 | `selfHosted` | Self-Hosted Inference (S38) | 14 | 511 |
| 20 | `sitePlatform` | sitePlatform | 36 | 2538 |
| 21 | `softwareFactory` | softwareFactory | 8 | 978 |
| 22 | `updates` | Updates / OTA (S54) | 9 | 644 |
| 23 | `websiteBuilder` | websiteBuilder | 21 | 1440 |

#### Mobile / devices / channels — 20

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `adminApiControl` | adminApiControl | 7 | 185 |
| 2 | `agentComm` | Agent Communication | 48 | 1294 |
| 3 | `architecture` | Architecture / ESI (S37) | 10 | 851 |
| 4 | `brokerIntegration` | brokerIntegration | 50 | 1969 |
| 5 | `channels` | Messaging Channels (WhatsApp/Telegram) | 29 | 2946 |
| 6 | `cloudAndroid` | cloudAndroid | 28 | 1066 |
| 7 | `cloudAndroidPublic` | cloudAndroidPublic | 16 | 372 |
| 8 | `command` | Global Command Center (S70) | 29 | 2373 |
| 9 | `constitution` | Constitution / Governance | 7 | 1222 |
| 10 | `coreIntegration` | Core Integration (S45) | 5 | 333 |
| 11 | `ea` | ea | 8 | 443 |
| 12 | `githubConnector` | githubConnector | 7 | 999 |
| 13 | `googleAuth` | Google Identity / OAuth (S114) | 18 | 2486 |
| 14 | `hybridExec` | Hybrid Execution (S43) | 13 | 953 |
| 15 | `mobile` | Mobile App / PWA | 39 | 3685 |
| 16 | `nfc` | nfc | 18 | 1402 |
| 17 | `nfcPublic` | nfcPublic | 14 | 505 |
| 18 | `opex` | OpEx / Trust / Safety (S73) | 42 | 6337 |
| 19 | `program` | Program Management (S25) | 25 | 1443 |
| 20 | `revenueGuardian` | revenueGuardian | 37 | 2769 |

#### Other — 7

| # | Module | Title | Routes | SLOC |
|---|---|---|---|---|
| 1 | `advertising` | advertising | 29 | 2512 |
| 2 | `enterpriseFinOps` | enterpriseFinOps | 19 | 1351 |
| 3 | `languageLearning` | languageLearning | 45 | 6782 |
| 4 | `licensing` | Licensing (S51) | 9 | 899 |
| 5 | `lotteryIntelligence` | lotteryIntelligence | 27 | 3042 |
| 6 | `sportsIntelligence` | sportsIntelligence | 24 | 4510 |
| 7 | `uxIntelligence` | UX Intelligence (S78) | 12 | 862 |

Totals: AI / ML platform 10, Media / creative 16, Voice / wake 1, Commerce / payments 13, Industry / verticals 15, Data / intelligence 13, Platform / infra 21, Mobile / devices / channels 20, Other 7 = **116**.  

Removed since the last revision: `moduleCenter` (13 routes), `moduleRuntime` (4 routes), `autonomous`
(6 routes) and `benchmarks` (8 routes) are ported and validated — see `docs/PHP_MODULE_PARITY.md`.

### 2.3 Named gaps inside the 28 "fully ported" modules

| Area | Gap |
|---|---|
| Agent lifecycle / skills | persistence + CRUD ported; **skill execution registry pending** |
| Message attachments | conversation upload, claim, history projection, secure download ported; **Talk targets await Talk module** |
| Conversation search | substring / extractive methods only (documented in responses) |
| Prompt templates | built-ins + MySQL usage ledger only |
| All 30 ported groups | the parity ledger still records **runtime validation pending** on every row |

---

## Method and caveats

- `audit/build-inventory.mjs` defines the status vocabulary in `classifyStatus()`: `MISSING`,
  `STUB`, `SIMULATED`, `DEMO DATA`, `PARTIAL`, `COMPLETE`. It hard-overrides `auth`, `kernel` and
  `platform` to `COMPLETE`, so those three can never be reported unfinished by the auditor.
- `INFRA_DIRS` excludes db / http / utils / services / config / observability / security /
  testUtils / kernel / enterprise / platform from module discovery, which is why some large
  directories never appear as modules at all.
- Grep for `TODO`/`FIXME` in `apps/api/src` is **not** a useful signal: the literal `TODO` occurs
  as a `TaskStatus` enum value and inside code that scans for TODO markers.
- The "not ported" set is a diff of the 155 non-scaffold module keys against a hand-built
  Node-module → PHP-controller map (30 entries). Two boundary calls are debatable; both are
  counted as **not ported** here:
  - `healthEcosystem` — PHP `Health.php` is only the health probe, not the 39-route Health
    Ecosystem V10 module.
- Route and SLOC columns are per-module totals from the freshly generated inventory.
