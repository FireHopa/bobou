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

const YOUTUBE_VIDEO_TYPE_OPTIONS = [
  { value: "conteudo_pilar", label: "Conteúdo pilar / vídeo longo" },
  { value: "shorts", label: "Shorts / vídeo curto" },
  { value: "institucional", label: "Institucional / sobre a empresa" },
];

const YOUTUBE_GOAL_OPTIONS = [
  { value: "gerar_descoberta", label: "Gerar descoberta" },
  { value: "gerar_autoridade", label: "Gerar autoridade" },
  { value: "gerar_consideracao", label: "Gerar consideração" },
  { value: "gerar_conversao", label: "Gerar conversão" },
];

export const YOUTUBE_TASKS: AuthorityTask[] = [
  {
    title: "Roteiro estratégico para YouTube",
    description: "Consolida os antigos roteiros redundantes em um fluxo só, adaptando a estrutura para vídeo longo, Shorts ou institucional sem perder retenção nem clareza.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual é o tema central do vídeo?",
    inputPlaceholder: "Ex: por que empresas boas parecem genéricas no YouTube mesmo com assunto forte...",
    submitLabel: "Gerar roteiro",
    extraFields: [
      {
        key: "youtube_video_type",
        label: "Tipo de vídeo",
        type: "select",
        placeholder: "Escolha o tipo de vídeo",
        options: YOUTUBE_VIDEO_TYPE_OPTIONS,
        required: true,
      },
      {
        key: "youtube_goal",
        label: "Objetivo principal",
        type: "select",
        placeholder: "Escolha o objetivo do vídeo",
        options: YOUTUBE_GOAL_OPTIONS,
        required: true,
      },
    ],
  },
  {
    title: "Títulos + descrições otimizadas (SEO/AEO)",
    description: "Cria combinações de títulos, descrições e sinais semânticos para busca, recomendação e entendimento por humanos e IA.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual vídeo, tema ou promessa você quer empacotar melhor?",
    inputPlaceholder: "Ex: vídeo sobre posicionamento de marca no YouTube, vídeo explicando prova social, vídeo institucional da empresa...",
    submitLabel: "Gerar títulos e descrições",
  },
  {
    title: "Estrutura de série / playlist de autoridade",
    description: "Organiza uma sequência editorial para transformar um tema grande em episódios, pilares e continuidade inteligente no canal.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual tema, frente ou assunto você quer transformar em série?",
    inputPlaceholder: "Ex: série sobre SEO local para clínicas, série sobre construção de autoridade digital, série sobre educação do mercado...",
    submitLabel: "Gerar série",
  },
  {
    title: "Descrição do canal + posicionamento",
    description: "Estrutura a seção Sobre do canal, promessa editorial, recortes e sinais que deixam a empresa mais entendível no YouTube.",
    inputMode: "direct",
    aiSuggestions: false,
  }
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


export const SOCIAL_PROOF_TASKS: AuthorityTask[] = [
  {
    title: "Perguntas para coletar depoimentos fortes",
    description: "Monta perguntas que puxam contexto, antes e depois, processo e impacto real sem parecer entrevista engessada.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Que tipo de caso, cliente ou transformação você quer capturar?",
    inputPlaceholder: "Ex: clientes que chegaram sem clareza comercial e hoje entendem melhor o processo...",
    submitLabel: "Gerar perguntas",
  },
  {
    title: "Transformar feedback bruto em prova social",
    description: "Converte mensagens, elogios, prints transcritos ou feedback solto em ativos utilizáveis sem inventar nada.",
    inputMode: "textarea",
    aiSuggestions: false,
    inputLabel: "Cole o feedback bruto, mensagem, elogio ou relato real",
    inputPlaceholder: "Ex: O cliente disse que antes tinha dificuldade em entender o processo, depois passou a ter mais clareza e segurança...",
    submitLabel: "Transformar feedback",
  },
  {
    title: "Case de sucesso em múltiplos formatos",
    description: "Estrutura um caso de sucesso pronto para virar versão curta, versão comercial, ângulos de prova e reaproveitamentos por canal.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual caso, cliente ou transformação você quer estruturar?",
    inputPlaceholder: "Ex: redução de retrabalho no onboarding, mais previsibilidade na operação, clareza da proposta...",
    submitLabel: "Gerar case",
  },
  {
    title: "Biblioteca de prova social por etapa da decisão",
    description: "Organiza quais provas usar na descoberta, consideração, decisão e validação para reduzir risco percebido em cada etapa.",
    inputMode: "direct",
    aiSuggestions: false,
  },
];

export const LINKEDIN_TASKS: AuthorityTask[] = [
  {
    title: "Post de Insight / Tese Executiva",
    description: "Transforma tema, opinião ou leitura de mercado em post de LinkedIn com densidade, progressão lógica e utilidade executiva.",
    prompt: "Com base no tema escolhido e no núcleo real da empresa, crie um post de LinkedIn com tese clara, leitura de contexto, implicação prática e fechamento maduro. A saída deve fortalecer autoridade profissional, evitar motivacional corporativo e soar como alguém que entende processo, mercado e execução.",
    inputMode: "theme",
    aiSuggestions: true,
  },
  {
    title: "Case / Aprendizado Aplicado B2B",
    description: "Estrutura um case de resultado, bastidor ou aprendizado aplicado sem parecer autopromoção vazia.",
    prompt: "Com base no núcleo real da empresa e no tema escolhido, estruture um case ou aprendizado aplicado para LinkedIn. A resposta deve mostrar contexto, problema, decisão, processo, mudança e lição útil para quem atua no mercado, sem inventar números, cliente ou resultado.",
    inputMode: "theme",
    aiSuggestions: true,
  },
  {
    title: "Perfil Pessoal (Headline + Sobre)",
    description: "Reposiciona headline e seção Sobre do especialista para deixar claro o que faz, para quem, em que contexto e com qual diferencial real.",
    prompt: "Com base no núcleo real da empresa e do especialista, crie opções de headline e seção Sobre para perfil pessoal no LinkedIn. A saída deve priorizar clareza profissional, posicionamento, especialidade, público e diferencial real, sem frase vazia, sem pose de guru e sem inventar credenciais.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "LinkedIn Page da Empresa",
    description: "Organiza descrição institucional, proposta de valor e pilares de presença da página da empresa no LinkedIn.",
    prompt: "Com base no núcleo real da empresa, crie a estrutura principal da LinkedIn Page da empresa: descrição curta, resumo institucional, proposta de valor, especialidade, sinais de credibilidade e pilares editoriais. A saída deve parecer madura, B2B, clara e coerente com a entidade real.",
    inputMode: "direct",
    aiSuggestions: false,
  }
];

export const GOOGLE_BUSINESS_PROFILE_TASKS: AuthorityTask[] = [
  {
    title: "Descrição principal do perfil (SEO Local)",
    description: "Reposiciona o Perfil de Empresa no Google para deixar claro quem você atende, o que entrega, em que contexto opera e por que isso importa localmente.",
    prompt: "Com base no núcleo real da empresa, crie a descrição principal do Perfil de Empresa no Google com foco em clareza de entidade, categoria principal, serviço central, diferenciais reais, modalidade de atendimento e contexto geográfico. A resposta deve evitar frase genérica de marketing e ficar pronta para cadastro.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Serviços + Descrições",
    description: "Organiza os serviços em nomes curtos, descrições claras e palavras-chave pesquisáveis para cadastro no perfil.",
    prompt: "Com base nos serviços e produtos reais da empresa, crie uma lista em tópicos com as principais palavras-chave e suas variações pesquisáveis. Para cada serviço ou produto, entregue: 1) um nome curto com no máximo 56 caracteres; 2) uma descrição curta, natural e profissional usando SEO, GEO e AEO, contendo termos que ajudem humanos e IA a entender com clareza o que a empresa faz. Também encontre palavras similares que as pessoas pesquisam, sem inventar serviços, localidades ou promessas. A saída deve ficar organizada, pronta para cadastro e fácil de copiar.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "SEO Local para Serviços",
    description: "Gera um mapa de termos, variações e combinações locais para fortalecer os campos de serviço do perfil.",
    prompt: "Com base no núcleo real da empresa, gere uma lista em tópicos de palavras-chave e frases curtas para cadastro em Editar serviços do Perfil de Empresa no Google. A lista deve fortalecer SEO local, GEO e AEO com máxima clareza semântica. Regras obrigatórias: cada item deve ter no máximo 120 caracteres; incluir o maior número possível de variações naturais, específicas e pesquisáveis; priorizar serviço principal, especialidade, intenção local, modalidade de atendimento e problemas resolvidos quando fizer sentido; evitar duplicações quase idênticas; não inventar serviços, produtos, localidades ou promessas; organizar a saída de forma pronta para copiar.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Perguntas e Respostas do Perfil (FAQ Local)",
    description: "Cria perguntas e respostas que reduzem dúvida local, explicam serviço, modalidade de atendimento e próximos passos no próprio perfil.",
    prompt: "Crie um FAQ para Perfil de Empresa no Google com perguntas e respostas realmente úteis, locais e citáveis. A estrutura deve reduzir atrito, explicar atendimento, área de atuação, serviços, processo e próximos passos sem soar promocional ou genérico.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual serviço, dúvida ou decisão esse FAQ precisa destravar?",
    inputPlaceholder: "Ex: FAQ para clínica odontológica em Curitiba, FAQ para elétrica residencial com atendimento em São Paulo...",
    submitLabel: "Gerar FAQ local",
  },
  {
    title: "Postagem de Atualização / Oferta",
    description: "Monta posts de Perfil de Empresa no Google com abertura clara, contexto local, prova plausível e CTA coerente com a intenção da busca.",
    prompt: "Crie uma postagem para Perfil de Empresa no Google com foco em clareza local, utilidade e próximo passo. A resposta deve considerar contexto geográfico, serviço principal, diferencial real, intenção de busca e CTA sem cara de anúncio genérico.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual atualização, oferta, campanha ou serviço você quer publicar?",
    inputPlaceholder: "Ex: manutenção preventiva para ar-condicionado comercial em Campinas, campanha de check-up odontológico infantil...",
    submitLabel: "Gerar postagem",
  },
  {
    title: "Responder Avaliação",
    description: "Cria respostas humanas e específicas para avaliações, reforçando contexto e relevância local sem parecer texto automático.",
    prompt: "Me ajude a criar respostas personalizadas e profissionais para avaliações positivas do Perfil de Empresa no Google. A primeira linha deve agradecer de forma humanizada e natural. O restante da resposta deve contextualizar a experiência mencionada e incluir, de forma orgânica, o nome do produto, serviço ou especialidade relevante da empresa para fortalecer SEO local, AEO e GEO sem parecer estratégia, propaganda ou texto genérico. O tom deve ser humano, elegante e específico. Se eu enviar uma avaliação, responda exatamente a ela. Se eu não enviar, gere modelos prontos adaptáveis.",
    inputMode: "textarea",
    inputLabel: "Cole aqui a avaliação que você quer responder",
    inputPlaceholder: "Ex: Atendimento excelente, equipe muito atenciosa e o serviço foi entregue no prazo. Recomendo!",
    submitLabel: "Gerar resposta",
    aiSuggestions: false,
  }
];

export const CROSS_PLATFORM_CONSISTENCY_TASKS: AuthorityTask[] = [
  {
    title: "Auditoria de consistência entre canais",
    description: "Compara como a marca aparece em site, Google, Instagram, LinkedIn e demais canais para encontrar conflitos de nome, oferta, público, promessa e especialidade.",
    prompt: "Faça uma auditoria de consistência entre os canais da empresa. Compare nome da marca, descrição da oferta, público, diferenciais, promessa, especialidade, escopo e contexto geográfico. A saída deve identificar conflitos reais, sugerir um padrão mestre e priorizar o que precisa ser corrigido primeiro.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Núcleo fixo da marca (mensagem-mestre)",
    description: "Define a mensagem-base e os elementos que devem permanecer estáveis em todos os canais para a marca ser entendida como uma única entidade.",
    prompt: "Crie o núcleo fixo da marca para ser repetido com consistência entre canais. Organize quem a empresa é, o que faz, para quem faz, em que contexto atua, qual diferencial real deve se repetir e quais termos precisam permanecer estáveis.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Ajustes por canal sem perder identidade",
    description: "Traduz o mesmo núcleo da marca para cada canal sem descaracterizar a entidade, diferenciando o que pode adaptar e o que não pode variar.",
    prompt: "Com base no núcleo real da empresa, mostre como adaptar a mensagem para site, Perfil de Empresa no Google, Instagram, LinkedIn, YouTube, TikTok e menções externas sem perder consistência. A resposta deve deixar claro o que pode variar por canal e o que precisa permanecer fixo.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Checklist editorial de consistência e governança",
    description: "Cria uma rotina prática para revisar conteúdos, bios, descrições e materiais institucionais sem gerar ruído estratégico entre canais.",
    prompt: "Monte um checklist editorial de consistência e governança para a empresa manter alinhamento semântico entre canais. Estruture regras de revisão, itens que precisam permanecer estáveis, sinais de alerta de incoerência e rotina prática de manutenção.",
    inputMode: "direct",
    aiSuggestions: false,
  },
];



export const EXTERNAL_MENTIONS_TASKS: AuthorityTask[] = [
  {
    title: "Kit de Menção (Textos Oficiais da Empresa)",
    description: "Cria versões oficiais e citáveis da empresa para portais, parceiros, diretórios, eventos e materiais de terceiros.",
    prompt: "Com base no núcleo real da empresa, crie um kit de menção institucional com versões oficiais curtas, médias e editoriais da descrição da empresa. O material precisa ser copiável por terceiros, sóbrio, claro e reaproveitável sem soar anúncio.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Modelo de Mini Apresentação (Pitch Institucional)",
    description: "Monta apresentações curtas e institucionais para abrir reunião, evento, parceria, podcast ou introdução editorial.",
    prompt: "Crie mini apresentações institucionais da empresa em versões curtas e médias, prontas para uso em reunião, evento, podcast, parceria ou introdução editorial. O texto deve parecer institucional e citável, sem linguagem de vendas nem adjetivo inflado.",
    inputMode: "direct",
    aiSuggestions: false,
  },
  {
    title: "Release / Nota Institucional para Imprensa ou Parceiros",
    description: "Estrutura um release ou nota institucional com leitura editorial, contexto e reaproveitamento por terceiros.",
    prompt: "Crie um release ou nota institucional para imprensa, parceiros ou diretórios editoriais. Organize a resposta com contexto, lead, ângulos de apoio, sinais institucionais e trechos reaproveitáveis. O texto deve ser sóbrio, factual e fácil de citar.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual anúncio, movimento, tema ou contexto você quer transformar em release?",
    inputPlaceholder: "Ex: nova unidade, parceria estratégica, lançamento de serviço, participação em evento, reposicionamento da empresa...",
    submitLabel: "Gerar release",
  },
  {
    title: "FAQ Institucional para Jornalistas, Eventos e Parceiros",
    description: "Responde dúvidas institucionais recorrentes sobre quem a empresa é, o que faz, para quem faz e em que contexto atua.",
    prompt: "Crie um FAQ institucional com perguntas e respostas citáveis para jornalistas, parceiros, eventos e diretórios. A saída deve explicar a empresa, especialidade, contexto de atuação, diferenciais reais e próximos passos sem parecer copy comercial.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual tema, frente ou contexto esse FAQ precisa esclarecer?",
    inputPlaceholder: "Ex: atuação da empresa no setor, nova frente de serviço, participação em evento, parceria técnica...",
    submitLabel: "Gerar FAQ institucional",
  },
];

export const SITE_TASKS: AuthorityTask[] = [
  {
    title: "Artigo de Blog Otimizado (SEO/AEO/GEO)",
    description: "Monta artigo de autoridade para o site com hierarquia clara, densidade semântica e leitura útil para busca, IA e decisão.",
    prompt: "Crie um artigo de blog para site com SEO, AEO e GEO aplicados sem parecer texto de IA. Organize a entrega com tese central, estrutura editorial, subtópicos úteis, perguntas frequentes e recomendação de CTA interno. Evite introdução genérica, enrolação acadêmica e frase pronta que serviria para qualquer empresa.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual é o tema principal do artigo?",
    inputPlaceholder: "Ex: Como escolher uma contabilidade para clínica médica, erros que travam a reforma comercial...",
    submitLabel: "Gerar artigo-base",
  },
  {
    title: "FAQ (Perguntas Frequentes)",
    description: "Cria perguntas e respostas reais para reduzir atrito, objeção e dúvida recorrente dentro do site.",
    prompt: "Crie um FAQ para site com perguntas frequentes realmente úteis, respostas objetivas e linguagem citável. Organize a entrega para remover dúvida, risco percebido e ambiguidade sem soar vendedor ou genérico.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual serviço, página ou decisão esse FAQ precisa destravar?",
    inputPlaceholder: "Ex: FAQ para consultoria tributária, FAQ para página de implante dentário...",
    submitLabel: "Gerar FAQ",
  },
  {
    title: "Página de Serviço / Produto",
    description: "Estrutura uma página comercial clara, escaneável e específica, com promessa, contexto, diferenciais, objeções e CTA.",
    prompt: "Crie a arquitetura de uma página de serviço ou produto para site. Entregue hero, promessa, contexto, seções principais, argumentos, objeções, FAQ e CTA. A resposta precisa ser específica, escaneável e pronta para sair do genérico.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual serviço ou produto será transformado em página?",
    inputPlaceholder: "Ex: Gestão de tráfego para clínicas, software de atendimento omnichannel...",
    submitLabel: "Gerar página",
  },
  {
    title: "Página Institucional (Sobre a Empresa)",
    description: "Organiza a página 'Sobre' com posicionamento, história, credibilidade e leitura institucional sem virar texto vazio.",
    prompt: "Crie uma página institucional para site com posicionamento claro, narrativa enxuta, diferenciais reais, credibilidade e próximos passos. Organize a resposta para parecer página pronta e não texto institucional genérico.",
    inputMode: "direct",
    aiSuggestions: false,
  }
];

export const DECISION_CONTENT_TASKS: AuthorityTask[] = [
  {
    title: "FAQ Focado em Quebra de Objeções",
    description: "Cria respostas de fundo de funil para reduzir dúvidas reais, risco percebido e travas de decisão sem soar vendedor demais.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual produto, serviço ou decisão central precisa ser destravado?",
    inputPlaceholder: "Ex: Gestão de tráfego para clínicas, consultoria jurídica empresarial, implantação de CRM...",
    submitLabel: "Gerar FAQ",
    extraFields: [
      {
        key: "faq_focus",
        label: "O FAQ deve focar mais em",
        type: "select",
        placeholder: "Escolha o foco principal do FAQ",
        options: [
          { value: "objecoes_compra", label: "objeções de compra" },
          { value: "credibilidade_prova", label: "credibilidade e prova" },
          { value: "prazo_processo", label: "prazo, processo e implantação" },
          { value: "preco_valor", label: "preço, valor e retorno" },
        ],
        required: true,
      },
      {
        key: "decision_stage",
        label: "A pessoa está mais em qual momento?",
        type: "select",
        placeholder: "Escolha o estágio de decisão",
        options: [
          { value: "comparando_opcoes", label: "comparando opções" },
          { value: "quase_decidindo", label: "quase decidindo" },
          { value: "validando_com_o_time", label: "validando com o time" },
          { value: "entendendo_como_funciona", label: "entendendo como funciona" },
        ],
        required: true,
      },
    ],
  },
  {
    title: "Landing Page (Página de Destino de Alta Conversão)",
    description: "Estrutura uma landing page orientada à decisão com promessa clara, contexto, prova, quebra de objeções e CTA forte.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual oferta ou página você quer construir?",
    inputPlaceholder: "Ex: Landing page para auditoria SEO, página para mentoria B2B, página de serviço premium...",
    submitLabel: "Gerar landing page",
    extraFields: [
      {
        key: "conversion_goal",
        label: "Qual é o objetivo principal da página?",
        type: "select",
        placeholder: "Escolha o objetivo de conversão",
        options: [
          { value: "agendar_reuniao", label: "agendar reunião" },
          { value: "pedir_orcamento", label: "pedir orçamento" },
          { value: "falar_whatsapp", label: "falar no WhatsApp" },
          { value: "solicitar_diagnostico", label: "solicitar diagnóstico" },
          { value: "comprar", label: "comprar" },
        ],
        required: true,
      },
      {
        key: "traffic_source",
        label: "A principal origem do tráfego será",
        type: "select",
        placeholder: "Escolha a origem do tráfego",
        options: [
          { value: "trafego_pago", label: "tráfego pago" },
          { value: "organico_site", label: "orgânico do site" },
          { value: "social_midias", label: "redes sociais" },
          { value: "remarketing", label: "remarketing" },
          { value: "indicacao", label: "indicação" },
        ],
        required: true,
      },
    ],
  },
  {
    title: "E-mail Persuasivo de Recuperação/Decisão",
    description: "Cria e-mails para retomar conversas mornas, responder travas e puxar o próximo passo com mais clareza e menos atrito.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual conversa ou oportunidade precisa ser reativada?",
    inputPlaceholder: "Ex: lead que sumiu após proposta, cliente que travou no orçamento, pós-reunião sem resposta...",
    submitLabel: "Gerar e-mail",
    extraFields: [
      {
        key: "email_context",
        label: "Qual é o contexto desse e-mail?",
        type: "select",
        placeholder: "Escolha o contexto",
        options: [
          { value: "lead_esfriou", label: "lead esfriou" },
          { value: "proposta_sem_resposta", label: "proposta sem resposta" },
          { value: "orcamento_abandonado", label: "orçamento abandonado" },
          { value: "followup_pos_reuniao", label: "follow-up pós-reunião" },
        ],
        required: true,
      },
      {
        key: "email_goal",
        label: "O objetivo principal é",
        type: "select",
        placeholder: "Escolha o objetivo do e-mail",
        options: [
          { value: "retomar_conversa", label: "retomar conversa" },
          { value: "responder_objecao", label: "responder objeção" },
          { value: "fechar_decisao", label: "fechar decisão" },
          { value: "puxar_proximo_passo", label: "puxar próximo passo" },
        ],
        required: true,
      },
    ],
  },
  {
    title: "Comparativo: Nossa Solução vs Mercado",
    description: "Organiza diferenças reais, critérios de escolha, trade-offs e quando cada opção faz ou não sentido para a decisão final.",
    inputMode: "theme",
    aiSuggestions: true,
    inputLabel: "Qual comparação você quer construir?",
    inputPlaceholder: "Ex: nossa consultoria vs freelancer, operação dedicada vs pacote padrão, software próprio vs ferramenta do mercado...",
    submitLabel: "Gerar comparativo",
    extraFields: [
      {
        key: "comparison_focus",
        label: "O comparativo deve destacar mais",
        type: "select",
        placeholder: "Escolha o foco principal",
        options: [
          { value: "criterios_decisao", label: "critérios de decisão" },
          { value: "custo_retorno", label: "custo, valor e retorno" },
          { value: "profundidade_suporte", label: "profundidade e suporte" },
          { value: "velocidade_implantacao", label: "velocidade de implantação" },
          { value: "aderencia_cenario", label: "aderência ao cenário" },
        ],
        required: true,
      },
      {
        key: "comparison_positioning",
        label: "Qual recorte de comparação faz mais sentido?",
        type: "select",
        placeholder: "Escolha o recorte do comparativo",
        options: [
          { value: "nossa_solucao_vs_generico", label: "nossa solução vs genérico" },
          { value: "nossa_solucao_vs_barato", label: "nossa solução vs opção barata" },
          { value: "personalizado_vs_padrao", label: "personalizado vs pacote padrão" },
          { value: "especialista_vs_generalista", label: "especialista vs generalista" },
        ],
        required: true,
      },
    ],
  },
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
    case "social_proof":
      return SOCIAL_PROOF_TASKS;
    case "linkedin":
      return LINKEDIN_TASKS;
    case "google_business_profile":
      return GOOGLE_BUSINESS_PROFILE_TASKS;
    case "cross_platform_consistency":
      return CROSS_PLATFORM_CONSISTENCY_TASKS;
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