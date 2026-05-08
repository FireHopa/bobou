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
  billing_basis?: string;
  estimated_cost_brl?: number;
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
  kind?: "plan" | "pack" | string;
}

export interface CreditCatalogResponse {
  current_credits: number;
  daily_free_credits: number;
  initial_credits: number;
  credit_brl_value?: number;
  pricing_note?: string;
  actions: CreditActionDefinition[];
  plans: CreditPlanDefinition[];
}

export const DEFAULT_DAILY_FREE_CREDITS = 3000;
export const DEFAULT_INITIAL_CREDITS = 12000;

export const CREDIT_ACTIONS: CreditActionDefinition[] = [
  {
    key: "robot_create",
    title: "Criar Sócio Inteligente",
    description: "Criação inicial do robô com briefing, estratégia e prompt-base.",
    credits: 1210,
    category: "Robôs",
    billing_basis: "Tamanho do briefing + resposta gerada + estrutura",
    estimated_cost_brl: 1.21,
  },
  {
    key: "robot_chat_message",
    title: "Mensagem no chat",
    description: "Resposta textual em agente comum. Varia com histórico e busca externa.",
    credits: 430,
    category: "Robôs",
    billing_basis: "Prompt + histórico + resposta + estrutura",
    estimated_cost_brl: 0.43,
  },
  {
    key: "robot_audio_message",
    title: "Mensagem por áudio",
    description: "Transcrição do áudio + resposta do agente.",
    credits: 580,
    category: "Robôs",
    billing_basis: "Duração do áudio + resposta + estrutura",
    estimated_cost_brl: 0.58,
  },
  {
    key: "authority_assistant_edit",
    title: "Ajustar agente de autoridade",
    description: "Revisão das instruções do robô e sugestões de melhoria.",
    credits: 1180,
    category: "Autoridade",
    billing_basis: "Instruções atuais + pedido + resposta + estrutura",
    estimated_cost_brl: 1.18,
  },
  {
    key: "authority_agent_run",
    title: "Executar agente de autoridade",
    description: "Execução completa de uma tarefa de autoridade.",
    credits: 2210,
    category: "Autoridade",
    billing_basis: "Tamanho do núcleo + saída gerada + estrutura",
    estimated_cost_brl: 2.21,
  },
  {
    key: "authority_agent_theme_suggestion",
    title: "Gerar ideias de temas",
    description: "Sugestões de temas para uma tarefa de autoridade.",
    credits: 1050,
    category: "Autoridade",
    billing_basis: "Núcleo + tarefa + temas gerados + estrutura",
    estimated_cost_brl: 1.05,
  },
  {
    key: "authority_agent_video_format_suggestion",
    title: "Sugerir formato de vídeo",
    description: "Análise do melhor formato para o tema informado.",
    credits: 620,
    category: "Autoridade",
    billing_basis: "Tema + núcleo + recomendação + estrutura",
    estimated_cost_brl: 0.62,
  },
  {
    key: "competition_find_competitors",
    title: "Encontrar concorrentes",
    description: "Mapeamento inicial de concorrentes com IA e busca externa quando disponível.",
    credits: 1220,
    category: "Concorrência",
    billing_basis: "Briefing + busca externa + resposta + estrutura",
    estimated_cost_brl: 1.22,
  },
  {
    key: "competition_analyze",
    title: "Analisar concorrência",
    description: "Relatório consolidado de concorrência e posicionamento.",
    credits: 2950,
    category: "Concorrência",
    billing_basis: "Dados enviados + análise + busca externa + estrutura",
    estimated_cost_brl: 2.95,
  },
  {
    key: "skybob_preflight",
    title: "SkyBob: leitura inicial",
    description: "Leitura e estruturação do catálogo antes da missão principal.",
    credits: 1610,
    category: "SkyBob",
    billing_basis: "Catálogo + normalização + estrutura",
    estimated_cost_brl: 1.61,
  },
  {
    key: "skybob_full_run",
    title: "SkyBob: estudo completo",
    description: "Estudo principal com hooks, insights, calendário e cards.",
    credits: 5370,
    category: "SkyBob",
    billing_basis: "Núcleo + preferências + estudo gerado + estrutura",
    estimated_cost_brl: 5.37,
  },
  {
    key: "skybob_refine_run",
    title: "SkyBob: nova rodada",
    description: "Rodada incremental baseada no feedback do usuário.",
    credits: 2300,
    category: "SkyBob",
    billing_basis: "Estudo anterior + feedback + nova saída + estrutura",
    estimated_cost_brl: 2.3,
  },
  {
    key: "image_generate_from_scratch",
    title: "Gerar imagem",
    description: "Geração completa de peça visual usando as engines configuradas.",
    credits: 7530,
    category: "Imagem",
    billing_basis: "Refino de prompt + engines + pós-processamento + estrutura",
    estimated_cost_brl: 7.53,
  },
  {
    key: "image_edit",
    title: "Editar imagem",
    description: "Edição com imagem de referência, recomposição e processamento local.",
    credits: 4900,
    category: "Imagem",
    billing_basis: "Refino + edição + versões + recomposição + estrutura",
    estimated_cost_brl: 4.9,
  },
];

