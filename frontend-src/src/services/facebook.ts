import { buildAppUrl } from "@/constants/app";
import { http } from "./http";

const DEFAULT_REDIRECT_URI =
  import.meta.env.VITE_FACEBOOK_META_REDIRECT_URI?.trim() || buildAppUrl("/auth/facebook/callback");

export type FacebookPage = {
  id: string;
  name: string;
  username?: string | null;
  fan_count?: number | null;
  followers_count?: number | null;
  picture_url?: string | null;
};

export type FacebookPublishPayload = {
  message: string;
  link?: string;
  image_url?: string;
  carousel_images?: string[];
  published?: boolean;
  scheduled_publish_time?: number;
  backdated_time?: string;
  place?: string;
  tags?: string[];
};

export const facebookService = {
  startAuth: (redirectPath = "/conta") => {
    const appId = import.meta.env.VITE_FACEBOOK_META_APP_ID;
    if (!appId) throw new Error("VITE_FACEBOOK_META_APP_ID não configurado no frontend.");

    const redirectUri = DEFAULT_REDIRECT_URI;
    const state = `facebook::${redirectPath}::${Date.now()}`;
    localStorage.setItem("meta_oauth_state", state);
    localStorage.setItem("meta_oauth_platform", "facebook");
    localStorage.setItem("meta_redirect_after_connect", redirectPath);

    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
    ].join(",");

    const authUrl = `https://www.facebook.com/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(state)}`;
    window.location.href = authUrl;
  },

  connect: async (code: string, redirect_uri = DEFAULT_REDIRECT_URI) => {
    return http<{
      ok: boolean;
      message: string;
      page_id?: string;
      page_name?: string | null;
      page_username?: string | null;
      pages?: FacebookPage[];
    }>("/api/facebook/link", {
      method: "POST",
      json: { code, redirect_uri },
    });
  },

  status: async () => {
    return http<{
      connected: boolean;
      page_id?: string | null;
      page_name?: string | null;
      page_username?: string | null;
      pages?: string;
    }>("/api/facebook/status", { method: "GET" });
  },

  disconnect: async () => http<{ ok: boolean }>("/api/facebook/disconnect", { method: "POST" }),

  selectPage: async (page_id: string) => {
    return http<{ ok: boolean; page_id: string; page_name?: string }>("/api/facebook/select-page", {
      method: "POST",
      json: { page_id },
    });
  },

  publish: async (payload: FacebookPublishPayload) => {
    return http<{ ok: boolean; message: string; post_id: string; page_id?: string; page_name?: string | null; permalink_url?: string | null }>("/api/facebook/publish", {
      method: "POST",
      json: payload,
    });
  },
};
