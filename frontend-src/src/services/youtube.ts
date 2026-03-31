import { http } from "./http";

export type YouTubePublishPayload = {
  title: string;
  description: string;
  privacy_status: "private" | "public" | "unlisted";
  made_for_kids: boolean;
  tags?: string;
  category_id?: string;
  video_file: File;
  thumbnail_file?: File | null;
};

export const youtubeService = {
  getAuthUrl: async (state?: string) => {
    const suffix = state ? `?state=${encodeURIComponent(state)}` : "";
    return http<{ url: string }>(`/api/youtube/auth-url${suffix}`, { method: "GET" });
  },

  connect: async (code: string) => {
    return http<{
      ok: boolean;
      message: string;
      channel_id?: string;
      channel_title?: string | null;
      channel_handle?: string | null;
      channel_thumbnail?: string | null;
    }>("/api/youtube/connect", {
      method: "POST",
      json: { code },
    });
  },

  status: async () => {
    return http<{
      connected: boolean;
      channel_id?: string | null;
      channel_title?: string | null;
      channel_handle?: string | null;
      channel_thumbnail?: string | null;
    }>("/api/youtube/status", { method: "GET" });
  },

  disconnect: async () => {
    return http<{ ok: boolean }>("/api/youtube/disconnect", { method: "POST" });
  },

  publish: async (payload: YouTubePublishPayload) => {
    const form = new FormData();
    form.append("title", payload.title);
    form.append("description", payload.description);
    form.append("privacy_status", payload.privacy_status);
    form.append("made_for_kids", String(payload.made_for_kids));
    form.append("tags", payload.tags || "");
    form.append("category_id", payload.category_id || "22");
    form.append("video_file", payload.video_file);
    if (payload.thumbnail_file) {
      form.append("thumbnail_file", payload.thumbnail_file);
    }

    return http<{
      ok: boolean;
      message: string;
      video_id: string;
      video_url: string;
      channel_title?: string | null;
      thumbnail_warning?: string | null;
    }>("/api/youtube/publish", {
      method: "POST",
      body: form,
    });
  },
};
