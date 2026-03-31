import type { BriefingField, JourneyStep } from "@/types/journey";

export const LEVELS = [
  { level: 1, title: "Robô", subtitle: "A Fundação" },
  { level: 2, title: "Autoridade", subtitle: "Regras e Provas" },
  { level: 3, title: "Canais", subtitle: "Presença Digital" },
];

export const JOURNEY_STEPS: JourneyStep[] = [
  // FASE 1: Montagem do Robô (Level 1)
  { id: "company_name", label: "Empresa", helper: "Como sua marca é chamada?", placeholder: "Ex: Casa do Ads", level: 1, accent: "blue" },
  { id: "owner_name", label: "Dono(a)", helper: "Quem é o dono ou porta-voz da empresa?", placeholder: "Ex: João Silva", level: 1, accent: "blue" },
  { id: "niche", label: "Nicho", helper: "Em qual mercado você atua?", placeholder: "Ex: Tráfego Pago para PMEs", level: 1, accent: "blue" },
  { id: "audience", label: "Público-alvo", helper: "Quem é o seu cliente ideal?", placeholder: "Ex: Donos de negócios locais", level: 1, accent: "blue" },
  { id: "offer", label: "Oferta", helper: "O que você vende?", placeholder: "Ex: Imersão presencial e consultoria", level: 1, accent: "blue" },
  { id: "region", label: "Região", helper: "Onde você atua?", placeholder: "Ex: Santos, SP", level: 1, accent: "blue" },
  { id: "tone", label: "Tom de voz", helper: "Como o robô deve falar?", placeholder: "Ex: Amigável e Técnico", level: 1, accent: "yellow" },
  { id: "goals", label: "Objetivos", helper: "O que você espera alcançar?", placeholder: "Ex: Mais leads qualificados", level: 1, accent: "green" },

  // FASE 2: Provas Sociais e Regras (Level 2)
  { id: "real_differentials", label: "Diferenciais", helper: "O que só você faz? Qual sua vantagem real?", placeholder: "Ex: 14 anos de mercado", level: 2, accent: "red" },
  { id: "restrictions", label: "Restrições", helper: "O que o robô NUNCA deve prometer?", placeholder: "Ex: Não prometer ROAS garantido", optional: true, level: 2, accent: "red" },
  { id: "forbidden_content", label: "Proibido", helper: "Existem assuntos proibidos?", placeholder: "Ex: Não falar de política ou religião", optional: true, level: 2, accent: "red" },
  { id: "reviews", label: "Avaliações", helper: "Onde estão suas melhores avaliações?", placeholder: "Ex: 5 estrelas no Google Meu Negócio", optional: true, level: 2, accent: "yellow" },
  { id: "testimonials", label: "Depoimentos", helper: "Tem depoimentos de clientes?", placeholder: "Ex: Clientes faturando 2x mais", optional: true, level: 2, accent: "yellow" },
  { id: "usable_links_texts", label: "Links Úteis", helper: "Links que o robô pode mandar nos textos:", placeholder: "Ex: Link do WhatsApp, link de checkout", optional: true, level: 2, accent: "yellow" },

  // FASE 3: Canais Oficiais (Level 3)
  { id: "site", label: "Site", helper: "Qual o seu site oficial?", placeholder: "https://", optional: true, level: 3, accent: "blue" },
  { id: "instagram", label: "Instagram", helper: "Qual o seu @ do Instagram?", placeholder: "@", optional: true, level: 3, accent: "blue" },
  { id: "google_business_profile", label: "Google", helper: "Link do seu Perfil de Empresa no Google:", placeholder: "URL", optional: true, level: 3, accent: "blue" },
  { id: "linkedin", label: "LinkedIn", helper: "Link do LinkedIn da empresa ou seu:", placeholder: "URL", optional: true, level: 3, accent: "blue" },
  { id: "youtube", label: "YouTube", helper: "Canal do YouTube:", placeholder: "URL", optional: true, level: 3, accent: "blue" },
  { id: "tiktok", label: "TikTok", helper: "Perfil do TikTok:", placeholder: "@", optional: true, level: 3, accent: "blue" },
];

export const DEFAULT_VALUES: Record<BriefingField, string> = {
  company_name: "", owner_name: "", niche: "", audience: "", offer: "", region: "", tone: "", competitors: "", goals: "",
  real_differentials: "", restrictions: "", reviews: "", testimonials: "", usable_links_texts: "", forbidden_content: "",
  site: "", google_business_profile: "", instagram: "", linkedin: "", youtube: "", tiktok: ""
};