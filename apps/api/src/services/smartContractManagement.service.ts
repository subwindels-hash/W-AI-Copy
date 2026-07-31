/**
 * Module 29: Smart Contract Management Service
 *
 * Manages smart contract deployment, ABI management, contract interaction,
 * compilation pipeline, contract verification, event monitoring, and
 * multi-chain deployment.
 *
 * Phase 1 — Critical Gap: Enterprise smart contract infrastructure
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:smartContractManagement');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type ContractLanguage = "solidity" | "vyper" | "rust" | "move" | "cairo" | "ink";

export type ContractFramework = "hardhat" | "foundry" | "truffle" | "anchor" | "brownie" | "remix";

export type ContractStatus =
  | "draft"
  | "compiling"
  | "compiled"
  | "compilation-failed"
  | "deploying"
  | "deployed"
  | "deployment-failed"
  | "verified"
  | "paused"
  | "upgraded"
  | "deprecated"
  | "self-destructed";

export type ContractVisibility = "public" | "internal" | "private";

export type EventType = "transfer" | "approval" | "ownership" | "custom" | "error" | "admin";

export interface ContractABI {
  name: string;
  type: "function" | "event" | "constructor" | "fallback" | "receive" | "error";
  inputs?: ABIParam[];
  outputs?: ABIParam[];
  stateMutability?: "pure" | "view" | "nonpayable" | "payable";
  anonymous?: boolean;
  indexed?: boolean;
}

export interface ABIParam {
  name: string;
  type: string;
  indexed?: boolean;
  components?: ABIParam[];
  internalType?: string;
}

export interface SmartContract {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  language: ContractLanguage;
  framework: ContractFramework;
  version: string;
  status: ContractStatus;
  visibility: ContractVisibility;
  sourceCode: string;
  sourceHash: string;
  compilerVersion: string;
  compilerOptions: {
    optimizer: boolean;
    optimizerRuns: number;
    evmVersion?: string;
    viaIR?: boolean;
    libraries?: Record<string, string>;
  };
  abi: ContractABI[];
  bytecode: string;
  deployedBytecode?: string;
  deployments: ContractDeployment[];
  compilationErrors: CompilationError[];
  compilationWarnings: CompilationWarning[];
  gasEstimate?: {
    deployment: number;
    averageFunctionCall: number;
  };
  auditReport?: {
    auditor: string;
    date: string;
    severity: "clean" | "informational" | "low" | "medium" | "high" | "critical";
    findings: string[];
    reportUrl?: string;
  };
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDeployment {
  id: string;
  contractId: string;
  networkId: string;
  networkName: string;
  chainId: number;
  environment: string;
  deployerAddress: string;
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  gasUsed: number;
  gasPrice: string;
  effectiveGasPrice?: string;
  deploymentCost: string; // in native currency
  constructorArgs: unknown[];
  status: "pending" | "confirmed" | "failed" | "replaced";
  verified: boolean;
  verifiedAt?: string;
  proxyInfo?: {
    isProxy: boolean;
    implementationAddress?: string;
    proxyType?: "transparent" | "uups" | "diamond" | "beacon";
  };
  deployedAt: string;
  confirmedAt?: string;
}

export interface CompilationError {
  type: "error";
  message: string;
  sourceLocation?: {
    file: string;
    start: number;
    end: number;
    line: number;
    column: number;
  };
  formattedMessage?: string;
}

export interface CompilationWarning {
  type: "warning";
  message: string;
  sourceLocation?: {
    file: string;
    start: number;
    end: number;
    line: number;
    column: number;
  };
  formattedMessage?: string;
}

export interface ContractInteraction {
  id: string;
  contractId: string;
  deploymentId: string;
  method: string;
  methodType: "read" | "write" | "payable";
  inputs: Record<string, unknown>;
  outputs?: unknown[];
  transactionHash?: string;
  gasUsed?: number;
  gasPrice?: string;
  value?: string;
  callerAddress: string;
  status: "pending" | "success" | "failed" | "reverted";
  errorMessage?: string;
  blockNumber?: number;
  executedAt: string;
  confirmedAt?: string;
}

export interface ContractEvent {
  id: string;
  contractId: string;
  deploymentId: string;
  eventName: string;
  eventType: EventType;
  args: Record<string, unknown>;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
  detectedAt: string;
}

export interface ContractVersion {
  version: string;
  contractId: string;
  sourceHash: string;
  changes: string;
  createdAt: string;
  createdBy: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const contracts = new Map<string, SmartContract>();
const deployments = new Map<string, ContractDeployment>();
const interactions: ContractInteraction[] = [];
const events: ContractEvent[] = [];
const versions: ContractVersion[] = [];

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a new smart contract definition
 */
