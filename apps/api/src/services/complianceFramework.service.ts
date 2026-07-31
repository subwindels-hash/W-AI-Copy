/**
 * Compliance Framework Service (Module 16 — Gap 2)
 *
 * Multi-regulation compliance management:
 * - Support for GDPR, HIPAA, SOC2, ISO 27001, PCI DSS, etc.
 * - Control definitions and mappings
 * - Evidence tracking and management
 * - Gap analysis and remediation tracking
 * - Compliance status reporting
 * - Audit-ready evidence packages
 *
 * Enables organizations to demonstrate compliance to auditors.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";

// ─── Types ──────────────────────────────────────────────────────

export type RegulationType = "GDPR" | "HIPAA" | "SOC2" | "ISO27001" | "PCIDSS" | "CCPA" | "CUSTOM";

export type ControlStatus = "not_started" | "in_progress" | "implemented" | "verified" | "non_compliant" | "not_applicable";

export type EvidenceType = "policy" | "procedure" | "configuration" | "audit_log" | "test_result" | "training" | "contract" | "other";

export interface ComplianceFramework {
  id: string;
  name: string;
  regulation: RegulationType;
  version: string;
  description: string;
  categories: ComplianceCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCategory {
  id: string;
  name: string;
  description: string;
  controls: ComplianceControl[];
}

export interface ComplianceControl {
  id: string;
  code: string; // e.g., "GDPR-Art5-1a", "HIPAA-164.312-a"
  name: string;
  description: string;
  requirement: string;
  guidance?: string;
  status: ControlStatus;
  implementationNotes?: string;
  evidence: ComplianceEvidence[];
  gaps: ComplianceGap[];
  lastAssessedAt?: string;
  nextAssessmentDue?: string;
}

export interface ComplianceEvidence {
  id: string;
  type: EvidenceType;
  title: string;
  description: string;
  location: string; // URL, file path, or reference
  uploadedAt: string;
  uploadedBy: string;
  expiresAt?: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ComplianceGap {
  id: string;
  description: string;
  impact: "low" | "medium" | "high" | "critical";
  remediationPlan?: string;
  remediationOwner?: string;
  remediationDueDate?: string;
  status: "open" | "in_progress" | "resolved" | "accepted";
  createdAt: string;
  resolvedAt?: string;
}

export interface ComplianceStatus {
  framework: string;
  regulation: RegulationType;
  totalControls: number;
  implementedControls: number;
  verifiedControls: number;
  nonCompliantControls: number;
  notApplicableControls: number;
  complianceScore: number; // 0-100
  openGaps: number;
  criticalGaps: number;
  evidenceCount: number;
  lastAssessedAt?: string;
  nextAssessmentDue?: string;
}

export interface ComplianceReport {
  id: string;
  frameworkId: string;
  generatedAt: string;
  generatedBy: string;
  status: ComplianceStatus;
  executiveSummary: string;
  detailedFindings: Array<{
    controlId: string;
    controlCode: string;
    controlName: string;
    status: ControlStatus;
    evidenceCount: number;
    gapCount: number;
    notes?: string;
  }>;
  recommendations: string[];
  evidencePackage: Array<{
    controlId: string;
    evidence: ComplianceEvidence[];
  }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const FRAMEWORKS_KEY = "compliance:frameworks";
const FRAMEWORK_KEY = (id: string) => `compliance:framework:${id}`;
const ORG_FRAMEWORKS_KEY = (orgId: string) => `compliance:org:${orgId}:frameworks`;

// ─── Predefined Frameworks ──────────────────────────────────────

const GDPR_FRAMEWORK: Omit<ComplianceFramework, "id" | "createdAt" | "updatedAt"> = {
  name: "GDPR Compliance Framework",
  regulation: "GDPR",
  version: "1.0",
  description: "General Data Protection Regulation compliance controls",
  categories: [
    {
      id: "gdpr-principles",
      name: "Data Protection Principles",
      description: "Article 5 principles for processing personal data",
      controls: [
        {
          id: "gdpr-art5-1a",
          code: "GDPR-Art5-1a",
          name: "Lawfulness, fairness, and transparency",
          description: "Process personal data lawfully, fairly, and transparently",
          requirement: "Personal data shall be processed lawfully, fairly and in a transparent manner in relation to the data subject",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
        {
          id: "gdpr-art5-1b",
          code: "GDPR-Art5-1b",
          name: "Purpose limitation",
          description: "Collect data for specified, explicit, and legitimate purposes",
          requirement: "Personal data shall be collected for specified, explicit and legitimate purposes",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
        {
          id: "gdpr-art5-1c",
          code: "GDPR-Art5-1c",
          name: "Data minimization",
          description: "Data must be adequate, relevant, and limited to what is necessary",
          requirement: "Personal data shall be adequate, relevant and limited to what is necessary",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
      ],
    },
    {
      id: "gdpr-rights",
      name: "Data Subject Rights",
      description: "Articles 12-23 rights of data subjects",
      controls: [
        {
          id: "gdpr-art15",
          code: "GDPR-Art15",
          name: "Right of access",
          description: "Data subjects have the right to access their personal data",
          requirement: "The data subject shall have the right to obtain confirmation as to whether or not personal data concerning them are being processed",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
        {
          id: "gdpr-art17",
          code: "GDPR-Art17",
          name: "Right to erasure",
          description: "Data subjects have the right to have their data erased",
          requirement: "The data subject shall have the right to obtain the erasure of personal data concerning them",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
      ],
    },
  ],
};

const HIPAA_FRAMEWORK: Omit<ComplianceFramework, "id" | "createdAt" | "updatedAt"> = {
  name: "HIPAA Security Rule Framework",
  regulation: "HIPAA",
  version: "1.0",
  description: "HIPAA Security Rule administrative, physical, and technical safeguards",
  categories: [
    {
      id: "hipaa-administrative",
      name: "Administrative Safeguards",
      description: "Administrative actions and policies",
      controls: [
        {
          id: "hipaa-164-308-a1",
          code: "HIPAA-164.308-a1",
          name: "Security Management Process",
          description: "Implement policies and procedures to prevent, detect, contain, and correct security violations",
          requirement: "Implement policies and procedures to prevent, detect, contain, and correct security violations",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
      ],
    },
    {
      id: "hipaa-technical",
      name: "Technical Safeguards",
      description: "Technology and policy for protecting electronic PHI",
      controls: [
        {
          id: "hipaa-164-312-a",
          code: "HIPAA-164.312-a",
          name: "Access Control",
          description: "Implement technical policies and procedures for electronic information systems that maintain ePHI",
          requirement: "Implement technical policies and procedures for electronic information systems that maintain electronic protected health information to allow access only to those persons or software programs that have been granted access rights",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
        {
          id: "hipaa-164-312-b",
          code: "HIPAA-164.312-b",
          name: "Audit Controls",
          description: "Implement hardware, software, and/or procedural mechanisms that record and examine activity",
          requirement: "Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use electronic protected health information",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
      ],
    },
  ],
};

const SOC2_FRAMEWORK: Omit<ComplianceFramework, "id" | "createdAt" | "updatedAt"> = {
  name: "SOC 2 Trust Services Criteria",
  regulation: "SOC2",
  version: "2017",
  description: "SOC 2 Type II trust services criteria for security, availability, processing integrity, confidentiality, and privacy",
  categories: [
    {
      id: "soc2-security",
      name: "Security",
      description: "Common criteria related to security",
      controls: [
        {
          id: "soc2-cc6-1",
          code: "SOC2-CC6.1",
          name: "Logical and Physical Access Controls",
          description: "The entity implements logical access security software, infrastructure, and architectures over protected information assets",
          requirement: "Logical and physical access controls are designed and implemented to protect information assets from unauthorized access",
          status: "not_started",
          evidence: [],
          gaps: [],
        },
      ],
    },
  ],
};

// ─── Framework Management ───────────────────────────────────────

/**
 * Initialize predefined compliance frameworks.
 */
