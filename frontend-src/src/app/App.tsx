import * as React from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/state/queryClient";
import { router } from "@/app/router";
import { useEasterEgg } from "@/hooks/useEasterEgg";

const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() => import("@tanstack/react-query-devtools").then((mod) => ({ default: mod.ReactQueryDevtools })))
  : null;

export function App() {
  useEasterEgg();

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors closeButton />
      {ReactQueryDevtools ? (
        <React.Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </React.Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
