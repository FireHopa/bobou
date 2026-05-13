import { exportAuthorityFormat } from "@/lib/authorityExport";

export type SocialPublisherPlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";

export type SocialPublisherDraft = {
  selected: Record<SocialPublisherPlatformKey, boolean>;
  baseCaption: string;
  mediaUrlsText: string;
  linkUrl: string;
  scheduledAt: string;
  perNetworkCaption: Record<SocialPublisherPlatformKey, string>;
  instagramFirstComment: string;
  instagramCollaborators: string;
  facebookPlace: string;
  facebookTags: string;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string;
  youtubeCategoryId: string;
  youtubePrivacyStatus: "private" | "public" | "unlisted";
  youtubeMadeForKids: boolean;
};

export type SocialPublisherImportNotice = {
  source: "authority_agent";
  agentKey: string;
  agentName: string;
  title: string;
  preview: string;
  importedAt: string;
};

export const SOCIAL_PUBLISHER_DRAFT_STORAGE_KEY = "bob:social-publisher:draft:v1";
export const SOCIAL_PUBLISHER_IMPORT_NOTICE_KEY = "bob:social-publisher:authority-import:v1";

const IMAGE_URL_PATTERN = /https?:\/\/[^\s)\]}>"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)\]}>"']*)?/gi;
const URL_PATTERN = /https?:\/\/[^\s)\]}>"']+/gi;

const PUBLIC_SECTION_TOKENS = [
  "legenda",
  "caption",
  "copy",
  "post",
  "postagem",
  "publicacao",
  "publicação",
  "texto do post",
  "texto da postagem",
  "texto para postar",
  "texto para publicacao",
  "texto para publicação",
  "conteudo do post",
  "conteúdo do post",
  "conteudo para postar",
  "conteúdo para postar",
  "conteudo para publicacao",
  "conteúdo para publicação",
  "conteudo final",
  "conteúdo final",
  "copy final",
  "texto final",
  "versao final",
  "versão final",
  "publicacao pronta",
  "publicação pronta",
  "post pronto",
  "post linkedin",
  "post para linkedin",
  "post para instagram",
  "post para facebook",
  "post para perfil de empresa",
  "postagem perfil de empresa",
  "postagem de atualizacao",
  "postagem de atualização",
  "postagem de oferta",
  "resposta pronta",
  "resposta para publicar",
  "descricao para youtube",
  "descrição para youtube",
  "descricao do video",
  "descrição do vídeo",
  "descricao youtube",
  "descrição youtube",
];

const PUBLIC_APPEND_SECTION_TOKENS = [
  "hashtags",
  "hashtag",
  "cta",
  "chamada para acao",
  "chamada para ação",
  "primeiro comentario",
  "primeiro comentário",
];

const READER_ONLY_SECTION_TOKENS = [
  "analise",
  "análise",
  "analise do tema",
  "análise do tema",
  "diagnostico",
  "diagnóstico",
  "estrategia",
  "estratégia",
  "estrategia do video",
  "estratégia do vídeo",
  "racional",
  "justificativa",
  "porque isso funciona",
  "por que isso funciona",
  "leitura estrategica",
  "leitura estratégica",
  "contexto",
  "briefing",
  "observacao",
  "observação",
  "observacoes",
  "observações",
  "nota",
  "notas",
  "como usar",
  "instrucoes",
  "instruções",
  "orientacao",
  "orientação",
  "orientacoes",
  "orientações",
  "proximos passos",
  "próximos passos",
  "passo a passo",
  "plano de acao",
  "plano de ação",
  "checklist",
  "calendario",
  "calendário",
  "pilares",
  "linha editorial",
  "estrutura",
  "arquitetura",
  "roteiro segundo a segundo",
  "roteiro",
  "texto na tela",
  "hooks",
  "hook",
  "formato do video",
  "formato do vídeo",
  "variacoes",
  "variações",
  "alternativas",
  "sugestoes",
  "sugestões",
  "palavras-chave",
  "palavras chave",
  "seo",
  "aeo",
  "geo",
  "faq",
  "perguntas frequentes",
  "comparativo",
  "tabela comparativa",
  "mercado",
  "nossa solucao",
  "nossa solução",
  "leitura de decisao",
  "leitura de decisão",
  "servicos",
  "serviços",
  "descricoes de servicos",
  "descrições de serviços",
];