export async function initializePredefinedFrameworks(organizationId: string): Promise<void> {
  const frameworks = [GDPR_FRAMEWORK, HIPAA_FRAMEWORK, SOC2_FRAMEWORK];

  for (const framework of frameworks) {
    const id = `framework_${framework.regulation.toLowerCase()}_${Date.now()}`;
    const now = new Date().toISOString();

    const fullFramework: ComplianceFramework = {
      ...framework,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await redisCmd.set(FRAMEWORK_KEY(id), JSON.stringify(fullFramework));
    await redisCmd.sadd(FRAMEWORKS_KEY, id);
    await redisCmd.sadd(ORG_FRAMEWORKS_KEY(organizationId), id);

    logger.info("Compliance framework initialized", {
      frameworkId: id,
      regulation: framework.regulation,
    });
  }
}

/**
 * Get a compliance framework by ID.
 */
export async function getFramework(frameworkId: string): Promise<ComplianceFramework | null> {
  const data = await redisCmd.get(FRAMEWORK_KEY(frameworkId));
  return data ? JSON.parse(data) : null;
}

/**
 * List compliance frameworks for an organization.
 */
export async function listFrameworks(organizationId: string): Promise<ComplianceFramework[]> {
  const frameworkIds = await redisCmd.smembers(ORG_FRAMEWORKS_KEY(organizationId));
  const frameworks: ComplianceFramework[] = [];

  for (const id of frameworkIds) {
    const framework = await getFramework(id);
    if (framework) frameworks.push(framework);
  }

  return frameworks;
}

/**
 * Update control status.
 */
export async function updateControlStatus(
  frameworkId: string,
  controlId: string,
  status: ControlStatus,
  implementationNotes?: string,
): Promise<ComplianceControl | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find(c => c.id === controlId);
    if (control) {
      control.status = status;
      control.implementationNotes = implementationNotes;
      control.lastAssessedAt = new Date().toISOString();
      
      await redisCmd.set(FRAMEWORK_KEY(frameworkId), JSON.stringify(framework));
      
      logger.info("Control status updated", {
        frameworkId,
        controlId,
        status,
      });
      
      return control;
    }
  }

  return null;
}

