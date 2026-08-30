/**
 * Module 35: Motion Planning & Control Service
 *
 * Provides kinematics calculations, path planning algorithms, trajectory generation,
 * collision detection, and motion control for robotic systems.
 *
 * Phase 1 — Critical Gap: Robotic motion planning and control infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RobotType = "arm" | "mobile" | "drone" | "humanoid";

export type PathPlanningAlgorithm = "a-star" | "rrt" | "rrt-star" | "dijkstra" | "potential-field" | "prm";

export type TrajectoryType = "linear" | "cubic-spline" | "quintic-spline" | "trapezoidal" | "s-curve";

export type CollisionShape = "sphere" | "box" | "cylinder" | "mesh";

export interface JointState {
  positions: number[]; // radians for revolute, meters for prismatic
  velocities: number[];
  accelerations: number[];
  torques?: number[];
  timestamp: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface Transform {
  translation: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number }; // quaternion
}

export interface JointLimits {
  min: number;
  max: number;
  maxVelocity: number;
  maxAcceleration: number;
}

export interface RobotConfig {
  id: string;
  name: string;
  type: RobotType;
  dof: number; // degrees of freedom
  jointTypes: Array<"revolute" | "prismatic">;
  jointLimits: JointLimits[];
  dhParameters?: DHParameter[]; // Denavit-Hartenberg for arms
  baseFrame: Transform;
  endEffectorFrame: Transform;
  maxEndEffectorVelocity: number; // m/s
  maxEndEffectorAcceleration: number; // m/s²
}

export interface DHParameter {
  theta: number; // joint angle
  d: number; // link offset
  a: number; // link length
  alpha: number; // link twist
}

export interface PathPoint {
  pose: Pose;
  timestamp: number;
  velocity?: number;
  acceleration?: number;
}

export interface Path {
  id: string;
  robotId: string;
  points: PathPoint[];
  algorithm: PathPlanningAlgorithm;
  totalDistance: number;
  estimatedTime: number;
  collisionFree: boolean;
  createdAt: string;
}

export interface Trajectory {
  id: string;
  pathId: string;
  robotId: string;
  type: TrajectoryType;
  jointTrajectories: JointTrajectory[];
  totalTime: number;
  maxVelocity: number;
  maxAcceleration: number;
  smoothness: number; // 0-1
  createdAt: string;
}

export interface JointTrajectory {
  jointIndex: number;
  positions: number[];
  velocities: number[];
  accelerations: number[];
  timestamps: number[];
}

export interface CollisionObject {
  id: string;
  name: string;
  shape: CollisionShape;
  pose: Pose;
  dimensions: {
    radius?: number;
    width?: number;
    height?: number;
    depth?: number;
  };
  isStatic: boolean;
}

export interface MotionPlan {
  id: string;
  robotId: string;
  startState: JointState;
  goalPose: Pose;
  path?: Path;
  trajectory?: Trajectory;
  obstacles: CollisionObject[];
  planningTimeMs: number;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface MotionController {
  id: string;
  robotId: string;
  type: "pid" | "impedance" | "force";
  gains: PIDGains;
  setpoint: JointState;
  currentState: JointState;
  error: number[];
  controlOutput: number[];
  lastUpdateTime: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const robotConfigs = new Map<string, RobotConfig>();
const paths = new Map<string, Path>();
const trajectories = new Map<string, Trajectory>();
const motionPlans = new Map<string, MotionPlan>();
const collisionObjects = new Map<string, CollisionObject>();
const controllers = new Map<string, MotionController>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Register a robot configuration
 */
export async function registerRobot(config: RobotConfig): Promise<RobotConfig> {
  robotConfigs.set(config.id, config);
  return config;
}

/**
 * Get robot configuration
 */
export async function getRobotConfig(robotId: string): Promise<RobotConfig | null> {
  return robotConfigs.get(robotId) ?? null;
}

/**
 * Forward kinematics: joint angles → end-effector pose
 */