export async function createSmartContract(params: {
  organizationId: string;
  name: string;
  description: string;
  language: ContractLanguage;
  framework: ContractFramework;
  sourceCode: string;
  compilerVersion: string;
  compilerOptions?: Partial<SmartContract["compilerOptions"]>;
  visibility?: ContractVisibility;
  tags?: string[];
  createdBy: string;
}): Promise<SmartContract> {
  const now = new Date().toISOString();
  const sourceHash = createHash("sha256").update(params.sourceCode).digest("hex");

  const contract: SmartContract = {
    id: `sc_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    language: params.language,
    framework: params.framework,
    version: "1.0.0",
    status: "draft",
    visibility: params.visibility ?? "internal",
    sourceCode: params.sourceCode,
    sourceHash,
    compilerVersion: params.compilerVersion,
    compilerOptions: {
      optimizer: params.compilerOptions?.optimizer ?? true,
      optimizerRuns: params.compilerOptions?.optimizerRuns ?? 200,
      evmVersion: params.compilerOptions?.evmVersion,
      viaIR: params.compilerOptions?.viaIR ?? false,
      libraries: params.compilerOptions?.libraries ?? {},
    },
    abi: [],
    bytecode: "",
    deployments: [],
    compilationErrors: [],
    compilationWarnings: [],
    tags: params.tags ?? [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  contracts.set(contract.id, contract);

  // Record initial version
  versions.push({
    version: "1.0.0",
    contractId: contract.id,
    sourceHash,
    changes: "Initial contract creation",
    createdAt: now,
    createdBy: params.createdBy,
  });

  return contract;
}

/**
 * Compile a smart contract
 */
export async function compileSmartContract(contractId: string): Promise<{
  success: boolean;
  abi: ContractABI[];
  bytecode: string;
  errors: CompilationError[];
  warnings: CompilationWarning[];
  gasEstimate?: { deployment: number; averageFunctionCall: number };
}> {
  const contract = contracts.get(contractId);
  if (!contract) throw new Error(`Contract ${contractId} not found`);

  // Update status to compiling
  contract.status = "compiling";
  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  // Simulate compilation
  const errors: CompilationError[] = [];
  const warnings: CompilationWarning[] = [];
  let abi: ContractABI[] = [];
  let bytecode = "";

  try {
    // Parse source code for ABI extraction (simplified simulation)
    const parsedAbi = extractABI(contract.sourceCode, contract.language);
    abi = parsedAbi.abi;
    warnings.push(...parsedAbi.warnings);

    // Simulate bytecode generation
    bytecode = generateSimulatedBytecode(contract.sourceCode);

    // Check for common issues
    if (contract.sourceCode.length < 50) {
      errors.push({
        type: "error",
        message: "Source code appears too short — possible incomplete implementation",
        formattedMessage: "Error: Source code too short",
      });
    }

    // Check for SPDX license
    if (!contract.sourceCode.includes("SPDX-License-Identifier")) {
      warnings.push({
        type: "warning",
        message: "SPDX license identifier not found in source code",
        formattedMessage: "Warning: Missing SPDX license identifier",
      });
    }

    // Check for pragma
    if (contract.language === "solidity" && !contract.sourceCode.includes("pragma solidity")) {
      errors.push({
        type: "error",
        message: "Missing pragma solidity directive",
        sourceLocation: { file: contract.name, start: 0, end: 0, line: 1, column: 0 },
        formattedMessage: "Error: Missing pragma solidity directive",
      });
    }

    const success = errors.length === 0;

    // Calculate gas estimates
    const gasEstimate = success
      ? {
          deployment: Math.floor(contract.sourceCode.length * 100 + 21000 + _rng.next() * 500000),
          averageFunctionCall: Math.floor(21000 + _rng.next() * 100000),
        }
      : undefined;

    // Update contract
    const updated: SmartContract = {
      ...contract,
      status: success ? "compiled" : "compilation-failed",
      abi: success ? abi : [],
      bytecode: success ? bytecode : "",
      compilationErrors: errors,
      compilationWarnings: warnings,
      gasEstimate,
      updatedAt: new Date().toISOString(),
    };
    contracts.set(contractId, updated);

    return { success, abi, bytecode, errors, warnings, gasEstimate };
  } catch (err) {
    const error: CompilationError = {
      type: "error",
      message: `Compilation failed: ${err instanceof Error ? err.message : String(err)}`,
    };

    contract.status = "compilation-failed";
    contract.compilationErrors = [error];
    contract.updatedAt = new Date().toISOString();
    contracts.set(contractId, contract);

    return { success: false, abi: [], bytecode: "", errors: [error], warnings: [] };
  }
}

/**
 * Deploy a smart contract to a blockchain network
 */
export async function deploySmartContract(params: {
  contractId: string;
  networkId: string;
  networkName: string;
  chainId: number;
  environment: string;
  deployerAddress: string;
  constructorArgs?: unknown[];
  gasLimit?: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  proxyDeployment?: {
    proxyType: "transparent" | "uups" | "diamond" | "beacon";
  };
}): Promise<ContractDeployment> {
  const contract = contracts.get(params.contractId);
  if (!contract) throw new Error(`Contract ${params.contractId} not found`);

  if (contract.status !== "compiled" && contract.status !== "verified" && contract.status !== "upgraded") {
    throw new Error(`Contract must be compiled before deployment. Current status: ${contract.status}`);
  }

  if (!contract.bytecode) {
    throw new Error("Contract has no bytecode. Compile the contract first.");
  }

  const now = new Date().toISOString();

  // Simulate deployment transaction
  const txHash = "0x" + createHash("sha256")
    .update(`${params.contractId}-${params.networkId}-${now}`)
    .digest("hex");
  
  const contractAddress = "0x" + createHash("sha256")
    .update(`addr-${txHash}`)
    .digest("hex")
    .slice(0, 40);
  
  const blockNumber = 18000000 + Math.floor(_rng.next() * 1000000);
  const blockHash = "0x" + createHash("sha256")
    .update(`block-${blockNumber}`)
    .digest("hex");
  
  const gasUsed = contract.gasEstimate?.deployment ?? 2000000;
  const gasPrice = params.gasPrice ?? "20000000000"; // 20 gwei default

  const deployment: ContractDeployment = {
    id: `dep_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    contractId: params.contractId,
    networkId: params.networkId,
    networkName: params.networkName,
    chainId: params.chainId,
    environment: params.environment,
    deployerAddress: params.deployerAddress,
    contractAddress,
    transactionHash: txHash,
    blockNumber,
    blockHash,
    gasUsed,
    gasPrice,
    effectiveGasPrice: gasPrice,
    deploymentCost: String(BigInt(gasUsed) * BigInt(gasPrice)),
    constructorArgs: params.constructorArgs ?? [],
    status: "confirmed",
    verified: false,
    proxyInfo: params.proxyDeployment
      ? {
          isProxy: true,
          proxyType: params.proxyDeployment.proxyType,
          implementationAddress: contractAddress,
        }
      : { isProxy: false },
    deployedAt: now,
    confirmedAt: now,
  };

  deployments.set(deployment.id, deployment);

  // Update contract
  contract.deployments.push(deployment);
  contract.status = "deployed";
  contract.deployedBytecode = contract.bytecode;
  contract.updatedAt = now;
  contracts.set(params.contractId, contract);

  return deployment;
}

