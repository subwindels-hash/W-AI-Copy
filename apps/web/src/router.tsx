import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppLayout } from "./app/Layout";
import { useAuthStore } from "./store/auth";
import { Spinner } from "./components/ui/Skeleton";

const LoginPage = lazy(() => import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const UserDashboard = lazy(() => import("./pages/dashboard/UserDashboard").then((m) => ({ default: m.UserDashboard })));
const AdminDashboard = lazy(() => import("./pages/dashboard/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminPage = lazy(() => import("./pages/admin/AdminPage").then((m) => ({ default: m.AdminPage })));
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
const VoiceConsolePage = lazy(() => import("./pages/voice/VoiceConsolePage").then((m) => ({ default: m.VoiceConsolePage })));
const MediaFactoryPage = lazy(() => import("./pages/media/MediaFactoryPage").then((m) => ({ default: m.MediaFactoryPage })));
const LearnPage = lazy(() => import("./pages/learn/LearnPage").then((m) => ({ default: m.LearnPage })));
const ProjectsPage = lazy(() => import("./pages/projects/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const LeadsPage = lazy(() => import("./pages/leads/LeadsPage").then((m) => ({ default: m.LeadsPage })));
const LeadPipelinePage = lazy(() => import("./pages/leads/LeadPipelinePage").then((m) => ({ default: m.LeadPipelinePage })));
const MfaAssurancePage = lazy(() => import("./pages/security/MfaAssurancePage").then((m) => ({ default: m.MfaAssurancePage })));
const MobileDevicesPage = lazy(() => import("./pages/mobile/MobileDevicesPage").then((m) => ({ default: m.MobileDevicesPage })));
const OpexAssurancePage = lazy(() => import("./pages/admin/OpexAssurancePage").then((m) => ({ default: m.OpexAssurancePage })));
const PromptTemplatesPage = lazy(() => import("./pages/admin/PromptTemplatesPage").then((m) => ({ default: m.PromptTemplatesPage })));
const PublicApiPage = lazy(() => import("./pages/admin/PublicApiPage").then((m) => ({ default: m.PublicApiPage })));
const SustainabilityPage = lazy(() => import("./pages/admin/SustainabilityPage").then((m) => ({ default: m.SustainabilityPage })));
const UsagePage = lazy(() => import("./pages/admin/UsagePage").then((m) => ({ default: m.UsagePage })));
const AiEngineeringPage = lazy(() => import("./pages/admin/AiEngineeringPage").then((m) => ({ default: m.AiEngineeringPage })));
const IdentityKnowledgePage = lazy(() => import("./pages/admin/IdentityKnowledgePage").then((m) => ({ default: m.IdentityKnowledgePage })));
const EventsPage = lazy(() => import("./pages/events/EventsPage").then((m) => ({ default: m.EventsPage })));
const WebhookInboxPage = lazy(() => import("./pages/webhook/WebhookInboxPage").then((m) => ({ default: m.WebhookInboxPage })));
const FilesPage = lazy(() => import("./pages/files/FilesPage").then((m) => ({ default: m.FilesPage })));
const AdsPage = lazy(() => import("./pages/advertising/AdsPage").then((m) => ({ default: m.AdsPage })));
const MusicStudioPage = lazy(() => import("./pages/music/MusicStudioPage").then((m) => ({ default: m.MusicStudioPage })));
const MusicVideoPage = lazy(() => import("./pages/media/MusicVideoPage").then((m) => ({ default: m.MusicVideoPage })));
const BrokerCommandCenterPage = lazy(() => import("./pages/trading/BrokerCommandCenterPage").then((m) => ({ default: m.BrokerCommandCenterPage })));
const TradingDashboardPage = lazy(() => import("./pages/trading/TradingDashboardPage").then((m) => ({ default: m.TradingDashboardPage })));
const MarketingDashboardPage = lazy(() => import("./pages/marketing/MarketingDashboardPage").then((m) => ({ default: m.MarketingDashboardPage })));
const EnterprisePage = lazy(() => import("./pages/admin/EnterprisePage"));
const GovernancePage = lazy(() => import("./pages/admin/GovernancePage"));
const PlatformPage = lazy(() => import("./pages/admin/PlatformPage"));
const SecurityPage = lazy(() => import("./pages/admin/SecurityPage"));
const TenantIsolationPage = lazy(() => import("./pages/admin/TenantIsolationPage").then((m) => ({ default: m.TenantIsolationPage })));
const CrmPage = lazy(() => import("./pages/crm/CrmPage").then((m) => ({ default: m.CrmPage })));
const EmailIntelPage = lazy(() => import("./pages/emailIntel/EmailIntelPage").then((m) => ({ default: m.EmailIntelPage })));
const ErpPage = lazy(() => import("./pages/erp/ErpPage").then((m) => ({ default: m.ErpPage })));
const RevenueGuardianPage = lazy(() => import("./pages/revenueGuardian/RevenueGuardianPage").then((m) => ({ default: m.RevenueGuardianPage })));
const VoiceWakeCenterPage = lazy(() => import("./pages/voiceWake/VoiceWakeCenterPage").then((m) => ({ default: m.VoiceWakeCenterPage })));
const WebsiteBuilderPage = lazy(() => import("./pages/websiteBuilder/WebsiteBuilderPage").then((m) => ({ default: m.WebsiteBuilderPage })));
const SocialPlatformPage = lazy(() => import("./pages/socialPlatform/SocialPlatformPage").then((m) => ({ default: m.SocialPlatformPage })));
const HelpdeskPage = lazy(() => import("./pages/helpdesk/HelpdeskPage").then((m) => ({ default: m.HelpdeskPage })));
const SoftwareFactoryPage = lazy(() => import("./pages/appBuilder/SoftwareFactoryPage").then((m) => ({ default: m.SoftwareFactoryPage })));
const BusinessIntelligencePage = lazy(() => import("./pages/bi/BusinessIntelligencePage").then((m) => ({ default: m.BusinessIntelligencePage })));
const EnterpriseSearchPage = lazy(() => import("./pages/search/EnterpriseSearchPage").then((m) => ({ default: m.EnterpriseSearchPage })));
const StudiosPage = lazy(() => import("./pages/softwareFactory/StudiosPage").then((m) => ({ default: m.StudiosPage })));
const EnterpriseFinOpsPage = lazy(() => import("./pages/finops/EnterpriseFinOpsPage").then((m) => ({ default: m.EnterpriseFinOpsPage })));
const AiEconomyPage = lazy(() => import("./pages/aiEconomy/AiEconomyPage").then((m) => ({ default: m.AiEconomyPage })));
const ApiKeysPage = lazy(() => import("./pages/apikey/ApiKeyPage").then((m) => ({ default: m.ApiKeyPage })));
const AttachmentsPage = lazy(() => import("./pages/attachments/AttachmentsPage").then((m) => ({ default: m.AttachmentsPage })));
const AutonomousPage = lazy(() => import("./pages/autonomous/AutonomousPage").then((m) => ({ default: m.AutonomousPage })));
const BillingPage = lazy(() => import("./pages/billing/BillingPage").then((m) => ({ default: m.BillingPage })));
const PaymentGatewaysPage = lazy(() => import("./pages/billing/PaymentGatewaysPage").then((m) => ({ default: m.PaymentGatewaysPage })));
const KnowledgePage = lazy(() => import("./pages/knowledge/KnowledgePage").then((m) => ({ default: m.KnowledgePage })));
const ReligionsPage = lazy(() => import("./pages/religions/ReligionsPage").then((m) => ({ default: m.ReligionsPage })));
const PoliticsPage = lazy(() => import("./pages/politics/PoliticsPage").then((m) => ({ default: m.PoliticsPage })));
const LifePrinciplesPage = lazy(() => import("./pages/lifePrinciples/LifePrinciplesPage").then((m) => ({ default: m.LifePrinciplesPage })));
const CyberCloudAcademyPage = lazy(() => import("./pages/cyberCloudAcademy/CyberCloudAcademyPage").then((m) => ({ default: m.CyberCloudAcademyPage })));
const UniversityPage = lazy(() => import("./pages/university/UniversityPage").then((m) => ({ default: m.UniversityPage })));
const UniversityEnginePage = lazy(() => import("./pages/universityEngine/UniversityEnginePage").then((m) => ({ default: m.UniversityEnginePage })));
const GeoBillingConsolePage = lazy(() => import("./pages/billing/GeoBillingConsolePage").then((m) => ({ default: m.GeoBillingConsolePage })));
const CommercePage = lazy(() => import("./pages/commerce/CommercePage").then((m) => ({ default: m.CommercePage })));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const PermissionsPage = lazy(() => import("./pages/permissions/PermissionsPage").then((m) => ({ default: m.PermissionsPage })));
const PublishingPage = lazy(() => import("./pages/publishing/PublishingPage").then((m) => ({ default: m.PublishingPage })));
const CameraPage = lazy(() => import("./pages/camera/CameraPage").then((m) => ({ default: m.CameraPage })));
const CognitivePage = lazy(() => import("./pages/cognitive/CognitivePage").then((m) => ({ default: m.CognitivePage })));
const CommandCenterPage = lazy(() => import("./pages/command/CommandCenterPage").then((m) => ({ default: m.CommandCenterPage })));
const ConversationsPage = lazy(() => import("./pages/conversations/ConversationsPage").then((m) => ({ default: m.ConversationsPage })));
const DerivativesPage = lazy(() => import("./pages/derivatives/DerivativesPage").then((m) => ({ default: m.DerivativesPage })));
const AuditConsolePage = lazy(() => import("./pages/audit/AuditConsolePage").then((m) => ({ default: m.AuditConsolePage })));
const GoogleIdentityPage = lazy(() => import("./pages/googleAuth/GoogleIdentityPage").then((m) => ({ default: m.GoogleIdentityPage })));
const GoogleCallbackPage = lazy(() => import("./pages/auth/GoogleCallbackPage").then((m) => ({ default: m.GoogleCallbackPage })));
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
  // Session 114 — the API has always redirected here after a Google sign-in;
  // until now the route did not exist and the token in the fragment was lost.
  { path: "/auth/callback", element: withSuspense(<GoogleCallbackPage />) },
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
      { path: "workspace", element: withSuspense(<UserDashboard />) },
      { path: "chat", element: withSuspense(<ChatPage />) },
      { path: "chat/:id", element: withSuspense(<ChatPage />) },
      { path: "talk", element: withSuspense(<TalkPage />) },
      { path: "flow", element: withSuspense(<WorkflowPage />) },
      { path: "flow/:id", element: withSuspense(<WorkflowPage />) },
      { path: "analytics", element: withSuspense(<AnalyticsPage />) },
      { path: "trading", element: withSuspense(<TradingIntelPage />) },
      { path: "trading/brokers", element: withSuspense(<BrokerCommandCenterPage />) },
      { path: "trading/dashboard", element: withSuspense(<TradingDashboardPage />) },
      { path: "marketing", element: withSuspense(<MarketingDashboardPage />) },
      { path: "voice", element: withSuspense(<VoiceStudioPage />) },
      { path: "voice-console", element: withSuspense(<VoiceConsolePage />) },
      { path: "media", element: withSuspense(<MediaFactoryPage />) },
      { path: "learn", element: withSuspense(<LearnPage />) },
      { path: "projects", element: withSuspense(<ProjectsPage />) },
      { path: "leads", element: withSuspense(<LeadsPage />) },
      { path: "lead-pipeline", element: withSuspense(<LeadPipelinePage />) },
      { path: "mfa-assurance", element: withSuspense(<MfaAssurancePage />) },
      { path: "mobile-devices", element: withSuspense(<MobileDevicesPage />) },
      { path: "opex", element: withSuspense(<OpexAssurancePage />) },
      { path: "prompt-templates", element: withSuspense(<PromptTemplatesPage />) },
      { path: "public-api", element: withSuspense(<PublicApiPage />) },
      { path: "sustainability", element: withSuspense(<SustainabilityPage />) },
      { path: "usage", element: withSuspense(<UsagePage />) },
      { path: "ai-engineering", element: withSuspense(<AiEngineeringPage />) },
      { path: "identity-knowledge", element: withSuspense(<IdentityKnowledgePage />) },
      { path: "events", element: withSuspense(<EventsPage />) },
      { path: "webhook", element: withSuspense(<WebhookInboxPage />) },
      { path: "ads", element: withSuspense(<AdsPage />) },
      { path: "music", element: withSuspense(<MusicStudioPage />) },
      { path: "music-video", element: withSuspense(<MusicVideoPage />) },
      { path: "developers", element: withSuspense(<DeveloperPage />) },
      { path: "files", element: withSuspense(<FilesPage />) },
      { path: "settings", element: withSuspense(<SettingsPage />) },
      { path: "enterprise", element: withSuspense(<EnterprisePage />) },
      { path: "governance", element: withSuspense(<GovernancePage />) },
      { path: "platform", element: withSuspense(<PlatformPage />) },
      { path: "security", element: withSuspense(<SecurityPage />) },
      { path: "tenant-isolation", element: withSuspense(<TenantIsolationPage />) },
      { path: "crm", element: withSuspense(<CrmPage />) },
      { path: "email-intel", element: withSuspense(<EmailIntelPage />) },
      { path: "erp", element: withSuspense(<ErpPage />) },
      { path: "revenue-guardian", element: withSuspense(<RevenueGuardianPage />) },
      { path: "voice-wake-center", element: withSuspense(<VoiceWakeCenterPage />) },
      { path: "website-builder", element: withSuspense(<WebsiteBuilderPage />) },
      { path: "social", element: withSuspense(<SocialPlatformPage />) },
      { path: "helpdesk", element: withSuspense(<HelpdeskPage />) },
      { path: "app-builder", element: withSuspense(<SoftwareFactoryPage />) },
      { path: "bi", element: withSuspense(<BusinessIntelligencePage />) },
      { path: "search", element: withSuspense(<EnterpriseSearchPage />) },
      { path: "software-factory", element: withSuspense(<StudiosPage />) },
      { path: "finops", element: withSuspense(<EnterpriseFinOpsPage />) },
      { path: "ai-economy", element: withSuspense(<AiEconomyPage />) },
      { path: "api-keys", element: withSuspense(<ApiKeysPage />) },
      { path: "attachments", element: withSuspense(<AttachmentsPage />) },
      { path: "autonomous", element: withSuspense(<AutonomousPage />) },
      { path: "billing", element: withSuspense(<BillingPage />) },
      { path: "payments", element: withSuspense(<PaymentGatewaysPage />) },
      { path: "knowledge", element: withSuspense(<KnowledgePage />) },
      { path: "religions", element: withSuspense(<ReligionsPage />) },
      { path: "politics", element: withSuspense(<PoliticsPage />) },
      { path: "life-principles", element: withSuspense(<LifePrinciplesPage />) },
      { path: "cyber-cloud-academy", element: withSuspense(<CyberCloudAcademyPage />) },
      { path: "university", element: withSuspense(<UniversityPage />) },
      { path: "education-engine", element: withSuspense(<UniversityEnginePage />) },
      { path: "geo-billing", element: withSuspense(<GeoBillingConsolePage />) },
      { path: "commerce", element: withSuspense(<CommercePage />) },
      { path: "notifications", element: withSuspense(<NotificationsPage />) },
      { path: "permissions", element: withSuspense(<PermissionsPage />) },
      { path: "publishing", element: withSuspense(<PublishingPage />) },
      { path: "camera", element: withSuspense(<CameraPage />) },
      { path: "cognitive", element: withSuspense(<CognitivePage />) },
      { path: "command", element: withSuspense(<CommandCenterPage />) },
      { path: "conversations", element: withSuspense(<ConversationsPage />) },
      { path: "derivatives", element: withSuspense(<DerivativesPage />) },
      { path: "audit", element: withSuspense(<AuditConsolePage />) },
      { path: "google-identity", element: withSuspense(<GoogleIdentityPage />) },
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
      { index: true, element: withSuspense(<AdminPage />) },
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
