/**
 * Session 32 — Collaboration & Perception Intelligence API client.
 */
import { api } from "./api";
import type { CollaborationDashboard, MeetingConnector, LiveMeeting, TranscriptSegment, TranslationChannel, SpeakerProfile, AgendaItem, MeetingActionItem, MeetingDecision, MeetingRisk, MeetingSummary, FollowUpTask, ScreenShareSession, InterfaceExplanation, GuidedStep, CodeAssistance, ScreenIssue, WorkflowDoc, CameraPipeline, Detection, CameraFinding } from "@windels/shared";
export type { CollaborationDashboard, MeetingConnector, LiveMeeting, TranscriptSegment, TranslationChannel, SpeakerProfile, AgendaItem, MeetingActionItem, MeetingDecision, MeetingRisk, MeetingSummary, FollowUpTask, ScreenShareSession, InterfaceExplanation, GuidedStep, CodeAssistance, ScreenIssue, WorkflowDoc, CameraPipeline, Detection, CameraFinding } from "@windels/shared";


export const collabApi = {
  dashboard: () => api<CollaborationDashboard>("/collaboration/dashboard/rollup"),

  // meeting connectors
  listConnectors: () => api<MeetingConnector[]>("/collaboration/meetings/connectors"),

  // meetings
  listMeetings: (status?: string) =>
    api<LiveMeeting[]>(`/collaboration/meetings${status ? `?status=${status}` : ""}`),
  getMeeting: (id: string) => api<LiveMeeting>(`/collaboration/meetings/${id}`),
  scheduleMeeting: (input: { title: string; platform: string; connectorId: string; organizer: string; attendees?: number; languages?: string[]; tags?: string[] }) =>
    api<LiveMeeting>("/collaboration/meetings", { method: "POST", json: input }),
  joinAi: (id: string) => api<LiveMeeting>(`/collaboration/meetings/${id}/join`, { method: "POST" }),
  endMeeting: (id: string) => api<LiveMeeting>(`/collaboration/meetings/${id}/end`, { method: "POST" }),

  listSegments: (id: string) => api<TranscriptSegment[]>(`/collaboration/meetings/${id}/transcripts`),
  listTranslations: (id: string) => api<TranslationChannel[]>(`/collaboration/meetings/${id}/translations`),
  enableTranslation: (id: string, language: string) =>
    api<TranslationChannel>(`/collaboration/meetings/${id}/translations`, { method: "POST", json: { language } }),
  listSpeakers: (id: string) => api<SpeakerProfile[]>(`/collaboration/meetings/${id}/speakers`),
  listAgenda: (id: string) => api<AgendaItem[]>(`/collaboration/meetings/${id}/agenda`),
  listActionItems: (id: string) => api<MeetingActionItem[]>(`/collaboration/meetings/${id}/action-items`),
  updateActionItem: (mid: string, id: string, status: string) =>
    api<MeetingActionItem>(`/collaboration/meetings/${mid}/action-items/${id}/status`, { method: "POST", json: { status } }),
  listDecisions: (id: string) => api<MeetingDecision[]>(`/collaboration/meetings/${id}/decisions`),
  listRisks: (id: string) => api<MeetingRisk[]>(`/collaboration/meetings/${id}/risks`),
  ackRisk: (mid: string, id: string) => api<MeetingRisk>(`/collaboration/meetings/${mid}/risks/${id}/ack`, { method: "POST" }),
  getSummary: (id: string) => api<MeetingSummary | null>(`/collaboration/meetings/${id}/summary`),
  listFollowUps: (id: string) => api<FollowUpTask[]>(`/collaboration/meetings/${id}/followups`),
  enqueueWriteThrough: (id: string) => api<FollowUpTask[]>(`/collaboration/meetings/${id}/writethrough`, { method: "POST" }),

  // screen sessions
  listSessions: (status?: string) =>
    api<ScreenShareSession[]>(`/collaboration/screen/sessions${status ? `?status=${status}` : ""}`),
  getSession: (id: string) => api<ScreenShareSession>(`/collaboration/screen/sessions/${id}`),
  startSession: (input: { title: string; user: string; level: string; application?: string; url?: string }) =>
    api<ScreenShareSession>("/collaboration/screen/sessions", { method: "POST", json: input }),
  endSession: (id: string) => api<ScreenShareSession>(`/collaboration/screen/sessions/${id}/end`, { method: "POST" }),
  listExplanations: (id: string) => api<InterfaceExplanation[]>(`/collaboration/screen/sessions/${id}/explanations`),
  listSteps: (id: string) => api<GuidedStep[]>(`/collaboration/screen/sessions/${id}/steps`),
  advanceStep: (sid: string, id: string, status: string) =>
    api<GuidedStep>(`/collaboration/screen/sessions/${sid}/steps/${id}/advance`, { method: "POST", json: { status } }),
  listCodeAssists: (id: string) => api<CodeAssistance[]>(`/collaboration/screen/sessions/${id}/code-assist`),
  listIssues: (id: string) => api<ScreenIssue[]>(`/collaboration/screen/sessions/${id}/issues`),
  listDocs: (id: string) => api<WorkflowDoc[]>(`/collaboration/screen/sessions/${id}/docs`),
  generateDoc: (sid: string, title: string, format: string = "markdown") =>
    api<WorkflowDoc>(`/collaboration/screen/sessions/${sid}/docs`, { method: "POST", json: { title, format } }),

  // camera pipelines
  listPipelines: (filter?: { kind?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<CameraPipeline[]>(`/collaboration/camera/pipelines${qs ? `?${qs}` : ""}`);
  },
  getPipeline: (id: string) => api<CameraPipeline>(`/collaboration/camera/pipelines/${id}`),
  setPipelineStatus: (id: string, status: string) =>
    api<CameraPipeline>(`/collaboration/camera/pipelines/${id}/status`, { method: "POST", json: { status } }),
  listDetections: (id: string) => api<Detection[]>(`/collaboration/camera/pipelines/${id}/detections`),
  listFindings: (id: string) => api<CameraFinding[]>(`/collaboration/camera/pipelines/${id}/findings`),
  acknowledgeFinding: (pid: string, id: string, by: string = "admin") =>
    api<CameraFinding>(`/collaboration/camera/pipelines/${pid}/findings/${id}/acknowledge`, { method: "POST", json: { by } }),
};
