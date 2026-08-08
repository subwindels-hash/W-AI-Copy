/**
 * Cyber & Cloud Academy — Lecturer AI teaching tracks.
 *
 * A curated learning path that connects the existing Cybersecurity Academy
 * (Session 82) and Cloud/Infrastructure modules to the Lecturer AI adaptive
 * tutor. Each catalog topic maps to a teaching prompt the Lecturer AI runs
 * through its ASSESS → LESSON → QUESTION → FEEDBACK loop, and each topic
 * carries prerequisites so the path can recommend what to learn next based on
 * the learner's measured mastery (from `LecturerService.topicMastery`).
 *
 * No topic is faked: starting a session delegates to the real Lecturer AI, and
 * progress is derived from the lecturer's persisted mastery, never asserted.
 */

export const ACADEMY_TRACKS = [
  "cybersecurity",
  "cloud",
] as const;
export type AcademyTrack = (typeof ACADEMY_TRACKS)[number];

export const ACADEMY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type AcademyLevel = (typeof ACADEMY_LEVELS)[number];

export interface AcademyTopic {
  id: string;
  title: string;
  track: AcademyTrack;
  /** Level this topic is pitched at when first started. */
  level: AcademyLevel;
  /** The concrete subject string handed to the Lecturer AI. */
  teachingTopic: string;
  /** Short human-facing description shown in catalogs/UI. */
  description: string;
  /** Optional ids of topics that should be mastered first. */
  prerequisites: string[];
}

/**
 * Curated catalog. The Cybersecurity topics mirror the real Cyber Academy
 * courses (offensive security / web / network / AD / malware / threat hunting);
 * the Cloud topics cover cloud fundamentals through multi-cloud security and
 * infrastructure-as-code, which map to the infrastructure & self-hosted modules.
 */