const NON_POST_STRUCTURAL_TOKENS = [
  "headline",
  "sobre",
  "bio",
  "destaque",
  "destaques",
  "perfil",
  "linkedin page",
  "pagina",
  "página",
  "pagina institucional",
  "página institucional",
  "descricao principal",
  "descrição principal",
  "descricao curta",
  "descrição curta",
  "descricao media",
  "descrição média",
  "servicos",
  "serviços",
  "artigo",
  "blog",
  "landing page",
  "release",
  "nota institucional",
  "pitch",
  "perguntas",
  "respostas",
  "titulo",
  "título",
  "titulos",
  "títulos",
  "descricoes otimizadas",
  "descrições otimizadas",
];

const PUBLICABLE_STRUCTURED_KEYS = [
  "legenda",
  "caption",
  "copy",
  "post",
  "postagem",
  "publicacao",
  "publicação",
  "texto_post",
  "texto_do_post",
  "texto_da_postagem",
  "texto_para_postar",
  "texto_para_publicacao",
  "texto_para_publicação",
  "conteudo_post",
  "conteúdo_post",
  "conteudo_do_post",
  "conteúdo_do_post",
  "conteudo_para_postar",
  "conteúdo_para_postar",
  "conteudo_para_publicacao",
  "conteúdo_para_publicação",
  "copy_final",
  "texto_final",
  "post_final",
  "linkedin_post",
  "instagram_caption",
  "facebook_caption",
  "youtube_description",
  "descricao_youtube",
  "descrição_youtube",
  "descricao_do_video",
  "descrição_do_vídeo",
];

type JsonRecord = Record<string, unknown>;

type ScriptTimelineItem = {
  tempo?: string;
  acao?: string;
  fala?: string;
};

type ScriptPayload = {
  titulo_da_tela?: string;
  analise_do_tema?: string;
  estrategia_do_video?: string;
  hooks?: string[];
  roteiro_segundo_a_segundo?: ScriptTimelineItem[];
  texto_na_tela?: string[];
  variacoes?: string[];
  legenda?: string;
  [key: string]: unknown;
};

type AuthorityBlock = {
  tipo?: string;
  conteudo?: unknown;
  [key: string]: unknown;
};

type AuthorityBlockPayload = {
  titulo_da_tela?: string;
  blocos?: AuthorityBlock[];
  [key: string]: unknown;
};

function safeText(value: unknown) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseJson(raw: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
  } catch {
    // O resultado também pode vir em markdown normal.
  }
  return null;
}

