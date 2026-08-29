/** Shared Session 86 branding footer. Keep wording centralized and year dynamic. */
export function GlobalBrandingFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`border-t border-white/5 text-xs text-text-muted ${compact ? "px-4 py-3" : "px-6 py-3"}`}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span>Proudly Powered by WIL.®</span>
        <span>© {new Date().getFullYear()} WINDELS AI OS</span>
      </div>
    </footer>
  );
}
