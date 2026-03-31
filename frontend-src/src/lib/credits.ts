import { useAuthStore } from "@/state/authStore";

export type CreditActionKey =
  | "robot_create"
  | "robot_chat_message"
  | "robot_audio_message"
  | "authority_assistant_edit"
  | "authority_agent_run"
  | "authority_agent_theme_suggestion"
  | "authority_agent_video_format_suggestion"
  | "competition_find_competitors"
  | "competition_analyze"
  | "skybob_preflight"
  | "skybob_full_run"
  | "skybob_refine_run"
  | "image_generate_from_scratch"
  | "image_edit";

export interface CreditActionDefinition {
  key: CreditActionKey;
  title: string;
  description: string;
  credits: number;
  category: string;
}

export interface CreditPlanDefinition {
  id: string;
  title: string;
  description: string;
  monthly_fit: string;
  display_price: string;
  base_credits: number;
  bonus_credits: number;
  total_credits: number;
  badge?: string | null;
  recommended?: boolean;
}

export interface CreditCatalogResponse {
  current_credits: number;
  daily_free_credits: number;
  initial_credits: number;
  actions: CreditActionDefinition[];
  plans: CreditPlanDefinition[];
}

export const DEFAULT_DAILY_FREE_CREDITS = 3000;
export const DEFAULT_INITIAL_CREDITS = 12000;

export const CREDIT_ACTIONS: CreditActionDefinition[] = [
  {
    key: "robot_create",
    title: "Criar robô por briefing",
    description: "Gera o robô inicial com estratégia, estrutura e prompt-base.",
    credits: 1800,
    category: "Robôs",
  },
  {
    key: "robot_chat_message",
    title: "Chat com robô",
    description: "Mensagem textual em agentes de chat que não são de autoridade.",
    credits: 350,
    category: "Robôs",
  },
  {
    key: "robot_audio_message",
    title: "Chat com robô por áudio",
    description: "Transcrição + resposta do agente.",
    credits: 700,
    category: "Robôs",
  },
  {
    key: "authority_assistant_edit",
    title: "Assistente de autoridade",
    description: "Refina e reescreve instruções do robô com IA.",
    credits: 1200,
    category: "Autoridade",
  },
  {
    key: "authority_agent_run",
    title: "Executar agente de autoridade",
    description: "Execução completa de tarefa de autoridade.",
    credits: 2500,
    category: "Autoridade",
  },
  {
    key: "authority_agent_theme_suggestion",
    title: "Gerar temas com IA",
    description: "Sugestões de temas para tarefas de autoridade.",
    credits: 900,
    category: "Autoridade",
  },
  {
    key: "authority_agent_video_format_suggestion",
    title: "Analisar formato de vídeo",
    description: "Recomendação automática do melhor formato para o tema.",
    credits: 700,
    category: "Autoridade",
  },
  {
    key: "competition_find_competitors",
    title: "Encontrar concorrentes",
    description: "Mapeamento inicial de concorrentes com IA.",
    credits: 1600,
    category: "Concorrência",
  },
  {
    key: "competition_analyze",
    title: "Análise competitiva",
    description: "Relatório consolidado de concorrência.",
    credits: 4200,
    category: "Concorrência",
  },
  {
    key: "skybob_preflight",
    title: "SkyBob preflight",
    description: "Leitura e estruturação do catálogo antes da missão principal.",
    credits: 1500,
    category: "SkyBob",
  },
  {
    key: "skybob_full_run",
    title: "SkyBob missão completa",
    description: "Estudo principal com hooks, insights, calendário e cards.",
    credits: 6500,
    category: "SkyBob",
  },
  {
    key: "skybob_refine_run",
    title: "SkyBob nova rodada de hooks",
    description: "Rodada incremental baseada em feedback do usuário.",
    credits: 2800,
    category: "SkyBob",
  },
  {
    key: "image_generate_from_scratch",
    title: "Motor de imagem do zero",
    description: "Geração completa de peça visual nas engines configuradas.",
    credits: 4800,
    category: "Imagem",
  },
  {
    key: "image_edit",
    title: "Motor de imagem por edição",
    description: "Edição local/IA em imagem de referência.",
    credits: 4200,
    category: "Imagem",
  },
];

export const CREDIT_ACTION_COSTS: Record<CreditActionKey, number> = CREDIT_ACTIONS.reduce(
  (acc, item) => {
    acc[item.key] = item.credits;
    return acc;
  },
  {} as Record<CreditActionKey, number>
);

export const CREDIT_PLANS: CreditPlanDefinition[] = [
  {
    id: "starter_boost",
    title: "Starter Boost",
    description: "Entrada rápida para quem usa chat, ajustes e algumas execuções pesadas.",
    monthly_fit: "Uso leve a moderado",
    display_price: "R$ 39",
    base_credits: 12000,
    bonus_credits: 3000,
    total_credits: 15000,
  },
  {
    id: "growth_stack",
    title: "Growth Stack",
    description: "Volume mais equilibrado para rodar autoridade, SkyBob e imagem sem travar rápido.",
    monthly_fit: "Uso constante",
    display_price: "R$ 89",
    base_credits: 32000,
    bonus_credits: 8000,
    total_credits: 40000,
    badge: "Mais escolhido",
    recommended: true,
  },
  {
    id: "scale_ops",
    title: "Scale Ops",
    description: "Pacote robusto para operação diária com várias rodadas e geração criativa recorrente.",
    monthly_fit: "Uso intenso",
    display_price: "R$ 179",
    base_credits: 72000,
    bonus_credits: 18000,
    total_credits: 90000,
    badge: "Melhor custo",
  },
  {
    id: "elite_orbit",
    title: "Elite Orbit",
    description: "Reserva alta para times ou operação pesada com imagem e SkyBob recorrentes.",
    monthly_fit: "Uso extremo",
    display_price: "R$ 349",
    base_credits: 160000,
    bonus_credits: 40000,
    total_credits: 200000,
    badge: "Escala máxima",
  },
];

export const DEFAULT_CREDIT_CATALOG: CreditCatalogResponse = {
  current_credits: DEFAULT_INITIAL_CREDITS,
  daily_free_credits: DEFAULT_DAILY_FREE_CREDITS,
  initial_credits: DEFAULT_INITIAL_CREDITS,
  actions: CREDIT_ACTIONS,
  plans: CREDIT_PLANS,
};

export function formatCredits(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

export function syncCreditsFromResponse(response: Response | null | undefined) {
  if (!response) return;

  const creditsHeader = response.headers.get("X-User-Credits");
  if (!creditsHeader) return;

  const credits = Number(creditsHeader);
  if (!Number.isFinite(credits)) return;

  useAuthStore.getState().updateCredits(credits);
}

export async function extractResponseErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      if (payload && typeof payload === "object") {
        const detail =
          "detail" in payload && typeof payload.detail === "string"
            ? payload.detail
            : "message" in payload && typeof payload.message === "string"
              ? payload.message
              : null;

        if (detail) return detail;
      }
    } else {
      const text = await response.text();
      if (text.trim()) return text.trim();
    }
  } catch {
    // ignora parsing e usa fallback
  }

  if (response.status === 401) return "Sessão expirada.";
  return `Erro ${response.status}`;
}
