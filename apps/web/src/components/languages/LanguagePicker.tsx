/**
 * WINDELS AI — fast, searchable language picker (Session 199).
 *
 * Designed to stay responsive with hundreds of languages:
 *  - fuzzy-ish substring search over name / native name / code / aliases
 *  - "Detect language" as the first option (when allowed)
 *  - Recently used + Favorites sections (persisted in localStorage)
 *  - native-language names and correct script rendering (RTL-aware)
 *  - full keyboard navigation (↑/↓/Enter/Esc) and ARIA roles
 *  - mobile + desktop friendly (portal-free dropdown that fits the trigger)
 *
 * The catalog itself comes from the backend registry — this component never
 * hard-codes languages.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Sparkles, Star, X } from "lucide-react";
import type { LlLanguage } from "@/lib/languageLearning";
import { cn } from "@/lib/cn";
import {
  DETECT_CODE, RECENTS_KEY, FAVS_KEY,
  buildRecents, toggleFavorite, buildPickerRows, selectableIndices,
  type PickerRow,
} from "./languageSelector";

export { DETECT_CODE };

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage may be unavailable */ }
}

export function pushRecentLanguage(code: string) {
  if (!code || code === DETECT_CODE) return;
  writeList(RECENTS_KEY, buildRecents(readList(RECENTS_KEY), code));
}

export interface LanguagePickerProps {
  languages: LlLanguage[];
  value: string; // code or DETECT_CODE
  onChange: (code: string) => void;
  allowDetect?: boolean;
  detectedLabel?: string | null; // when value===DETECT_CODE, show the detected language inline
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function LanguagePicker({
  languages,
  value,
  onChange,
  allowDetect = false,
  detectedLabel = null,
  label,
  placeholder = "Select language",
  className,
  disabled,
  id,
}: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFavs(readList(FAVS_KEY));
    setRecents(readList(RECENTS_KEY));
  }, [open]);

  const byCode = useMemo(() => {
    const m = new Map<string, LlLanguage>();
    for (const l of languages) m.set(l.code, l);
    return m;
  }, [languages]);

  const selected = value === DETECT_CODE ? null : byCode.get(value) ?? null;

  // Build the flat, ordered option list used for keyboard nav + rendering.
  type Row = PickerRow;

  const rows: Row[] = useMemo(
    () => buildPickerRows({ languages, query, favorites: favs, recents, allowDetect }),
    [allowDetect, languages, query, favs, recents],
  );

  const selectableIdxs = useMemo(() => selectableIndices(rows), [rows]);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setActiveIdx(selectableIdxs[0] ?? 0);
      // Focus the search box shortly after opening.
      const t = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(t);
    }
  }, [open, selectableIdxs]);

  const commit = useCallback((code: string) => { onChange(code); close(); }, [onChange, close]);

  const toggleFav = useCallback((code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavs((cur) => {
      const next = toggleFavorite(cur, code);
      writeList(FAVS_KEY, next);
      return next;
    });
  }, []);

  const moveActive = useCallback((dir: 1 | -1) => {
    setActiveIdx((cur) => {
      const pos = selectableIdxs.indexOf(cur);
      const nextPos = Math.max(0, Math.min(selectableIdxs.length - 1, (pos < 0 ? 0 : pos) + dir));
      const next = selectableIdxs[nextPos] ?? cur;
      // keep the active row in view
      window.requestAnimationFrame(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${next}"]`);
        el?.scrollIntoView({ block: "nearest" });
      });
      return next;
    });
  }, [selectableIdxs]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIdx];
      if (row?.kind === "detect") commit(DETECT_CODE);
      else if (row?.kind === "lang") { pushRecentLanguage(row.lang.code); commit(row.lang.code); }
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  const triggerLabel = value === DETECT_CODE
    ? (detectedLabel ? `Detect · ${detectedLabel}` : "Detect language")
    : selected
      ? selected.name
      : placeholder;

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      {label ? <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor={id}>{label}</label> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright",
          "hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-azure/60 transition disabled:opacity-50",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {value === DETECT_CODE ? <Sparkles className="h-4 w-4 shrink-0 text-azure" /> : null}
          <span className="truncate">{triggerLabel}</span>
          {selected && selected.nativeName !== selected.name ? (
            <span className="truncate text-text-muted" dir={selected.textDirection === "RTL" ? "rtl" : "ltr"}>· {selected.nativeName}</span>
          ) : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] rounded-lg border border-white/10 bg-bg-elevated shadow-xl" role="listbox">
          <div className="flex items-center gap-2 border-b border-white/10 p-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search languages…"
              className="w-full bg-transparent text-sm text-text-bright outline-none placeholder:text-text-muted"
              aria-label="Search languages"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-text-muted hover:text-text-bright">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div ref={listRef} className="max-h-72 overflow-auto py-1">
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">No languages match “{query}”.</div>
            ) : rows.map((row, i) => {
              if (row.kind === "header") {
                return <div key={`h-${i}`} className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{row.label}</div>;
              }
              if (row.kind === "detect") {
                const active = i === activeIdx;
                return (
                  <button
                    key="detect"
                    type="button"
                    data-row={i}
                    role="option"
                    aria-selected={value === DETECT_CODE}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => commit(DETECT_CODE)}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", active ? "bg-azure/15 text-azure" : "text-text-bright hover:bg-white/5")}
                  >
                    <Sparkles className="h-4 w-4 text-azure" />
                    <span className="flex-1">Detect language</span>
                    {value === DETECT_CODE ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              }
              const l = row.lang;
              const active = i === activeIdx;
              const isSel = l.code === value;
              const isFav = favs.includes(l.code);
              return (
                <div
                  key={l.code}
                  data-row={i}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => { pushRecentLanguage(l.code); commit(l.code); }}
                  className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 text-sm", active ? "bg-azure/15" : "hover:bg-white/5")}
                >
                  <button
                    type="button"
                    onClick={(e) => toggleFav(l.code, e)}
                    aria-label={isFav ? `Unfavorite ${l.name}` : `Favorite ${l.name}`}
                    className={cn("shrink-0", isFav ? "text-amber-400" : "text-text-muted/50 hover:text-text-muted")}
                  >
                    <Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-text-bright">
                    {l.name}
                    {!l.learningSupported ? <span className="ml-1 text-[10px] text-text-muted">· translate</span> : null}
                  </span>
                  {l.nativeName !== l.name ? (
                    <span className="max-w-[45%] truncate text-xs text-text-muted" dir={l.textDirection === "RTL" ? "rtl" : "ltr"}>{l.nativeName}</span>
                  ) : null}
                  {isSel ? <Check className="h-4 w-4 shrink-0 text-azure" /> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
