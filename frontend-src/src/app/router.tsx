import * as React from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import LandingPage from "@/pages/LandingPage";
import JourneyPage from "@/pages/JourneyPage";
import DashboardPage from "@/pages/DashboardPage";
import RobotDetailPage from "@/pages/RobotDetailPage";
import RobotChatPage from "@/pages/RobotChatPage";
import BobarPage from "@/pages/BobarPage";
import MaterialsPage from "@/pages/MaterialsPage";
import VideoPage from "@/pages/VideoPage";
import AuthorityAgentsPage from "@/pages/AuthorityAgentsPage";
import AuthorityAgentRunPage from "@/pages/AuthorityAgentRunPage";
import AuthorityAgentChatPage from "@/pages/AuthorityAgentChatPage";
import AuthorityNucleusPage from "@/pages/AuthorityNucleusPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AccountPage from "@/pages/AccountPage";
import LinkedInCallbackPage from "@/pages/LinkedInCallbackPage";
import ImageEnginePage from "@/pages/ImageEnginePage";
import { FacebookCallbackPage } from "@/pages/FacebookCallbackPage";
import YouTubeCallbackPage from "@/pages/YouTubeCallbackPage";
import TikTokCallbackPage from "@/pages/TikTokCallbackPage";
import GoogleBusinessCallbackPage from "@/pages/GoogleBusinessCallbackPage";
import SkyBobPage from "@/pages/SkyBobPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/auth/linkedin/callback", element: <LinkedInCallbackPage /> },
  { path: "/auth/facebook/callback", element: <FacebookCallbackPage /> },
  { path: "/auth/youtube/callback", element: <YouTubeCallbackPage /> },
  { path: "/auth/tiktok/callback", element: <TikTokCallbackPage /> },
  { path: "/auth/google-business/callback", element: <GoogleBusinessCallbackPage /> },
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