export const ACADEMY_CATALOG: AcademyTopic[] = [
  // ── Cybersecurity & Ethical Hacking ──────────────────────────────
  {
    id: "cyber-fundamentals",
    title: "Cybersecurity Fundamentals",
    track: "cybersecurity",
    level: "beginner",
    teachingTopic: "Cybersecurity Fundamentals: core security concepts, the CIA triad, threat actors, attack surface and defense-in-depth",
    description: "Core security concepts: CIA triad, threat actors, attack surface, defense-in-depth.",
    prerequisites: [],
  },
  {
    id: "ethical-hacking",
    title: "Ethical Hacking Bootcamp",
    track: "cybersecurity",
    level: "intermediate",
    teachingTopic: "Ethical Hacking Bootcamp: the ethical hacking methodology, reconnaissance, enumeration, vulnerability exploitation and responsible disclosure",
    description: "Ethical hacking methodology: recon, enumeration, exploitation, responsible disclosure.",
    prerequisites: ["cyber-fundamentals"],
  },
  {
    id: "web-hacking",
    title: "Web App Hacking (OWASP Top 10)",
    track: "cybersecurity",
    level: "intermediate",
    teachingTopic: "Web Application Hacking and the OWASP Top 10: injection, broken authentication, XSS, insecure design and their mitigations",
    description: "OWASP Top 10 web vulnerabilities and how to test and fix them.",
    prerequisites: ["cyber-fundamentals"],
  },
  {
    id: "network-pentest",
    title: "Network Penetration Testing",
    track: "cybersecurity",
    level: "advanced",
    teachingTopic: "Network Penetration Testing: scanning, service fingerprinting, exploitation, pivoting and post-exploitation",
    description: "Scanning, fingerprinting, exploitation, pivoting and post-exploitation.",
    prerequisites: ["ethical-hacking"],
  },
  {
    id: "active-directory",
    title: "Active Directory Attack & Defense",
    track: "cybersecurity",
    level: "advanced",
    teachingTopic: "Active Directory Attack and Defense: AD enumeration, Kerberos attacks, privilege escalation and hardening",
    description: "AD enumeration, Kerberos attacks, privilege escalation and hardening.",
    prerequisites: ["network-pentest"],
  },
  {
    id: "api-security",
    title: "API Security Testing",
    track: "cybersecurity",
    level: "advanced",
    teachingTopic: "API Security Testing: authentication and authorization flaws, mass assignment, rate limiting and API fuzzing",
    description: "API auth/authz flaws, mass assignment, rate limiting and fuzzing.",
    prerequisites: ["web-hacking"],
  },
  {
    id: "malware-analysis",
    title: "Malware Analysis & Reverse Engineering",
    track: "cybersecurity",
    level: "expert",
    teachingTopic: "Malware Analysis and Reverse Engineering: static and dynamic analysis, unpacking, disassembly and indicators of compromise",
    description: "Static/dynamic analysis, unpacking, disassembly and indicators of compromise.",
    prerequisites: ["network-pentest"],
  },
  {
    id: "zero-trust",
    title: "Zero Trust Architecture Design",
    track: "cybersecurity",
    level: "expert",
    teachingTopic: "Zero Trust Architecture: never trust / always verify, micro-segmentation, identity-centric access control and continuous validation",
    description: "Never-trust/always-verify, micro-segmentation and identity-centric access control.",
    prerequisites: ["active-directory"],
  },
  {
    id: "threat-hunting",
    title: "Threat Hunting with AI",
    track: "cybersecurity",
    level: "expert",
    teachingTopic: "Threat Hunting with AI: hypothesis-driven hunting, anomaly detection, machine learning on telemetry and automated triage",
    description: "Hypothesis-driven hunting, anomaly detection and ML on security telemetry.",
    prerequisites: ["zero-trust"],
  },

  // ── Cloud Computing ──────────────────────────────────────────────
  {
    id: "cloud-fundamentals",
    title: "Cloud Computing Fundamentals",
    track: "cloud",
    level: "beginner",
    teachingTopic: "Cloud Computing Fundamentals: IaaS, PaaS, SaaS, virtualization, regions and availability zones, and shared responsibility",
    description: "IaaS/PaaS/SaaS, virtualization, regions/AZs and the shared responsibility model.",
    prerequisites: [],
  },
  {
    id: "iac",
    title: "Infrastructure as Code (Terraform)",
    track: "cloud",
    level: "intermediate",
    teachingTopic: "Infrastructure as Code with Terraform: declarative resources, state, plan/apply, modules and drift",
    description: "Declarative resources, state, plan/apply, modules and drift detection.",
    prerequisites: ["cloud-fundamentals"],
  },
  {
    id: "cloud-aws",
    title: "AWS Architecture & Security",
    track: "cloud",
    level: "intermediate",
    teachingTopic: "AWS Cloud Architecture and Security: core services, VPC networking, IAM, encryption and the AWS security model",
    description: "Core AWS services, VPC, IAM, encryption and AWS security best practice.",
    prerequisites: ["cloud-fundamentals"],
  },
  {
    id: "cloud-azure",
    title: "Azure Cloud & Defender",
    track: "cloud",
    level: "intermediate",
    teachingTopic: "Microsoft Azure Cloud and Defender: Azure services, Entra ID, networking, Sentinel and Defender for Cloud",
    description: "Azure services, Entra ID, networking, Sentinel and Defender for Cloud.",
    prerequisites: ["cloud-fundamentals"],
  },
  {
    id: "cloud-gcp",
    title: "Google Cloud & Security Command Center",
    track: "cloud",
    level: "intermediate",
    teachingTopic: "Google Cloud Platform and Security Command Center: GCP services, IAM, networking, and Cloud Security Command Center",
    description: "GCP services, IAM, networking and Cloud Security Command Center.",
    prerequisites: ["cloud-fundamentals"],
  },
  {
    id: "kubernetes-security",
    title: "Container & Kubernetes Security",
    track: "cloud",
    level: "advanced",
    teachingTopic: "Container and Kubernetes Security: image scanning, RBAC, pod security, network policies and cluster hardening",
    description: "Image scanning, RBAC, pod security, network policies and cluster hardening.",
    prerequisites: ["iac"],
  },
  {
    id: "devsecops",
    title: "DevSecOps Pipeline Engineering",
    track: "cloud",
    level: "advanced",
    teachingTopic: "DevSecOps Pipeline Engineering: shift-left security, SAST/DAST, SBOM, secret scanning and CI/CD security gates",
    description: "Shift-left security, SAST/DAST, SBOM, secret scanning and CI/CD gates.",
    prerequisites: ["kubernetes-security"],
  },
  {
    id: "multi-cloud",
    title: "Multi-Cloud Security & FinOps",
    track: "cloud",
    level: "expert",
    teachingTopic: "Multi-Cloud Security and FinOps: consistent policy across AWS/Azure/GCP, cost governance, and cloud cost optimization",
    description: "Consistent policy across clouds, cost governance and optimization.",
    prerequisites: ["devsecops", "cloud-aws"],
  },
];

export function academyTopicById(id: string): AcademyTopic | undefined {
  return ACADEMY_CATALOG.find((t) => t.id === id);
}

export interface AcademyProgressEntry {
  topicId: string;
  title: string;
  track: AcademyTrack;
  masteryPct: number | null; // null = never started (never a fabricated 0)
  level: AcademyLevel;
  completed: boolean;        // mastery >= 85 (the lecturer's completion threshold)
  started: boolean;          // has a measurable mastery record
  recommendedLevel: AcademyLevel;
}

export interface AcademyPathNode {
  topicId: string;
  title: string;
  track: AcademyTrack;
  level: AcademyLevel;
  prerequisites: string[];
  prerequisitesMet: boolean;
  masteryPct: number | null;
  completed: boolean;
  started: boolean;
  nextRecommended: boolean;
}

export interface AcademyCatalogView {
  tracks: Record<AcademyTrack, AcademyTopic[]>;
  total: number;
}
