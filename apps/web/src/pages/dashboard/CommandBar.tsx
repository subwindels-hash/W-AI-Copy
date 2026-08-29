import { useState } from "react";
import { Plus, CalendarClock, Upload } from "lucide-react";
import { useDashboard } from "@/lib/useDashboard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function CommandBar() {
  const [title, setTitle] = useState("");
  const createTask = useDashboard((s) => s.createTask);
  const loading = useDashboard((s) => s.loading);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask(title.trim());
    setTitle("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass p-2 flex items-center gap-2 rounded-2xl"
    >
      <div className="flex-1 flex items-center gap-2 px-3">
        <Plus className="h-4 w-4 text-text-muted" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task, ask Windels, or type a command…"
          className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-sm text-text-muted hover:bg-white/5">
          <CalendarClock className="h-4 w-4" /> Meeting
        </button>
        <button type="button" className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-sm text-text-muted hover:bg-white/5">
          <Upload className="h-4 w-4" /> Upload
        </button>
        <Button type="submit" size="sm" loading={loading} disabled={!title.trim()}>
          Create
        </Button>
      </div>
    </form>
  );
}
