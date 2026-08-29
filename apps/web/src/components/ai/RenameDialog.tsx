import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const MAX_TITLE = 200;

interface Props {
  open: boolean;
  currentTitle: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void> | void;
}

/**
 * Inline rename modal for a conversation. Validates the title (non-empty,
 * length-capped), supports Enter to save / Escape to cancel, and preserves the
 * conversation id — the backend PATCH only updates the title column.
 */
export function RenameDialog({ open, currentTitle, onClose, onSave }: Props) {
  const [value, setValue] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTitle);
      setError(null);
      setSaving(false);
      // select-on-focus for a fast overwrite
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, currentTitle]);

  async function save() {
    const title = value.trim();
    if (!title) { setError("Title cannot be empty."); return; }
    if (title.length > MAX_TITLE) { setError(`Title must be ${MAX_TITLE} characters or fewer.`); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(title);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to rename conversation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename chat"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving} disabled={!value.trim()}>Save</Button>
        </>
      }
    >
      <label className="block text-xs text-text-muted mb-1.5">Chat title</label>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onClose();
        }}
        maxLength={MAX_TITLE}
        aria-label="Chat title"
        className="h-10 w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-text-main placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure/50"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-crimson">{error ?? ""}</span>
        <span className="text-[11px] text-text-muted">{value.length}/{MAX_TITLE}</span>
      </div>
    </Modal>
  );
}
