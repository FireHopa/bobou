import { http } from "./http";

export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "FOLLOWER_OF_CREATOR"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY";

export type TikTokPublishPayload = {
  title?: string;
  post_mode?: "direct_post" | "inbox_upload";
  caption: string;
  privacy_level: TikTokPrivacyLevel;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  is_aigc: boolean;
  brand_content_toggle: boolean;
  brand_organic_toggle: boolean;
  video_cover_timestamp_ms: number;
  video_file: File;
};

export const tiktokService = {
  getAuthUrl: async (state?: string, codeChallenge?: string) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (codeChallenge) params.set("code_challenge", codeChallenge);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return http<{ url: string; state: string }>(`/api/tiktok/auth-url${suffix}`, { method: "GET" });
  },

  connect: async (code: string, codeVerifier: string) => {
    return http<{
      ok: boolean;
      message: string;
      display_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      profile_url?: string | null;
      privacy_level_options?: TikTokPrivacyLevel[];
      max_video_post_duration_sec?: number;
    }>("/api/tiktok/connect", {
      method: "POST",
      json: { code, code_verifier: codeVerifier },
    });
  },

  status: async () => {
    return http<{
      connected: boolean;
      display_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      profile_url?: string | null;
      is_verified?: boolean;
      privacy_level_options?: TikTokPrivacyLevel[];
      privacy_level_labels?: Record<string, string>;
      max_video_post_duration_sec?: number;
    }>("/api/tiktok/status", { method: "GET" });
  },

  disconnect: async () => {
    return http<{ ok: boolean }>("/api/tiktok/disconnect", { method: "POST" });
  },

  publish: async (payload: TikTokPublishPayload) => {
    const form = new FormData();
    form.append("caption", payload.caption);
    form.append("privacy_level", payload.privacy_level);
    form.append("disable_comment", String(payload.disable_comment));
    form.append("disable_duet", String(payload.disable_duet));
    form.append("disable_stitch", String(payload.disable_stitch));
    form.append("is_aigc", String(payload.is_aigc));
    form.append("brand_content_toggle", String(payload.brand_content_toggle));
    form.append("brand_organic_toggle", String(payload.brand_organic_toggle));
    form.append("video_cover_timestamp_ms", String(payload.video_cover_timestamp_ms));
    form.append("video_file", payload.video_file);

    return http<{
      ok: boolean;
      message: string;
      publish_id: string;
      status?: string;
      status_message?: string | null;
      warning?: string | null;
    }>("/api/tiktok/publish", {
      method: "POST",
      body: form,
    });
  },
};
