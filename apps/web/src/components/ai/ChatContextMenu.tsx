import { MoreHorizontal, Pin, PinOff, Share2, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import type { Conversation } from "@/lib/chat";

export interface ChatMenuHandlers {
  onPin: (c: Conversation) => void;
  onUnpin: (c: Conversation) => void;
  onShare: (c: Conversation) => void;
  onRename: (c: Conversation) => void;
  onArchive: (c: Conversation) => void;
  onUnarchive: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}

interface Props {
  conversation: Conversation;
  handlers: ChatMenuHandlers;
  stopPropagation?: boolean;
}

/**
 * The three-dot context menu for a conversation. The available actions depend
 * on the current state: archived chats offer Unarchive instead of Pin/Archive;
 * pinned chats offer Unpin instead of Pin.
 */
export function ChatContextMenu({ conversation, handlers, stopPropagation = true }: Props) {
  const c = conversation;
  const items = [];
  if (c.isArchived) {
    items.push({
      label: "Unarchive",
      icon: <ArchiveRestore className="h-4 w-4" />,
      onSelect: () => handlers.onUnarchive(c),
    });
  } else if (c.pinned) {
    items.push({
      label: "Unpin",
      icon: <PinOff className="h-4 w-4" />,
      onSelect: () => handlers.onUnpin(c),
    });
  } else {
    items.push({
      label: "Pin",
      icon: <Pin className="h-4 w-4" />,
      onSelect: () => handlers.onPin(c),
    });
  }
  items.push(
    { label: "Share", icon: <Share2 className="h-4 w-4" />, onSelect: () => handlers.onShare(c) },
    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onSelect: () => handlers.onRename(c) },
  );
  if (!c.isArchived) {
    items.push({ label: "Archive", icon: <Archive className="h-4 w-4" />, onSelect: () => handlers.onArchive(c) });
  }
  items.push({
    label: c.isArchived ? "Delete permanently" : "Delete",
    icon: <Trash2 className="h-4 w-4" />,
    danger: true,
    onSelect: () => handlers.onDelete(c),
  });

  return (
    <div
      onClick={(e) => { if (stopPropagation) e.stopPropagation(); }}
      className="shrink-0"
      aria-label={`Menu for ${c.title}`}
    >
      <Dropdown
        trigger={
          <button
            className="h-8 w-8 grid place-items-center rounded-lg text-text-muted hover:text-text-bright hover:bg-white/10 transition-colors"
            aria-label={`Actions for ${c.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
        items={items}
        align="end"
      />
    </div>
  );
}
