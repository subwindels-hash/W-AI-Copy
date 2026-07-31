/**
 * Module 29: Blockchain Network Management Service
 * 
 * Manages blockchain network connections, RPC nodes, network health monitoring,
 * failover, chain configuration, and multi-provider support.
 * 
 * Phase 1 — Critical Gap: Enterprise blockchain network infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockchainType = 
  | "ethereum" | "polygon" | "bsc" | "arbitrum" | "optimism" 
  | "avalanche" | "base" | "solana" | "bitcoin" | "hyperledger"
  | "cosmos" | "polkadot" | "custom";

export type NetworkEnvironment = "mainnet" | "testnet" | "devnet" | "localnet";

export type NodeStatus = "healthy" | "degraded" | "offline" | "syncing" | "maintenance";

export type NodeProvider = 
  | "infura" | "alchemy" | "quicknode" | "moralis" | "ankr" 
  | "chainstack" | "getblock" | "self-hosted" | "custom";

export type ConsensusMechanism = "pow" | "pos" | "dpos" | "pbft" | "raft" | "ibft" | "custom";

export interface BlockchainNode {
  id: string;
  networkId: string;
  organizationId: string;
  name: string;
  provider: NodeProvider;
  rpcUrl: string;
  wsUrl?: string;
  graphqlUrl?: string;
  environment: NetworkEnvironment;
  status: NodeStatus;
  latencyMs: number;
  blockHeight: number;
  lastSyncedAt: string;
  lastHealthCheckAt: string;
  failoverPriority: number;
  rateLimitRps: number;
  rateLimitUsed: number;
  isPrimary: boolean;
  credentials?: {
    apiKey?: string;
    apiSecret?: string;
  };
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BlockchainNetwork {
  id: string;
  organizationId: string;
  name: string;
  blockchainType: BlockchainType;
  chainId: number;
  environment: NetworkEnvironment;
  consensusMechanism: ConsensusMechanism;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl?: string;
  blockTime: number; // seconds
  avgGasPrice?: number; // in native currency units
  avgTransactionFee?: number; // in native currency units
  status: NodeStatus;
  nodeCount: number;
  activeNodeCount: number;
  totalTransactions: number;
  totalBlocks: number;
  latestBlockHeight: number;
  lastBlockAt: string;
  features: {
    smartContracts: boolean;
    evmCompatible: boolean;
    eip1559: boolean;
    crossChain: boolean;
    layer2: boolean;
    privateTransactions: boolean;
  };
  config: {
    maxRetries: number;
    retryDelayMs: number;
    healthCheckIntervalMs: number;
    failoverEnabled: boolean;
    loadBalancing: "round-robin" | "latency-based" | "priority-based";
    cacheEnabled: boolean;
    cacheTtlMs: number;
  };
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkHealthReport {
  networkId: string;
  networkName: string;
  overallStatus: NodeStatus;
  nodes: Array<{
    nodeId: string;
    nodeName: string;
    status: NodeStatus;
    latencyMs: number;
    blockHeight: number;
    isPrimary: boolean;
    isBehind: boolean;
    blocksBehind: number;
  }>;
  averageLatencyMs: number;
  highestBlockHeight: number;
  lowestBlockHeight: number;
  blockHeightSpread: number;
  healthScore: number; // 0-100
  recommendations: string[];
  checkedAt: string;
}

export interface NetworkFailoverEvent {
  id: string;
  networkId: string;
  fromNodeId: string;
  toNodeId: string;
  reason: string;
  triggeredAt: string;
  resolvedAt?: string;
  durationMs?: number;
}

// ─── In-Memory Store (Redis-backed in production) ────────────────────────────

const networks = new Map<string, BlockchainNetwork>();
const nodes = new Map<string, BlockchainNode>();
const failoverEvents: NetworkFailoverEvent[] = [];
const healthReports = new Map<string, NetworkHealthReport>();

// ─── Default Chain Configurations ─────────────────────────────────────────────

const DEFAULT_CHAINS: Partial<Record<BlockchainType, Partial<BlockchainNetwork>>> = {
  ethereum: {
    blockchainType: "ethereum",
    chainId: 1,
    consensusMechanism: "pos",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://etherscan.io",
    blockTime: 12,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: false, privateTransactions: false
    }
  },
  polygon: {
    blockchainType: "polygon",
    chainId: 137,
    consensusMechanism: "pos",
    nativeCurrency: { name: "Polygon", symbol: "POL", decimals: 18 },
    blockExplorerUrl: "https://polygonscan.com",
    blockTime: 2,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: true, privateTransactions: false
    }
  },
  bsc: {
    blockchainType: "bsc",
    chainId: 56,
    consensusMechanism: "pos",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    blockExplorerUrl: "https://bscscan.com",
    blockTime: 3,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: false,
      crossChain: true, layer2: false, privateTransactions: false
    }
  },
  arbitrum: {
    blockchainType: "arbitrum",
    chainId: 42161,
    consensusMechanism: "custom",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://arbiscan.io",
    blockTime: 1,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: true, privateTransactions: false
    }
  },
  optimism: {
    blockchainType: "optimism",
    chainId: 10,
    consensusMechanism: "custom",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://optimistic.etherscan.io",
    blockTime: 2,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: true, privateTransactions: false
    }
  },
  avalanche: {
    blockchainType: "avalanche",
    chainId: 43114,
    consensusMechanism: "pos",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    blockExplorerUrl: "https://snowtrace.io",
    blockTime: 2,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: false, privateTransactions: false
    }
  },
  base: {
    blockchainType: "base",
    chainId: 8453,
    consensusMechanism: "custom",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://basescan.org",
    blockTime: 2,
    features: {
      smartContracts: true, evmCompatible: true, eip1559: true,
      crossChain: true, layer2: true, privateTransactions: false
    }
  },
  solana: {
    blockchainType: "solana",
    chainId: 0,
    consensusMechanism: "pos",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    blockExplorerUrl: "https://solscan.io",
    blockTime: 0.4,
    features: {
      smartContracts: true, evmCompatible: false, eip1559: false,
      crossChain: true, layer2: false, privateTransactions: false
    }
  },
  bitcoin: {
    blockchainType: "bitcoin",
    chainId: 0,
    consensusMechanism: "pow",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 8 },
    blockExplorerUrl: "https://blockchain.info",
    blockTime: 600,
    features: {
      smartContracts: false, evmCompatible: false, eip1559: false,
      crossChain: false, layer2: false, privateTransactions: false
    }
  },
  hyperledger: {
    blockchainType: "hyperledger",
    chainId: 0,
    consensusMechanism: "pbft",
    nativeCurrency: { name: "N/A", symbol: "N/A", decimals: 0 },
    blockTime: 1,
    features: {
      smartContracts: true, evmCompatible: false, eip1559: false,
      crossChain: false, layer2: false, privateTransactions: true
    }
  }
};

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a blockchain network configuration
 */
