import { Link, NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

const links = [
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/workforce", label: "Workforce" },
  { to: "/agents", label: "Agents" },
  { to: "/pricing", label: "Pricing" },
  { to: "/faq", label: "FAQ" },
  { to: "/docs", label: "Docs" },
  { to: "/contact", label: "Contact" },
];

export function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-bg-dark/80 backdrop-blur-xl app-sticky-top">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/logo-icon.png" alt="WINDELS" className="h-9 w-9 rounded-lg object-cover" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-text-bright tracking-tight">WINDELS</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">AI OS</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                isActive ? "text-white bg-white/10" : "text-slate-300 hover:text-white hover:bg-white/5"
              )}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/auth/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/auth/register"><Button size="sm">Start free</Button></Link>
        </div>
      </div>
    </header>
  );
}