export const CREDIT_ACTION_COSTS: Record<CreditActionKey, number> = CREDIT_ACTIONS.reduce(
  (acc, item) => {
    acc[item.key] = item.credits;
    return acc;
  },
  {} as Record<CreditActionKey, number>,
);

export const CREDIT_PLANS: CreditPlanDefinition[] = [
  {
    id: "basico",
    title: "Básico",
    description: "Para testar o sistema, conversar com agentes e fazer poucas tarefas por semana.",
    monthly_fit: "Uso leve",
    display_price: "R$ 39",
    base_credits: 15000,
    bonus_credits: 0,
    total_credits: 15000,
    kind: "plan",
  },
  {
    id: "profissional",
    title: "Profissional",
    description: "Para usar agentes de autoridade, SkyBob e algumas imagens com mais frequência.",
    monthly_fit: "Uso constante",
    display_price: "R$ 89",
    base_credits: 40000,
    bonus_credits: 5000,
    total_credits: 45000,
    badge: "Mais indicado",
    recommended: true,
    kind: "plan",
  },
  {
    id: "avancado",
    title: "Avançado",
    description: "Para rotina de produção, várias análises e criação visual recorrente.",
    monthly_fit: "Uso intenso",
    display_price: "R$ 179",
    base_credits: 90000,
    bonus_credits: 15000,
    total_credits: 105000,
    badge: "Melhor custo",
    kind: "plan",
  },
  {
    id: "equipe",
    title: "Equipe",
    description: "Para operação pesada, times e alto volume de agentes, estudos e imagens.",
    monthly_fit: "Alto volume",
    display_price: "R$ 349",
    base_credits: 200000,
    bonus_credits: 45000,
    total_credits: 245000,
    badge: "Escala",
    kind: "plan",
  },
  {
    id: "creditos_10k",
    title: "10 mil créditos",
    description: "Recarga avulsa para completar o saldo sem mudar de plano.",
    monthly_fit: "Recarga rápida",
    display_price: "R$ 19",
    base_credits: 10000,
    bonus_credits: 0,
    total_credits: 10000,
    kind: "pack",
  },
  {
    id: "creditos_30k",
    title: "30 mil créditos",
    description: "Recarga avulsa para rodadas extras de agentes e publicações.",
    monthly_fit: "Recarga média",
    display_price: "R$ 49",
    base_credits: 30000,
    bonus_credits: 3000,
    total_credits: 33000,
    badge: "Popular",
    kind: "pack",
  },
  {
    id: "creditos_75k",
    title: "75 mil créditos",
    description: "Recarga avulsa para maior volume de estudos, autoridade e imagem.",
    monthly_fit: "Recarga alta",
    display_price: "R$ 109",
    base_credits: 75000,
    bonus_credits: 10000,
    total_credits: 85000,
    kind: "pack",
  },
  {
    id: "creditos_150k",
    title: "150 mil créditos",
    description: "Recarga avulsa para operações maiores sem valor customizado.",
    monthly_fit: "Recarga operação",
    display_price: "R$ 199",
    base_credits: 150000,
    bonus_credits: 25000,
    total_credits: 175000,
    badge: "Maior saldo",
    kind: "pack",
  },
];

export const DEFAULT_CREDIT_CATALOG: CreditCatalogResponse = {
  current_credits: DEFAULT_INITIAL_CREDITS,
  daily_free_credits: DEFAULT_DAILY_FREE_CREDITS,
  initial_credits: DEFAULT_INITIAL_CREDITS,
  credit_brl_value: 0.001,
  pricing_note:
    "Cada pedido desconta uma estimativa de custo de IA, busca, imagem e estrutura da plataforma. O valor pode variar conforme tamanho do prompt, resposta, histórico, resolução, versões e chamadas externas.",
  actions: CREDIT_ACTIONS,
  plans: CREDIT_PLANS,
};

export function formatCredits(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

export function formatCreditCost(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
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