/**
 * Verify a deployed contract on a block explorer
 */
export async function verifySmartContract(
  deploymentId: string,
  explorerApiUrl?: string
): Promise<{ success: boolean; message: string }> {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  const contract = contracts.get(deployment.contractId);
  if (!contract) throw new Error(`Contract ${deployment.contractId} not found`);

  // Simulate verification
  const success = true; // In production, call block explorer API
  const now = new Date().toISOString();

  if (success) {
    deployment.verified = true;
    deployment.verifiedAt = now;
    deployments.set(deploymentId, deployment);

    contract.status = "verified";
    contract.updatedAt = now;
    contracts.set(contract.id, contract);

    return { success: true, message: `Contract verified at ${deployment.contractAddress} on ${deployment.networkName}` };
  }

  return { success: false, message: "Verification failed" };
}

/**
 * Interact with a deployed smart contract (read or write)
 */
export async function interactWithContract(params: {
  contractId: string;
  deploymentId: string;
  method: string;
  methodType: "read" | "write" | "payable";
  inputs?: Record<string, unknown>;
  value?: string;
  callerAddress: string;
  gasLimit?: number;
  gasPrice?: string;
}): Promise<ContractInteraction> {
  const contract = contracts.get(params.contractId);
  if (!contract) throw new Error(`Contract ${params.contractId} not found`);

  const deployment = deployments.get(params.deploymentId);
  if (!deployment) throw new Error(`Deployment ${params.deploymentId} not found`);

  // Validate method exists in ABI
  const methodAbi = contract.abi.find(
    a => a.type === "function" && a.name === params.method
  );

  if (!methodAbi && contract.abi.length > 0) {
    throw new Error(`Method ${params.method} not found in contract ABI`);
  }

  const now = new Date().toISOString();
  let txHash: string | undefined;
  let gasUsed: number | undefined;
  let outputs: unknown[] | undefined;
  let status: ContractInteraction["status"] = "success";
  let errorMessage: string | undefined;

  if (params.methodType === "read") {
    // Simulate read operation
    outputs = simulateReadOperation(params.method, params.inputs ?? {}, contract);
    gasUsed = 0;
  } else {
    // Simulate write transaction
    txHash = "0x" + createHash("sha256")
      .update(`tx-${params.deploymentId}-${params.method}-${now}`)
      .digest("hex");
    gasUsed = contract.gasEstimate?.averageFunctionCall ?? 50000;
    
    // 5% chance of revert for simulation
    if (_rng.next() < 0.05) {
      status = "reverted";
      errorMessage = "Transaction reverted: execution reverted";
    }
  }

  const interaction: ContractInteraction = {
    id: `int_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    contractId: params.contractId,
    deploymentId: params.deploymentId,
    method: params.method,
    methodType: params.methodType,
    inputs: params.inputs ?? {},
    outputs,
    transactionHash: txHash,
    gasUsed,
    gasPrice: params.gasPrice,
    value: params.value,
    callerAddress: params.callerAddress,
    status,
    errorMessage,
    blockNumber: deployment.blockNumber + Math.floor(_rng.next() * 1000),
    executedAt: now,
    confirmedAt: status === "success" ? now : undefined,
  };

  interactions.push(interaction);

  // Emit events for write operations
  if (params.methodType !== "read" && status === "success") {
    const emittedEvents = generateSimulatedEvents(
      params.method,
      params.inputs ?? {},
      interaction,
      deployment
    );
    events.push(...emittedEvents);
  }

  return interaction;
}

/**
 * Get contract interaction history
 */
export async function getContractInteractions(
  contractId: string,
  filters?: {
    deploymentId?: string;
    method?: string;
    methodType?: "read" | "write" | "payable";
    status?: ContractInteraction["status"];
    limit?: number;
  }
): Promise<ContractInteraction[]> {
  let result = interactions.filter(i => i.contractId === contractId);

  if (filters?.deploymentId) {
    result = result.filter(i => i.deploymentId === filters.deploymentId);
  }
  if (filters?.method) {
    result = result.filter(i => i.method === filters.method);
  }
  if (filters?.methodType) {
    result = result.filter(i => i.methodType === filters.methodType);
  }
  if (filters?.status) {
    result = result.filter(i => i.status === filters.status);
  }

  return result
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get contract events
 */
export async function getContractEvents(
  contractId: string,
  filters?: {
    deploymentId?: string;
    eventName?: string;
    eventType?: EventType;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
  }
): Promise<ContractEvent[]> {
  let result = events.filter(e => e.contractId === contractId);

  if (filters?.deploymentId) {
    result = result.filter(e => e.deploymentId === filters.deploymentId);
  }
  if (filters?.eventName) {
    result = result.filter(e => e.eventName === filters.eventName);
  }
  if (filters?.eventType) {
    result = result.filter(e => e.eventType === filters.eventType);
  }
  if (filters?.fromBlock !== undefined) {
    result = result.filter(e => e.blockNumber >= filters.fromBlock!);
  }
  if (filters?.toBlock !== undefined) {
    result = result.filter(e => e.blockNumber <= filters.toBlock!);
  }

  return result
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, filters?.limit ?? 100);
}

/**
 * Update smart contract source code (new version)
 */
export async function updateSmartContractSource(
  contractId: string,
  params: {
    sourceCode: string;
    compilerVersion?: string;
    compilerOptions?: Partial<SmartContract["compilerOptions"]>;
    changes: string;
    updatedBy: string;
  }
): Promise<SmartContract | null> {
  const contract = contracts.get(contractId);
  if (!contract) return null;

  const now = new Date().toISOString();
  const sourceHash = createHash("sha256").update(params.sourceCode).digest("hex");

  // Increment version
  const versionParts = contract.version.split(".").map(Number);
  versionParts[1]++;
  const newVersion = versionParts.join(".");

  const updated: SmartContract = {
    ...contract,
    sourceCode: params.sourceCode,
    sourceHash,
    version: newVersion,
    compilerVersion: params.compilerVersion ?? contract.compilerVersion,
    compilerOptions: params.compilerOptions
      ? { ...contract.compilerOptions, ...params.compilerOptions }
      : contract.compilerOptions,
    status: "draft",
    abi: [],
    bytecode: "",
    compilationErrors: [],
    compilationWarnings: [],
    updatedAt: now,
  };

  contracts.set(contractId, updated);

  // Record version
  versions.push({
    version: newVersion,
    contractId,
    sourceHash,
    changes: params.changes,
    createdAt: now,
    createdBy: params.updatedBy,
  });

  return updated;
}

/**
 * Get contract version history
 */
export async function getContractVersions(contractId: string): Promise<ContractVersion[]> {
  return versions
    .filter(v => v.contractId === contractId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get a smart contract by ID
 */
export async function getSmartContract(contractId: string): Promise<SmartContract | null> {
  return contracts.get(contractId) ?? null;
}

/**
 * List all smart contracts for an organization
 */
export async function listSmartContracts(
  organizationId: string,
  filters?: {
    language?: ContractLanguage;
    status?: ContractStatus;
    visibility?: ContractVisibility;
    tag?: string;
  }
): Promise<SmartContract[]> {
  let result = Array.from(contracts.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.language) {
    result = result.filter(c => c.language === filters.language);
  }
  if (filters?.status) {
    result = result.filter(c => c.status === filters.status);
  }
  if (filters?.visibility) {
    result = result.filter(c => c.visibility === filters.visibility);
  }
  if (filters?.tag) {
    result = result.filter(c => c.tags.includes(filters.tag!));
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get contract deployment by ID
 */
export async function getContractDeployment(deploymentId: string): Promise<ContractDeployment | null> {
  return deployments.get(deploymentId) ?? null;
}

/**
 * List all deployments for a contract
 */
export async function listContractDeployments(contractId: string): Promise<ContractDeployment[]> {
  return Array.from(deployments.values())
    .filter(d => d.contractId === contractId)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
}

/**
 * Delete a smart contract (soft delete — marks as deprecated)
 */
export async function deleteSmartContract(contractId: string): Promise<boolean> {
  const contract = contracts.get(contractId);
  if (!contract) return false;

  contract.status = "deprecated";
  contract.updatedAt = new Date().toISOString();
  contracts.set(contractId, contract);

  return true;
}

/**
 * Get smart contract statistics for an organization
 */
export async function getSmartContractStats(organizationId: string): Promise<{
  totalContracts: number;
  contractsByLanguage: Record<string, number>;
  contractsByStatus: Record<string, number>;
  totalDeployments: number;
  deploymentsByNetwork: Record<string, number>;
  verifiedDeployments: number;
  totalInteractions: number;
  interactionsByType: Record<string, number>;
  totalEvents: number;
  failedInteractions: number;
  averageGasUsed: number;
}> {
  const allContracts = Array.from(contracts.values()).filter(
    c => c.organizationId === organizationId
  );
  const allDeployments = Array.from(deployments.values()).filter(
    d => allContracts.some(c => c.id === d.contractId)
  );
  const allInteractions = interactions.filter(
    i => allContracts.some(c => c.id === i.contractId)
  );
  const allEvents = events.filter(
    e => allContracts.some(c => c.id === e.contractId)
  );

  const contractsByLanguage: Record<string, number> = {};
  const contractsByStatus: Record<string, number> = {};
  const deploymentsByNetwork: Record<string, number> = {};
  const interactionsByType: Record<string, number> = {};

  for (const c of allContracts) {
    contractsByLanguage[c.language] = (contractsByLanguage[c.language] || 0) + 1;
    contractsByStatus[c.status] = (contractsByStatus[c.status] || 0) + 1;
  }

  for (const d of allDeployments) {
    deploymentsByNetwork[d.networkName] = (deploymentsByNetwork[d.networkName] || 0) + 1;
  }

  for (const i of allInteractions) {
    interactionsByType[i.methodType] = (interactionsByType[i.methodType] || 0) + 1;
  }

  const verifiedDeployments = allDeployments.filter(d => d.verified).length;
  const failedInteractions = allInteractions.filter(
    i => i.status === "failed" || i.status === "reverted"
  ).length;
  const avgGas = allInteractions.length > 0
    ? Math.round(
        allInteractions
          .filter(i => i.gasUsed !== undefined)
          .reduce((sum, i) => sum + (i.gasUsed ?? 0), 0) /
          allInteractions.filter(i => i.gasUsed !== undefined).length
      )
    : 0;

  return {
    totalContracts: allContracts.length,
    contractsByLanguage,
    contractsByStatus,
    totalDeployments: allDeployments.length,
    deploymentsByNetwork,
    verifiedDeployments,
    totalInteractions: allInteractions.length,
    interactionsByType,
    totalEvents: allEvents.length,
    failedInteractions,
    averageGasUsed: avgGas,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Extract ABI from source code (simplified simulation)
 */
function extractABI(
  sourceCode: string,
  language: ContractLanguage
): { abi: ContractABI[]; warnings: CompilationWarning[] } {
  const abi: ContractABI[] = [];
  const warnings: CompilationWarning[] = [];

  if (language === "solidity" || language === "vyper") {
    // Extract constructor
    const constructorMatch = sourceCode.match(/constructor\s*\(([^)]*)\)/);
    if (constructorMatch) {
      abi.push({
        name: "",
        type: "constructor",
        inputs: parseParams(constructorMatch[1]),
        stateMutability: sourceCode.includes("payable") && constructorMatch[0].includes("payable")
          ? "payable"
          : "nonpayable",
      });
    }

    // Extract functions
    const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(public|external|internal|private)?\s*(view|pure|payable)?\s*(returns\s*\(([^)]*)\))?/g;
    let match;
    while ((match = functionRegex.exec(sourceCode)) !== null) {
      const visibility = match[3] || "public";
      if (visibility === "internal" || visibility === "private") continue;

      const stateMutability = match[4] as ContractABI["stateMutability"] || "nonpayable";
      abi.push({
        name: match[1],
        type: "function",
        inputs: parseParams(match[2]),
        outputs: match[6] ? parseParams(match[6]) : [],
        stateMutability,
      });
    }

    // Extract events
    const eventRegex = /event\s+(\w+)\s*\(([^)]*)\)/g;
    while ((match = eventRegex.exec(sourceCode)) !== null) {
      abi.push({
        name: match[1],
        type: "event",
        inputs: parseParams(match[2]),
        anonymous: false,
      });
    }

    // Extract errors (Solidity 0.8.4+)
    const errorRegex = /error\s+(\w+)\s*\(([^)]*)\)/g;
    while ((match = errorRegex.exec(sourceCode)) !== null) {
      abi.push({
        name: match[1],
        type: "error",
        inputs: parseParams(match[2]),
      });
    }

    // Check for receive/fallback
    if (sourceCode.includes("receive()")) {
      abi.push({ name: "", type: "receive", stateMutability: "payable" });
    }
    if (sourceCode.includes("fallback()")) {
      abi.push({ name: "", type: "fallback", stateMutability: "nonpayable" });
    }
  }

  return { abi, warnings };
}

/**
 * Parse function parameters from Solidity-style parameter string
 */
function parseParams(paramString: string): ABIParam[] {
  if (!paramString || paramString.trim() === "") return [];

  return paramString.split(",").map(p => {
    const parts = p.trim().split(/\s+/);
    const indexed = parts.includes("indexed");
    const filteredParts = parts.filter(p => p !== "indexed" && p !== "memory" && p !== "storage" && p !== "calldata");
    
    return {
      name: filteredParts[1] || `param${Math.floor(_rng.next() * 100)}`,
      type: mapSolidityType(filteredParts[0] || "uint256"),
      indexed,
    };
  }).filter(p => p.type);
}

/**
 * Map Solidity types to ABI types
 */
function mapSolidityType(solidityType: string): string {
  const typeMap: Record<string, string> = {
    uint: "uint256",
    int: "int256",
    address: "address",
    bool: "bool",
    string: "string",
    bytes: "bytes",
    bytes32: "bytes32",
    uint256: "uint256",
    int256: "int256",
    uint128: "uint128",
    uint64: "uint64",
    uint32: "uint32",
    uint8: "uint8",
  };
  return typeMap[solidityType] || solidityType;
}

/**
 * Generate simulated bytecode from source code
 */
function generateSimulatedBytecode(sourceCode: string): string {
  const hash = createHash("sha256").update(sourceCode).digest("hex");
  // Simulate EVM bytecode prefix + hash-based content
  return "0x6080604052" + hash + hash.slice(0, 64);
}

/**
 * Simulate a read operation on a contract
 */
function simulateReadOperation(
  method: string,
  inputs: Record<string, unknown>,
  contract: SmartContract
): unknown[] {
  // Simulate common read patterns
  const methodLower = method.toLowerCase();

  if (methodLower === "name" || methodLower === "symbol") {
    return [contract.name];
  }
  if (methodLower === "totalsupply" || methodLower === "total_supply") {
    return [String(Math.floor(_rng.next() * 1e24))];
  }
  if (methodLower === "balanceof" || methodLower === "balance_of") {
    return [String(Math.floor(_rng.next() * 1e20))];
  }
  if (methodLower === "owner") {
    return ["0x" + createHash("sha256").update("owner").digest("hex").slice(0, 40)];
  }
  if (methodLower === "decimals") {
    return [18];
  }
  if (methodLower.includes("get") || methodLower.includes("read")) {
    return [Math.floor(_rng.next() * 1000)];
  }

  return [null];
}

/**
 * Generate simulated events from a contract interaction
 */
function generateSimulatedEvents(
  method: string,
  inputs: Record<string, unknown>,
  interaction: ContractInteraction,
  deployment: ContractDeployment
): ContractEvent[] {
  const result: ContractEvent[] = [];
  const now = new Date().toISOString();
  const methodLower = method.toLowerCase();

  // Transfer events for transfer-like methods
  if (methodLower.includes("transfer") || methodLower.includes("send")) {
    result.push({
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      contractId: interaction.contractId,
      deploymentId: interaction.deploymentId,
      eventName: "Transfer",
      eventType: "transfer",
      args: {
        from: interaction.callerAddress,
        to: inputs.to || inputs.recipient || "0x0000000000000000000000000000000000000000",
        value: inputs.amount || inputs.value || "0",
      },
      transactionHash: interaction.transactionHash || "",
      blockNumber: interaction.blockNumber || deployment.blockNumber,
      blockHash: deployment.blockHash,
      logIndex: 0,
      removed: false,
      detectedAt: now,
    });
  }

  // Approval events
  if (methodLower.includes("approve") || methodLower.includes("allowance")) {
    result.push({
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      contractId: interaction.contractId,
      deploymentId: interaction.deploymentId,
      eventName: "Approval",
      eventType: "approval",
      args: {
        owner: interaction.callerAddress,
        spender: inputs.spender || "0x0000000000000000000000000000000000000000",
        value: inputs.amount || inputs.value || "0",
      },
      transactionHash: interaction.transactionHash || "",
      blockNumber: interaction.blockNumber || deployment.blockNumber,
      blockHash: deployment.blockHash,
      logIndex: result.length,
      removed: false,
      detectedAt: now,
    });
  }

  // Ownership events
  if (methodLower.includes("owner") || methodLower.includes("admin")) {
    result.push({
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      contractId: interaction.contractId,
      deploymentId: interaction.deploymentId,
      eventName: "OwnershipTransferred",
      eventType: "ownership",
      args: {
        previousOwner: "0x0000000000000000000000000000000000000000",
        newOwner: inputs.newOwner || interaction.callerAddress,
      },
      transactionHash: interaction.transactionHash || "",
      blockNumber: interaction.blockNumber || deployment.blockNumber,
      blockHash: deployment.blockHash,
      logIndex: result.length,
      removed: false,
      detectedAt: now,
    });
  }

  return result;
}
