/**
 * Module 32: Spatial Interaction Service
 *
 * Manages spatial anchors, hand tracking, gesture recognition, physics simulation,
 * multi-user spatial synchronization, spatial audio, gaze tracking, and scene
 * composition for AR/VR experiences.
 *
 * Phase 1 — Critical Gap: Enterprise spatial interaction infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnchorType = "persistent" | "session" | "shared" | "cloud" | "local";

export type AnchorStatus = "active" | "lost" | "relocating" | "expired";

export type GestureType =
  | "pinch" | "grab" | "point" | "wave" | "thumbs_up" | "thumbs_down"
  | "open_palm" | "closed_fist" | "tap" | "swipe_left" | "swipe_right"
  | "swipe_up" | "swipe_down" | "circle" | "custom";

export type HandType = "left" | "right" | "both";

export type PhysicsBodyType = "static" | "dynamic" | "kinematic";

export type ColliderType = "box" | "sphere" | "capsule" | "mesh" | "convex";

export interface SpatialAnchor {
  id: string;
  organizationId: string;
  sessionId: string;
  twinId?: string;
  name: string;
  description: string;
  type: AnchorType;
  status: AnchorStatus;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  confidence: number; // 0-1
  worldMappingId?: string;
  environmentFeatures?: number;
  attachedEntities: Array<{
    entityId: string;
    entityType: "3d-model" | "ui-panel" | "label" | "light" | "audio-source";
    offset: { x: number; y: number; z: number };
  }>;
  createdBy: string;
  createdAt: string;
  lastRelocatedAt?: string;
  expiresAt?: string;
}

export interface HandTrackingData {
  sessionId: string;
  userId: string;
  hand: HandType;
  timestamp: string;
  joints: HandJoint[];
  gestures: DetectedGesture[];
  confidence: number;
  isTracking: boolean;
}

export interface HandJoint {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  radius: number;
}

export interface DetectedGesture {
  type: GestureType;
  confidence: number;
  hand: HandType;
  timestamp: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface PhysicsBody {
  id: string;
  sessionId: string;
  anchorId?: string;
  type: PhysicsBodyType;
  collider: {
    type: ColliderType;
    size: { x: number; y: number; z: number };
    offset: { x: number; y: number; z: number };
    isTrigger: boolean;
  };
  mass: number;
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  useGravity: boolean;
  isKinematic: boolean;
  friction: number;
  restitution: number;
  metadata: Record<string, unknown>;
}

export interface PhysicsCollision {
  id: string;
  sessionId: string;
  bodyAId: string;
  bodyBId: string;
  contactPoint: { x: number; y: number; z: number };
  contactNormal: { x: number; y: number; z: number };
  impulse: number;
  relativeVelocity: number;
  timestamp: string;
}

export interface SpatialUser {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  avatarId?: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  gaze: { x: number; y: number; z: number };
  headPosition: { x: number; y: number; z: number };
  leftHandPosition?: { x: number; y: number; z: number };
  rightHandPosition?: { x: number; y: number; z: number };
  isSpeaking: boolean;
  audioLevel: number;
  joinedAt: string;
  lastUpdateAt: string;
}

export interface SpatialAudioSource {
  id: string;
  sessionId: string;
  anchorId?: string;
  type: "ambient" | "positional" | "voice" | "effect" | "music";
  url?: string;
  position: { x: number; y: number; z: number };
  volume: number;
  pitch: number;
  spatialBlend: number; // 0 = 2D, 1 = 3D
  minDistance: number;
  maxDistance: number;
  isLooping: boolean;
  isPlaying: boolean;
  metadata: Record<string, unknown>;
}

export interface GazeInteraction {
  id: string;
  sessionId: string;
  userId: string;
  targetId: string;
  targetType: "anchor" | "entity" | "ui-element";
  gazeStartTime: string;
  gazeDurationMs: number;
  gazePosition: { x: number; y: number; z: number };
  isDwelling: boolean;
  triggered: boolean;
  metadata: Record<string, unknown>;
}

export interface SceneLayer {
  id: string;
  sessionId: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  entities: Array<{
    entityId: string;
    anchorId?: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  }>;
  metadata: Record<string, unknown>;
}

export interface SpatialInteractionEvent {
  id: string;
  sessionId: string;
  userId: string;
  type: "gesture" | "gaze" | "collision" | "voice-command" | "spatial-tap" | "grab" | "release" | "move";
  targetId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const anchors = new Map<string, SpatialAnchor>();
const handTrackingData: HandTrackingData[] = [];
const physicsBodies = new Map<string, PhysicsBody>();
const collisions: PhysicsCollision[] = [];
const spatialUsers = new Map<string, SpatialUser>();
const audioSources = new Map<string, SpatialAudioSource>();
const gazeInteractions: GazeInteraction[] = [];
const sceneLayers = new Map<string, SceneLayer>();
const interactionEvents: SpatialInteractionEvent[] = [];

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a spatial anchor
 */
