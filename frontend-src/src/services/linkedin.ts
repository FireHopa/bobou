import { http } from "./http";

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
  
  publish: async (text: string) => {
    return http<{ ok: boolean }>("/api/linkedin/publish", {
      method: "POST",
      json: { text },
    });
  }
};