/**
 * Add evidence to a control.
 */
export async function addEvidence(
  frameworkId: string,
  controlId: string,
  evidence: Omit<ComplianceEvidence, "id" | "uploadedAt" | "verified">,
  uploadedBy: string,
): Promise<ComplianceEvidence | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find(c => c.id === controlId);
    if (control) {
      const newEvidence: ComplianceEvidence = {
        ...evidence,
        id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
        verified: false,
      };

      control.evidence.push(newEvidence);
      await redisCmd.set(FRAMEWORK_KEY(frameworkId), JSON.stringify(framework));

      logger.info("Evidence added", {
        frameworkId,
        controlId,
        evidenceId: newEvidence.id,
        type: evidence.type,
      });

      return newEvidence;
    }
  }

  return null;
}

/**
 * Verify evidence.
 */
export async function verifyEvidence(
  frameworkId: string,
  controlId: string,
  evidenceId: string,
  verifiedBy: string,
): Promise<ComplianceEvidence | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find(c => c.id === controlId);
    if (control) {
      const evidence = control.evidence.find(e => e.id === evidenceId);
      if (evidence) {
        evidence.verified = true;
        evidence.verifiedBy = verifiedBy;
        evidence.verifiedAt = new Date().toISOString();

        await redisCmd.set(FRAMEWORK_KEY(frameworkId), JSON.stringify(framework));

        logger.info("Evidence verified", {
          frameworkId,
          controlId,
          evidenceId,
          verifiedBy,
        });

        return evidence;
      }
    }
  }

  return null;
}

/**
 * Add a compliance gap.
 */
export async function addGap(
  frameworkId: string,
  controlId: string,
  gap: Omit<ComplianceGap, "id" | "createdAt" | "status">,
): Promise<ComplianceGap | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find(c => c.id === controlId);
    if (control) {
      const newGap: ComplianceGap = {
        ...gap,
        id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        status: "open",
      };

      control.gaps.push(newGap);
      await redisCmd.set(FRAMEWORK_KEY(frameworkId), JSON.stringify(framework));

      logger.info("Compliance gap added", {
        frameworkId,
        controlId,
        gapId: newGap.id,
        impact: gap.impact,
      });

      return newGap;
    }
  }

  return null;
}

/**
 * Update gap status.
 */
export async function updateGapStatus(
  frameworkId: string,
  controlId: string,
  gapId: string,
  status: ComplianceGap["status"],
): Promise<ComplianceGap | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find(c => c.id === controlId);
    if (control) {
      const gap = control.gaps.find(g => g.id === gapId);
      if (gap) {
        gap.status = status;
        if (status === "resolved") {
          gap.resolvedAt = new Date().toISOString();
        }

        await redisCmd.set(FRAMEWORK_KEY(frameworkId), JSON.stringify(framework));

        logger.info("Gap status updated", {
          frameworkId,
          controlId,
          gapId,
          status,
        });

        return gap;
      }
    }
  }

  return null;
}

// ─── Compliance Status & Reporting ──────────────────────────────

/**
 * Get compliance status for a framework.
 */