export async function createSpatialAnchor(params: {
  organizationId: string;
  sessionId: string;
  twinId?: string;
  name: string;
  description?: string;
  type?: AnchorType;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  scale?: { x: number; y: number; z: number };
  expiresAt?: string;
  createdBy: string;
}): Promise<SpatialAnchor> {
  const now = new Date().toISOString();
  const anchor: SpatialAnchor = {
    id: `anchor_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    sessionId: params.sessionId,
    twinId: params.twinId,
    name: params.name,
    description: params.description ?? "",
    type: params.type ?? "session",
    status: "active",
    position: params.position,
    rotation: params.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    scale: params.scale ?? { x: 1, y: 1, z: 1 },
    confidence: 0.95,
    attachedEntities: [],
    createdBy: params.createdBy,
    createdAt: now,
    expiresAt: params.expiresAt,
  };

  anchors.set(anchor.id, anchor);
  return anchor;
}

/**
 * Get a spatial anchor by ID
 */
export async function getSpatialAnchor(anchorId: string): Promise<SpatialAnchor | null> {
  return anchors.get(anchorId) ?? null;
}

/**
 * List anchors for a session
 */
export async function listSessionAnchors(
  sessionId: string,
  filters?: { type?: AnchorType; status?: AnchorStatus }
): Promise<SpatialAnchor[]> {
  let result = Array.from(anchors.values()).filter(a => a.sessionId === sessionId);
  if (filters?.type) result = result.filter(a => a.type === filters.type);
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Update anchor position (relocalization)
 */
export async function updateAnchorPosition(
  anchorId: string,
  position: { x: number; y: number; z: number },
  rotation?: { x: number; y: number; z: number; w: number },
  confidence?: number
): Promise<SpatialAnchor | null> {
  const anchor = anchors.get(anchorId);
  if (!anchor) return null;

  const now = new Date().toISOString();
  anchor.position = position;
  if (rotation) anchor.rotation = rotation;
  if (confidence !== undefined) anchor.confidence = confidence;
  anchor.lastRelocatedAt = now;
  anchor.status = "active";
  anchors.set(anchorId, anchor);

  return anchor;
}

/**
 * Attach an entity to an anchor
 */
export async function attachEntityToAnchor(
  anchorId: string,
  entity: {
    entityId: string;
    entityType: SpatialAnchor["attachedEntities"][0]["entityType"];
    offset?: { x: number; y: number; z: number };
  }
): Promise<SpatialAnchor | null> {
  const anchor = anchors.get(anchorId);
  if (!anchor) return null;

  anchor.attachedEntities.push({
    entityId: entity.entityId,
    entityType: entity.entityType,
    offset: entity.offset ?? { x: 0, y: 0, z: 0 },
  });
  anchors.set(anchorId, anchor);

  return anchor;
}

/**
 * Record hand tracking data
 */
export async function recordHandTracking(data: {
  sessionId: string;
  userId: string;
  hand: HandType;
  joints: HandJoint[];
  gestures?: DetectedGesture[];
  confidence?: number;
}): Promise<HandTrackingData> {
  const trackingData: HandTrackingData = {
    sessionId: data.sessionId,
    userId: data.userId,
    hand: data.hand,
    timestamp: new Date().toISOString(),
    joints: data.joints,
    gestures: data.gestures ?? [],
    confidence: data.confidence ?? 0.9,
    isTracking: true,
  };

  handTrackingData.push(trackingData);

  // Record gesture events
  for (const gesture of trackingData.gestures) {
    interactionEvents.push({
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      sessionId: data.sessionId,
      userId: data.userId,
      type: "gesture",
      data: {
        gesture: gesture.type,
        hand: gesture.hand,
        confidence: gesture.confidence,
        duration: gesture.duration,
      },
      timestamp: trackingData.timestamp,
    });
  }

  return trackingData;
}

/**
 * Get recent hand tracking data
 */
export async function getHandTrackingHistory(
  sessionId: string,
  userId: string,
  limit: number = 100
): Promise<HandTrackingData[]> {
  return handTrackingData
    .filter(d => d.sessionId === sessionId && d.userId === userId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

/**
 * Create a physics body
 */
export async function createPhysicsBody(params: {
  sessionId: string;
  anchorId?: string;
  type: PhysicsBodyType;
  collider: PhysicsBody["collider"];
  mass?: number;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  useGravity?: boolean;
  friction?: number;
  restitution?: number;
  metadata?: Record<string, unknown>;
}): Promise<PhysicsBody> {
  const body: PhysicsBody = {
    id: `phys_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: params.sessionId,
    anchorId: params.anchorId,
    type: params.type,
    collider: params.collider,
    mass: params.mass ?? 1,
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    position: params.position,
    rotation: params.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    useGravity: params.useGravity ?? true,
    isKinematic: params.type === "kinematic",
    friction: params.friction ?? 0.5,
    restitution: params.restitution ?? 0.5,
    metadata: params.metadata ?? {},
  };

  physicsBodies.set(body.id, body);
  return body;
}

