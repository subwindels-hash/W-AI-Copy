import { cn } from "@/lib/cn";

const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm", xl: "h-14 w-14 text-base" } as const;
const statusColors = { online: "bg-emerald-500", idle: "bg-slate-400", working: "bg-amber-400", error: "bg-crimson", offline: "bg-slate-600" } as const;

export function MAvatar({
  name, color = "#3B82F6", src, size = "md", status,
}: { name?: string; color?: string; src?: string; size?: keyof typeof sizes; status?: keyof typeof statusColors }) {
  const initials = (name ?? "W").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="relative inline-flex">
      {src ? (
        <img src={src} alt="" className={cn("rounded-full object-cover ring-2 ring-black/20", sizes[size])} />
      ) : (
        <span
          className={cn("rounded-full inline-flex items-center justify-center font-semibold text-white ring-2 ring-black/20", sizes[size])}
          style={{ background: `linear-gradient(135deg, ${color} 0%, rgba(0,0,0,.35) 100%)` }}
        >
          {initials}
        </span>
      )}
      {status && (
        <span className={cn("absolute bottom-0 right-0 rounded-full ring-2 ring-bg-dark h-2.5 w-2.5", statusColors[status])} />
      )}
    </span>
  );
}
