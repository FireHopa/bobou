import { http } from "./http";

export type SocialPublisherMediaUploadItem = {
  url: string;
  filename: string;
  type?: "image" | "video";
  content_type?: string;
};

export type SocialPublisherMediaUploadResponse = {
  ok: boolean;
  items: SocialPublisherMediaUploadItem[];
  urls: string[];
};

export const socialPublisherService = {
  uploadMedia: async (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return http<SocialPublisherMediaUploadResponse>("/api/social-publisher/media", {
      method: "POST",
      body: form,
    });
  },
};
