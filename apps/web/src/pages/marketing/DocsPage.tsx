import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { DOC_SECTIONS } from "@/lib/docs";
import type { DocBlock } from "@/lib/docs";

export default function DocsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const firstId = DOC_SECTIONS[0]!.id;
  const active = params.get("section") ?? firstId;

  useEffect(() => {
    if (!params.get("section")) setParams({ section: firstId }, { replace: true });
    // eslint-disable-next-line
  }, []);

  const section = useMemo(() => DOC_SECTIONS.find(s => s.id === active) ?? DOC_SECTIONS[0]!, [active]);
  const filteredSections = useMemo(() => {
    if (!search) return DOC_SECTIONS;
    const q = search.toLowerCase();
    return DOC_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.blocks.some(b => 'text' in b && String(b.text).toLowerCase().includes(q))
    );
  }, [search]);

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-bright">Documentation</h1>
          <p className="text-sm text-text-muted mt-1">Everything you need to build on WINDELS AI OS.</p>
          <div className="mt-4 max-w-md"><Input placeholder="Search docs…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        <div className="grid md:grid-cols-[240px_1fr] gap-8">
          <nav className="space-y-1 sticky top-20 self-start">
            {filteredSections.map(s => (
              <Link
                key={s.id}
                to={`/docs?section=${s.id}`}
                className={cn(
                  "block px-3 py-2 rounded-md text-sm transition-colors",
                  s.id === active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >{s.title}</Link>
            ))}
          </nav>
          <Card>
            <CardContent className="p-8 max-w-3xl">
              <h2 className="text-2xl font-bold text-text-bright">{section.title}</h2>
              <p className="text-text-muted mt-1 mb-6">{section.description}</p>
              <div className="space-y-4">
                {section.blocks.map((b, i) => <Block key={i} b={b}/>)}
              </div>
              <div className="mt-10 pt-6 border-t border-white/5 flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => {
                  const idx = DOC_SECTIONS.findIndex(s=>s.id===active);
                  if (idx>0) setParams({section:DOC_SECTIONS[idx-1]!.id});
                }}>← Previous</Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const idx = DOC_SECTIONS.findIndex(s=>s.id===active);
                  if (idx<DOC_SECTIONS.length-1) setParams({section:DOC_SECTIONS[idx+1]!.id});
                }}>Next →</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.type) {
    case "h2": return <h3 className="text-xl font-semibold text-text-bright pt-4">{b.text}</h3>;
    case "h3": return <h4 className="text-lg font-semibold text-text-bright pt-2">{b.text}</h4>;
    case "p": return <p className="text-sm text-text-main leading-relaxed">{b.text}</p>;
    case "ul": return <ul className="list-disc list-inside text-sm text-text-main space-y-1">{b.items.map((it,i)=><li key={i}>{it}</li>)}</ul>;
    case "code": return <pre className="bg-black/60 border border-white/10 rounded p-4 overflow-x-auto text-xs font-mono text-slate-200"><code>{b.text}</code></pre>;
    case "callout": return (
      <div className={cn("rounded-md border px-4 py-3 text-sm",
        b.tone==="warn"?"border-amber/40 bg-amber/10 text-amber":
        b.tone==="success"?"border-emerald/40 bg-emerald/10 text-emerald-200":
        "border-azure/40 bg-azure/10 text-azure-200")}>
        {b.text}
      </div>
    );
  }
}
