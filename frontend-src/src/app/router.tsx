import * as React from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { withSuspense } from "@/app/Lazy";

const LoginPage = withSuspense(React.lazy(() => import("@/pages/LoginPage")));
const RegisterPage = withSuspense(React.lazy(() => import("@/pages/RegisterPage")));
const LandingPage = withSuspense(React.lazy(() => import("@/pages/LandingPage")));
const JourneyPage = withSuspense(React.lazy(() => import("@/pages/JourneyPage")));
const DashboardPage = withSuspense(React.lazy(() => import("@/pages/DashboardPage")));
const RobotDetailPage = withSuspense(React.lazy(() => import("@/pages/RobotDetailPage")));
const RobotChatPage = withSuspense(React.lazy(() => import("@/pages/RobotChatPage")));
const BobarPage = withSuspense(React.lazy(() => import("@/pages/BobarPage")));
const MaterialsPage = withSuspense(React.lazy(() => import("@/pages/MaterialsPage")));
const VideoPage = withSuspense(React.lazy(() => import("@/pages/VideoPage")));
const AuthorityAgentsPage = withSuspense(React.lazy(() => import("@/pages/AuthorityAgentsPage")));
const AuthorityAgentRunPage = withSuspense(React.lazy(() => import("@/pages/AuthorityAgentRunPage")));
const AuthorityAgentChatPage = withSuspense(React.lazy(() => import("@/pages/AuthorityAgentChatPage")));
const AuthorityNucleusPage = withSuspense(React.lazy(() => import("@/pages/AuthorityNucleusPage")));
const NotFoundPage = withSuspense(React.lazy(() => import("@/pages/NotFoundPage")));
const AccountPage = withSuspense(React.lazy(() => import("@/pages/AccountPage")));
const LinkedInCallbackPage = withSuspense(React.lazy(() => import("@/pages/LinkedInCallbackPage")));
const FacebookCallbackPage = withSuspense(
  React.lazy(() => import("@/pages/FacebookCallbackPage").then((mod) => ({ default: mod.FacebookCallbackPage }))),
);
const YouTubeCallbackPage = withSuspense(React.lazy(() => import("@/pages/YouTubeCallbackPage")));
const TikTokCallbackPage = withSuspense(React.lazy(() => import("@/pages/TikTokCallbackPage")));
const GoogleBusinessCallbackPage = withSuspense(React.lazy(() => import("@/pages/GoogleBusinessCallbackPage")));
const ImageEnginePage = withSuspense(React.lazy(() => import("@/pages/ImageEnginePage")));
const SkyBobPage = withSuspense(React.lazy(() => import("@/pages/SkyBobPage")));
const SocialPublisherPage = withSuspense(React.lazy(() => import("@/pages/SocialPublisherPage")));
const TermsOfServicePage = withSuspense(React.lazy(() => import("@/pages/TermsOfServicePage")));
const PrivacyPolicyPage = withSuspense(React.lazy(() => import("@/pages/PrivacyPolicyPage")));

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/auth/linkedin/callback", element: <LinkedInCallbackPage /> },
  { path: "/auth/facebook/callback", element: <FacebookCallbackPage /> },
  { path: "/auth/youtube/callback", element: <YouTubeCallbackPage /> },
  { path: "/auth/tiktok/callback", element: <TikTokCallbackPage /> },
  { path: "/auth/google-business/callback", element: <GoogleBusinessCallbackPage /> },
  { path: "/termos-de-servico", element: <TermsOfServicePage /> },
  { path: "/politica-de-privacidade", element: <PrivacyPolicyPage /> },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <LandingPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "journey", element: <JourneyPage /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "conta", element: <AccountPage /> },
          { path: "robots/:publicId", element: <RobotDetailPage /> },
          { path: "robots/:publicId/chat", element: <RobotChatPage /> },
          { path: "projects", element: <BobarPage /> },
          { path: "bobar", element: <BobarPage /> },
          { path: "materials", element: <MaterialsPage /> },
          { path: "video", element: <VideoPage /> },
          { path: "image-engine", element: <ImageEnginePage /> },
          { path: "skybob", element: <SkyBobPage /> },
          { path: "social-publisher", element: <SocialPublisherPage /> },
          { path: "authority-agents", element: <AuthorityAgentsPage /> },
          { path: "authority-agents/nucleus", element: <AuthorityNucleusPage /> },
          { path: "authority-agents/chat/:agentKey", element: <AuthorityAgentChatPage /> },
          { path: "authority-agents/run/:agentKey", element: <AuthorityAgentRunPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
