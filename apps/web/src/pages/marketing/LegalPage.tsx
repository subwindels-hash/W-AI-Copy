import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { LEGAL_DOCS } from "@/lib/legal";

export default function LegalPage() {
  const [params, setParams] = useSearchParams();
  const firstId = LEGAL_DOCS[0]!.id;
  const [active, setActive] = useState(params.get("doc") ?? firstId);
  useEffect(() => {
    const d = params.get("doc");
    if (d && LEGAL_DOCS.find(x => x.id === d)) setActive(d);
    // eslint-disable-next-line
  }, [params]);
  function onTabChange(v: string) {
    setActive(v);
    setParams({ doc: v });
  }
  const doc = LEGAL_DOCS.find(d => d.id === active) ?? LEGAL_DOCS[0]!;
  return (
    <div className="py-14">
      <div className="max-w-4xl mx-auto px-6">
        <h1 className="text-3xl font-bold text-text-bright">Legal</h1>
        <p className="text-sm text-text-muted mt-1">Last updated {new Date(doc.updated).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}</p>
        <Tabs value={active} onValueChange={onTabChange} className="mt-6">
          <TabsList>
            {LEGAL_DOCS.map(d => <TabsTrigger key={d.id} value={d.id}>{d.title}</TabsTrigger>)}
          </TabsList>
          {LEGAL_DOCS.map(d => (
            <TabsContent key={d.id} value={d.id}>
              <Card><CardContent className="p-8 space-y-5">
                <h2 className="text-2xl font-bold text-text-bright">{d.title}</h2>
                {d.sections.map(s => (
                  <section key={s.heading}>
                    <h3 className="font-semibold text-text-bright mb-1">{s.heading}</h3>
                    {Array.isArray(s.body) ? (
                      <ul className="list-disc list-inside text-sm text-text-main space-y-1">{s.body.map((b,i)=> <li key={i}>{b}</li>)}</ul>
                    ) : (
                      <p className="text-sm text-text-main leading-relaxed">{s.body}</p>
                    )}
                  </section>
                ))}
              </CardContent></Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
