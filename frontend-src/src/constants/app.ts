export const APP_NAME = "Autoridade ORI";

export const ROUTES = {
  home: "/",
  // journey: "/journey",
  // dashboard: "/dashboard",
} as const;

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getAppBaseUrl(): string {
  const envUrl = normalizeBaseUrl(import.meta.env.VITE_APP_BASE_URL);
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin) || "http://localhost:5173";
  }

  return "http://localhost:5173";
}

function inferApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  const { hostname } = window.location;

  if (isLocalHostname(hostname)) {
    return "http://localhost:8000";
  }

  return getAppBaseUrl();
}

export function buildAppUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

export const API_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ?? inferApiBaseUrl();
