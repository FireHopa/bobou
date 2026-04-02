import { HttpError, http } from "./http";

export type LinkedInPublishMode = "feed" | "article";

export type LinkedInArticlePayload = {
  title: string;
  url: string;
  description?: string;
};

export type LinkedInPublishPayload = {
  mode: LinkedInPublishMode;
  text: string;
  article?: LinkedInArticlePayload;
};

export type LinkedInPublishResponse = {
  ok: boolean;
  mode: LinkedInPublishMode;
  post_id?: string;
};

const RECENT_PUBLISH_WINDOW_MS = 8_000;
let lastPublishSignature = "";
let lastPublishAt = 0;

function normalizePublishPayload(payload: LinkedInPublishPayload) {
  return {
    mode: payload.mode,
    text: payload.text.trim(),
    article:
      payload.mode === "article" && payload.article
        ? {
            title: payload.article.title.trim(),
            url: payload.article.url.trim(),
            description: payload.article.description?.trim() || "",
          }
        : undefined,
  };
}

function buildPublishSignature(payload: LinkedInPublishPayload) {
  return JSON.stringify(normalizePublishPayload(payload));
}

export const linkedinService = {
  getAuthUrl: async () => {
    return http<{ url: string }>("/api/linkedin/auth-url", { method: "GET" });
  },

  connect: async (code: string) => {
    return http<{ ok: boolean; message: string }>("/api/linkedin/connect", {
      method: "POST",
      json: { code },
    });
  },

  publish: async (payload: LinkedInPublishPayload) => {
    const signature = buildPublishSignature(payload);
    const now = Date.now();

    if (signature === lastPublishSignature && now - lastPublishAt < RECENT_PUBLISH_WINDOW_MS) {
      throw new Error("Essa publicação já foi enviada há instantes. Aguarde alguns segundos ou altere o conteúdo antes de tentar novamente.");
    }

    lastPublishSignature = signature;
    lastPublishAt = now;

    try {
      return await http<LinkedInPublishResponse>("/api/linkedin/publish", {
        method: "POST",
        json: normalizePublishPayload(payload),
      });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status < 500) {
        throw error;
      }
      throw error;
    }
  },
};
