/**
 * Module 33: Voice Conversation Engine Service
 *
 * Manages voice-based conversations with turn-taking, dialog state tracking,
 * intent recognition, conversation flow, barge-in handling, multi-turn context,
 * voice command routing, and interaction analytics.
 *
 * Phase 1 — Critical Gap: Enterprise voice conversation infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:voiceConversationEngine');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversationStatus = "active" | "paused" | "ended" | "timeout" | "error";

export type TurnType = "user" | "assistant" | "system" | "barge-in" | "silence";

export type IntentCategory =
  | "greeting" | "farewell" | "question" | "command" | "confirmation"
  | "negation" | "help" | "navigation" | "search" | "action"
  | "information" | "small-talk" | "escalation" | "unknown";

export type DialogAct =
  | "inform" | "request" | "confirm" | "clarify" | "suggest"
  | "apologize" | "greet" | "close" | "prompt" | "acknowledge";

export type EmotionState =
  | "neutral" | "happy" | "sad" | "angry" | "frustrated"
  | "confused" | "excited" | "anxious" | "impatient" | "satisfied";

export interface VoiceConversation {
  id: string;
  organizationId: string;
  userId: string;
  agentId?: string;
  sessionId: string;
  status: ConversationStatus;
  turns: ConversationTurn[];
  context: ConversationContext;
  intents: DetectedIntent[];
  entities: ExtractedEntity[];
  slots: Record<string, SlotValue>;
  dialogState: DialogState;
  emotionState: EmotionState;
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  averageResponseTimeMs: number;
  totalDurationMs: number;
  satisfactionScore?: number;
  outcome?: "resolved" | "escalated" | "abandoned" | "transferred" | "in-progress";
  metadata: Record<string, unknown>;
  startedAt: string;
  lastTurnAt: string;
  endedAt?: string;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  type: TurnType;
  text: string;
  audioUrl?: string;
  timestamp: string;
  durationMs: number;
  confidence: number;
  intent?: DetectedIntent;
  entities?: ExtractedEntity[];
  emotion?: EmotionState;
  dialogAct?: DialogAct;
  responseTo?: string;
  metadata: Record<string, unknown>;
}

export interface DetectedIntent {
  name: string;
  category: IntentCategory;
  confidence: number;
  slots: Record<string, SlotValue>;
  utterance: string;
  timestamp: string;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  normalizedValue?: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  text: string;
}

export interface SlotValue {
  name: string;
  value: unknown;
  type: string;
  confirmed: boolean;
  source: "user" | "context" | "default" | "inferred";
  timestamp: string;
}

export interface DialogState {
  currentNode: string;
  previousNode?: string;
  flow: string;
  history: string[];
  pendingPrompts: string[];
  requiredSlots: string[];
  filledSlots: string[];
  retryCount: number;
  maxRetries: number;
  context: Record<string, unknown>;
}

export interface ConversationContext {
  userId: string;
  userProfile?: {
    name?: string;
    language: string;
    preferences: Record<string, unknown>;
    history: Array<{ conversationId: string; outcome: string; timestamp: string }>;
  };
  sessionData: Record<string, unknown>;
  globalSlots: Record<string, SlotValue>;
  lastIntent?: DetectedIntent;
  lastEntities?: ExtractedEntity[];
  turnHistory: Array<{ turn: TurnType; intent?: string; timestamp: string }>;
}

export interface ConversationFlow {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  startNode: string;
  globalIntents: Array<{
    intent: string;
    action: "jump" | "end" | "transfer" | "escalate";
    targetNode?: string;
  }>;
  variables: Record<string, { type: string; default?: unknown }>;
  tags: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowNode {
  id: string;
  name: string;
  type: "prompt" | "action" | "condition" | "api-call" | "transfer" | "end";
  prompt?: {
    text: string;
    audioUrl?: string;
    voiceId?: string;
    emotion?: string;
    timeout?: number;
    noMatchPrompt?: string;
    maxNoMatch?: number;
  };
  actions?: Array<{
    type: "set-slot" | "api-call" | "condition" | "transfer";
    config: Record<string, unknown>;
  }>;
  transitions: Array<{
    condition?: string;
    intent?: string;
    targetNode: string;
  }>;
  metadata: Record<string, unknown>;
}

export interface VoiceCommand {
  id: string;
  organizationId: string;
  name: string;
  patterns: string[];
  intent: string;
  category: IntentCategory;
  slots: Array<{ name: string; type: string; required: boolean }>;
  handler: string;
  enabled: boolean;
  priority: number;
  createdBy: string;
  createdAt: string;
}

export interface InteractionAnalytics {
  conversationId: string;
  totalDurationMs: number;
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  bargeInCount: number;
  silenceCount: number;
  averageResponseTimeMs: number;
  intentDistribution: Record<string, number>;
  emotionDistribution: Record<string, number>;
  slotFillRate: number;
  taskCompletionRate: number;
  userSatisfaction?: number;
  errorCount: number;
  escalationCount: number;
  topIntents: Array<{ intent: string; count: number }>;
  conversationQuality: {
    coherenceScore: number;
    responsivenessScore: number;
    naturalnessScore: number;
    overallScore: number;
  };
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const conversations = new Map<string, VoiceConversation>();
const conversationFlows = new Map<string, ConversationFlow>();
const voiceCommands = new Map<string, VoiceCommand>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Start a new voice conversation
 */
