export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-white/5 rounded-2xl rounded-bl-md w-fit">
      <div className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" />
      </div>
      <span className="text-xs text-text-muted">Thinking…</span>
    </div>
  );
}
