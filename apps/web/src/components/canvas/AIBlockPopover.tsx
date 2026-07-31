import { useState } from "react";
import type { CanvasBlock } from "@/lib/canvas";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function AIBlockPopover({ x, y, block, onClose, onGenerate }: {
  x: number; y: number; block: CanvasBlock; onClose: () => void; onGenerate: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState((block.content as any)?.prompt ?? "");
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <Card className="absolute p-4 w-80 space-y-3 shadow-2xl"
        style={{ left: Math.min(x, window.innerWidth - 340), top: Math.min(y, window.innerHeight - 320) }}
        onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-text-bright text-sm">✨ Generate with AI</h3>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
          autoFocus
          placeholder="Describe what you want generated (e.g. 'Summarize Q3 priorities in 3 bullets')"
          className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-sm text-text-main resize-none focus:outline-none focus:ring-2 focus:ring-violet/40" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => prompt.trim() && onGenerate(prompt)} disabled={!prompt.trim()}>Generate</Button>
        </div>
      </Card>
    </div>
  );
}