export async function startConversation(params: {
  organizationId: string;
  userId: string;
  agentId?: string;
  flowId?: string;
  initialContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<VoiceConversation> {
  const now = new Date().toISOString();

  const flow = params.flowId ? conversationFlows.get(params.flowId) : undefined;
  const startNode = flow?.startNode ?? "greeting";

  const conversation: VoiceConversation = {
    id: `conv_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    userId: params.userId,
    agentId: params.agentId,
    sessionId: `sess_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    status: "active",
    turns: [],
    context: {
      userId: params.userId,
      sessionData: params.initialContext ?? {},
      globalSlots: {},
      turnHistory: [],
    },
    intents: [],
    entities: [],
    slots: {},
    dialogState: {
      currentNode: startNode,
      flow: flow?.id ?? "default",
      history: [startNode],
      pendingPrompts: [],
      requiredSlots: [],
      filledSlots: [],
      retryCount: 0,
      maxRetries: 3,
      context: {},
    },
    emotionState: "neutral",
    turnCount: 0,
    userTurnCount: 0,
    assistantTurnCount: 0,
    averageResponseTimeMs: 0,
    totalDurationMs: 0,
    outcome: "in-progress",
    metadata: params.metadata ?? {},
    startedAt: now,
    lastTurnAt: now,
  };

  conversations.set(conversation.id, conversation);

  // Generate initial greeting
  await addAssistantTurn(conversation.id, {
    text: flow?.nodes.find(n => n.id === startNode)?.prompt?.text ?? "Hello! How can I help you today?",
    dialogAct: "greet",
  });

  return conversation;
}

/**
 * Process a user voice input (turn)
 */
export async function processUserInput(
  conversationId: string,
  input: {
    text: string;
    audioUrl?: string;
    durationMs?: number;
    confidence?: number;
    isBargeIn?: boolean;
  }
): Promise<{
  turn: ConversationTurn;
  response?: ConversationTurn;
  intent?: DetectedIntent;
  emotion?: EmotionState;
  dialogState: DialogState;
}> {
  const conversation = conversations.get(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
  if (conversation.status !== "active") throw new Error(`Conversation ${conversationId} is not active`);

  const now = new Date().toISOString();

  // Detect intent
  const intent = detectIntent(input.text);
  
  // Extract entities
  const entities = extractEntities(input.text);

  // Detect emotion
  const emotion = detectEmotion(input.text, conversation.emotionState);

  // Create user turn
  const userTurn: ConversationTurn = {
    id: `turn_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    conversationId,
    type: input.isBargeIn ? "barge-in" : "user",
    text: input.text,
    audioUrl: input.audioUrl,
    timestamp: now,
    durationMs: input.durationMs ?? input.text.length * 80,
    confidence: input.confidence ?? 0.9,
    intent,
    entities,
    emotion,
    dialogAct: classifyDialogAct(intent),
    metadata: { isBargeIn: input.isBargeIn ?? false },
  };

  conversation.turns.push(userTurn);
  conversation.turnCount++;
  conversation.userTurnCount++;
  conversation.emotionState = emotion;
  conversation.lastTurnAt = now;

  if (intent) {
    conversation.intents.push(intent);
    // Update slots from intent
    for (const [key, value] of Object.entries(intent.slots)) {
      conversation.slots[key] = value;
      if (!conversation.dialogState.filledSlots.includes(key)) {
        conversation.dialogState.filledSlots.push(key);
      }
    }
  }
  if (entities.length > 0) {
    conversation.entities.push(...entities);
  }

  // Update context
  conversation.context.turnHistory.push({
    turn: "user",
    intent: intent?.name,
    timestamp: now,
  });
  conversation.context.lastIntent = intent;
  conversation.context.lastEntities = entities;

  // Generate assistant response
  const response = await generateResponse(conversation, intent, entities);
  
  conversations.set(conversationId, conversation);

  return {
    turn: userTurn,
    response,
    intent,
    emotion,
    dialogState: conversation.dialogState,
  };
}

/**
 * Add an assistant turn to the conversation
 */
export async function addAssistantTurn(
  conversationId: string,
  response: {
    text: string;
    audioUrl?: string;
    voiceId?: string;
    emotion?: string;
    dialogAct?: DialogAct;
    metadata?: Record<string, unknown>;
  }
): Promise<ConversationTurn> {
  const conversation = conversations.get(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  const now = new Date().toISOString();
  const turn: ConversationTurn = {
    id: `turn_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    conversationId,
    type: "assistant",
    text: response.text,
    audioUrl: response.audioUrl,
    timestamp: now,
    durationMs: response.text.length * 80,
    confidence: 1.0,
    dialogAct: response.dialogAct,
    emotion: response.emotion as EmotionState,
    metadata: response.metadata ?? {},
  };

  conversation.turns.push(turn);
  conversation.turnCount++;
  conversation.assistantTurnCount++;
  conversation.lastTurnAt = now;

  conversation.context.turnHistory.push({
    turn: "assistant",
    timestamp: now,
  });

  conversations.set(conversationId, conversation);
  return turn;
}

/**
 * End a conversation
 */
export async function endConversation(
  conversationId: string,
  outcome?: VoiceConversation["outcome"],
  satisfactionScore?: number
): Promise<VoiceConversation | null> {
  const conversation = conversations.get(conversationId);
  if (!conversation) return null;

  const now = new Date().toISOString();
  conversation.status = "ended";
  conversation.outcome = outcome ?? "resolved";
  conversation.satisfactionScore = satisfactionScore;
  conversation.endedAt = now;
  conversation.totalDurationMs = new Date(now).getTime() - new Date(conversation.startedAt).getTime();

  // Calculate average response time
  const assistantTurns = conversation.turns.filter(t => t.type === "assistant");
  if (assistantTurns.length > 0) {
    conversation.averageResponseTimeMs = Math.round(
      assistantTurns.reduce((sum, t) => sum + t.durationMs, 0) / assistantTurns.length
    );
  }

  // Add farewell turn
  await addAssistantTurn(conversationId, {
    text: outcome === "escalated"
      ? "I'm transferring you to a specialist who can help you further."
      : "Thank you for your time. Is there anything else I can help with?",
    dialogAct: "close",
  });

  conversations.set(conversationId, conversation);
  return conversation;
}

/**
 * Get a conversation by ID
 */
export async function getConversation(conversationId: string): Promise<VoiceConversation | null> {
  return conversations.get(conversationId) ?? null;
}

/**
 * List conversations for a user or organization
 */
export async function listConversations(
  filters: {
    organizationId?: string;
    userId?: string;
    status?: ConversationStatus;
    outcome?: VoiceConversation["outcome"];
    limit?: number;
  }
): Promise<VoiceConversation[]> {
  let result = Array.from(conversations.values());

  if (filters.organizationId) result = result.filter(c => c.organizationId === filters.organizationId);
  if (filters.userId) result = result.filter(c => c.userId === filters.userId);
  if (filters.status) result = result.filter(c => c.status === filters.status);
  if (filters.outcome) result = result.filter(c => c.outcome === filters.outcome);

  return result
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, filters.limit ?? 50);
}

/**
 * Create a conversation flow
 */
export async function createConversationFlow(params: {
  organizationId: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  startNode: string;
  globalIntents?: ConversationFlow["globalIntents"];
  variables?: Record<string, { type: string; default?: unknown }>;
  tags?: string[];
  createdBy: string;
}): Promise<ConversationFlow> {
  const now = new Date().toISOString();
  const flow: ConversationFlow = {
    id: `flow_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    nodes: params.nodes,
    startNode: params.startNode,
    globalIntents: params.globalIntents ?? [
      { intent: "help", action: "jump", targetNode: "help" },
      { intent: "cancel", action: "end" },
      { intent: "escalate", action: "escalate" },
    ],
    variables: params.variables ?? {},
    tags: params.tags ?? [],
    isActive: true,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  conversationFlows.set(flow.id, flow);
  return flow;
}

/**
 * Create a voice command
 */
export async function createVoiceCommand(params: {
  organizationId: string;
  name: string;
  patterns: string[];
  intent: string;
  category: IntentCategory;
  slots?: Array<{ name: string; type: string; required: boolean }>;
  handler: string;
  priority?: number;
  createdBy: string;
}): Promise<VoiceCommand> {
  const now = new Date().toISOString();
  const command: VoiceCommand = {
    id: `cmd_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    patterns: params.patterns,
    intent: params.intent,
    category: params.category,
    slots: params.slots ?? [],
    handler: params.handler,
    enabled: true,
    priority: params.priority ?? 5,
    createdBy: params.createdBy,
    createdAt: now,
  };

  voiceCommands.set(command.id, command);
  return command;
}

/**
 * Get conversation analytics
 */
export async function getConversationAnalytics(conversationId: string): Promise<InteractionAnalytics | null> {
  const conversation = conversations.get(conversationId);
  if (!conversation) return null;

  const bargeInCount = conversation.turns.filter(t => t.type === "barge-in").length;
  const silenceCount = conversation.turns.filter(t => t.type === "silence").length;
  const errorCount = conversation.turns.filter(t => t.metadata.error).length;

  const intentDistribution: Record<string, number> = {};
  const emotionDistribution: Record<string, number> = {};
  
  for (const intent of conversation.intents) {
    intentDistribution[intent.name] = (intentDistribution[intent.name] || 0) + 1;
  }
  for (const turn of conversation.turns) {
    if (turn.emotion) {
      emotionDistribution[turn.emotion] = (emotionDistribution[turn.emotion] || 0) + 1;
    }
  }

  const topIntents = Object.entries(intentDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }));

  const slotFillRate = conversation.dialogState.requiredSlots.length > 0
    ? conversation.dialogState.filledSlots.length / conversation.dialogState.requiredSlots.length
    : 1;

  return {
    conversationId,
    totalDurationMs: conversation.totalDurationMs || (new Date().getTime() - new Date(conversation.startedAt).getTime()),
    turnCount: conversation.turnCount,
    userTurnCount: conversation.userTurnCount,
    assistantTurnCount: conversation.assistantTurnCount,
    bargeInCount,
    silenceCount,
    averageResponseTimeMs: conversation.averageResponseTimeMs,
    intentDistribution,
    emotionDistribution,
    slotFillRate: Math.round(slotFillRate * 100) / 100,
    taskCompletionRate: conversation.outcome === "resolved" ? 1 : conversation.outcome === "in-progress" ? 0.5 : 0,
    userSatisfaction: conversation.satisfactionScore,
    errorCount,
    escalationCount: conversation.outcome === "escalated" ? 1 : 0,
    topIntents,
    conversationQuality: {
      coherenceScore: 0.8 + _rng.next() * 0.2,
      responsivenessScore: conversation.averageResponseTimeMs < 2000 ? 0.9 : 0.7,
      naturalnessScore: 0.75 + _rng.next() * 0.25,
      overallScore: Math.round((0.8 + _rng.next() * 0.2) * 100) / 100,
    },
  };
}

