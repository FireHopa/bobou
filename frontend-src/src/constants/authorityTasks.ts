export type AuthorityTaskInputMode = "theme" | "textarea" | "direct";

export type AuthorityTaskExtraField = {
  key: string;
  label: string;
  type: "select";
  placeholder?: string;
  options: { value: string; label: string }[];
  required?: boolean;
  aiRecommended?: boolean;
};

export type AuthorityTask = {
  title: string;
  description?: string;
  prompt?: string;
  inputMode?: AuthorityTaskInputMode;
  inputLabel?: string;
  inputPlaceholder?: string;
  submitLabel?: string;
  aiSuggestions?: boolean;
  extraFields?: AuthorityTaskExtraField[];
};

const VIDEO_FORMAT_OPTIONS = [
  { value: "direct_camera", label: "Você falando direto para a câmera" },
  { value: "screen_plus_commentary", label: "Tela + você comentando" },
  { value: "front_of_content", label: "Você na frente do conteúdo" },
  { value: "reaction_commentary", label: "Reação ou comentário" },
  { value: "video_checklist", label: "Checklist em vídeo" },
  { value: "before_after", label: "Antes e depois" },
  { value: "common_error_fix", label: "Erro comum + correção" },
  { value: "social_proof", label: "Prova social" },
  { value: "behind_the_scenes", label: "Bastidores com narração" },
  { value: "myth_vs_reality", label: "Mito vs realidade" },
  { value: "comparison_a_vs_b", label: "Comparativo A vs B" },
  { value: "quick_diagnosis", label: "Diagnóstico ou opinião rápida" },
];

export const YOUTUBE_TASKS: AuthorityTask[] = [
  { title: "Roteiro de Vídeo Longo (Conteúdo Pilar)", inputMode: "theme", aiSuggestions: true },
  { title: "Roteiro de Shorts / Vídeo Curto", inputMode: "theme", aiSuggestions: true },
  { title: "Títulos e Descrições Otimizadas (SEO/AEO)", inputMode: "theme", aiSuggestions: true },
  { title: "Roteiro Institucional (Sobre a Empresa)", inputMode: "theme", aiSuggestions: true }
];

export const INSTAGRAM_TASKS: AuthorityTask[] = [
  {
    title: "Bio estratégica (AEO, AIO E GEO)",
    description: "Reposiciona a bio para explicar com clareza quem você ajuda, o que entrega e por que vale clicar.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Destaques estratégicos (AEO, AIO E GEO)",
    description: "Organiza os Destaques em blocos que fortalecem autoridade, contexto, prova e entendimento do perfil.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "CTA estratégico para bio, post, stories ou link",
    description: "Cria CTAs específicos para levar a audiência da atenção para a próxima ação certa.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual CTA você quer criar?",
    inputPlaceholder: "Ex: CTA para bio de consultoria, CTA para post de autoridade...",
    submitLabel: "Gerar CTA",
  },
  {
    title: "Roteiros",
    description: "Transforma o tema em um roteiro gravável e escolhe o formato de vídeo mais forte para retenção e clareza.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual é o tema principal do vídeo?",
    inputPlaceholder: "Ex: Por que empresas boas continuam invisíveis no Instagram...",
    submitLabel: "Gerar roteiro",
    extraFields: [
      {
        key: "video_format",
        label: "Formato do vídeo",
        type: "select",
        placeholder: "Escolha o formato do vídeo",
        options: VIDEO_FORMAT_OPTIONS,
        required: true,
        aiRecommended: true,
      },
    ],
  },
  {
    title: "Legendas estratégicas (AEO, AIO E GEO)",
    description: "Cria legendas com intenção clara de alcance, autoridade, conversão ou debate, usando o núcleo da empresa.",
    inputMode: "theme",
    aiSuggestions: false,
    inputLabel: "Qual é o tema principal do conteúdo?",
    inputPlaceholder: "Ex: Por que o conteúdo bonito não gera autoridade nem lead",
    submitLabel: "Gerar legendas",
    extraFields: [
      {
        key: "content_type",
        label: "Esse conteúdo é",
        type: "select",
        placeholder: "Escolha o tipo de conteúdo",
        options: [
          { value: "reels", label: "reels" },
          { value: "carrossel", label: "carrossel" },
          { value: "post", label: "post" },
          { value: "video_educativo", label: "vídeo educativo" },
          { value: "opiniao", label: "opinião" },
          { value: "react", label: "react" },
        ],
        required: true,
      },
      {
        key: "content_goal",
        label: "O objetivo principal é",
        type: "select",
        placeholder: "Escolha o objetivo principal",
        options: [
          { value: "gerar_alcance", label: "gerar alcance" },
          { value: "gerar_autoridade", label: "gerar autoridade" },
          { value: "gerar_conversao", label: "gerar conversão" },
          { value: "gerar_debate", label: "gerar debate" },
        ],
        required: true,
      },
    ],
  },
];

