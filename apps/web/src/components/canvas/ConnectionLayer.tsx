import type { CanvasBlock, CanvasConnection } from "@/lib/canvas";
import { cn } from "@/lib/cn";

const colorStroke: Record<string, string> = {
  azure: "#3B82F6", violet: "#8B5CF6", teal: "#14B8A6", fuchsia: "#D946EF",
  amber: "#F59E0B", emerald: "#10B981", crimson: "#DC2626",
};

export function ConnectionLayer({
  blocks, connections, connectingFrom, onDeleteConnection,
}: {
  blocks: CanvasBlock[];
  connections: CanvasConnection[];
  connectingFrom: string | null;
  onDeleteConnection: (id: string) => void;
}) {
  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  function anchorCenter(b: CanvasBlock): { x: number; y: number } {
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  function anchorRight(b: CanvasBlock): { x: number; y: number } {
    return { x: b.x + b.width, y: b.y + b.height / 2 };
  }
  function anchorLeft(b: CanvasBlock): { x: number; y: number } {
    return { x: b.x, y: b.y + b.height / 2 };
  }

  // Generate bezier path between two points
  function bezier(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = Math.abs(to.x - from.x);
    const c1x = from.x + dx * 0.5;
    const c2x = to.x - dx * 0.5;
    return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
  }

  const W = 10000, H = 10000;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
        </marker>
        {Object.entries(colorStroke).map(([k, v]) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={v} />
          </marker>
        ))}
      </defs>
      {connections.map((c) => {
        const from = blockMap.get(c.fromId);
        const to = blockMap.get(c.toId);
        if (!from || !to) return null;
        const p1 = anchorRight(from);
        const p2 = anchorLeft(to);
        const stroke = colorStroke[c.color ?? ""] ?? "#94A3B8";
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        return (
          <g key={c.id} style={{ pointerEvents: "auto" }}>
            <path d={bezier(p1, p2)} fill="none" stroke={stroke} strokeWidth={2} strokeOpacity={0.7} markerEnd={`url(#arrow-${c.color ?? ""})`} />
            {/* hit area */}
            <path d={bezier(p1, p2)} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} onClick={() => onDeleteConnection(c.id)} />
            {c.label && (
              <g transform={`translate(${mid.x},${mid.y})`}>
                <rect x={-c.label.length * 3.4 - 6} y={-10} rx={4} width={c.label.length * 6.8 + 12} height={18} fill="#162033" stroke="rgba(255,255,255,0.1)" />
                <text x={0} y={3} textAnchor="middle" fill="#E2E8F0" fontSize={11}>{c.label}</text>
              </g>
            )}
          </g>
        );
      })}
      {connectingFrom && blockMap.get(connectingFrom) && (() => {
        const from = anchorRight(blockMap.get(connectingFrom)!);
        // Preview line to origin + pulse
        return <circle cx={from.x} cy={from.y} r={6} fill="#F59E0B" className="animate-pulse" />;
      })()}
    </svg>
  );
}