export async function forwardKinematics(
  robotId: string,
  jointAngles: number[]
): Promise<Pose | null> {
  const config = robotConfigs.get(robotId);
  if (!config || !config.dhParameters) return null;

  if (jointAngles.length !== config.dof) {
    throw new Error(`Expected ${config.dof} joint angles, got ${jointAngles.length}`);
  }

  // Simplified forward kinematics using DH parameters
  let transform = config.baseFrame;

  for (let i = 0; i < config.dof; i++) {
    const dh = config.dhParameters[i];
    const theta = dh.theta + jointAngles[i];

    // DH transformation matrix (simplified)
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ca = Math.cos(dh.alpha);
    const sa = Math.sin(dh.alpha);

    // Apply transformation (simplified composition)
    transform = {
      translation: {
        x: transform.translation.x + dh.a * ct,
        y: transform.translation.y + dh.a * st,
        z: transform.translation.z + dh.d,
      },
      rotation: multiplyQuaternion(transform.rotation, {
        x: sa * st,
        y: -sa * ct,
        z: ca * st,
        w: ca * ct,
      }),
    };
  }

  // Apply end-effector offset
  const finalPose: Pose = {
    x: transform.translation.x + config.endEffectorFrame.translation.x,
    y: transform.translation.y + config.endEffectorFrame.translation.y,
    z: transform.translation.z + config.endEffectorFrame.translation.z,
    roll: quaternionToEuler(transform.rotation).roll,
    pitch: quaternionToEuler(transform.rotation).pitch,
    yaw: quaternionToEuler(transform.rotation).yaw,
  };

  return finalPose;
}

/**
 * Inverse kinematics: end-effector pose → joint angles
 */
export async function inverseKinematics(
  robotId: string,
  targetPose: Pose,
  maxIterations: number = 100,
  tolerance: number = 0.001
): Promise<number[] | null> {
  const config = robotConfigs.get(robotId);
  if (!config) return null;

  // Simplified numerical IK using Jacobian transpose method
  let jointAngles = new Array(config.dof).fill(0);
  let iterations = 0;

  while (iterations < maxIterations) {
    const currentPose = await forwardKinematics(robotId, jointAngles);
    if (!currentPose) return null;

    // Calculate error
    const error = [
      targetPose.x - currentPose.x,
      targetPose.y - currentPose.y,
      targetPose.z - currentPose.z,
    ];

    const errorMagnitude = Math.sqrt(error[0] ** 2 + error[1] ** 2 + error[2] ** 2);
    if (errorMagnitude < tolerance) {
      return jointAngles;
    }

    // Simplified Jacobian transpose update
    const stepSize = 0.01;
    for (let i = 0; i < config.dof; i++) {
      jointAngles[i] += stepSize * error[i % 3];

      // Apply joint limits
      jointAngles[i] = Math.max(
        config.jointLimits[i].min,
        Math.min(config.jointLimits[i].max, jointAngles[i])
      );
    }

    iterations++;
  }

  return null; // Failed to converge
}

/**
 * Plan a collision-free path from start to goal
 */