export const TIKTOK_TASKS: AuthorityTask[] = [
  {
    title: "Bio estratégica (AEO, AIO E GEO)",
    description: "Reposiciona o perfil para deixar claro quem você ajuda, o que entrega, qual é o diferencial e qual ação a pessoa deve tomar ao entrar no TikTok.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Roteiros",
    description: "Transforma o tema em um roteiro gravável com foco em retenção, clareza e ritmo de TikTok, escolhendo o formato mais forte para viralização, autoridade ou conversão.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual é o tema principal do vídeo?",
    inputPlaceholder: "Ex: Por que empresas boas continuam invisíveis no TikTok mesmo postando todo dia...",
    submitLabel: "Gerar roteiro",
    extraFields: [
      {
        key: "video_format",
        label: "Formato do vídeo",
        type: "select",
        placeholder: "Escolha o formato do vídeo",
        options: VIDEO_FORMAT_OPTIONS,
        required: true,
        aiRecommended: true,
      },
    ],
  },
  {
    title: "Legendas estratégicas",
    description: "Cria legendas com intenção clara de descoberta, contexto e conversão, reforçando o tema do vídeo sem repetir o que já foi dito na gravação.",
    inputMode: "theme",
    aiSuggestions: false,
    inputLabel: "Qual é o tema principal do vídeo?",
    inputPlaceholder: "Ex: O erro que faz um vídeo promissor morrer nos primeiros segundos",
    submitLabel: "Gerar legendas",
    extraFields: [
      {
        key: "content_type",
        label: "Esse conteúdo é",
        type: "select",
        placeholder: "Escolha o tipo de conteúdo",
        options: [
          { value: "video_curto", label: "vídeo curto" },
          { value: "trend_adaptada", label: "trend adaptada ao nicho" },
          { value: "educativo", label: "educativo" },
          { value: "opiniao", label: "opinião" },
          { value: "react", label: "react" },
          { value: "storytelling", label: "storytelling" },
        ],
        required: true,
      },
      {
        key: "content_goal",
        label: "O objetivo principal é",
        type: "select",
        placeholder: "Escolha o objetivo principal",
        options: [
          { value: "gerar_descoberta", label: "gerar descoberta" },
          { value: "gerar_autoridade", label: "gerar autoridade" },
          { value: "gerar_conversao", label: "gerar conversão" },
          { value: "gerar_interacao", label: "gerar interação" },
        ],
        required: true,
      },
    ],
  },
  {
    title: "Caçador de trends",
    description: "Analisa o núcleo da empresa, cruza com sinais reais do TikTok e encontra trends, formatos, temas e ganchos com aderência ao nicho — sem forçar trend errada só porque está viral.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Hooks de abertura",
    description: "Cria aberturas curtas e fortes para segurar os primeiros segundos do vídeo, com foco em curiosidade, diagnóstico, contraste, erro ou promessa específica.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Sobre qual tema você quer criar hooks?",
    inputPlaceholder: "Ex: Como transformar conteúdo técnico em vídeo curto que prende atenção",
    submitLabel: "Gerar hooks",
  },
];

export const LINKEDIN_TASKS: AuthorityTask[] = [
  { title: "Post Educacional / Opinião Técnica", inputMode: "theme", aiSuggestions: true },
  { title: "Estudo de Caso / Resultado B2B", inputMode: "theme", aiSuggestions: true },
  { title: "Otimização de Perfil Pessoal (Headline e Sobre)", inputMode: "direct", aiSuggestions: false },
  { title: "Otimização de LinkedIn Page (Empresa)", inputMode: "direct", aiSuggestions: false }
];

