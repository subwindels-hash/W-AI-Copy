import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./styles/globals.css";
import { router } from "./router";
import { bootstrapAuth } from "./lib/bootstrap";
import { ToastHost } from "./lib/toast";
import { OfflineBanner } from "./components/ui/OfflineBanner";

function Root() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    bootstrapAuth().finally(() => setReady(true));
  }, []);
  if (!ready) {
    return (
      <div className="h-screen grid place-items-center bg-bg-deep text-text-muted relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_50%_30%,rgba(59,130,246,.12),transparent_60%)]" />
        <div className="flex flex-col items-center gap-4 relative">
          <img src="/brand/logo-icon.png" alt="WINDELS" className="h-16 w-16 rounded-2xl object-cover shadow-[0_0_40px_rgba(59,130,246,.45)] animate-pulse" />
          <div className="text-center">
            <div className="text-sm font-semibold tracking-[0.2em] text-text-bright">WINDELS</div>
            <div className="text-[10px] tracking-[0.35em] text-text-muted">AI OS</div>
          </div>
          <div className="h-1 w-32 rounded-full bg-white/10 overflow-hidden mt-2"><div className="h-full w-1/2 bg-gradient-to-r from-azure to-violet animate-[shimmer_1.4s_ease-in-out_infinite]" /></div>
          <span className="text-xs tracking-widest text-text-muted animate-pulse">BOOTING…</span>
        </div>
      </div>
    );
  }
  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
      <ToastHost />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
