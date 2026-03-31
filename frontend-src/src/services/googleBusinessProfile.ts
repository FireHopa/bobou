import { http } from "./http";

export type GoogleBusinessLocation = {
  name: string;
  title: string;
  store_code?: string | null;
  category?: string | null;
  language_code?: string | null;
};

export type GoogleBusinessStatus = {
  connected: boolean;
  account_name?: string | null;
  location_name?: string | null;
  location_title?: string | null;
  location_store_code?: string | null;
  location_category?: string | null;
  locations: GoogleBusinessLocation[];
  warning?: string | null;
};

export type ApplyGoogleBusinessServicesPayload = {
  location_name?: string;
  source_type: "keyword_list" | "service_cards";
  items: unknown[];
  language_code?: string;
};

export const googleBusinessProfileService = {
  getAuthUrl: async () => {
    return http<{ url: string; state: string }>("/api/google-business-profile/auth-url", { method: "GET" });
  },

  connect: async (code: string) => {
    return http<{
      ok: boolean;
      message: string;
      warning?: string | null;
      account_name?: string | null;
      location_title?: string | null;
      locations?: GoogleBusinessLocation[];
    }>("/api/google-business-profile/connect", {
      method: "POST",
      json: { code },
    });
  },

  status: async () => {
    return http<GoogleBusinessStatus>("/api/google-business-profile/status", { method: "GET" });
  },

  disconnect: async () => {
    return http<{ ok: boolean }>("/api/google-business-profile/disconnect", { method: "POST" });
  },

  listLocations: async () => {
    return http<{
      locations: GoogleBusinessLocation[];
      selected_location_name?: string | null;
      selected_location_title?: string | null;
    }>("/api/google-business-profile/locations", { method: "GET" });
  },

  selectLocation: async (location_name: string) => {
    return http<{ ok: boolean; location_title?: string }>("/api/google-business-profile/locations/select", {
      method: "POST",
      json: { location_name },
    });
  },

  applyServices: async (payload: ApplyGoogleBusinessServicesPayload) => {
    return http<{
      ok: boolean;
      message: string;
      applied_count: number;
      location_title?: string | null;
      service_list?: unknown;
    }>("/api/google-business-profile/services/apply", {
      method: "POST",
      json: payload,
    });
  },
};
