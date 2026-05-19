import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { ColorThemeToggle } from "@/components/layout/ColorThemeToggle";
import { cn } from "@/lib/utils";

export function AppShell() {
  const location = useLocation();
  const [sidebarW, setSidebarW] = React.useState(268);

  const params = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isReferenceEditorRoute =
    location.pathname === "/image-engine" && params.get("mode") === "edit-reference";
  const isSkyBobFullscreenRoute = location.pathname === "/skybob";
  const isBobarFullscreenRoute = location.pathname === "/bobar" || location.pathname === "/projects";
  const isSocialPublisherFullscreenRoute = location.pathname === "/social-publisher";
  const isFullscreenRoute = isReferenceEditorRoute || isSkyBobFullscreenRoute || isBobarFullscreenRoute || isSocialPublisherFullscreenRoute;

  const pageThemeClass = React.useMemo(() => {
    if (isBobarFullscreenRoute) return "theme-page-bobar";
    if (isSkyBobFullscreenRoute) return "theme-page-skybob";
    if (isSocialPublisherFullscreenRoute) return "theme-page-social-publisher";
    if (isReferenceEditorRoute) return "theme-page-image-reference";
    if (location.pathname === "/conta") return "theme-page-account";
    if (location.pathname === "/image-engine") return "theme-page-image-engine";
    return "theme-page-standard";
  }, [isBobarFullscreenRoute, isReferenceEditorRoute, isSkyBobFullscreenRoute, isSocialPublisherFullscreenRoute, location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:px-4 focus:py-2 focus:shadow-card"
      >
        Pular para o conteúdo
      </a>

      {!isFullscreenRoute ? <Sidebar onWidthChange={setSidebarW} /> : <ColorThemeToggle variant="floating" />}

      <div
        style={isFullscreenRoute ? undefined : { paddingLeft: sidebarW }}
        className={isReferenceEditorRoute ? "h-dvh overflow-hidden" : isBobarFullscreenRoute ? "min-h-dvh overflow-hidden" : "min-h-dvh"}
      >
        <AnimatePresence mode="wait">
          <motion.main
            key={`${location.pathname}${location.search}`}
            id="main-content"
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(8px)" }}
            transition={{ duration: 0.22 }}
            className={cn(
              pageThemeClass,
              isReferenceEditorRoute
                ? "h-dvh overflow-hidden"
                : isBobarFullscreenRoute
                  ? "min-h-dvh"
                  : isSkyBobFullscreenRoute || isSocialPublisherFullscreenRoute
                    ? "min-h-dvh"
                    : "container py-10",
            )}
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
