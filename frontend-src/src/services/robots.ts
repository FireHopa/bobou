import { http } from "@/services/http";
import type {
  HealthResponse,
  RobotOut,
  RobotDetail,
  BriefingIn,
  RobotUpdateIn,
  ChatIn,
  ChatMessageOut,
  MessageUpdateIn,
  AuthorityAssistantIn,
  AuthorityAssistantOut,
  AuthorityEditOut,
  BusinessCoreIn,
  BusinessCoreOut,
  AuthorityAgentRunRequest,
  AuthorityAgentRunResponse,
  SuggestVideoFormatResponse,
  SkyBobCatalogAnalysis,
  SkyBobJobResultResponse,
  SkyBobJobStatusResponse,
  SkyBobRunResponse,
} from "@/types/api";

export type AuthorityAgentRunItem = {
  id: number;
  agent_key: string;
  output_text: string;
  created_at: string;
};

export type AuthorityAgentHistoryOut = {
  items: AuthorityAgentRunItem[];
};

export type AuthorityAgentRunGlobalIn = {
  client_id: string;
  agent_key: string;
  nucleus: Record<string, any>;
};

export type SuggestThemesIn = {
  agent_key: string;
  task: string;
  nucleus: Record<string, any>;
};

export type SuggestVideoFormatIn = {
  agent_key: string;
  theme: string;
  nucleus: Record<string, any>;
};

export type SkyBobRunIn = {
  nucleus: Record<string, any>;
  preferences?: Record<string, any>;
  previous_study?: Record<string, any>;
  catalog_analysis?: Record<string, any> | null;
  mode?: "full" | "refine";
};

export type SkyBobCatalogIn = {
  nucleus: Record<string, any>;
};

export const api = {
  health: () => http<HealthResponse>("/api/health"),

  skybob: {
    preflight: (payload: SkyBobCatalogIn) =>
      http<SkyBobCatalogAnalysis>(`/api/skybob/preflight`, { method: "POST", json: payload }),
    startJob: (payload: SkyBobRunIn) =>
      http<SkyBobJobStatusResponse>(`/api/skybob/jobs`, { method: "POST", json: payload }),
    getJob: (jobId: string) =>
      http<SkyBobJobStatusResponse>(`/api/skybob/jobs/${encodeURIComponent(jobId)}`),
    getJobResult: (jobId: string) =>
      http<SkyBobJobResultResponse>(`/api/skybob/jobs/${encodeURIComponent(jobId)}/result`),
    run: (payload: SkyBobRunIn) =>
      http<SkyBobRunResponse>(`/api/skybob/run`, { method: "POST", json: payload }),
  },

  robots: {
    list: () => http<RobotOut[]>("/api/robots"),
    create: (brief: BriefingIn) => http<RobotOut>("/api/robots", { method: "POST", json: brief }),
    get: (publicId: string) => http<RobotDetail>(`/api/robots/${publicId}`),
    update: (publicId: string, patch: RobotUpdateIn) =>
      http<RobotDetail>(`/api/robots/${publicId}`, { method: "PATCH", json: patch }),
    remove: (publicId: string) => http<{ ok: true }>(`/api/robots/${publicId}`, { method: "DELETE" }),

    messages: {
      list: (publicId: string) => http<ChatMessageOut[]>(`/api/robots/${publicId}/messages`),
      clear: (publicId: string) => http<{ ok: true }>(`/api/robots/${publicId}/messages`, { method: "DELETE" }),
      update: (publicId: string, messageId: number, body: MessageUpdateIn) =>
        http<ChatMessageOut>(`/api/robots/${publicId}/messages/${messageId}`, { method: "PATCH", json: body }),
    },

    chat: (publicId: string, body: ChatIn) =>
      http<ChatMessageOut>(`/api/robots/${publicId}/chat`, { method: "POST", json: body }),

    authorityAssistant: (publicId: string, body: AuthorityAssistantIn) =>
      http<AuthorityAssistantOut>(`/api/robots/${publicId}/authority-assistant`, { method: "POST", json: body }),

    authorityEdits: (publicId: string) =>
      http<AuthorityEditOut[]>(`/api/robots/${publicId}/authority-edits`),

    businessCore: {
      get: (publicId: string) => http<BusinessCoreOut>(`/api/robots/${publicId}/business-core`),
      patch: (publicId: string, patch: BusinessCoreIn) =>
        http<BusinessCoreOut>(`/api/robots/${publicId}/business-core`, { method: "PATCH", json: patch }),
    },

    authorityAgents: {
      cooldown: (publicId: string, agentKey: string) =>
        http<{ cooldown_seconds: number }>(
          `/api/robots/${publicId}/authority-agents/cooldown?agent_key=${encodeURIComponent(agentKey)}`
        ),
      run: (publicId: string, body: AuthorityAgentRunRequest) =>
        http<AuthorityAgentRunItem>(`/api/robots/${publicId}/authority-agents/run`, {
          method: "POST",
          json: body,
        }),
    },

    audio: async (publicId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return http<ChatMessageOut>(`/api/robots/${publicId}/audio`, { method: "POST", body: form });
    },
  },

  authorityAgents: {
    historyGlobal: (clientId: string) =>
      http<AuthorityAgentHistoryOut>(`/api/authority-agents/history?client_id=${encodeURIComponent(clientId)}`),
    runGlobal: (payload: AuthorityAgentRunGlobalIn) =>
      http<AuthorityAgentRunItem>(`/api/authority-agents/run`, { method: "POST", json: payload }),

    runById: (clientId: string, runId: number) =>
      http<AuthorityAgentRunItem>(
        `/api/authority-agents/run/${encodeURIComponent(String(runId))}?client_id=${encodeURIComponent(clientId)}`
      ),

    updateRunGlobal: (runId: number, payload: { output_text: string }) =>
      http<AuthorityAgentRunItem>(`/api/authority-agents/run/${runId}`, { method: "PATCH", json: payload }),

    suggestThemes: (payload: SuggestThemesIn) =>
      http<{ themes: string[] }>(`/api/authority-agents/suggest-themes`, { method: "POST", json: payload }),

    suggestVideoFormat: (payload: SuggestVideoFormatIn) =>
      http<SuggestVideoFormatResponse>(`/api/authority-agents/suggest-video-format`, { method: "POST", json: payload }),
  },
} as const;

export function getClientId(): string {
  const key = "ori_authority_client_id";
  let v = localStorage.getItem(key);
  if (!v) {
    v = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    localStorage.setItem(key, v);
  }
  return v;
}

export async function uploadRobotKnowledgeFile(publicId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return http(`/api/robots/${publicId}/upload-knowledge`, {
    method: "POST",
    body: formData,
  });
}

export async function uploadBusinessCoreKnowledgeFile(publicId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return http(`/api/robots/${publicId}/business-core/upload-knowledge`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteRobotKnowledgeFile(publicId: string, filename: string) {
  return http(`/api/robots/${publicId}/knowledge-files/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

export async function deleteBusinessCoreKnowledgeFile(publicId: string, filename: string) {
  return http(`/api/robots/${publicId}/business-core/files/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}
