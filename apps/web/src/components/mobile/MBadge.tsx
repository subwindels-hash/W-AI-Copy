import { cn } from "@/lib/cn";
export function MBadge({ count, dot = false, tone = "crimson", className }: { count?: number; dot?: boolean; tone?: "azure" | "crimson" | "emerald" | "amber"; className?: string }) {
  if (dot) {
    return <span className={cn("inline-block h-2 w-2 rounded-full bg-crimson", className)} />;
  }
  if (!count || count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white leading-none",
        tone === "azure" && "bg-azure-500",
        tone === "crimson" && "bg-crimson",
        tone === "emerald" && "bg-emerald-500",
        tone === "amber" && "bg-amber-500",
        className
      )}
    >{display}</span>
  );
}