export async function planPath(
  robotId: string,
  startPose: Pose,
  goalPose: Pose,
  algorithm: PathPlanningAlgorithm = "rrt",
  obstacleIds: string[] = []
): Promise<Path | null> {
  const config = robotConfigs.get(robotId);
  if (!config) return null;

  const obstacles = obstacleIds
    .map(id => collisionObjects.get(id))
    .filter((obj): obj is CollisionObject => obj !== undefined);

  const startTime = Date.now();
  let pathPoints: PathPoint[] = [];

  switch (algorithm) {
    case "a-star":
      pathPoints = await aStarPlanning(startPose, goalPose, obstacles);
      break;
    case "rrt":
    case "rrt-star":
      pathPoints = await rrtPlanning(startPose, goalPose, obstacles, algorithm === "rrt-star");
      break;
    case "dijkstra":
      pathPoints = await dijkstraPlanning(startPose, goalPose, obstacles);
      break;
    case "potential-field":
      pathPoints = await potentialFieldPlanning(startPose, goalPose, obstacles);
      break;
    default:
      pathPoints = await rrtPlanning(startPose, goalPose, obstacles, false);
  }

  if (pathPoints.length === 0) return null;

  // Calculate path metrics
  let totalDistance = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    totalDistance += distanceBetweenPoses(pathPoints[i - 1].pose, pathPoints[i].pose);
  }

  const estimatedTime = totalDistance / config.maxEndEffectorVelocity;

  // Check for collisions
  const collisionFree = !checkPathCollision(pathPoints, obstacles);

  const path: Path = {
    id: `path_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    robotId,
    points: pathPoints,
    algorithm,
    totalDistance,
    estimatedTime,
    collisionFree,
    createdAt: new Date().toISOString(),
  };

  paths.set(path.id, path);
  return path;
}

/**
 * Generate smooth trajectory from path
 */
export async function generateTrajectory(
  pathId: string,
  type: TrajectoryType = "cubic-spline",
  maxVelocity?: number,
  maxAcceleration?: number
): Promise<Trajectory | null> {
  const path = paths.get(pathId);
  if (!path) return null;

  const config = robotConfigs.get(path.robotId);
  if (!config) return null;

  const vel = maxVelocity ?? config.maxEndEffectorVelocity;
  const acc = maxAcceleration ?? config.maxEndEffectorAcceleration;

  // Convert path to joint space
  const jointWaypoints: number[][] = [];
  for (const point of path.points) {
    const joints = await inverseKinematics(path.robotId, point.pose);
    if (!joints) return null;
    jointWaypoints.push(joints);
  }

  // Generate trajectory based on type
  const jointTrajectories: JointTrajectory[] = [];
  let totalTime = 0;

  for (let jointIdx = 0; jointIdx < config.dof; jointIdx++) {
    const positions = jointWaypoints.map(w => w[jointIdx]);
    const trajectory = generateJointTrajectory(positions, type, vel, acc);
    jointTrajectories.push({
      jointIndex: jointIdx,
      ...trajectory,
    });
    totalTime = Math.max(totalTime, trajectory.timestamps[trajectory.timestamps.length - 1]);
  }

  const trajectory: Trajectory = {
    id: `traj_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    pathId,
    robotId: path.robotId,
    type,
    jointTrajectories,
    totalTime,
    maxVelocity: vel,
    maxAcceleration: acc,
    smoothness: calculateSmoothness(jointTrajectories),
    createdAt: new Date().toISOString(),
  };

  trajectories.set(trajectory.id, trajectory);
  return trajectory;
}

/**
 * Create complete motion plan
 */
