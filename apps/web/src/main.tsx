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
      <div className="h-screen grid place-items-center bg-bg-deep text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-azure to-violet animate-pulse" />
          <span className="text-sm">Loading WINDELS AI OS…</span>
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
