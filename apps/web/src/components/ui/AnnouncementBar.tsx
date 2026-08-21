const MESSAGES = [
  "WINDELS AI OS — the operating system for intelligent work.",
  "New: agents, workflows, and Talk in one workspace.",
  "Start free · Scale to enterprise · API-first.",
  "Security, governance, and audit built in.",
];

export function AnnouncementBar() {
  const text = MESSAGES.join("   ·   ");
  return (
    <div
      className="announcement-bar shrink-0 bg-white text-black border-b border-black/10 overflow-hidden"
      role="region"
      aria-label="Announcements"
    >
      <div className="announcement-track">
        <span className="announcement-copy">{text}</span>
        <span className="announcement-copy" aria-hidden="true">
          {text}
        </span>
      </div>
    </div>
  );
}

export default AnnouncementBar;