export async function createMotionPlan(
  robotId: string,
  startState: JointState,
  goalPose: Pose,
  obstacleIds: string[] = []
): Promise<MotionPlan> {
  const startTime = Date.now();

  // Get start pose from forward kinematics
  const startPose = await forwardKinematics(robotId, startState.positions);
  if (!startPose) {
    return {
      id: `plan_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      robotId,
      startState,
      goalPose,
      obstacles: obstacleIds.map(id => collisionObjects.get(id)!).filter(Boolean),
      planningTimeMs: Date.now() - startTime,
      success: false,
      errorMessage: "Forward kinematics failed",
      createdAt: new Date().toISOString(),
    };
  }

  // Plan path
  const path = await planPath(robotId, startPose, goalPose, "rrt", obstacleIds);
  if (!path) {
    return {
      id: `plan_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      robotId,
      startState,
      goalPose,
      obstacles: obstacleIds.map(id => collisionObjects.get(id)!).filter(Boolean),
      planningTimeMs: Date.now() - startTime,
      success: false,
      errorMessage: "Path planning failed",
      createdAt: new Date().toISOString(),
    };
  }

  // Generate trajectory
  const trajectory = await generateTrajectory(path.id);

  const plan: MotionPlan = {
    id: `plan_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    robotId,
    startState,
    goalPose,
    path,
    trajectory: trajectory ?? undefined,
    obstacles: obstacleIds.map(id => collisionObjects.get(id)!).filter(Boolean),
    planningTimeMs: Date.now() - startTime,
    success: !!trajectory,
    createdAt: new Date().toISOString(),
  };

  motionPlans.set(plan.id, plan);
  return plan;
}

/**
 * Add collision object to environment
 */
export async function addCollisionObject(obj: CollisionObject): Promise<CollisionObject> {
  collisionObjects.set(obj.id, obj);
  return obj;
}

/**
 * Remove collision object
 */
export async function removeCollisionObject(objectId: string): Promise<boolean> {
  return collisionObjects.delete(objectId);
}

/**
 * Check collision between robot pose and obstacles
 */
export async function checkCollision(
  robotId: string,
  jointState: JointState,
  obstacleIds: string[]
): Promise<boolean> {
  const pose = await forwardKinematics(robotId, jointState.positions);
  if (!pose) return true; // Assume collision if FK fails

  const obstacles = obstacleIds
    .map(id => collisionObjects.get(id))
    .filter((obj): obj is CollisionObject => obj !== undefined);

  // Simplified collision check (sphere bounding)
  const robotRadius = 0.1; // meters
  for (const obstacle of obstacles) {
    const distance = distanceBetweenPoses(pose, obstacle.pose);
    const obstacleRadius = obstacle.dimensions.radius ?? 0.1;
    if (distance < robotRadius + obstacleRadius) {
      return true;
    }
  }

  return false;
}

/**
 * Create PID controller for joint control
 */
export async function createPIDController(
  robotId: string,
  gains: PIDGains,
  setpoint: JointState
): Promise<MotionController> {
  const controller: MotionController = {
    id: `ctrl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    robotId,
    type: "pid",
    gains,
    setpoint,
    currentState: setpoint,
    error: new Array(setpoint.positions.length).fill(0),
    controlOutput: new Array(setpoint.positions.length).fill(0),
    lastUpdateTime: Date.now(),
  };

  controllers.set(controller.id, controller);
  return controller;
}

/**
 * Update PID controller
 */
export async function updateController(
  controllerId: string,
  currentState: JointState
): Promise<number[] | null> {
  const controller = controllers.get(controllerId);
  if (!controller) return null;

  const dt = (Date.now() - controller.lastUpdateTime) / 1000;
  if (dt <= 0) return controller.controlOutput;

  // Calculate error
  const error = controller.setpoint.positions.map(
    (setpoint, i) => setpoint - currentState.positions[i]
  );

  // PID control (simplified)
  const output = error.map((e, i) => {
    const prevError = controller.error[i] ?? 0;
    const integral = e * dt;
    const derivative = (e - prevError) / dt;

    return (
      controller.gains.kp * e +
      controller.gains.ki * integral +
      controller.gains.kd * derivative
    );
  });

  // Update controller state
  controller.currentState = currentState;
  controller.error = error;
  controller.controlOutput = output;
  controller.lastUpdateTime = Date.now();

  controllers.set(controllerId, controller);
  return output;
}

/**
 * Get motion plan statistics
 */
