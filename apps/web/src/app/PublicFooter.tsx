import { Link } from "react-router-dom";
import { GlobalBrandingFooter } from "./GlobalBrandingFooter";
import { useSitePublic } from "@/lib/useSitePublic";

export function PublicFooter() {
  const site = useSitePublic();
  const cols = [
    {
      title: "Product",
      links: [
        { to: "/features", label: "Features" },
        { to: "/workforce", label: "AI Workforce" },
        { to: "/pricing", label: "Pricing" },
        { to: "/how-it-works", label: "How it works" },
      ],
    },
    {
      title: "Developers",
      links: [
        { to: "/developers", label: "Developer portal" },
        { to: "/docs", label: "API reference" },
        { to: "/docs?section=webhooks", label: "Webhooks" },
        { to: "https://github.com", label: "GitHub" },
      ],
    },
    {
      title: "Company",
      links: [
        { to: "/blog", label: "Blog" },
        { to: "/support", label: "Support" },
        { to: "/legal?doc=terms", label: "Terms" },
        { to: "/legal?doc=privacy", label: "Privacy" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/5 mt-16 bg-bg-dark/60">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <img src={site.brand.logo} alt="WINDELS" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-semibold text-text-bright">WINDELS AI OS</span>
          </div>
          <p className="text-sm text-text-muted mt-3 max-w-sm">The enterprise operating system for AI workforces. Build, deploy, and govern intelligent agents across your organization.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs uppercase tracking-widest text-text-muted mb-3">{c.title}</div>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-sm text-slate-300 hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <GlobalBrandingFooter />
      <div className="px-6 pb-5 flex flex-wrap gap-4 text-xs text-text-muted justify-end">
        <Link to="/legal?doc=terms" className="hover:text-white">Terms</Link>
        <Link to="/legal?doc=privacy" className="hover:text-white">Privacy</Link>
        <Link to="/legal?doc=cookies" className="hover:text-white">Cookies</Link>
        <Link to="/legal?doc=security" className="hover:text-white">Security</Link>
      </div>
    </footer>
  );
}