export const GOOGLE_BUSINESS_PROFILE_TASKS: AuthorityTask[] = [
  { title: "Postagem de Atualização / Oferta", inputMode: "theme", aiSuggestions: true },
  { title: "Responder Dúvidas Frequentes (FAQ)", inputMode: "theme", aiSuggestions: true },
  { title: "Otimização de Serviços e Descrição (SEO Local)", inputMode: "direct", aiSuggestions: false },
  {
    title: "SEO Local para Serviços",
    prompt: "Com base no núcleo real da empresa, gere uma lista em tópicos de palavras-chave e frases curtas para cadastro em Editar serviços do Perfil de Empresa no Google. A lista deve fortalecer SEO local, GEO e AEO com máxima clareza semântica. Regras obrigatórias: cada item deve ter no máximo 120 caracteres; incluir o maior número possível de variações naturais, específicas e pesquisáveis; priorizar serviço principal, especialidade, intenção local, modalidade de atendimento e problemas resolvidos quando fizer sentido; evitar duplicações quase idênticas; não inventar serviços, produtos, localidades ou promessas; organizar a saída de forma pronta para copiar.",
    inputMode: "direct",
    aiSuggestions: false
  },
  {
    title: "Serviços + Descrições",
    prompt: "Com base nos serviços e produtos reais da empresa, crie uma lista em tópicos com as principais palavras-chave e suas variações pesquisáveis. Para cada serviço ou produto, entregue: 1) um nome curto com no máximo 56 caracteres; 2) uma descrição curta, natural e profissional usando SEO, GEO e AEO, contendo termos que ajudem humanos e IA a entender com clareza o que a empresa faz. Também encontre palavras similares que as pessoas pesquisam, sem inventar serviços, localidades ou promessas. A saída deve ficar organizada, pronta para cadastro e fácil de copiar.",
    inputMode: "direct",
    aiSuggestions: false
  },
  {
    title: "Responder Avaliação",
    prompt: "Me ajude a criar respostas personalizadas e profissionais para avaliações positivas do Perfil de Empresa no Google. A primeira linha deve agradecer de forma humanizada e natural. O restante da resposta deve contextualizar a experiência mencionada e incluir, de forma orgânica, o nome do produto, serviço ou especialidade relevante da empresa para fortalecer SEO local, AEO e GEO sem parecer estratégia, propaganda ou texto genérico. O tom deve ser humano, elegante e específico. Se eu enviar uma avaliação, responda exatamente a ela. Se eu não enviar, gere modelos prontos adaptáveis.",
    inputMode: "textarea",
    inputLabel: "Cole aqui a avaliação que você quer responder",
    inputPlaceholder: "Ex: Atendimento excelente, equipe muito atenciosa e o serviço foi entregue no prazo. Recomendo!",
    submitLabel: "Gerar Resposta",
    aiSuggestions: false
  }
];

export const EXTERNAL_MENTIONS_TASKS: AuthorityTask[] = [
  { title: "Kit de Menção (Textos Oficiais da Empresa)", inputMode: "direct", aiSuggestions: false },
  { title: "Modelo de Mini Apresentação (Pitch)", inputMode: "direct", aiSuggestions: false },
  { title: "Artigo / Release para Imprensa ou Parceiros", inputMode: "theme", aiSuggestions: true }
];

export const SITE_TASKS: AuthorityTask[] = [
  { title: "Artigo de Blog Otimizado (SEO/AEO/GEO)", inputMode: "theme", aiSuggestions: true },
  { title: "FAQ (Perguntas Frequentes)", inputMode: "theme", aiSuggestions: true },
  { title: "Página de Serviço / Produto", inputMode: "theme", aiSuggestions: true },
  { title: "Página Institucional (Sobre a Empresa)", inputMode: "direct", aiSuggestions: false }
];

export const DECISION_CONTENT_TASKS: AuthorityTask[] = [
  { title: "FAQ Focado em Quebra de Objeções", inputMode: "theme", aiSuggestions: true },
  { title: "Landing Page (Página de Destino de Alta Conversão)", inputMode: "theme", aiSuggestions: true },
  { title: "E-mail Persuasivo de Recuperação/Decisão", inputMode: "theme", aiSuggestions: true },
  { title: "Comparativo: Nossa Solução vs Mercado", inputMode: "direct", aiSuggestions: false }
];

export function tasksByAgentKey(agentKey?: string | null): AuthorityTask[] {
  if (!agentKey) return [];
  switch (agentKey) {
    case "youtube":
      return YOUTUBE_TASKS;
    case "instagram":
      return INSTAGRAM_TASKS;
    case "tiktok":
      return TIKTOK_TASKS;
    case "linkedin":
      return LINKEDIN_TASKS;
    case "google_business_profile":
      return GOOGLE_BUSINESS_PROFILE_TASKS;
    case "external_mentions":
      return EXTERNAL_MENTIONS_TASKS;
    case "site":
      return SITE_TASKS;
    case "decision_content":
      return DECISION_CONTENT_TASKS;
    default:
      return [];
  }
}