export async function getComplianceStatus(frameworkId: string): Promise<ComplianceStatus | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  let totalControls = 0;
  let implementedControls = 0;
  let verifiedControls = 0;
  let nonCompliantControls = 0;
  let notApplicableControls = 0;
  let openGaps = 0;
  let criticalGaps = 0;
  let evidenceCount = 0;
  let lastAssessedAt: string | undefined;

  for (const category of framework.categories) {
    for (const control of category.controls) {
      totalControls++;

      if (control.status === "implemented") implementedControls++;
      if (control.status === "verified") verifiedControls++;
      if (control.status === "non_compliant") nonCompliantControls++;
      if (control.status === "not_applicable") notApplicableControls++;

      evidenceCount += control.evidence.length;

      for (const gap of control.gaps) {
        if (gap.status === "open" || gap.status === "in_progress") {
          openGaps++;
          if (gap.impact === "critical") criticalGaps++;
        }
      }

      if (control.lastAssessedAt) {
        if (!lastAssessedAt || control.lastAssessedAt > lastAssessedAt) {
          lastAssessedAt = control.lastAssessedAt;
        }
      }
    }
  }

  const applicableControls = totalControls - notApplicableControls;
  const complianceScore = applicableControls > 0
    ? Math.round(((implementedControls + verifiedControls) / applicableControls) * 100)
    : 0;

  return {
    framework: framework.name,
    regulation: framework.regulation,
    totalControls,
    implementedControls,
    verifiedControls,
    nonCompliantControls,
    notApplicableControls,
    complianceScore,
    openGaps,
    criticalGaps,
    evidenceCount,
    lastAssessedAt,
  };
}

/**
 * Generate compliance report.
 */
export async function generateComplianceReport(
  frameworkId: string,
  generatedBy: string,
): Promise<ComplianceReport | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  const status = await getComplianceStatus(frameworkId);
  if (!status) return null;

  const detailedFindings: ComplianceReport["detailedFindings"] = [];
  const evidencePackage: ComplianceReport["evidencePackage"] = [];
  const recommendations: string[] = [];

  for (const category of framework.categories) {
    for (const control of category.controls) {
      detailedFindings.push({
        controlId: control.id,
        controlCode: control.code,
        controlName: control.name,
        status: control.status,
        evidenceCount: control.evidence.length,
        gapCount: control.gaps.filter(g => g.status === "open" || g.status === "in_progress").length,
        notes: control.implementationNotes,
      });

      if (control.evidence.length > 0) {
        evidencePackage.push({
          controlId: control.id,
          evidence: control.evidence,
        });
      }

      // Generate recommendations
      if (control.status === "not_started" || control.status === "non_compliant") {
        recommendations.push(`${control.code}: ${control.name} - Implementation required`);
      } else if (control.status === "in_progress") {
        recommendations.push(`${control.code}: ${control.name} - Complete implementation and gather evidence`);
      } else if (control.status === "implemented" && control.evidence.length === 0) {
        recommendations.push(`${control.code}: ${control.name} - Add evidence to demonstrate compliance`);
      }
    }
  }

  const executiveSummary = `Compliance assessment for ${framework.name} shows a compliance score of ${status.complianceScore}% with ${status.implementedControls + status.verifiedControls} of ${status.totalControls - status.notApplicableControls} applicable controls implemented. ${status.openGaps} gaps remain open, including ${status.criticalGaps} critical gaps requiring immediate attention.`;

  const report: ComplianceReport = {
    id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    frameworkId,
    generatedAt: new Date().toISOString(),
    generatedBy,
    status,
    executiveSummary,
    detailedFindings,
    recommendations: recommendations.slice(0, 20), // Top 20 recommendations
    evidencePackage,
  };

  logger.info("Compliance report generated", {
    reportId: report.id,
    frameworkId,
    complianceScore: status.complianceScore,
  });

  return report;
}

/**
 * Get gap analysis summary.
 */
export async function getGapAnalysis(frameworkId: string): Promise<{
  totalGaps: number;
  byImpact: Record<string, number>;
  byStatus: Record<string, number>;
  overdueGaps: number;
  topGaps: ComplianceGap[];
} | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  const allGaps: ComplianceGap[] = [];
  const byImpact: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let overdueGaps = 0;
  const now = new Date();

  for (const category of framework.categories) {
    for (const control of category.controls) {
      for (const gap of control.gaps) {
        allGaps.push(gap);

        byImpact[gap.impact] = (byImpact[gap.impact] ?? 0) + 1;
        byStatus[gap.status] = (byStatus[gap.status] ?? 0) + 1;

        if (gap.remediationDueDate && new Date(gap.remediationDueDate) < now && gap.status !== "resolved") {
          overdueGaps++;
        }
      }
    }
  }

  const topGaps = allGaps
    .filter(g => g.status === "open" || g.status === "in_progress")
    .sort((a, b) => {
      const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    })
    .slice(0, 10);

  return {
    totalGaps: allGaps.length,
    byImpact,
    byStatus,
    overdueGaps,
    topGaps,
  };
}
