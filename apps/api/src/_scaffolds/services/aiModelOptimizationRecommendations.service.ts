/**
 * Module 106: AI Model Optimization Recommendations Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides intelligent optimization recommendations for AI models based on profiling
 * data, performance metrics, and resource utilization patterns. Recommends specific
 * optimization techniques with expected impact and implementation guidance.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OptimizationAnalysis {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  profilingSessionId?: string;
  status: AnalysisStatus;
  currentPerformance: CurrentPerformance;
  recommendations: OptimizationRecommendation[];
  optimizationPlan?: OptimizationPlan;
  estimatedImprovements: EstimatedImprovements;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type AnalysisStatus =
  | 'pending'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface CurrentPerformance {
  latencyMs: number;
  throughputRps: number;
  memoryUsageMB: number;
  cpuUtilization: number;
  gpuUtilization?: number;
  modelSizeMB: number;
  batchSize: number;
  errorRate: number;
}

export interface OptimizationRecommendation {
  id: string;
  category: OptimizationCategory;
  technique: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: ImpactEstimate;
  implementation: ImplementationGuide;
  prerequisites: string[];
  risks: Risk[];
  alternatives: string[];
  references: string[];
  applicable: boolean;
  reasonIfNotApplicable?: string;
}

export type OptimizationCategory =
  | 'model_compression'
  | 'inference_optimization'
  | 'hardware_acceleration'
  | 'batching_strategy'
  | 'memory_optimization'
  | 'network_optimization'
  | 'deployment_strategy'
  | 'framework_optimization';

export interface ImpactEstimate {
  latencyReduction: number; // percentage
  throughputIncrease: number; // percentage
  memoryReduction: number; // percentage
  costReduction: number; // percentage
  accuracyImpact: number; // percentage (negative means degradation)
  overallScore: number; // 0-100
}

export interface ImplementationGuide {
  steps: ImplementationStep[];
  estimatedTimeHours: number;
  requiredExpertise: 'beginner' | 'intermediate' | 'advanced';
  tools: string[];
  codeExamples?: CodeExample[];
  testingStrategy: string;
  rollbackPlan: string;
}

export interface ImplementationStep {
  order: number;
  title: string;
  description: string;
  estimatedDuration: string;
  verification: string;
}

export interface CodeExample {
  language: string;
  title: string;
  code: string;
  explanation: string;
}

export interface Risk {
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface OptimizationPlan {
  id: string;
  phases: OptimizationPhase[];
  totalEstimatedTimeHours: number;
  totalEstimatedImprovement: EstimatedImprovements;
  dependencies: Dependency[];
  milestones: Milestone[];
}

export interface OptimizationPhase {
  phaseNumber: number;
  name: string;
  description: string;
  recommendations: string[]; // recommendation IDs
  estimatedTimeHours: number;
  estimatedImprovement: EstimatedImprovements;
  dependencies: string[]; // phase numbers
}

export interface EstimatedImprovements {
  latencyReduction: number; // percentage
  throughputIncrease: number; // percentage
  memoryReduction: number; // percentage
  costReduction: number; // percentage
}

export interface Dependency {
  fromRecommendation: string;
  toRecommendation: string;
  type: 'required' | 'optional';
  reason: string;
}

export interface Milestone {
  name: string;
  description: string;
  targetDate?: string;
  completionCriteria: string[];
}

export interface OptimizationTemplate {
  id: string;
  name: string;
  description: string;
  category: OptimizationCategory;
  applicableScenarios: string[];
  recommendations: Omit<OptimizationRecommendation, 'id' | 'applicable'>[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const optimizationAnalyses = new Map<string, OptimizationAnalysis>();
const optimizationTemplates = new Map<string, OptimizationTemplate>();

// ─── Recommendation Generation Logic ──────────────────────────────────────────

function generateModelCompressionRecommendations(
  performance: CurrentPerformance
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  // Quantization recommendation
  if (performance.modelSizeMB > 100) {
    recommendations.push({
      id: randomUUID(),
      category: 'model_compression',
      technique: 'quantization',
      title: 'Apply Model Quantization',
      description: 'Convert model weights from FP32 to INT8 or FP16 to reduce model size and improve inference speed',
      priority: performance.modelSizeMB > 500 ? 'high' : 'medium',
      effort: 'medium',
      impact: {
        latencyReduction: 30,
        throughputIncrease: 40,
        memoryReduction: 75,
        costReduction: 50,
        accuracyImpact: -1,
        overallScore: 85,
      },
      implementation: {
        steps: [
          {
            order: 1,
            title: 'Profile baseline performance',
            description: 'Measure current latency, throughput, and accuracy',
            estimatedDuration: '1 hour',
            verification: 'Baseline metrics recorded',
          },
          {
            order: 2,
            title: 'Apply quantization',
            description: 'Use framework quantization tools to convert to INT8',
            estimatedDuration: '2 hours',
            verification: 'Quantized model loads successfully',
          },
          {
            order: 3,
            title: 'Validate accuracy',
            description: 'Test quantized model on validation dataset',
            estimatedDuration: '2 hours',
            verification: 'Accuracy within 1% of baseline',
          },
          {
            order: 4,
            title: 'Benchmark performance',
            description: 'Measure latency and throughput improvements',
            estimatedDuration: '1 hour',
            verification: 'Performance improvements meet targets',
          },
        ],
        estimatedTimeHours: 6,
        requiredExpertise: 'intermediate',
        tools: ['PyTorch Quantization', 'TensorFlow Lite', 'ONNX Runtime'],
        testingStrategy: 'A/B test quantized vs original model in staging',
        rollbackPlan: 'Revert to FP32 model if accuracy degrades >2%',
      },
      prerequisites: ['Model training complete', 'Validation dataset available'],
      risks: [
        {
          description: 'Accuracy degradation',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Use post-training quantization with calibration dataset',
        },
      ],
      alternatives: ['Model pruning', 'Knowledge distillation'],
      references: ['https://pytorch.org/docs/stable/quantization.html'],
      applicable: true,
    });
  }

  // Pruning recommendation
  if (performance.modelSizeMB > 200) {
    recommendations.push({
      id: randomUUID(),
      category: 'model_compression',
      technique: 'pruning',
      title: 'Apply Model Pruning',
      description: 'Remove redundant weights and neurons to reduce model size while maintaining accuracy',
      priority: 'medium',
      effort: 'high',
      impact: {
        latencyReduction: 20,
        throughputIncrease: 25,
        memoryReduction: 50,
        costReduction: 40,
        accuracyImpact: -2,
        overallScore: 75,
      },
      implementation: {
        steps: [
          {
            order: 1,
            title: 'Analyze model structure',
            description: 'Identify layers with redundant weights',
            estimatedDuration: '2 hours',
            verification: 'Pruning candidates identified',
          },
          {
            order: 2,
            title: 'Apply structured pruning',
            description: 'Remove entire filters or attention heads',
            estimatedDuration: '4 hours',
            verification: 'Pruned model compiles',
          },
          {
            order: 3,
            title: 'Fine-tune pruned model',
            description: 'Retrain for 10-20% of original epochs',
            estimatedDuration: '8 hours',
            verification: 'Accuracy recovered to within 2%',
          },
        ],
        estimatedTimeHours: 14,
        requiredExpertise: 'advanced',
        tools: ['PyTorch Pruning', 'TensorFlow Model Optimization'],
        testingStrategy: 'Compare pruned model accuracy on test set',
        rollbackPlan: 'Keep original model as fallback',
      },
      prerequisites: ['Training infrastructure available', 'Sufficient compute budget'],
      risks: [
        {
          description: 'Significant accuracy loss',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Use gradual pruning with fine-tuning',
        },
      ],
      alternatives: ['Quantization', 'Knowledge distillation'],
      references: ['https://pytorch.org/tutorials/intermediate/pruning_tutorial.html'],
      applicable: true,
    });
  }

  return recommendations;
}

function generateInferenceOptimizationRecommendations(
  performance: CurrentPerformance
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  // Batching optimization
  if (performance.batchSize === 1 && performance.throughputRps < 100) {
    recommendations.push({
      id: randomUUID(),
      category: 'batching_strategy',
      technique: 'dynamic_batching',
      title: 'Implement Dynamic Batching',
      description: 'Batch incoming requests to improve GPU utilization and throughput',
      priority: 'high',
      effort: 'medium',
      impact: {
        latencyReduction: 0,
        throughputIncrease: 200,
        memoryReduction: 0,
        costReduction: 60,
        accuracyImpact: 0,
        overallScore: 90,
      },
      implementation: {
        steps: [
          {
            order: 1,
            title: 'Implement request queue',
            description: 'Add queue to buffer incoming requests',
            estimatedDuration: '2 hours',
            verification: 'Requests queued successfully',
          },
          {
            order: 2,
            title: 'Add batching logic',
            description: 'Batch requests when queue reaches threshold or timeout',
            estimatedDuration: '3 hours',
            verification: 'Batches created correctly',
          },
          {
            order: 3,
            title: 'Tune batch parameters',
            description: 'Optimize batch size and timeout for your workload',
            estimatedDuration: '2 hours',
            verification: 'Throughput improved',
          },
        ],
        estimatedTimeHours: 7,
        requiredExpertise: 'intermediate',
        tools: ['TorchServe', 'TensorFlow Serving', 'Triton Inference Server'],
        testingStrategy: 'Load test with varying request rates',
        rollbackPlan: 'Disable batching and process requests individually',
      },
      prerequisites: ['Serving infrastructure supports batching'],
      risks: [
        {
          description: 'Increased latency for early requests in batch',
          probability: 'high',
          impact: 'medium',
          mitigation: 'Use short timeout (10-50ms) to balance latency and throughput',
        },
      ],
      alternatives: ['Static batching', 'Continuous batching'],
      references: ['https://pytorch.org/serve/batch_inference.html'],
      applicable: true,
    });
  }

  // GPU optimization
  if (performance.gpuUtilization && performance.gpuUtilization < 50) {
    recommendations.push({
      id: randomUUID(),
      category: 'hardware_acceleration',
      technique: 'gpu_optimization',
      title: 'Optimize GPU Utilization',
      description: 'Increase batch size or use CUDA streams to improve GPU utilization',
      priority: 'high',
      effort: 'low',
      impact: {
        latencyReduction: 20,
        throughputIncrease: 100,
        memoryReduction: 0,
        costReduction: 50,
        accuracyImpact: 0,
        overallScore: 88,
      },
      implementation: {
        steps: [
          {
            order: 1,
            title: 'Increase batch size',
            description: 'Gradually increase batch size until GPU utilization >80%',
            estimatedDuration: '1 hour',
            verification: 'GPU utilization improved',
          },
          {
            order: 2,
            title: 'Enable CUDA streams',
            description: 'Use multiple streams for concurrent operations',
            estimatedDuration: '2 hours',
            verification: 'Concurrent execution observed',
          },
        ],
        estimatedTimeHours: 3,
        requiredExpertise: 'intermediate',
        tools: ['nvidia-smi', 'PyTorch Profiler', 'TensorBoard'],
        testingStrategy: 'Monitor GPU utilization with nvidia-smi',
        rollbackPlan: 'Revert batch size changes',
      },
      prerequisites: ['GPU monitoring tools installed'],
      risks: [
        {
          description: 'Out of memory errors',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Monitor GPU memory and reduce batch size if OOM occurs',
        },
      ],
      alternatives: ['Model parallelism', 'Tensor parallelism'],
      references: ['https://pytorch.org/docs/stable/notes/cuda.html'],
      applicable: true,
    });
  }

  return recommendations;
}

function generateDeploymentStrategyRecommendations(
  performance: CurrentPerformance
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  // Auto-scaling recommendation
  if (performance.cpuUtilization > 70 || (performance.gpuUtilization && performance.gpuUtilization > 70)) {
    recommendations.push({
      id: randomUUID(),
      category: 'deployment_strategy',
      technique: 'auto_scaling',
      title: 'Implement Auto-Scaling',
      description: 'Automatically scale instances based on CPU/GPU utilization or request queue depth',
      priority: 'high',
      effort: 'medium',
      impact: {
        latencyReduction: 30,
        throughputIncrease: 150,
        memoryReduction: 0,
        costReduction: 40,
        accuracyImpact: 0,
        overallScore: 85,
      },
      implementation: {
        steps: [
          {
            order: 1,
            title: 'Configure metrics collection',
            description: 'Set up CloudWatch/Prometheus metrics for CPU/GPU utilization',
            estimatedDuration: '2 hours',
            verification: 'Metrics visible in dashboard',
          },
          {
            order: 2,
            title: 'Define scaling policies',
            description: 'Set scale-up at 70% utilization, scale-down at 30%',
            estimatedDuration: '1 hour',
            verification: 'Scaling policies created',
          },
          {
            order: 3,
            title: 'Test auto-scaling',
            description: 'Load test to verify scaling behavior',
            estimatedDuration: '2 hours',
            verification: 'Instances scale up/down correctly',
          },
        ],
        estimatedTimeHours: 5,
        requiredExpertise: 'intermediate',
        tools: ['Kubernetes HPA', 'AWS Auto Scaling', 'Google Cloud Autoscaler'],
        testingStrategy: 'Simulate traffic spikes and verify scaling',
        rollbackPlan: 'Disable auto-scaling and use fixed instance count',
      },
      prerequisites: ['Container orchestration platform', 'Metrics collection system'],
      risks: [
        {
          description: 'Scaling latency during traffic spikes',
          probability: 'medium',
          impact: 'medium',
          mitigation: 'Use predictive scaling or maintain buffer capacity',
        },
      ],
      alternatives: ['Manual scaling', 'Scheduled scaling'],
      references: ['https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/'],
      applicable: true,
    });
  }

  return recommendations;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createOptimizationAnalysis(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  profilingSessionId?: string;
  currentPerformance: CurrentPerformance;
  createdBy: string;
}): OptimizationAnalysis {
  const now = new Date().toISOString();
  const id = randomUUID();

  const analysis: OptimizationAnalysis = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    profilingSessionId: params.profilingSessionId,
    status: 'pending',
    currentPerformance: params.currentPerformance,
    recommendations: [],
    estimatedImprovements: {
      latencyReduction: 0,
      throughputIncrease: 0,
      memoryReduction: 0,
      costReduction: 0,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  optimizationAnalyses.set(id, analysis);
  return analysis;
}

export function analyzeOptimizations(analysisId: string): OptimizationAnalysis {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);

  analysis.status = 'analyzing';
  analysis.updatedAt = new Date().toISOString();

  // Generate recommendations
  const recommendations: OptimizationRecommendation[] = [
    ...generateModelCompressionRecommendations(analysis.currentPerformance),
    ...generateInferenceOptimizationRecommendations(analysis.currentPerformance),
    ...generateDeploymentStrategyRecommendations(analysis.currentPerformance),
  ];

  // Sort by priority and impact score
  recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.impact.overallScore - a.impact.overallScore;
  });

  analysis.recommendations = recommendations;

  // Calculate estimated improvements
  const applicableRecs = recommendations.filter(r => r.applicable);
  if (applicableRecs.length > 0) {
    analysis.estimatedImprovements = {
      latencyReduction: Math.min(80, applicableRecs.reduce((sum, r) => sum + r.impact.latencyReduction, 0) * 0.5),
      throughputIncrease: Math.min(500, applicableRecs.reduce((sum, r) => sum + r.impact.throughputIncrease, 0) * 0.5),
      memoryReduction: Math.min(90, applicableRecs.reduce((sum, r) => sum + r.impact.memoryReduction, 0) * 0.5),
      costReduction: Math.min(80, applicableRecs.reduce((sum, r) => sum + r.impact.costReduction, 0) * 0.5),
    };
  }

  // Generate optimization plan
  if (applicableRecs.length > 0) {
    const phases: OptimizationPhase[] = [];
    
    // Phase 1: Quick wins (low effort, high impact)
    const quickWins = applicableRecs.filter(r => r.effort === 'low' && r.impact.overallScore >= 80);
    if (quickWins.length > 0) {
      phases.push({
        phaseNumber: 1,
        name: 'Quick Wins',
        description: 'Low-effort optimizations with high impact',
        recommendations: quickWins.map(r => r.id),
        estimatedTimeHours: quickWins.reduce((sum, r) => sum + r.implementation.estimatedTimeHours, 0),
        estimatedImprovement: {
          latencyReduction: quickWins.reduce((sum, r) => sum + r.impact.latencyReduction, 0),
          throughputIncrease: quickWins.reduce((sum, r) => sum + r.impact.throughputIncrease, 0),
          memoryReduction: quickWins.reduce((sum, r) => sum + r.impact.memoryReduction, 0),
          costReduction: quickWins.reduce((sum, r) => sum + r.impact.costReduction, 0),
        },
        dependencies: [],
      });
    }

    // Phase 2: Medium effort optimizations
    const mediumEffort = applicableRecs.filter(r => r.effort === 'medium' && r.impact.overallScore >= 70);
    if (mediumEffort.length > 0) {
      phases.push({
        phaseNumber: 2,
        name: 'Core Optimizations',
        description: 'Medium-effort optimizations with significant impact',
        recommendations: mediumEffort.map(r => r.id),
        estimatedTimeHours: mediumEffort.reduce((sum, r) => sum + r.implementation.estimatedTimeHours, 0),
        estimatedImprovement: {
          latencyReduction: mediumEffort.reduce((sum, r) => sum + r.impact.latencyReduction, 0),
          throughputIncrease: mediumEffort.reduce((sum, r) => sum + r.impact.throughputIncrease, 0),
          memoryReduction: mediumEffort.reduce((sum, r) => sum + r.impact.memoryReduction, 0),
          costReduction: mediumEffort.reduce((sum, r) => sum + r.impact.costReduction, 0),
        },
        dependencies: quickWins.length > 0 ? [1] : [],
      });
    }

    // Phase 3: Advanced optimizations
    const advanced = applicableRecs.filter(r => r.effort === 'high' || r.implementation.requiredExpertise === 'advanced');
    if (advanced.length > 0) {
      phases.push({
        phaseNumber: 3,
        name: 'Advanced Optimizations',
        description: 'High-effort optimizations requiring advanced expertise',
        recommendations: advanced.map(r => r.id),
        estimatedTimeHours: advanced.reduce((sum, r) => sum + r.implementation.estimatedTimeHours, 0),
        estimatedImprovement: {
          latencyReduction: advanced.reduce((sum, r) => sum + r.impact.latencyReduction, 0),
          throughputIncrease: advanced.reduce((sum, r) => sum + r.impact.throughputIncrease, 0),
          memoryReduction: advanced.reduce((sum, r) => sum + r.impact.memoryReduction, 0),
          costReduction: advanced.reduce((sum, r) => sum + r.impact.costReduction, 0),
        },
        dependencies: phases.length > 0 ? [phases.length] : [],
      });
    }

    analysis.optimizationPlan = {
      id: randomUUID(),
      phases,
      totalEstimatedTimeHours: phases.reduce((sum, p) => sum + p.estimatedTimeHours, 0),
      totalEstimatedImprovement: analysis.estimatedImprovements,
      dependencies: [],
      milestones: [
        {
          name: 'Phase 1 Complete',
          description: 'Quick wins implemented and validated',
          completionCriteria: ['All Phase 1 recommendations implemented', 'Performance improvements verified'],
        },
        {
          name: 'Phase 2 Complete',
          description: 'Core optimizations deployed to production',
          completionCriteria: ['All Phase 2 recommendations implemented', 'Production metrics meet targets'],
        },
        {
          name: 'Optimization Complete',
          description: 'All optimizations implemented and validated',
          completionCriteria: ['All phases complete', 'Overall improvement targets met'],
        },
      ],
    };
  }

  analysis.status = 'completed';
  analysis.updatedAt = new Date().toISOString();

  return analysis;
}

export function getOptimizationAnalysis(id: string): OptimizationAnalysis | undefined {
  return optimizationAnalyses.get(id);
}

export function listOptimizationAnalyses(
  organizationId: string,
  filters?: { modelId?: string; status?: AnalysisStatus }
): OptimizationAnalysis[] {
  let result = Array.from(optimizationAnalyses.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(a => a.modelId === filters.modelId);
  if (filters?.status) result = result.filter(a => a.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRecommendationsByPriority(
  analysisId: string,
  priority: 'critical' | 'high' | 'medium' | 'low'
): OptimizationRecommendation[] {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);

  return analysis.recommendations.filter(r => r.priority === priority && r.applicable);
}

export function getRecommendationsByCategory(
  analysisId: string,
  category: OptimizationCategory
): OptimizationRecommendation[] {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);

  return analysis.recommendations.filter(r => r.category === category && r.applicable);
}

export function createOptimizationTemplate(params: {
  name: string;
  description: string;
  category: OptimizationCategory;
  applicableScenarios: string[];
  recommendations: Omit<OptimizationRecommendation, 'id' | 'applicable'>[];
}): OptimizationTemplate {
  const id = randomUUID();

  const template: OptimizationTemplate = {
    id,
    name: params.name,
    description: params.description,
    category: params.category,
    applicableScenarios: params.applicableScenarios,
    recommendations: params.recommendations,
  };

  optimizationTemplates.set(id, template);
  return template;
}

export function getOptimizationTemplate(id: string): OptimizationTemplate | undefined {
  return optimizationTemplates.get(id);
}

export function listOptimizationTemplates(
  filters?: { category?: OptimizationCategory }
): OptimizationTemplate[] {
  let result = Array.from(optimizationTemplates.values());

  if (filters?.category) {
    result = result.filter(t => t.category === filters.category);
  }

  return result;
}

export function applyTemplate(
  analysisId: string,
  templateId: string
): OptimizationAnalysis {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);

  const template = optimizationTemplates.get(templateId);
  if (!template) throw new Error(`Optimization template ${templateId} not found`);

  // Add template recommendations to analysis
  const templateRecs: OptimizationRecommendation[] = template.recommendations.map(r => ({
    ...r,
    id: randomUUID(),
    applicable: true,
  }));

  analysis.recommendations.push(...templateRecs);
  analysis.updatedAt = new Date().toISOString();

  return analysis;
}

export function getOptimizationPlan(analysisId: string): OptimizationPlan | undefined {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);
  return analysis.optimizationPlan;
}

export function getEstimatedImprovements(analysisId: string): EstimatedImprovements {
  const analysis = optimizationAnalyses.get(analysisId);
  if (!analysis) throw new Error(`Optimization analysis ${analysisId} not found`);
  return analysis.estimatedImprovements;
}
