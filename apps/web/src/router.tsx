import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppLayout } from "./app/Layout";
import { useAuthStore } from "./store/auth";
import { Spinner } from "./components/ui/Skeleton";

const LoginPage = lazy(() => import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const UserDashboard = lazy(() => import("./pages/dashboard/UserDashboard").then((m) => ({ default: m.UserDashboard })));
const AdminDashboard = lazy(() => import("./pages/dashboard/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const SuperAdminDashboard = lazy(() => import("./pages/dashboard/SuperAdminDashboard").then((m) => ({ default: m.SuperAdminDashboard })));
const ChatPage = lazy(() => import("./pages/chat/ChatPage").then((m) => ({ default: m.ChatPage })));
const AgentsPage = lazy(() => import("./pages/agents/AgentsPage"));
const CanvasPage = lazy(() => import("./pages/canvas/CanvasPage"));
const TalkPage = lazy(() => import("./pages/talk/TalkPage").then((m) => ({ default: m.default })));
const WorkflowPage = lazy(() => import("./pages/workflow/WorkflowPage"));
const NotFoundPage = lazy(() => import("./pages/errors/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const DeveloperPage = lazy(() => import("./pages/developers/DeveloperPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const AnalyticsPage = lazy(() => import("./pages/analytics/AnalyticsPage"));
const TradingIntelPage = lazy(() => import("./pages/trading/TradingIntelPage").then((m) => ({ default: m.TradingIntelPage })));
const VoiceStudioPage = lazy(() => import("./pages/voice/VoiceStudioPage").then((m) => ({ default: m.VoiceStudioPage })));
const MediaFactoryPage = lazy(() => import("./pages/media/MediaFactoryPage").then((m) => ({ default: m.MediaFactoryPage })));
const LearnPage = lazy(() => import("./pages/learn/LearnPage").then((m) => ({ default: m.LearnPage })));
const ProjectsPage = lazy(() => import("./pages/projects/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const LeadsPage = lazy(() => import("./pages/leads/LeadsPage").then((m) => ({ default: m.LeadsPage })));
const EnterprisePage = lazy(() => import("./pages/admin/EnterprisePage"));
const GovernancePage = lazy(() => import("./pages/admin/GovernancePage"));
const PlatformPage = lazy(() => import("./pages/admin/PlatformPage"));
const SecurityPage = lazy(() => import("./pages/admin/SecurityPage"));
const MarketingLayout = lazy(() => import("./pages/marketing/Layout").then((m) => ({ default: m.MarketingLayout })));
const LandingPage = lazy(() => import("./pages/marketing/LandingPage"));
const MarketingPricing = lazy(() => import("./pages/marketing/PricingPage"));
const MarketingEnterprise = lazy(() => import("./pages/marketing/EnterprisePage"));
const MarketingDevelopers = lazy(() => import("./pages/marketing/DevelopersPage"));
const MarketingDocs = lazy(() => import("./pages/marketing/DocsPage"));
const MarketingBlog = lazy(() => import("./pages/marketing/BlogPage"));
const MarketingSupport = lazy(() => import("./pages/marketing/SupportPage"));
const MarketingLegal = lazy(() => import("./pages/marketing/LegalPage"));

// Mobile (Session 15)
const MobileShell = lazy(() => import("./app/mobile/MobileShell").then((m) => ({ default: m.MobileShell })));
const MobileAuthPage = lazy(() => import("./pages/mobile/MobileAuthPage").then((m) => ({ default: m.MobileAuthPage })));
const MobileHomePage = lazy(() => import("./pages/mobile/MobileHomePage").then((m) => ({ default: m.MobileHomePage })));
const MobileChatListPage = lazy(() => import("./pages/mobile/MobileChatListPage").then((m) => ({ default: m.MobileChatListPage })));
const MobileChatPage = lazy(() => import("./pages/mobile/MobileChatPage").then((m) => ({ default: m.MobileChatPage })));
const MobileAgentsPage = lazy(() => import("./pages/mobile/MobileAgentsPage").then((m) => ({ default: m.MobileAgentsPage })));
const MobileFilesPage = lazy(() => import("./pages/mobile/MobileFilesPage").then((m) => ({ default: m.MobileFilesPage })));
const MobileNotificationsPage = lazy(() => import("./pages/mobile/MobileNotificationsPage").then((m) => ({ default: m.MobileNotificationsPage })));
const MobileMeetingsPage = lazy(() => import("./pages/mobile/MobileMeetingsPage").then((m) => ({ default: m.MobileMeetingsPage })));
const MobileMeetingRoomPage = lazy(() => import("./pages/mobile/MobileMeetingRoomPage").then((m) => ({ default: m.MobileMeetingRoomPage })));
const MobileSettingsPage = lazy(() => import("./pages/mobile/MobileSettingsPage").then((m) => ({ default: m.MobileSettingsPage })));
const MobileProfilePage = lazy(() => import("./pages/mobile/MobileProfilePage").then((m) => ({ default: m.MobileProfilePage })));
const MobileOfflinePage = lazy(() => import("./pages/mobile/MobileOfflinePage").then((m) => ({ default: m.MobileOfflinePage })));

// Desktop (Session 16)
const DesktopHomePage = lazy(() => import("./pages/desktop/DesktopHomePage").then((m) => ({ default: m.DesktopHomePage })));
const DesktopLayout = lazy(() => import("./app/desktop/DesktopLayout").then((m) => ({ default: m.DesktopLayout })));

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  // If this is a standalone PWA install or viewport is mobile-width, route to the mobile shell.
  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const mobileTarget = user ? "/m" : "/m/auth";
  if (isStandalone || isMobile) return <Navigate to={mobileTarget} replace />;
  return <Navigate to={user ? "/app" : "/home"} replace />;
}

function PageLoader() {
  return (
    <div className="h-[calc(100vh-56px)] grid place-items-center text-text-muted">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={22} />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}
function MobileSplash() {
  return (
    <div className="h-screen w-screen bg-bg-deep grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-azure-500 to-violet-500 grid place-items-center text-white font-black text-4xl shadow-2xl shadow-azure-500/30">W</div>
        <span className="text-text-muted text-sm tracking-widest">WINDELS</span>
      </div>
    </div>
  );
}
function withSuspense(children: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function ProtectedRoute({
  children,
  minRole,
}: {
  children: React.ReactNode;
  minRole?: "user" | "admin" | "super_admin";
}) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/login" replace />;
  const hierarchy = { user: 0, admin: 50, super_admin: 100 } as const;
  if (minRole && hierarchy[user.role] < hierarchy[minRole]) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

const Placeholder = ({ title, description }: { title: string; description: string }) => (
  <div className="max-w-2xl">
    <h1 className="text-2xl font-bold text-text-bright">{title}</h1>
    <p className="text-text-muted mt-2">{description}</p>
    <p className="text-xs text-text-muted mt-6">
      This module ships in a later session per the roadmap.
    </p>
  </div>
);
const placeholder = (title: string, description: string) => (
  <Placeholder title={title} description={description} />
);

export const router = createBrowserRouter([
  { path: "/", element: <HomeRedirect/> },
  // Marketing website (public, no auth)
  {
    path: "/home",
    element: withSuspense(<MarketingLayout/>),
    children: [
      { index: true, element: withSuspense(<LandingPage/>) },
    ],
  },
  { path: "/pricing", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingPricing/>) }] },
  { path: "/enterprise", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingEnterprise/>) }] },
  { path: "/developers", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingDevelopers/>) }] },
  { path: "/docs", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingDocs/>) }] },
  { path: "/blog", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingBlog/>) }] },
  { path: "/blog/:slug", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingBlog/>) }] },
  { path: "/support", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingSupport/>) }] },
  { path: "/legal", element: withSuspense(<MarketingLayout/>), children: [{ index: true, element: withSuspense(<MarketingLegal/>) }] },
  { path: "/changelog", element: <Navigate to="/blog/launch-notes-july" replace /> },
  { path: "/auth/login", element: withSuspense(<LoginPage />) },
  { path: "/auth/register", element: withSuspense(<RegisterPage />) },
  { path: "/auth/forgot", element: placeholder("Password reset", "Password reset flow is implemented when auth is hardened in later slices.") },

  // Desktop App (/d/*) — Session 16
  {
    path: "/d",
    element: (
      <ProtectedRoute minRole="user">
        <Suspense fallback={<PageLoader />}>
          <DesktopLayout />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<DesktopHomePage />) },
      { path: "chat", element: withSuspense(<ChatPage />) },
      { path: "workflow", element: withSuspense(<WorkflowPage />) },
      { path: "canvas", element: withSuspense(<CanvasPage />) },
      { path: "settings", element: withSuspense(<SettingsPage />) },
    ],
  },

  // Mobile PWA (/m/*) — Session 15
  { path: "/m/auth", element: withSuspense(<MobileAuthPage mode="login" />) },
  { path: "/m/auth/register", element: withSuspense(<MobileAuthPage mode="register" />) },
  {
    path: "/m",
    element: (
      <ProtectedRoute minRole="user">
        <Suspense fallback={<MobileSplash />}><MobileShell /></Suspense>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<MobileHomePage />) },
      { path: "chat", element: withSuspense(<MobileChatListPage />) },
      { path: "chat/:id", element: withSuspense(<MobileChatPage />) },
      { path: "agents", element: withSuspense(<MobileAgentsPage />) },
      { path: "files", element: withSuspense(<MobileFilesPage />) },
      { path: "notifications", element: withSuspense(<MobileNotificationsPage />) },
      { path: "talk", element: withSuspense(<MobileMeetingsPage />) },
      { path: "talk/meetings", element: withSuspense(<MobileMeetingsPage />) },
      { path: "meetings", element: <Navigate to="/m/talk/meetings" replace /> },
      { path: "meetings/:id", element: withSuspense(<MobileMeetingRoomPage />) },
      { path: "settings", element: withSuspense(<MobileSettingsPage />) },
      { path: "profile", element: withSuspense(<MobileProfilePage />) },
      { path: "offline", element: withSuspense(<MobileOfflinePage />) },
    ],
  },
  {
    path: "/app",
    element: (
      <ProtectedRoute minRole="user">
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<UserDashboard />) },
      { path: "workforce", element: withSuspense(<AgentsPage />) },
      { path: "canvas", element: withSuspense(<CanvasPage />) },
      { path: "canvas/:id", element: withSuspense(<CanvasPage />) },
      { path: "workspace", element: placeholder("Universal Workspace (full)", "Session 2 builds the complete dashboard.") },
      { path: "chat", element: withSuspense(<ChatPage />) },
      { path: "chat/:id", element: withSuspense(<ChatPage />) },
      { path: "talk", element: withSuspense(<TalkPage />) },
      { path: "flow", element: withSuspense(<WorkflowPage />) },
      { path: "flow/:id", element: withSuspense(<WorkflowPage />) },
      { path: "analytics", element: withSuspense(<AnalyticsPage />) },
      { path: "trading", element: withSuspense(<TradingIntelPage />) },
      { path: "voice", element: withSuspense(<VoiceStudioPage />) },
      { path: "media", element: withSuspense(<MediaFactoryPage />) },
      { path: "learn", element: withSuspense(<LearnPage />) },
      { path: "projects", element: withSuspense(<ProjectsPage />) },
      { path: "leads", element: withSuspense(<LeadsPage />) },
      { path: "developers", element: withSuspense(<DeveloperPage />) },
      { path: "files", element: placeholder("Files", "File storage comes online in later sessions.") },
      { path: "settings", element: withSuspense(<SettingsPage />) },
      { path: "enterprise", element: withSuspense(<EnterprisePage />) },
      { path: "governance", element: withSuspense(<GovernancePage />) },
      { path: "platform", element: withSuspense(<PlatformPage />) },
      { path: "security", element: withSuspense(<SecurityPage />) },
    ],
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute minRole="admin">
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<AdminDashboard />) },
      { path: "governance", element: withSuspense(<GovernancePage />) },
      { path: "platform", element: withSuspense(<PlatformPage />) },
      { path: "security", element: withSuspense(<SecurityPage />) },
    ],
  },
  {
    path: "/platform",
    element: (
      <ProtectedRoute minRole="super_admin">
        <AppShell />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: withSuspense(<SuperAdminDashboard />) }],
  },
  { path: "*", element: withSuspense(<NotFoundPage />) },
]);