/**
 * Simulate physics collision
 */
export async function simulateCollision(
  bodyAId: string,
  bodyBId: string,
  contactPoint: { x: number; y: number; z: number },
  impulse: number
): Promise<PhysicsCollision | null> {
  const bodyA = physicsBodies.get(bodyAId);
  const bodyB = physicsBodies.get(bodyBId);
  if (!bodyA || !bodyB) return null;

  const now = new Date().toISOString();

  // Calculate relative velocity (simplified)
  const relativeVelocity = Math.sqrt(
    Math.pow(bodyA.velocity.x - bodyB.velocity.x, 2) +
    Math.pow(bodyA.velocity.y - bodyB.velocity.y, 2) +
    Math.pow(bodyA.velocity.z - bodyB.velocity.z, 2)
  );

  const collision: PhysicsCollision = {
    id: `col_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: bodyA.sessionId,
    bodyAId,
    bodyBId,
    contactPoint,
    contactNormal: { x: 0, y: 1, z: 0 }, // Simplified
    impulse,
    relativeVelocity,
    timestamp: now,
  };

  collisions.push(collision);

  // Update velocities (simplified physics)
  if (bodyA.type === "dynamic") {
    bodyA.velocity.x -= impulse * 0.5 / bodyA.mass;
    bodyA.velocity.y += impulse * 0.3;
  }
  if (bodyB.type === "dynamic") {
    bodyB.velocity.x += impulse * 0.5 / bodyB.mass;
    bodyB.velocity.y += impulse * 0.3;
  }

  physicsBodies.set(bodyAId, bodyA);
  physicsBodies.set(bodyBId, bodyB);

  // Record collision event
  interactionEvents.push({
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: bodyA.sessionId,
    userId: "system",
    type: "collision",
    targetId: bodyAId,
    data: {
      bodyAId,
      bodyBId,
      impulse,
      relativeVelocity,
      contactPoint,
    },
    timestamp: now,
  });

  return collision;
}

/**
 * Add a user to spatial session
 */
export async function addSpatialUser(params: {
  sessionId: string;
  userId: string;
  username: string;
  avatarId?: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
}): Promise<SpatialUser> {
  const now = new Date().toISOString();
  const user: SpatialUser = {
    id: `suser_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: params.sessionId,
    userId: params.userId,
    username: params.username,
    avatarId: params.avatarId,
    position: params.position,
    rotation: params.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    gaze: { x: 0, y: 0, z: -1 },
    headPosition: { ...params.position, y: params.position.y + 1.7 },
    isSpeaking: false,
    audioLevel: 0,
    joinedAt: now,
    lastUpdateAt: now,
  };

  spatialUsers.set(user.id, user);
  return user;
}