export async function createBlockchainNetwork(params: {
  organizationId: string;
  name: string;
  blockchainType: BlockchainType;
  environment: NetworkEnvironment;
  chainId?: number;
  consensusMechanism?: ConsensusMechanism;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  blockExplorerUrl?: string;
  blockTime?: number;
  features?: Partial<BlockchainNetwork["features"]>;
  config?: Partial<BlockchainNetwork["config"]>;
  metadata?: Record<string, unknown>;
}): Promise<BlockchainNetwork> {
  const now = new Date().toISOString();
  const defaults = DEFAULT_CHAINS[params.blockchainType] || {};
  
  const network: BlockchainNetwork = {
    id: `bn_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    blockchainType: params.blockchainType,
    chainId: params.chainId ?? defaults.chainId ?? 0,
    environment: params.environment,
    consensusMechanism: params.consensusMechanism ?? defaults.consensusMechanism ?? "pos",
    nativeCurrency: params.nativeCurrency ?? defaults.nativeCurrency ?? { name: "Unknown", symbol: "???", decimals: 18 },
    blockExplorerUrl: params.blockExplorerUrl ?? defaults.blockExplorerUrl,
    blockTime: params.blockTime ?? defaults.blockTime ?? 12,
    status: "offline",
    nodeCount: 0,
    activeNodeCount: 0,
    totalTransactions: 0,
    totalBlocks: 0,
    latestBlockHeight: 0,
    lastBlockAt: now,
    features: {
      smartContracts: params.features?.smartContracts ?? defaults.features?.smartContracts ?? false,
      evmCompatible: params.features?.evmCompatible ?? defaults.features?.evmCompatible ?? false,
      eip1559: params.features?.eip1559 ?? defaults.features?.eip1559 ?? false,
      crossChain: params.features?.crossChain ?? defaults.features?.crossChain ?? false,
      layer2: params.features?.layer2 ?? defaults.features?.layer2 ?? false,
      privateTransactions: params.features?.privateTransactions ?? defaults.features?.privateTransactions ?? false,
    },
    config: {
      maxRetries: params.config?.maxRetries ?? 3,
      retryDelayMs: params.config?.retryDelayMs ?? 1000,
      healthCheckIntervalMs: params.config?.healthCheckIntervalMs ?? 30000,
      failoverEnabled: params.config?.failoverEnabled ?? true,
      loadBalancing: params.config?.loadBalancing ?? "latency-based",
      cacheEnabled: params.config?.cacheEnabled ?? true,
      cacheTtlMs: params.config?.cacheTtlMs ?? 5000,
    },
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  networks.set(network.id, network);
  return network;
}

/**
 * Get a blockchain network by ID
 */
export async function getBlockchainNetwork(networkId: string): Promise<BlockchainNetwork | null> {
  return networks.get(networkId) ?? null;
}

/**
 * List all blockchain networks for an organization
 */
export async function listBlockchainNetworks(organizationId: string, filters?: {
  blockchainType?: BlockchainType;
  environment?: NetworkEnvironment;
  status?: NodeStatus;
}): Promise<BlockchainNetwork[]> {
  let result = Array.from(networks.values()).filter(
    n => n.organizationId === organizationId
  );

  if (filters?.blockchainType) {
    result = result.filter(n => n.blockchainType === filters.blockchainType);
  }
  if (filters?.environment) {
    result = result.filter(n => n.environment === filters.environment);
  }
  if (filters?.status) {
    result = result.filter(n => n.status === filters.status);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Update a blockchain network configuration
 */
export async function updateBlockchainNetwork(
  networkId: string,
  updates: Partial<Pick<BlockchainNetwork, 
    "name" | "blockExplorerUrl" | "blockTime" | "features" | "config" | "metadata"
  >>
): Promise<BlockchainNetwork | null> {
  const network = networks.get(networkId);
  if (!network) return null;

  const updated: BlockchainNetwork = {
    ...network,
    ...updates,
    features: updates.features ? { ...network.features, ...updates.features } : network.features,
    config: updates.config ? { ...network.config, ...updates.config } : network.config,
    updatedAt: new Date().toISOString(),
  };

  networks.set(networkId, updated);
  return updated;
}

/**
 * Delete a blockchain network and all its nodes
 */
export async function deleteBlockchainNetwork(networkId: string): Promise<boolean> {
  const network = networks.get(networkId);
  if (!network) return false;

  // Remove all nodes for this network
  for (const [nodeId, node] of nodes) {
    if (node.networkId === networkId) {
      nodes.delete(nodeId);
    }
  }

  networks.delete(networkId);
  healthReports.delete(networkId);
  return true;
}

/**
 * Add an RPC node to a blockchain network
 */
export async function addBlockchainNode(params: {
  networkId: string;
  organizationId: string;
  name: string;
  provider: NodeProvider;
  rpcUrl: string;
  wsUrl?: string;
  graphqlUrl?: string;
  environment: NetworkEnvironment;
  failoverPriority?: number;
  rateLimitRps?: number;
  isPrimary?: boolean;
  credentials?: { apiKey?: string; apiSecret?: string };
  metadata?: Record<string, unknown>;
}): Promise<BlockchainNode> {
  const network = networks.get(params.networkId);
  if (!network) throw new Error(`Network ${params.networkId} not found`);

  const existingNodes = Array.from(nodes.values()).filter(
    n => n.networkId === params.networkId
  );
  
  // If this is the first node, make it primary
  const isPrimary = params.isPrimary ?? (existingNodes.length === 0);

  const now = new Date().toISOString();
  const node: BlockchainNode = {
    id: `node_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    networkId: params.networkId,
    organizationId: params.organizationId,
    name: params.name,
    provider: params.provider,
    rpcUrl: params.rpcUrl,
    wsUrl: params.wsUrl,
    graphqlUrl: params.graphqlUrl,
    environment: params.environment,
    status: "offline",
    latencyMs: 0,
    blockHeight: 0,
    lastSyncedAt: now,
    lastHealthCheckAt: now,
    failoverPriority: params.failoverPriority ?? existingNodes.length,
    rateLimitRps: params.rateLimitRps ?? 100,
    rateLimitUsed: 0,
    isPrimary,
    credentials: params.credentials,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  nodes.set(node.id, node);

  // Update network node count
  network.nodeCount = existingNodes.length + 1;
  network.updatedAt = now;
  networks.set(network.id, network);

  return node;
}

/**
 * Remove an RPC node from a blockchain network
 */
export async function removeBlockchainNode(nodeId: string): Promise<boolean> {
  const node = nodes.get(nodeId);
  if (!node) return false;

  nodes.delete(nodeId);

  // Update network
  const network = networks.get(node.networkId);
  if (network) {
    const remainingNodes = Array.from(nodes.values()).filter(
      n => n.networkId === node.networkId
    );
    network.nodeCount = remainingNodes.length;
    network.activeNodeCount = remainingNodes.filter(n => n.status === "healthy").length;
    
    // If we removed the primary, promote the next best node
    if (node.isPrimary && remainingNodes.length > 0) {
      const nextPrimary = remainingNodes
        .sort((a, b) => a.failoverPriority - b.failoverPriority)[0];
      nextPrimary.isPrimary = true;
      nodes.set(nextPrimary.id, nextPrimary);
    }
    
    network.updatedAt = new Date().toISOString();
    networks.set(network.id, network);
  }

  return true;
}

/**
 * List all nodes for a blockchain network
 */
export async function listBlockchainNodes(networkId: string, status?: NodeStatus): Promise<BlockchainNode[]> {
  let result = Array.from(nodes.values()).filter(n => n.networkId === networkId);
  
  if (status) {
    result = result.filter(n => n.status === status);
  }

  return result.sort((a, b) => a.failoverPriority - b.failoverPriority);
}

/**
 * Perform health check on a specific node
 */
export async function healthCheckNode(nodeId: string): Promise<{
  nodeId: string;
  status: NodeStatus;
  latencyMs: number;
  blockHeight: number;
  isSynced: boolean;
}> {
  const node = nodes.get(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  // Simulate health check (in production, make actual RPC calls)
  const startTime = Date.now();
  
  // Simulate RPC call: eth_blockNumber or equivalent
  const simulatedLatency = Math.floor(Math.random() * 200) + 10;
  const simulatedBlockHeight = node.blockHeight + Math.floor(Math.random() * 10) + 1;
  const isHealthy = Math.random() > 0.05; // 95% healthy rate
  const isSyncing = Math.random() < 0.02; // 2% syncing rate

  const now = new Date().toISOString();
  let newStatus: NodeStatus;
  if (!isHealthy) newStatus = "offline";
  else if (isSyncing) newStatus = "syncing";
  else newStatus = "healthy";

  const updatedNode: BlockchainNode = {
    ...node,
    status: newStatus,
    latencyMs: simulatedLatency,
    blockHeight: simulatedBlockHeight,
    lastSyncedAt: now,
    lastHealthCheckAt: now,
    updatedAt: now,
  };
  nodes.set(nodeId, updatedNode);

  // Check if node is synced with network
  const network = networks.get(node.networkId);
  const networkNodes = Array.from(nodes.values()).filter(
    n => n.networkId === node.networkId && n.status === "healthy"
  );
  const maxBlockHeight = Math.max(...networkNodes.map(n => n.blockHeight), 0);
  const isSynced = maxBlockHeight - simulatedBlockHeight <= 5;

  // Update network status
  if (network) {
    updateNetworkStatus(network.id);
  }

  return {
    nodeId,
    status: newStatus,
    latencyMs: simulatedLatency,
    blockHeight: simulatedBlockHeight,
    isSynced,
  };
}

/**
 * Perform health check on all nodes in a network
 */
export async function healthCheckNetwork(networkId: string): Promise<NetworkHealthReport> {
  const network = networks.get(networkId);
  if (!network) throw new Error(`Network ${networkId} not found`);

  const networkNodes = Array.from(nodes.values()).filter(
    n => n.networkId === networkId
  );

  // Health check all nodes
  const nodeResults = await Promise.all(
    networkNodes.map(n => healthCheckNode(n.id))
  );

  const healthyNodes = nodeResults.filter(r => r.status === "healthy");
  const highestBlock = Math.max(...nodeResults.map(r => r.blockHeight), 0);
  const lowestBlock = Math.min(...nodeResults.filter(r => r.status === "healthy").map(r => r.blockHeight), highestBlock);
  const avgLatency = healthyNodes.length > 0
    ? Math.round(healthyNodes.reduce((sum, r) => sum + r.latencyMs, 0) / healthyNodes.length)
    : 0;

  // Calculate health score (0-100)
  let healthScore = 100;
  if (healthyNodes.length === 0) healthScore = 0;
  else {
    // Deduct for offline/degraded nodes
    healthScore -= ((networkNodes.length - healthyNodes.length) / networkNodes.length) * 40;
    // Deduct for high latency
    if (avgLatency > 500) healthScore -= 20;
    else if (avgLatency > 200) healthScore -= 10;
    // Deduct for block height spread
    if (highestBlock - lowestBlock > 10) healthScore -= 20;
    else if (highestBlock - lowestBlock > 5) healthScore -= 10;
  }
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  // Generate recommendations
  const recommendations: string[] = [];
  if (healthyNodes.length === 0) {
    recommendations.push("CRITICAL: All nodes are offline. Immediate action required.");
  }
  if (healthyNodes.length === 1 && networkNodes.length > 1) {
    recommendations.push("WARNING: Only one healthy node remaining. Add backup nodes.");
  }
  if (avgLatency > 500) {
    recommendations.push("High average latency detected. Consider adding nodes in closer geographic regions.");
  }
  if (highestBlock - lowestBlock > 10) {
    recommendations.push("Significant block height spread detected. Some nodes may be out of sync.");
  }
  if (networkNodes.filter(n => n.provider === "self-hosted").length === 0) {
    recommendations.push("Consider adding self-hosted nodes for better reliability and reduced third-party dependency.");
  }
  if (!networkNodes.some(n => n.wsUrl)) {
    recommendations.push("No WebSocket endpoints configured. Add WebSocket URLs for real-time event subscriptions.");
  }

  let overallStatus: NodeStatus;
  if (healthScore >= 80) overallStatus = "healthy";
  else if (healthScore >= 50) overallStatus = "degraded";
  else overallStatus = "offline";

  const report: NetworkHealthReport = {
    networkId,
    networkName: network.name,
    overallStatus,
    nodes: nodeResults.map(r => ({
      nodeId: r.nodeId,
      nodeName: nodes.get(r.nodeId)?.name ?? "Unknown",
      status: r.status,
      latencyMs: r.latencyMs,
      blockHeight: r.blockHeight,
      isPrimary: nodes.get(r.nodeId)?.isPrimary ?? false,
      isBehind: !r.isSynced,
      blocksBehind: highestBlock - r.blockHeight,
    })),
    averageLatencyMs: avgLatency,
    highestBlockHeight: highestBlock,
    lowestBlockHeight: lowestBlock,
    blockHeightSpread: highestBlock - lowestBlock,
    healthScore,
    recommendations,
    checkedAt: new Date().toISOString(),
  };

  healthReports.set(networkId, report);

  // Update network status
  const updatedNetwork = { ...network, status: overallStatus, activeNodeCount: healthyNodes.length };
  if (healthyNodes.length > 0) {
    updatedNetwork.latestBlockHeight = highestBlock;
    updatedNetwork.lastBlockAt = new Date().toISOString();
  }
  networks.set(networkId, updatedNetwork);

  return report;
}

/**
 * Get the latest health report for a network
 */
export async function getNetworkHealthReport(networkId: string): Promise<NetworkHealthReport | null> {
  return healthReports.get(networkId) ?? null;
}

/**
 * Trigger automatic failover when primary node goes down
 */
export async function triggerFailover(networkId: string, failedNodeId: string): Promise<NetworkFailoverEvent | null> {
  const network = networks.get(networkId);
  if (!network) return null;
  if (!network.config.failoverEnabled) return null;

  const failedNode = nodes.get(failedNodeId);
  if (!failedNode) return null;

  // Find the best failover candidate
  const candidates = Array.from(nodes.values())
    .filter(n => n.networkId === networkId && n.id !== failedNodeId && n.status === "healthy")
    .sort((a, b) => {
      // Sort by failover priority, then by latency
      if (a.failoverPriority !== b.failoverPriority) {
        return a.failoverPriority - b.failoverPriority;
      }
      return a.latencyMs - b.latencyMs;
    });

  if (candidates.length === 0) return null;

  const newPrimary = candidates[0];
  const now = new Date().toISOString();

  // Demote failed node
  const updatedFailedNode = { ...failedNode, isPrimary: false, status: "offline" as NodeStatus, updatedAt: now };
  nodes.set(failedNodeId, updatedFailedNode);

  // Promote new primary
  const updatedNewPrimary = { ...newPrimary, isPrimary: true, updatedAt: now };
  nodes.set(newPrimary.id, updatedNewPrimary);

  // Record failover event
  const event: NetworkFailoverEvent = {
    id: `fo_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    networkId,
    fromNodeId: failedNodeId,
    toNodeId: newPrimary.id,
    reason: `Primary node ${failedNode.name} went offline. Failover to ${newPrimary.name}.`,
    triggeredAt: now,
  };
  failoverEvents.push(event);

  // Update network
  updateNetworkStatus(networkId);

  return event;
}

/**
 * Get failover history for a network
 */
export async function getFailoverHistory(networkId: string, limit: number = 50): Promise<NetworkFailoverEvent[]> {
  return failoverEvents
    .filter(e => e.networkId === networkId)
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, limit);
}

/**
 * Get the best available RPC endpoint for a network (with load balancing)
 */
export async function getBestRpcEndpoint(networkId: string): Promise<{
  nodeId: string;
  rpcUrl: string;
  wsUrl?: string;
  provider: NodeProvider;
  latencyMs: number;
} | null> {
  const network = networks.get(networkId);
  if (!network) return null;

  const healthyNodes = Array.from(nodes.values())
    .filter(n => n.networkId === networkId && n.status === "healthy");

  if (healthyNodes.length === 0) return null;

  let selectedNode: BlockchainNode;

  switch (network.config.loadBalancing) {
    case "round-robin": {
      // Simple round-robin based on last used index
      const index = Math.floor(Math.random() * healthyNodes.length);
      selectedNode = healthyNodes[index];
      break;
    }
    case "latency-based": {
      selectedNode = healthyNodes.sort((a, b) => a.latencyMs - b.latencyMs)[0];
      break;
    }
    case "priority-based":
    default: {
      // Prefer primary node, then by failover priority
      const primary = healthyNodes.find(n => n.isPrimary);
      selectedNode = primary ?? healthyNodes.sort((a, b) => a.failoverPriority - b.failoverPriority)[0];
      break;
    }
  }

  return {
    nodeId: selectedNode.id,
    rpcUrl: selectedNode.rpcUrl,
    wsUrl: selectedNode.wsUrl,
    provider: selectedNode.provider,
    latencyMs: selectedNode.latencyMs,
  };
}

/**
 * Get network statistics summary
 */
export async function getBlockchainNetworkStats(organizationId: string): Promise<{
  totalNetworks: number;
  networksByType: Record<string, number>;
  networksByEnvironment: Record<string, number>;
  networksByStatus: Record<string, number>;
  totalNodes: number;
  nodesByProvider: Record<string, number>;
  nodesByStatus: Record<string, number>;
  averageHealthScore: number;
  totalFailoverEvents: number;
  networksRequiringAttention: string[];
}> {
  const allNetworks = Array.from(networks.values()).filter(
    n => n.organizationId === organizationId
  );
  const allNodes = Array.from(nodes.values()).filter(
    n => n.organizationId === organizationId
  );

  const networksByType: Record<string, number> = {};
  const networksByEnvironment: Record<string, number> = {};
  const networksByStatus: Record<string, number> = {};
  const nodesByProvider: Record<string, number> = {};
  const nodesByStatus: Record<string, number> = {};
  const networksRequiringAttention: string[] = [];

  for (const network of allNetworks) {
    networksByType[network.blockchainType] = (networksByType[network.blockchainType] || 0) + 1;
    networksByEnvironment[network.environment] = (networksByEnvironment[network.environment] || 0) + 1;
    networksByStatus[network.status] = (networksByStatus[network.status] || 0) + 1;

    const report = healthReports.get(network.id);
    if (report && report.healthScore < 70) {
      networksRequiringAttention.push(network.name);
    }
  }

  for (const node of allNodes) {
    nodesByProvider[node.provider] = (nodesByProvider[node.provider] || 0) + 1;
    nodesByStatus[node.status] = (nodesByStatus[node.status] || 0) + 1;
  }

  const healthScores = Array.from(healthReports.values())
    .filter(r => allNetworks.some(n => n.id === r.networkId))
    .map(r => r.healthScore);
  
  const averageHealthScore = healthScores.length > 0
    ? Math.round(healthScores.reduce((sum, s) => sum + s, 0) / healthScores.length)
    : 0;

  const orgFailoverEvents = failoverEvents.filter(
    e => allNetworks.some(n => n.id === e.networkId)
  );

  return {
    totalNetworks: allNetworks.length,
    networksByType,
    networksByEnvironment,
    networksByStatus,
    totalNodes: allNodes.length,
    nodesByProvider,
    nodesByStatus,
    averageHealthScore,
    totalFailoverEvents: orgFailoverEvents.length,
    networksRequiringAttention,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function updateNetworkStatus(networkId: string): void {
  const network = networks.get(networkId);
  if (!network) return;

  const networkNodes = Array.from(nodes.values()).filter(
    n => n.networkId === networkId
  );
  const healthyCount = networkNodes.filter(n => n.status === "healthy").length;
  
  let status: NodeStatus;
  if (healthyCount === 0) status = "offline";
  else if (healthyCount < networkNodes.length / 2) status = "degraded";
  else status = "healthy";

  const updated = {
    ...network,
    status,
    activeNodeCount: healthyCount,
    nodeCount: networkNodes.length,
    updatedAt: new Date().toISOString(),
  };
  networks.set(networkId, updated);
}
