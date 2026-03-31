import { buildAppUrl } from "@/constants/app";
import { http } from "./http";

const DEFAULT_REDIRECT_URI =
  import.meta.env.VITE_INSTAGRAM_META_REDIRECT_URI?.trim() || buildAppUrl("/auth/facebook/callback");

export type InstagramPublishPayload = {
  caption: string;
  image_url?: string;
  carousel_images?: string[];
  collaborators?: string[];
  location_id?: string;
  first_comment?: string;
  share_to_feed?: boolean;
};

export const instagramService = {
  startAuth: (redirectPath = "/conta") => {
    const appId = import.meta.env.VITE_INSTAGRAM_META_APP_ID;
    if (!appId) throw new Error("VITE_INSTAGRAM_META_APP_ID não configurado no frontend.");

    const redirectUri = DEFAULT_REDIRECT_URI;
    const state = `instagram::${redirectPath}::${Date.now()}`;
    localStorage.setItem("meta_oauth_state", state);
    localStorage.setItem("meta_oauth_platform", "instagram");
    localStorage.setItem("meta_redirect_after_connect", redirectPath);

    const scopes = [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
      "pages_read_engagement",
    ].join(",");

    const authUrl = `https://www.facebook.com/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(state)}`;
    window.location.href = authUrl;
  },

  connect: async (code: string, redirect_uri = DEFAULT_REDIRECT_URI) => {
    return http<{
      ok: boolean;
      message: string;
      instagram_username?: string | null;
      instagram_account_id?: string;
      instagram_page_id?: string;
    }>("/api/instagram/link", {
      method: "POST",
      json: { code, redirect_uri },
    });
  },

  status: async () => {
    return http<{
      connected: boolean;
      instagram_account_id?: string | null;
      instagram_page_id?: string | null;
      instagram_username?: string | null;
    }>("/api/instagram/status", { method: "GET" });
  },

  disconnect: async () => {
    return http<{ ok: boolean }>("/api/instagram/disconnect", { method: "POST" });
  },

  publish: async (payload: InstagramPublishPayload) => {
    return http<{ ok: boolean; message: string; post_id: string; instagram_username?: string | null; warning?: unknown }>("/api/instagram/publish", {
      method: "POST",
      json: payload,
    });
  },
};