/**
 * Update spatial user state
 */
export async function updateSpatialUser(
  spatialUserId: string,
  updates: Partial<Pick<SpatialUser, 
    "position" | "rotation" | "gaze" | "headPosition" | 
    "leftHandPosition" | "rightHandPosition" | "isSpeaking" | "audioLevel"
  >>
): Promise<SpatialUser | null> {
  const user = spatialUsers.get(spatialUserId);
  if (!user) return null;

  Object.assign(user, updates);
  user.lastUpdateAt = new Date().toISOString();
  spatialUsers.set(spatialUserId, user);

  return user;
}

/**
 * Get all users in a session
 */
export async function getSessionUsers(sessionId: string): Promise<SpatialUser[]> {
  return Array.from(spatialUsers.values())
    .filter(u => u.sessionId === sessionId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/**
 * Create a spatial audio source
 */
export async function createSpatialAudioSource(params: {
  sessionId: string;
  anchorId?: string;
  type: SpatialAudioSource["type"];
  url?: string;
  position: { x: number; y: number; z: number };
  volume?: number;
  pitch?: number;
  spatialBlend?: number;
  minDistance?: number;
  maxDistance?: number;
  isLooping?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<SpatialAudioSource> {
  const source: SpatialAudioSource = {
    id: `audio_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: params.sessionId,
    anchorId: params.anchorId,
    type: params.type,
    url: params.url,
    position: params.position,
    volume: params.volume ?? 1,
    pitch: params.pitch ?? 1,
    spatialBlend: params.spatialBlend ?? 1,
    minDistance: params.minDistance ?? 1,
    maxDistance: params.maxDistance ?? 20,
    isLooping: params.isLooping ?? false,
    isPlaying: true,
    metadata: params.metadata ?? {},
  };

  audioSources.set(source.id, source);
  return source;
}

/**
 * Record gaze interaction
 */
export async function recordGazeInteraction(params: {
  sessionId: string;
  userId: string;
  targetId: string;
  targetType: GazeInteraction["targetType"];
  gazePosition: { x: number; y: number; z: number };
  durationMs: number;
  isDwelling: boolean;
  triggered?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<GazeInteraction> {
  const now = new Date().toISOString();
  const interaction: GazeInteraction = {
    id: `gaze_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: params.sessionId,
    userId: params.userId,
    targetId: params.targetId,
    targetType: params.targetType,
    gazeStartTime: now,
    gazeDurationMs: params.durationMs,
    gazePosition: params.gazePosition,
    isDwelling: params.isDwelling,
    triggered: params.triggered ?? false,
    metadata: params.metadata ?? {},
  };

  gazeInteractions.push(interaction);

  if (params.triggered) {
    interactionEvents.push({
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      sessionId: params.sessionId,
      userId: params.userId,
      type: "gaze",
      targetId: params.targetId,
      data: {
        targetType: params.targetType,
        durationMs: params.durationMs,
        gazePosition: params.gazePosition,
      },
      timestamp: now,
    });
  }

  return interaction;
}

/**
 * Create a scene layer
 */
export async function createSceneLayer(params: {
  sessionId: string;
  name: string;
  order?: number;
  visible?: boolean;
  locked?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<SceneLayer> {
  const existingLayers = Array.from(sceneLayers.values())
    .filter(l => l.sessionId === params.sessionId);

  const layer: SceneLayer = {
    id: `layer_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId: params.sessionId,
    name: params.name,
    order: params.order ?? existingLayers.length,
    visible: params.visible ?? true,
    locked: params.locked ?? false,
    entities: [],
    metadata: params.metadata ?? {},
  };

  sceneLayers.set(layer.id, layer);
  return layer;
}

/**
 * Add entity to scene layer
 */
export async function addEntityToLayer(
  layerId: string,
  entity: SceneLayer["entities"][0]
): Promise<SceneLayer | null> {
  const layer = sceneLayers.get(layerId);
  if (!layer) return null;
  if (layer.locked) throw new Error("Layer is locked");

  layer.entities.push(entity);
  sceneLayers.set(layerId, layer);
  return layer;
}

/**
 * Get interaction events for a session
 */
export async function getSessionInteractionEvents(
  sessionId: string,
  filters?: {
    userId?: string;
    type?: SpatialInteractionEvent["type"];
    targetId?: string;
    limit?: number;
  }
): Promise<SpatialInteractionEvent[]> {
  let result = interactionEvents.filter(e => e.sessionId === sessionId);
  if (filters?.userId) result = result.filter(e => e.userId === filters.userId);
  if (filters?.type) result = result.filter(e => e.type === filters.type);
  if (filters?.targetId) result = result.filter(e => e.targetId === filters.targetId);
  return result
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get spatial interaction statistics for a session
 */
export async function getSessionInteractionStats(sessionId: string): Promise<{
  anchorCount: number;
  activeAnchors: number;
  userCount: number;
  physicsBodyCount: number;
  collisionCount: number;
  audioSourceCount: number;
  gestureCount: number;
  gazeInteractionCount: number;
  layerCount: number;
  topGestures: Array<{ type: string; count: number }>;
  averageGazeDurationMs: number;
  totalInteractionEvents: number;
}> {
  const sessionAnchors = Array.from(anchors.values()).filter(a => a.sessionId === sessionId);
  const sessionUsers = Array.from(spatialUsers.values()).filter(u => u.sessionId === sessionId);
  const sessionBodies = Array.from(physicsBodies.values()).filter(b => b.sessionId === sessionId);
  const sessionCollisions = collisions.filter(c => c.sessionId === sessionId);
  const sessionAudio = Array.from(audioSources.values()).filter(a => a.sessionId === sessionId);
  const sessionGaze = gazeInteractions.filter(g => g.sessionId === sessionId);
  const sessionLayers = Array.from(sceneLayers.values()).filter(l => l.sessionId === sessionId);
  const sessionEvents = interactionEvents.filter(e => e.sessionId === sessionId);

  const gestureEvents = sessionEvents.filter(e => e.type === "gesture");
  const gestureCounts: Record<string, number> = {};
  for (const evt of gestureEvents) {
    const gestureType = (evt.data.gesture as string) ?? "unknown";
    gestureCounts[gestureType] = (gestureCounts[gestureType] || 0) + 1;
  }
  const topGestures = Object.entries(gestureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const avgGazeDuration = sessionGaze.length > 0
    ? Math.round(sessionGaze.reduce((sum, g) => sum + g.gazeDurationMs, 0) / sessionGaze.length)
    : 0;

  return {
    anchorCount: sessionAnchors.length,
    activeAnchors: sessionAnchors.filter(a => a.status === "active").length,
    userCount: sessionUsers.length,
    physicsBodyCount: sessionBodies.length,
    collisionCount: sessionCollisions.length,
    audioSourceCount: sessionAudio.length,
    gestureCount: gestureEvents.length,
    gazeInteractionCount: sessionGaze.length,
    layerCount: sessionLayers.length,
    topGestures,
    averageGazeDurationMs: avgGazeDuration,
    totalInteractionEvents: sessionEvents.length,
  };
}