function normalizeLabel(value: unknown) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[“”"'`*#>|•]/g, "")
    .replace(/[.:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function keyMatches(key: string, tokens: string[]) {
  const normalized = normalizeLabel(key);
  if (!normalized) return false;

  return tokens.some((token) => {
    const normalizedToken = normalizeLabel(token);
    if (!normalizedToken) return false;
    return normalized === normalizedToken || normalized.includes(normalizedToken);
  });
}

function isPublicSectionLabel(label: string) {
  return keyMatches(label, PUBLIC_SECTION_TOKENS);
}

function isPublicAppendSectionLabel(label: string) {
  return keyMatches(label, PUBLIC_APPEND_SECTION_TOKENS);
}

function isReaderOnlySectionLabel(label: string) {
  return keyMatches(label, READER_ONLY_SECTION_TOKENS);
}

function getFirstString(value: unknown): string {
  if (typeof value === "string") return safeText(value);
  if (typeof value === "number" || typeof value === "boolean") return safeText(value);
  if (Array.isArray(value)) return value.map(getFirstString).find(Boolean) || "";
  if (isRecord(value)) {
    const direct = safeText(value.texto || value.text || value.conteudo || value.content || value.resposta || value.copy || value.legenda || value.caption || value.post || value.postagem);
    if (direct) return direct;
  }
  return "";
}

function isScriptPayload(value: unknown): value is ScriptPayload {
  return isRecord(value) && ["analise_do_tema", "estrategia_do_video", "hooks", "roteiro_segundo_a_segundo", "texto_na_tela", "variacoes", "legenda"].some((key) => key in value);
}

function isBlockPayload(value: unknown): value is AuthorityBlockPayload {
  return isRecord(value) && Array.isArray(value.blocos);
}

function removeMarkdownChrome(text: string) {
  return safeText(text)
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[>\s]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCopyLabel(text: string) {
  let out = removeMarkdownChrome(text);

  out = out.replace(/^\s*(?:op[cç][aã]o|vers[aã]o|varia[cç][aã]o|legenda|post|postagem|copy|texto final|conte[uú]do final)\s*\d*\s*[:.)-]\s*/i, "");
  out = out.replace(/^\s*(?:texto para postar|conte[uú]do para postar|publica[cç][aã]o pronta)\s*[:.)-]\s*/i, "");

  return out.trim();
}

function detectExplicitLabel(line: string): { label: string; rest: string; isBoundary: boolean } | null {
  const cleaned = line.trim().replace(/^[-*•\d.)\s]+/, "").trim();
  if (!cleaned) return null;

  const headingMatch = /^#{1,6}\s+(.+)$/.exec(cleaned);
  if (headingMatch) {
    const label = headingMatch[1].trim();
    const isBoundary = isPublicSectionLabel(label) || isPublicAppendSectionLabel(label) || isReaderOnlySectionLabel(label);
    return isBoundary ? { label, rest: "", isBoundary } : null;
  }

  const labelWithRest = /^([^:]{2,90}):\s*(.*)$/.exec(cleaned);
  if (labelWithRest) {
    const label = labelWithRest[1].trim();
    const rest = labelWithRest[2].trim();
    const isBoundary = isPublicSectionLabel(label) || isPublicAppendSectionLabel(label) || isReaderOnlySectionLabel(label);
    return isBoundary ? { label, rest, isBoundary } : null;
  }

  const normalized = normalizeLabel(cleaned);
  if (cleaned.length <= 90 && (isPublicSectionLabel(normalized) || isPublicAppendSectionLabel(normalized) || isReaderOnlySectionLabel(normalized))) {
    return { label: cleaned, rest: "", isBoundary: true };
  }

  return null;
}

function extractLabeledPublicSections(text: string) {
  const lines = safeText(text).split("\n");
  const sections: { label: string; body: string; publicable: boolean }[] = [];
  let current: { label: string; bodyLines: string[]; publicable: boolean } | null = null;

  const flush = () => {
    if (!current) return;
    const body = stripCopyLabel(current.bodyLines.join("\n"));
    if (body) sections.push({ label: current.label, body, publicable: current.publicable });
    current = null;
  };

  for (const line of lines) {
    const detected = detectExplicitLabel(line);

    if (detected) {
      flush();
      const publicable = isPublicSectionLabel(detected.label) || isPublicAppendSectionLabel(detected.label);
      current = { label: detected.label, bodyLines: detected.rest ? [detected.rest] : [], publicable };
      continue;
    }

    if (current) current.bodyLines.push(line);
  }

  flush();

  const publicSections = sections.filter((section) => section.publicable).map((section) => section.body).filter(Boolean);
  return publicSections.length ? linesToText(publicSections) : "";
}

function removeReaderOnlySections(text: string) {
  const lines = safeText(text).split("\n");
  const out: string[] = [];
  let skipping = false;
  let sawReaderSection = false;

  for (const line of lines) {
    const detected = detectExplicitLabel(line);

    if (detected) {
      if (isReaderOnlySectionLabel(detected.label)) {
        skipping = true;
        sawReaderSection = true;
        continue;
      }

      if (isPublicSectionLabel(detected.label) || isPublicAppendSectionLabel(detected.label)) {
        skipping = false;
        if (detected.rest) out.push(detected.rest);
        continue;
      }
    }

    if (!skipping) out.push(line);
  }

  return sawReaderSection ? stripCopyLabel(out.join("\n")) : "";
}

function looksMostlyReaderOnly(text: string) {
  const normalized = normalizeLabel(text);
  const readerHits = READER_ONLY_SECTION_TOKENS.filter((token) => normalized.includes(normalizeLabel(token))).length;
  const publicHits = PUBLIC_SECTION_TOKENS.filter((token) => normalized.includes(normalizeLabel(token))).length;
  return readerHits >= 2 && publicHits === 0;
}

function countStructuralLabels(text: string) {
  return safeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.length > 100) return false;
      if (/^#{1,6}\s+/.test(line)) return true;
      if (/^[^:]{2,80}:\s*$/.test(line)) return true;
      if (/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s/()+&.,-]{3,90}$/.test(line) && line === line.toUpperCase()) return true;
      return false;
    }).length;
}

