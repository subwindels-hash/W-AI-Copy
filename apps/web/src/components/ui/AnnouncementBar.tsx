import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { siteApi, type SpAnnouncement } from "@/lib/sitePlatform";

const APP_PREFIXES = ["/app", "/admin", "/platform", "/m", "/d"];

function isPublicPath(pathname: string) {
  return !APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AnnouncementBar() {
  const loc = useLocation();
  const [item, setItem] = useState<SpAnnouncement | null>(null);

  useEffect(() => {
    void siteApi.announcement().then(setItem).catch(() => setItem(null));
  }, []);

  const show = Boolean(item) && isPublicPath(loc.pathname);
  useEffect(() => {
    document.documentElement.style.setProperty("--announcement-bar-height", show ? "36px" : "0px");
    return () => document.documentElement.style.setProperty("--announcement-bar-height", "0px");
  }, [show]);

  if (!show || !item) return null;
  const text = item.message;
  const inner = item.link ? (
    <a href={item.link} className="underline-offset-2 hover:underline">
      {text}
    </a>
  ) : (
    text
  );

  return (
    <div
      className="announcement-bar fixed top-[var(--sat)] left-0 right-0 z-[300] shrink-0 bg-white text-black border-b border-black/10 overflow-hidden"
      role="region"
      aria-label="Announcements"
    >
      <div className={`announcement-track ${item.animationEnabled ? "" : "announcement-track-static"}`}>
        <span className="announcement-copy">{inner}</span>
        {item.animationEnabled ? <span className="announcement-copy" aria-hidden="true">{text}</span> : null}
      </div>
    </div>
  );
}

export default AnnouncementBar;