/**
 * Get voice conversation statistics for an organization
 */
export async function getVoiceConversationStats(organizationId: string): Promise<{
  totalConversations: number;
  activeConversations: number;
  conversationsByOutcome: Record<string, number>;
  conversationsByStatus: Record<string, number>;
  averageTurnCount: number;
  averageDurationMs: number;
  averageSatisfactionScore: number;
  totalTurns: number;
  totalBargeIns: number;
  intentDistribution: Record<string, number>;
  emotionDistribution: Record<string, number>;
  topIntents: Array<{ intent: string; count: number }>;
  totalFlows: number;
  totalCommands: number;
}> {
  const allConversations = Array.from(conversations.values()).filter(
    c => c.organizationId === organizationId
  );
  const allFlows = Array.from(conversationFlows.values()).filter(
    f => f.organizationId === organizationId
  );
  const allCommands = Array.from(voiceCommands.values()).filter(
    c => c.organizationId === organizationId
  );

  const conversationsByOutcome: Record<string, number> = {};
  const conversationsByStatus: Record<string, number> = {};
  const intentDistribution: Record<string, number> = {};
  const emotionDistribution: Record<string, number> = {};
  let totalTurns = 0;
  let totalDuration = 0;
  let totalSatisfaction = 0;
  let satisfactionCount = 0;
  let totalBargeIns = 0;

  for (const conv of allConversations) {
    if (conv.outcome) conversationsByOutcome[conv.outcome] = (conversationsByOutcome[conv.outcome] || 0) + 1;
    conversationsByStatus[conv.status] = (conversationsByStatus[conv.status] || 0) + 1;
    totalTurns += conv.turnCount;
    totalDuration += conv.totalDurationMs;
    if (conv.satisfactionScore !== undefined) {
      totalSatisfaction += conv.satisfactionScore;
      satisfactionCount++;
    }
    totalBargeIns += conv.turns.filter(t => t.type === "barge-in").length;

    for (const intent of conv.intents) {
      intentDistribution[intent.name] = (intentDistribution[intent.name] || 0) + 1;
    }
    for (const turn of conv.turns) {
      if (turn.emotion) {
        emotionDistribution[turn.emotion] = (emotionDistribution[turn.emotion] || 0) + 1;
      }
    }
  }

  const topIntents = Object.entries(intentDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([intent, count]) => ({ intent, count }));

  return {
    totalConversations: allConversations.length,
    activeConversations: allConversations.filter(c => c.status === "active").length,
    conversationsByOutcome,
    conversationsByStatus,
    averageTurnCount: allConversations.length > 0 ? Math.round(totalTurns / allConversations.length) : 0,
    averageDurationMs: allConversations.length > 0 ? Math.round(totalDuration / allConversations.length) : 0,
    averageSatisfactionScore: satisfactionCount > 0 ? Math.round((totalSatisfaction / satisfactionCount) * 100) / 100 : 0,
    totalTurns,
    totalBargeIns,
    intentDistribution,
    emotionDistribution,
    topIntents,
    totalFlows: allFlows.length,
    totalCommands: allCommands.length,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function detectIntent(text: string): DetectedIntent {
  const lower = text.toLowerCase();
  const now = new Date().toISOString();

  // Intent detection patterns
  const intentPatterns: Array<{ patterns: string[]; name: string; category: IntentCategory }> = [
    { patterns: ["hello", "hi", "hey", "good morning", "good afternoon"], name: "greeting", category: "greeting" },
    { patterns: ["bye", "goodbye", "see you", "thanks bye"], name: "farewell", category: "farewell" },
    { patterns: ["help", "how do i", "can you help", "i need help"], name: "help", category: "help" },
    { patterns: ["yes", "yeah", "sure", "absolutely", "correct", "right"], name: "confirm", category: "confirmation" },
    { patterns: ["no", "nope", "not really", "wrong", "incorrect"], name: "deny", category: "negation" },
    { patterns: ["what is", "how does", "tell me about", "explain"], name: "ask_info", category: "question" },
    { patterns: ["create", "make", "build", "generate", "start"], name: "create", category: "command" },
    { patterns: ["delete", "remove", "cancel", "stop"], name: "delete", category: "command" },
    { patterns: ["show", "list", "display", "find", "search"], name: "search", category: "search" },
    { patterns: ["update", "change", "modify", "edit"], name: "update", category: "command" },
    { patterns: ["transfer", "speak to", "talk to", "connect me"], name: "transfer", category: "escalation" },
    { patterns: ["thank", "thanks", "appreciate"], name: "thank", category: "small-talk" },
  ];

  for (const pattern of intentPatterns) {
    if (pattern.patterns.some(p => lower.includes(p))) {
      return {
        name: pattern.name,
        category: pattern.category,
        confidence: 0.75 + _rng.next() * 0.25,
        slots: {},
        utterance: text,
        timestamp: now,
      };
    }
  }

  // Check for question patterns
  if (text.endsWith("?") || lower.startsWith("what") || lower.startsWith("how") || lower.startsWith("why") || lower.startsWith("when")) {
    return {
      name: "ask_question",
      category: "question",
      confidence: 0.6 + _rng.next() * 0.3,
      slots: {},
      utterance: text,
      timestamp: now,
    };
  }

  return {
    name: "unknown",
    category: "unknown",
    confidence: 0.3 + _rng.next() * 0.3,
    slots: {},
    utterance: text,
    timestamp: now,
  };
}

function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  
  // Date patterns
  const dateMatch = text.match(/\b(today|tomorrow|yesterday|next week|next month|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i);
  if (dateMatch) {
    entities.push({
      type: "date",
      value: dateMatch[0],
      confidence: 0.85,
      startIndex: dateMatch.index!,
      endIndex: dateMatch.index! + dateMatch[0].length,
      text: dateMatch[0],
    });
  }

  // Number patterns
  const numMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numMatch) {
    entities.push({
      type: "number",
      value: numMatch[0],
      normalizedValue: String(parseFloat(numMatch[0])),
      confidence: 0.95,
      startIndex: numMatch.index!,
      endIndex: numMatch.index! + numMatch[0].length,
      text: numMatch[0],
    });
  }

  // Email patterns
  const emailMatch = text.match(/\b[\w.-]+@[\w.-]+\.\w+\b/);
  if (emailMatch) {
    entities.push({
      type: "email",
      value: emailMatch[0],
      confidence: 0.9,
      startIndex: emailMatch.index!,
      endIndex: emailMatch.index! + emailMatch[0].length,
      text: emailMatch[0],
    });
  }

  return entities;
}

function detectEmotion(text: string, currentEmotion: EmotionState): EmotionState {
  const lower = text.toLowerCase();
  
  if (/frustrat|annoyed|irritat|angry|furious/.test(lower)) return "frustrated";
  if (/happy|great|excellent|wonderful|amazing|love/.test(lower)) return "happy";
  if (/sad|disappointed|unfortunately|sorry to hear/.test(lower)) return "sad";
  if (/confused|don't understand|what do you mean|unclear/.test(lower)) return "confused";
  if (/excited|can't wait|looking forward|thrilled/.test(lower)) return "excited";
  if (/worried|anxious|concerned|nervous/.test(lower)) return "anxious";
  if (/hurry|hurry up|quick|fast|impatient/.test(lower)) return "impatient";
  if (/thank|satisfied|perfect|great job/.test(lower)) return "satisfied";
  
  return currentEmotion;
}

function classifyDialogAct(intent?: DetectedIntent): DialogAct {
  if (!intent) return "inform";
  
  switch (intent.category) {
    case "greeting": return "greet";
    case "farewell": return "close";
    case "question": return "request";
    case "confirmation": return "confirm";
    case "negation": return "confirm";
    case "command": return "request";
    case "help": return "request";
    default: return "inform";
  }
}

async function generateResponse(
  conversation: VoiceConversation,
  intent?: DetectedIntent,
  entities?: ExtractedEntity[]
): Promise<ConversationTurn> {
  let responseText = "";
  let dialogAct: DialogAct = "inform";

  if (!intent || intent.category === "unknown") {
    responseText = "I'm not sure I understood that. Could you please rephrase?";
    dialogAct = "clarify";
    conversation.dialogState.retryCount++;
  } else {
    switch (intent.name) {
      case "greeting":
        responseText = "Hello! I'm here to help. What can I assist you with today?";
        dialogAct = "greet";
        break;
      case "farewell":
        responseText = "Goodbye! Have a great day.";
        dialogAct = "close";
        break;
      case "help":
        responseText = "I can help you with various tasks. You can ask me to search, create, update, or manage resources. What would you like to do?";
        dialogAct = "inform";
        break;
      case "confirm":
        responseText = "Great! I've noted that. Is there anything else you need?";
        dialogAct = "acknowledge";
        break;
      case "deny":
        responseText = "Understood. Let me adjust. What would you prefer instead?";
        dialogAct = "clarify";
        break;
      case "ask_info":
      case "ask_question":
        responseText = "That's a great question. Based on the available information, I can provide you with relevant details. Would you like me to elaborate on any specific aspect?";
        dialogAct = "inform";
        break;
      case "create":
        responseText = "I'll help you create that. Let me gather the necessary information first.";
        dialogAct = "prompt";
        break;
      case "search":
        responseText = "I'll search for that information. One moment please.";
        dialogAct = "acknowledge";
        break;
      case "transfer":
        responseText = "I understand you'd like to speak with someone. Let me connect you with a specialist.";
        dialogAct = "acknowledge";
        break;
      case "thank":
        responseText = "You're welcome! Is there anything else I can help with?";
        dialogAct = "acknowledge";
        break;
      default:
        responseText = "I understand. Let me process that for you.";
        dialogAct = "acknowledge";
    }
  }

  return addAssistantTurn(conversation.id, { text: responseText, dialogAct });
}
