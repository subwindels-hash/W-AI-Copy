import { useCallback, useEffect, useState } from "react";
import { languageApi } from "@/lib/languageLearning";
import type { LlDashboard } from "@/lib/languageLearning";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";

export function MobileLanguagesPage() {
  const [dash, setDash] = useState<LlDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setDash(await languageApi.dashboard()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="pb-8">
      <MobileTopBar title="Languages" subtitle="AI teacher" />
      <div className="px-4 pt-3 space-y-3">
        {err ? <div className="text-xs text-crimson">{err}</div> : null}
        <div className="rounded-2xl bg-azure/15 text-azure px-3 py-2 text-xs">{dash?.speech.note}</div>
        {(dash?.profiles ?? []).length === 0 ? (
          <div className="rounded-2xl border border-white/10 px-4 py-6 text-sm text-text-muted text-center">No languages yet. Open the desktop catalog or enroll below.</div>
        ) : dash!.profiles.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-bg-elevated px-4 py-3">
            <div className="flex justify-between">
              <div className="text-white font-semibold">{dash?.languages.find((l) => l.code === p.languageCode)?.name}</div>
              <div className="text-azure text-sm">{p.currentLevel}</div>
            </div>
            <div className="text-[11px] text-text-muted mt-1">{p.progress?.vocabularyKnown ?? 0} words · {p.progress?.lessonsCompleted ?? 0} lessons · streak {p.studyStreakDays}d</div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          {(dash?.languages ?? []).slice(0, 8).map((l) => (
            <button key={l.code} onClick={() => void languageApi.enroll({ languageCode: l.code, nativeLanguageCode: "en", explanationLanguageCode: "en", dailyMinutes: 20 }).then(load)} className="rounded-2xl border border-white/10 px-3 py-3 text-left">
              <div className="text-sm text-white">{l.name}</div>
              <div className="text-[11px] text-text-muted">{l.nativeName}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