function hasNonPostStructuralLabel(text: string) {
  return safeText(text)
    .split("\n")
    .some((line) => {
      const cleaned = line.trim().replace(/^#{1,6}\s+/, "").replace(/:.*$/, "");
      if (!cleaned || cleaned.length > 90) return false;
      return keyMatches(cleaned, NON_POST_STRUCTURAL_TOKENS);
    });
}

function looksLikeReadyPostWithoutLabel(text: string) {
  const cleaned = stripCopyLabel(text);
  if (!isUsablePostText(cleaned)) return false;
  if (cleaned.length > 2200) return false;
  if (hasNonPostStructuralLabel(cleaned)) return false;
  if (countStructuralLabels(cleaned) >= 3) return false;
  return true;
}

function isUsablePostText(text: string) {
  const cleaned = stripCopyLabel(text);
  if (cleaned.length < 8) return false;
  if (looksMostlyReaderOnly(cleaned)) return false;
  return true;
}

function linesToText(lines: string[]) {
  return lines
    .map((line) => safeText(line))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectPublicStructuredFields(value: unknown, agentKey: string, depth = 0): string[] {
  if (!isRecord(value) || depth > 4) return [];

  const out: string[] = [];

  for (const [key, current] of Object.entries(value)) {
    if (key === "blocos" || key === "blocks" || key === "roteiro_segundo_a_segundo" || key === "hooks" || key === "texto_na_tela" || key === "variacoes") continue;

    const normalizedKey = normalizeLabel(key);
    const isExplicitPublicKey = PUBLICABLE_STRUCTURED_KEYS.some((token) => normalizedKey === normalizeLabel(token) || normalizedKey.includes(normalizeLabel(token)));
    const isYoutubeDescription = agentKey === "youtube" && ["description", "descricao", "descrição"].includes(normalizedKey);

    if (isExplicitPublicKey || isYoutubeDescription) {
      const content = getFirstString(current);
      if (isUsablePostText(content)) out.push(stripCopyLabel(content));
      continue;
    }

    if (!isReaderOnlySectionLabel(key)) {
      out.push(...collectPublicStructuredFields(current, agentKey, depth + 1));
    }
  }

  return out;
}

function extractFromResponseVariations(value: unknown) {
  if (!isRecord(value)) return "";
  const items = value.items || value.variacoes || value.variações || value.respostas || value.options;
  const values = Array.isArray(items) ? items.map(getFirstString).map(stripCopyLabel).filter(isUsablePostText) : [];
  return values[0] || "";
}

function extractFromBlockPayload(payload: AuthorityBlockPayload, agentKey: string) {
  const candidates: string[] = [];

  for (const block of payload.blocos || []) {
    if (!isRecord(block)) continue;

    const tipo = normalizeLabel(block.tipo);
    const conteudo = isRecord(block.conteudo) ? block.conteudo : {};
    const blockTitle = safeText((conteudo as JsonRecord).titulo || block.titulo || block.title || block.label);

    if (tipo === "response_variations") {
      const variation = extractFromResponseVariations(conteudo);
      if (variation) candidates.push(variation);
      continue;
    }

    if (tipo === "markdown") {
      const text = safeText((conteudo as JsonRecord).texto || block.texto || block.markdown || block.body);
      const labeled = extractLabeledPublicSections(text);
      if (isUsablePostText(labeled)) {
        candidates.push(labeled);
        continue;
      }

      const cleanedWithoutReaderSections = removeReaderOnlySections(text);
      if (isUsablePostText(cleanedWithoutReaderSections)) {
        candidates.push(cleanedWithoutReaderSections);
        continue;
      }

      if ((agentKey === "linkedin" || agentKey === "instagram" || agentKey === "tiktok" || agentKey === "google_business_profile") && looksLikeReadyPostWithoutLabel(text)) {
        candidates.push(stripCopyLabel(text));
      }
      continue;
    }

    if (tipo === "highlight" || tipo === "quote") {
      const text = safeText((conteudo as JsonRecord).texto || block.texto || block.body);
      if ((isPublicSectionLabel(blockTitle) || isPublicSectionLabel(tipo) || agentKey === "linkedin" || agentKey === "instagram") && isUsablePostText(text)) {
        candidates.push(stripCopyLabel(text));
      }
      continue;
    }

    const directFields = collectPublicStructuredFields(conteudo, agentKey);
    if (directFields.length) candidates.push(...directFields);
  }

  return candidates.find(Boolean) || "";
}

function buildVideoDescriptionFromScript(payload: ScriptPayload) {
  const caption = stripCopyLabel(safeText(payload.legenda));
  if (caption) return caption;

  const firstVariation = Array.isArray(payload.variacoes) ? payload.variacoes.map(stripCopyLabel).find(isUsablePostText) : "";
  if (firstVariation) return firstVariation;

  return "";
}

function extractPostableText(raw: string, agentKey: string) {
  const parsed = tryParseJson(raw);

  if (isScriptPayload(parsed)) {
    return buildVideoDescriptionFromScript(parsed);
  }

  if (isBlockPayload(parsed)) {
    const blockText = extractFromBlockPayload(parsed, agentKey);
    if (blockText) return blockText;
  }

  if (parsed) {
    const structuredFields = collectPublicStructuredFields(parsed, agentKey);
    if (structuredFields.length) return structuredFields[0];
  }

  const labeledRaw = extractLabeledPublicSections(raw);
  if (labeledRaw) return labeledRaw;

  const formattedText = safeText(exportAuthorityFormat(raw, "txt")) || raw;
  const labeledFormatted = extractLabeledPublicSections(formattedText);
  if (labeledFormatted) return labeledFormatted;

  const withoutReaderSections = removeReaderOnlySections(formattedText);
  if (isUsablePostText(withoutReaderSections)) return withoutReaderSections;

  if ((agentKey === "linkedin" || agentKey === "instagram" || agentKey === "tiktok" || agentKey === "google_business_profile") && looksLikeReadyPostWithoutLabel(formattedText)) {
    return stripCopyLabel(formattedText);
  }

  return "";
}

function inferTitle(raw: string, formattedText: string, agentName: string) {
  const parsed = tryParseJson(raw);
  const structuredTitle = parsed
    ? safeText(parsed.titulo_da_tela || parsed.titulo || parsed.title || parsed.headline || parsed.nome)
    : "";
  if (structuredTitle) return structuredTitle;

  const heading = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+/.test(line));
  if (heading) return heading.replace(/^#{1,3}\s+/, "").trim();

  const firstUsefulLine = formattedText
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .find((line) => line.length >= 8 && line.length <= 120);

  return firstUsefulLine || agentName || "Conteúdo importado";
}

function extractUrls(text: string) {
  const allUrls = Array.from(new Set(text.match(URL_PATTERN) || [])).map((url) => url.replace(/[.,;:!?]+$/, ""));
  const imageUrls = Array.from(new Set(text.match(IMAGE_URL_PATTERN) || [])).map((url) => url.replace(/[.,;:!?]+$/, ""));
  const firstNonImageUrl = allUrls.find((url) => !imageUrls.includes(url)) || "";
  return { imageUrls, firstNonImageUrl };
}

function selectedPlatformsForAgent(agentKey: string, hasImageUrls: boolean): Record<SocialPublisherPlatformKey, boolean> {
  if (agentKey === "linkedin") return { instagram: false, facebook: false, linkedin: true, youtube: false };
  if (agentKey === "youtube") return { instagram: false, facebook: false, linkedin: false, youtube: true };
  if (agentKey === "instagram" || agentKey === "tiktok") return { instagram: true, facebook: true, linkedin: false, youtube: false };
  if (agentKey === "google_business_profile") return { instagram: false, facebook: true, linkedin: true, youtube: false };
  return { instagram: hasImageUrls, facebook: true, linkedin: true, youtube: false };
}

export function buildSocialPublisherDraftFromAuthorityResult(
  outputText: string,
  agent: { key?: string; name?: string; label?: string },
): SocialPublisherDraft {
  const raw = safeText(outputText);
  const agentKey = safeText(agent.key);
  const agentName = safeText(agent.name || agent.label) || "Agente de autoridade";
  const formattedText = safeText(exportAuthorityFormat(raw, "txt")) || raw;
  const postableText = extractPostableText(raw, agentKey);
  const title = inferTitle(raw, formattedText, agentName);
  const { imageUrls, firstNonImageUrl } = extractUrls(raw || formattedText);
  const baseCaption = postableText;
  const youtubeDescription = agentKey === "youtube" ? postableText || "" : baseCaption;

  return {
    selected: selectedPlatformsForAgent(agentKey, imageUrls.length > 0),
    baseCaption,
    mediaUrlsText: imageUrls.join("\n"),
    linkUrl: firstNonImageUrl,
    scheduledAt: "",
    perNetworkCaption: {
      instagram: baseCaption,
      facebook: baseCaption,
      linkedin: baseCaption,
      youtube: "",
    },
    instagramFirstComment: "",
    instagramCollaborators: "",
    facebookPlace: "",
    facebookTags: "",
    youtubeTitle: title.slice(0, 100),
    youtubeDescription,
    youtubeTags: "",
    youtubeCategoryId: "22",
    youtubePrivacyStatus: "private",
    youtubeMadeForKids: false,
  };
}

export function saveAuthorityResultForSocialPublisher(
  outputText: string,
  agent: { key?: string; name?: string; label?: string },
) {
  if (typeof window === "undefined") return buildSocialPublisherDraftFromAuthorityResult(outputText, agent);

  const draft = buildSocialPublisherDraftFromAuthorityResult(outputText, agent);
  const agentName = safeText(agent.name || agent.label) || "Agente de autoridade";
  const notice: SocialPublisherImportNotice = {
    source: "authority_agent",
    agentKey: safeText(agent.key),
    agentName,
    title: draft.youtubeTitle || agentName,
    preview: draft.baseCaption ? draft.baseCaption.slice(0, 180) : "Nenhum bloco pronto para publicação foi identificado automaticamente.",
    importedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SOCIAL_PUBLISHER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    localStorage.setItem(SOCIAL_PUBLISHER_IMPORT_NOTICE_KEY, JSON.stringify(notice));
  } catch (error) {
    throw new Error("Não foi possível salvar o rascunho no Publicador Social. O armazenamento local pode estar cheio.");
  }

  return draft;
}

export function readSocialPublisherImportNotice(): SocialPublisherImportNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SOCIAL_PUBLISHER_IMPORT_NOTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SocialPublisherImportNotice;
    return parsed?.source === "authority_agent" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSocialPublisherImportNotice() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SOCIAL_PUBLISHER_IMPORT_NOTICE_KEY);
  } catch {
    // Ignora falha de limpeza.
  }
}