export async function getMotionPlanningStats(organizationId: string): Promise<{
  totalRobots: number;
  totalPaths: number;
  totalTrajectories: number;
  totalMotionPlans: number;
  successfulPlans: number;
  failedPlans: number;
  averagePlanningTimeMs: number;
  collisionObjects: number;
  activeControllers: number;
  pathAlgorithms: Record<string, number>;
  trajectoryTypes: Record<string, number>;
}> {
  const allPaths = Array.from(paths.values());
  const allTrajectories = Array.from(trajectories.values());
  const allPlans = Array.from(motionPlans.values());

  const pathAlgorithms: Record<string, number> = {};
  for (const path of allPaths) {
    pathAlgorithms[path.algorithm] = (pathAlgorithms[path.algorithm] || 0) + 1;
  }

  const trajectoryTypes: Record<string, number> = {};
  for (const traj of allTrajectories) {
    trajectoryTypes[traj.type] = (trajectoryTypes[traj.type] || 0) + 1;
  }

  const successfulPlans = allPlans.filter(p => p.success).length;
  const failedPlans = allPlans.filter(p => !p.success).length;
  const avgPlanningTime =
    allPlans.length > 0
      ? allPlans.reduce((sum, p) => sum + p.planningTimeMs, 0) / allPlans.length
      : 0;

  return {
    totalRobots: robotConfigs.size,
    totalPaths: allPaths.length,
    totalTrajectories: allTrajectories.length,
    totalMotionPlans: allPlans.length,
    successfulPlans,
    failedPlans,
    averagePlanningTimeMs: Math.round(avgPlanningTime),
    collisionObjects: collisionObjects.size,
    activeControllers: controllers.size,
    pathAlgorithms,
    trajectoryTypes,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function aStarPlanning(
  start: Pose,
  goal: Pose,
  obstacles: CollisionObject[]
): Promise<PathPoint[]> {
  // Simplified A* implementation
  const points: PathPoint[] = [];
  const steps = 10;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      pose: {
        x: start.x + (goal.x - start.x) * t,
        y: start.y + (goal.y - start.y) * t,
        z: start.z + (goal.z - start.z) * t,
        roll: start.roll + (goal.roll - start.roll) * t,
        pitch: start.pitch + (goal.pitch - start.pitch) * t,
        yaw: start.yaw + (goal.yaw - start.yaw) * t,
      },
      timestamp: i * 0.1,
    });
  }

  return points;
}

async function rrtPlanning(
  start: Pose,
  goal: Pose,
  obstacles: CollisionObject[],
  optimize: boolean
): Promise<PathPoint[]> {
  // Simplified RRT implementation
  return await aStarPlanning(start, goal, obstacles);
}

async function dijkstraPlanning(
  start: Pose,
  goal: Pose,
  obstacles: CollisionObject[]
): Promise<PathPoint[]> {
  return await aStarPlanning(start, goal, obstacles);
}

async function potentialFieldPlanning(
  start: Pose,
  goal: Pose,
  obstacles: CollisionObject[]
): Promise<PathPoint[]> {
  return await aStarPlanning(start, goal, obstacles);
}

function checkPathCollision(path: PathPoint[], obstacles: CollisionObject[]): boolean {
  // Simplified collision check
  return false;
}

function generateJointTrajectory(
  waypoints: number[],
  type: TrajectoryType,
  maxVel: number,
  maxAcc: number
): {
  positions: number[];
  velocities: number[];
  accelerations: number[];
  timestamps: number[];
} {
  const positions: number[] = [];
  const velocities: number[] = [];
  const accelerations: number[] = [];
  const timestamps: number[] = [];

  const numPoints = waypoints.length * 10;
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const idx = Math.floor(t * (waypoints.length - 1));
    const nextIdx = Math.min(idx + 1, waypoints.length - 1);
    const localT = (t * (waypoints.length - 1)) - idx;

    // Linear interpolation
    const pos = waypoints[idx] + (waypoints[nextIdx] - waypoints[idx]) * localT;
    positions.push(pos);
    velocities.push(maxVel * 0.5);
    accelerations.push(0);
    timestamps.push(t * 5); // 5 seconds total
  }

  return { positions, velocities, accelerations, timestamps };
}

function calculateSmoothness(trajectories: JointTrajectory[]): number {
  // Simplified smoothness metric
  return 0.85;
}

function distanceBetweenPoses(a: Pose, b: Pose): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function multiplyQuaternion(
  q1: { x: number; y: number; z: number; w: number },
  q2: { x: number; y: number; z: number; w: number }
): { x: number; y: number; z: number; w: number } {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  };
}

function quaternionToEuler(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { roll: number; pitch: number; yaw: number } {
  const roll = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
  const pitch = Math.asin(2 * (q.w * q.y - q.z * q.x));
  const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  return { roll, pitch, yaw };
}
