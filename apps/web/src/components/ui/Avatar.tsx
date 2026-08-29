import { cn } from "@/lib/cn";

interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}

function initials(name?: string | null) {
  if (!name) return "W";
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export function Avatar({ name, url, size = 36, className, ring }: AvatarProps) {
  const style = { width: size, height: size } as const;
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? "avatar"}
        style={style}
        className={cn(
          "rounded-full object-cover",
          ring && "ring-2 ring-azure/40",
          className
        )}
      />
    );
  }
  return (
    <div
      style={style}
      className={cn(
        "rounded-full bg-gradient-to-br from-azure/80 to-violet/70 text-white font-semibold",
        "flex items-center justify-center text-sm",
        ring && "ring-2 ring-azure/40",
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
