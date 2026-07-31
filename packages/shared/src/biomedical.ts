/**
 * Session 65 — Enterprise Biomedical & Healthcare Intelligence.
 * Medical imaging, CDSS, hospital ops, lab intelligence, patient workflow,
 * compliance, pharmacy, telemedicine. HIPAA/gated by governance.
 */

export const BIOMED_AREAS = [
  "medical_imaging", "clinical_decision", "hospital_ops", "laboratory",
  "patient_workflow", "healthcare_compliance", "pharmacy", "telemedicine",
] as const;
export type BiomedArea = typeof BIOMED_AREAS[number];

export const COMPLIANCE_FRAMEWORKS = ["HIPAA","HITECH","GDPR-H","FDA-AI-AAP","CE-MDR","ISO-13485","21 CFR Part 11"] as const;

export interface ImagingStudy {
  id: string;
  patientHash: string;
  modality: "xray"|"ct"|"mri"|"ultrasound"|"pet"|"mammo"|"pathology";
  bodyPart: string;
  aiFindings: Array<{ finding: string; confidence: number; severity: "low"|"moderate"|"high"; priority: boolean }>;
  radiologistReviewed: boolean;
  status: "queued"|"analyzing"|"review"|"signed_off"|"escalated";
  createdAt: string;
  completedAt?: string;
}

export interface ClinicalDecision {
  id: string;
  patientHash: string;
  context: string;
  recommendations: Array<{ text: string; evidenceLevel: "A"|"B"|"C"|"D"; contraindicated: boolean }>;
  differentialDiagnoses: string[];
  riskScores: Record<string, number>;
  reviewedBy?: string;
  createdAt: string;
}

export interface HospitalOpsMetric {
  label: string;
  value: number;
  unit: string;
  target: number;
  status: "ok"|"warn"|"critical";
}

export interface PharmacyAlert {
  id: string;
  kind: "interaction"|"duplicate"|"allergy"|"dose"|"contraindication";
  severity: "info"|"warn"|"critical";
  message: string;
  at: string;
}

export interface TelemedicineSession {
  id: string;
  providerId: string;
  patientHash: string;
  startedAt: string;
  endedAt?: string;
  modality: "video"|"voice"|"async";
  language: string;
  aiScribeActive: boolean;
  summaryGenerated: boolean;
}

export interface BiomedicalDashboard {
  areas: Record<BiomedArea, { enabled: boolean; models: number; reviewed24h: number; escalations24h: number }>;
  imaging: { studies24h: number; aiAssisted: number; pendingReview: number; avgTurnaroundMin: number };
  ops: HospitalOpsMetric[];
  alerts24h: number;
  pharmacyAlerts: PharmacyAlert[];
  telemetryActive: number;
  complianceStatus: Record<string, "compliant"|"gap"|"at_risk">;
  recentStudies: ImagingStudy[];
}
