import { useEffect, useState } from "react";
import { Maximize2, Minus, X, Coffee } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDesktop } from "./hooks/useDesktop";

/**
 * Custom titlebar for frameless/titleBarStyle:hiddenInset Electron windows.
 * Provides a draggable region + min/max/close controls that talk to the main
 * process via the `window.desktop` preload API.
 *
 * On macOS (hiddenInset), the native traffic-light controls occupy the left side,
 * so we only render the right-side controls when NOT on macOS.
 */
export function DesktopTitleBar() {
  const d = useDesktop();
  const [maximized, setMaximized] = useState(false);
  const [platform, setPlatform] = useState<string>("web");

  useEffect(() => {
    if (!d) return;
    d.app.info().then((i) => setPlatform(i.platform));
  }, [d]);

  if (!d) return null;

  const isMac = platform === "darwin";

  return (
    <div
      className={cn(
        "h-10 bg-bg-dark/95 border-b border-white/5 flex items-center select-none app-drag",
        isMac ? "pl-20 pr-2" : "pl-4 pr-2"
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium">
        <span className="h-5 w-5 rounded-md bg-gradient-to-br from-azure-500 to-violet-500 grid place-items-center text-white text-[10px] font-black">W</span>
        <span>WINDELS AI OS</span>
      </div>
      <div className="flex-1" />
      {!isMac && (
        <div className="flex items-center h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <TitleBtn onClick={() => d.window.minimize()} title="Minimize">
            <Minus size={14} />
          </TitleBtn>
          <TitleBtn onClick={() => { d.window.toggleMaximize(); setMaximized((m) => !m); }} title={maximized ? "Restore" : "Maximize"}>
            {maximized ? <Coffee size={14} /> : <Maximize2 size={14} />}
          </TitleBtn>
          <TitleBtn onClick={() => d.window.close()} title="Close" danger>
            <X size={14} />
          </TitleBtn>
        </div>
      )}
    </div>
  );
}

function TitleBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-10 w-11 grid place-items-center text-text-muted hover:bg-white/5 transition",
        danger && "hover:bg-crimson hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
