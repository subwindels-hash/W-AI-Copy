import type { FlowEdge, FlowNode } from "@/lib/workflow";

const NODE_W = 220;
const NODE_H = 86;

function outAnchor(n: FlowNode) {
  return { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
}
function inAnchor(n: FlowNode) {
  return { x: n.x, y: n.y + NODE_H / 2 };
}
function bezier(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

const statusColor: Record<string, string> = {
  SUCCEEDED: "#10B981",
  FAILED: "#DC2626",
  RUNNING: "#3B82F6",
  WAITING_APPROVAL: "#F59E0B",
  SKIPPED: "#64748B",
  PENDING: "#475569",
  RETRYING: "#D946EF",
};

interface Props {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onDeleteEdge?: (id: string) => void;
  connectingFrom?: string | null;
  mousePos?: { x: number; y: number } | null;
  nodeStatuses?: Record<string, { status: string; error?: string | null }>;
}

export function FlowConnectionLayer({ nodes, edges, onDeleteEdge, connectingFrom, mousePos, nodeStatuses }: Props) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const W = 20000, H = 20000;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
        </marker>
        <marker id="flow-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
        </marker>
      </defs>
      {edges.map((e) => {
        const from = nodeMap.get(e.fromId);
        const to = nodeMap.get(e.toId);
        if (!from || !to) return null;
        const p1 = outAnchor(from);
        const p2 = inAnchor(to);
        const toStatus = nodeStatuses?.[e.toId]?.status;
        const stroke = toStatus ? statusColor[toStatus] ?? "#64748B" : "#64748B";
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 12 };
        return (
          <g key={e.id} style={{ pointerEvents: "auto" }}>
            <path d={bezier(p1, p2)} fill="none" stroke={stroke} strokeWidth={2} strokeOpacity={0.8} markerEnd={toStatus && toStatus !== "PENDING" ? "url(#flow-arrow-active)" : "url(#flow-arrow)"} />
            <path d={bezier(p1, p2)} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} onClick={() => onDeleteEdge?.(e.id)} />
            {e.label && (
              <g transform={`translate(${mid.x},${mid.y})`}>
                <rect x={-e.label.length * 3.4 - 8} y={-10} rx={4} width={e.label.length * 6.8 + 16} height={18} fill="#0F172A" stroke="rgba(255,255,255,0.15)" />
                <text x={0} y={3} textAnchor="middle" fill="#CBD5E1" fontSize={11}>{e.label}</text>
              </g>
            )}
            {e.condition && (
              <g transform={`translate(${mid.x},${mid.y + 14})`}>
                <rect x={-e.condition.length * 3.4 - 6} y={-9} rx={4} width={e.condition.length * 6.8 + 12} height={16} fill="#1E293B" stroke={e.condition === "true" ? "rgba(16,185,129,0.5)" : "rgba(220,38,38,0.5)"} />
                <text x={0} y={3} textAnchor="middle" fill={e.condition === "true" ? "#10B981" : "#F87171"} fontSize={10}>{e.condition}</text>
              </g>
            )}
          </g>
        );
      })}
      {connectingFrom && nodeMap.get(connectingFrom) && mousePos && (() => {
        const from = outAnchor(nodeMap.get(connectingFrom)!);
        return <path d={bezier(from, mousePos)} fill="none" stroke="#3B82F6" strokeWidth={2} strokeDasharray="6 4" />;
      })()}
    </svg>
  );
}
