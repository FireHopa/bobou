
export type AuthorityExportFormat = "md" | "whatsapp" | "txt" | "html";

type JsonRecord = Record<string, unknown>;

type AuthorityBlockPayload = {
  titulo_da_tela?: string;
  blocos?: AuthorityBlock[];
};

type AuthorityBlock = {
  tipo?: string;
  conteudo?: any;
};

type ScriptTimelineItem = {
  tempo?: string;
  acao?: string;
  fala?: string;
};

type ScriptPayload = {
  titulo_da_tela?: string;
  analise_do_tema?: string;
  estrategia_do_video?: string;
  video_format_selected?: string;
  video_format_recommended?: string;
  video_format_rationale?: string;
  hooks?: string[];
  roteiro_segundo_a_segundo?: ScriptTimelineItem[];
  texto_na_tela?: string[];
  variacoes?: string[];
  legenda?: string;
};

const ROOT_HTML_STYLE = [
  "font-family: Arial, Helvetica, sans-serif",
  "line-height: 1.65",
  "color: #1f2937",
  "max-width: 960px",
  "margin: 0 auto",
  "padding: 28px 24px 40px",
  "background: #ffffff",
].join(";");

const PANEL_HTML_STYLE = [
  "border: 1px solid #e5e7eb",
  "border-radius: 24px",
  "background: #ffffff",
  "padding: 22px",
  "margin: 0 0 18px",
  "box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05)",
  "page-break-inside: avoid",
].join(";");

const SECTION_HTML_STYLE = [
  "border: 1px solid #e5e7eb",
  "border-radius: 28px",
  "background: #f9fafb",
  "padding: 24px",
  "margin: 0 0 20px",
  "page-break-inside: avoid",
].join(";");

const LABEL_HTML_STYLE = [
  "display: inline-block",
  "font-size: 11px",
  "font-weight: 700",
  "letter-spacing: 0.16em",
  "text-transform: uppercase",
  "color: #2563eb",
  "margin: 0 0 10px",
].join(";");

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value: unknown): string {
  return safeText(value).replace(/\r\n?/g, "\n");
}

function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toLabel(key: string): string {
  const normalized = safeText(key)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "Seção";

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value: unknown): string {
  const text = safeText(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(value: unknown): string {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code style=\"background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:1px 6px;font-family:Consolas,monospace;font-size:0.92em;\">$1</code>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  return text;
}

type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string };

function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const text = normalizeText(input).trim();
  if (!text) return [];

  const lines = text.split("\n");
  const out: MarkdownBlock[] = [];

  let paragraph: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    const joined = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (joined) out.push({ kind: "p", text: joined });
    paragraph = [];
  };

  const flushLists = () => {
    if (unorderedItems.length) out.push({ kind: "ul", items: unorderedItems });
    if (orderedItems.length) out.push({ kind: "ol", items: orderedItems });
    unorderedItems = [];
    orderedItems = [];
  };

  const flushCode = () => {
    const joined = codeLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) out.push({ kind: "code", text: joined });
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCode) {
        flushParagraph();
        flushLists();
        inCode = true;
      } else {
        flushCode();
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushLists();
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      out.push({ kind: "heading", level, text: headingMatch[2].trim() });
      continue;
    }

    const unorderedMatch = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      if (orderedItems.length) flushLists();
      unorderedItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (unorderedItems.length) flushLists();
      orderedItems.push(orderedMatch[1].trim());
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushLists();
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushLists();
  if (inCode) flushCode();

  return out;
}

function markdownToHtml(input: string): string {
  const blocks = parseMarkdownBlocks(input);
  if (!blocks.length) return "";

  return blocks
    .map((block) => {
      if (block.kind === "heading") {
        const sizes = {
          1: "font-size:28px;font-weight:800;color:#111827;margin:0 0 12px;",
          2: "font-size:22px;font-weight:800;color:#111827;margin:20px 0 10px;",
          3: "font-size:18px;font-weight:800;color:#111827;margin:18px 0 8px;",
        };
        return `<h${block.level} style="${sizes[block.level]}">${inlineHtml(block.text)}</h${block.level}>`;
      }

      if (block.kind === "ul") {
        return `<ul style="margin:0 0 16px 20px;padding:0;">${block.items.map((item) => `<li style="margin:0 0 8px;">${inlineHtml(item)}</li>`).join("")}</ul>`;
      }

      if (block.kind === "ol") {
        return `<ol style="margin:0 0 16px 20px;padding:0;">${block.items.map((item) => `<li style="margin:0 0 8px;">${inlineHtml(item)}</li>`).join("")}</ol>`;
      }

      if (block.kind === "code") {
        return `<pre style="margin:0 0 16px;padding:14px 16px;border-radius:16px;border:1px solid #dbeafe;background:#eff6ff;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;color:#1e3a8a;">${escapeHtml(block.text)}</pre>`;
      }

      return `<p style="margin:0 0 14px;color:#374151;">${inlineHtml(block.text)}</p>`;
    })
    .join("");
}

function markdownToText(input: string, mode: "txt" | "md" | "whatsapp"): string {
  const text = normalizeText(input).trim();
  if (!text) return "";

  if (mode === "md") return text;

  if (mode === "whatsapp") {
    return text
      .replace(/^###\s+/gim, "*")
      .replace(/^##\s+/gim, "*")
      .replace(/^#\s+/gim, "*")
      .replace(/\*\*/g, "*")
      .replace(/```([\s\S]*?)```/g, (_m, code) => `\n${String(code).trim()}\n`);
  }

  return text
    .replace(/^###\s+/gim, "")
    .replace(/^##\s+/gim, "")
    .replace(/^#\s+/gim, "")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```([\s\S]*?)```/g, (_m, code) => `\n${String(code).trim()}\n`);
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isScriptPayload(value: unknown): value is ScriptPayload {
  if (!isRecord(value)) return false;
  return [
    "analise_do_tema",
    "estrategia_do_video",
    "hooks",
    "roteiro_segundo_a_segundo",
    "texto_na_tela",
    "variacoes",
    "legenda",
  ].some((key) => key in value);
}

function isBlockPayload(value: unknown): value is AuthorityBlockPayload {
  return isRecord(value) && Array.isArray(value.blocos);
}

function renderHtmlTitle(title: string): string {
  const safeTitle = inlineHtml(title);
  return [
    `<header style="margin:0 0 24px;padding:0 0 18px;border-bottom:2px solid #e5e7eb;">`,
    `<div style="${LABEL_HTML_STYLE}">Resultado formatado</div>`,
    `<h1 style="margin:0;font-size:34px;line-height:1.12;font-weight:800;color:#111827;">${safeTitle}</h1>`,
    `</header>`,
  ].join("");
}

function renderHtmlSection(title: string, body: string, eyebrow?: string): string {
  const heading = title ? `<h2 style="margin:0 0 14px;font-size:24px;line-height:1.18;font-weight:800;color:#111827;">${inlineHtml(title)}</h2>` : "";
  const eyebrowHtml = eyebrow ? `<div style="${LABEL_HTML_STYLE}">${inlineHtml(eyebrow)}</div>` : "";
  return `<section style="${SECTION_HTML_STYLE}">${eyebrowHtml}${heading}${body}</section>`;
}

function renderHtmlGrid(items: string[]): string {
  return `<div style="display:grid;gap:12px;">${items.join("")}</div>`;
}

function htmlInfoCard(title: string, body: string, accent = "#2563eb"): string {
  return [
    `<article style="${PANEL_HTML_STYLE};border-left:4px solid ${accent};">`,
    title ? `<div style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent};">${inlineHtml(title)}</div>` : "",
    `<div>${body}</div>`,
    `</article>`,
  ].join("");
}

function renderBlockPayloadHtml(payload: AuthorityBlockPayload): string {
  const parts: string[] = [];

  if (safeText(payload.titulo_da_tela)) {
    parts.push(renderHtmlTitle(safeText(payload.titulo_da_tela)));
  }

  for (const rawBlock of safeArray<AuthorityBlock>(payload.blocos)) {
    const tipo = safeText(rawBlock?.tipo).toLowerCase();
    const conteudo = isRecord(rawBlock?.conteudo) ? rawBlock.conteudo : {};

    if (tipo === "markdown") {
      const body = markdownToHtml(safeText((conteudo as any).texto));
      if (body) parts.push(renderHtmlSection("", body));
      continue;
    }

    if (tipo === "highlight") {
      const title = safeText((conteudo as any).titulo) || "Destaque";
      const text = safeText((conteudo as any).texto);
      if (!text) continue;
      parts.push(htmlInfoCard(title, `<p style="margin:0;color:#374151;">${inlineHtml(text)}</p>`, "#0ea5e9"));
      continue;
    }

    if (tipo === "timeline") {
      const passos = safeArray<string>((conteudo as any).passos).map((item) => safeText(item)).filter(Boolean);
      if (!passos.length) continue;
      const body = `<ol style="margin:0;padding-left:20px;">${passos.map((passo) => `<li style="margin:0 0 12px;color:#374151;">${inlineHtml(passo)}</li>`).join("")}</ol>`;
      parts.push(renderHtmlSection("Passo a passo", body, "Timeline"));
      continue;
    }

    if (tipo === "quote") {
      const text = safeText((conteudo as any).texto);
      if (!text) continue;
      const author = safeText((conteudo as any).autor);
      const body = `<blockquote style="margin:0;padding:0 0 0 18px;border-left:4px solid #d1d5db;"><p style="margin:0 0 12px;font-size:20px;line-height:1.5;color:#111827;font-style:italic;">“${inlineHtml(text)}”</p>${author ? `<p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${inlineHtml(author)}</p>` : ""}</blockquote>`;
      parts.push(renderHtmlSection("Citação", body));
      continue;
    }

    if (tipo === "faq") {
      const questions = safeArray<any>((conteudo as any).perguntas)
        .filter((item) => isRecord(item))
        .map((item) => {
          const question = safeText(item.pergunta);
          const answer = safeText(item.resposta);
          if (!question || !answer) return "";
          return htmlInfoCard(question, markdownToHtml(answer) || `<p style="margin:0;color:#374151;">${inlineHtml(answer)}</p>`, "#8b5cf6");
        })
        .filter(Boolean);
      if (!questions.length) continue;
      parts.push(renderHtmlSection("Perguntas frequentes", renderHtmlGrid(questions), "FAQ"));
      continue;
    }

    if (tipo === "keyword_list") {
      const title = safeText((conteudo as any).titulo) || "Palavras-chave";
      const limit = safeText((conteudo as any).limite_por_item);
      const items = safeArray<string>((conteudo as any).items).map((item) => safeText(item)).filter(Boolean);
      if (!items.length) continue;
      const chips = items.map((item) => `<div style="${PANEL_HTML_STYLE};padding:14px 16px;border-radius:18px;background:#f8fafc;">${inlineHtml(item)}</div>`);
      const meta = limit ? `<p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Limite por item: ${inlineHtml(limit)}</p>` : "";
      parts.push(renderHtmlSection(title, `${meta}${renderHtmlGrid(chips)}`, "Lista técnica"));
      continue;
    }

    if (tipo === "service_cards") {
      const title = safeText((conteudo as any).titulo) || "Serviços e descrições";
      const items = safeArray<any>((conteudo as any).items)
        .filter((item) => isRecord(item))
        .map((item) => {
          const name = safeText(item.nome);
          const description = safeText(item.descricao);
          const keywords = safeArray<string>(item.palavras_chave).map((value) => safeText(value)).filter(Boolean);
          if (!name && !description) return "";
          const keywordsHtml = keywords.length
            ? `<p style="margin:12px 0 0;color:#4b5563;font-size:13px;"><strong>Palavras-chave:</strong> ${inlineHtml(keywords.join(" • "))}</p>`
            : "";
          return `<article style="${PANEL_HTML_STYLE}"><h3 style="margin:0 0 10px;font-size:18px;font-weight:800;color:#111827;">${inlineHtml(name || "Serviço")}</h3><p style="margin:0;color:#374151;">${inlineHtml(description)}</p>${keywordsHtml}</article>`;
        })
        .filter(Boolean);
      if (!items.length) continue;
      parts.push(renderHtmlSection(title, renderHtmlGrid(items), "Catálogo"));
      continue;
    }

    if (tipo === "response_variations") {
      const title = safeText((conteudo as any).titulo) || "Respostas sugeridas";
      const items = safeArray<string>((conteudo as any).items)
        .map((item) => safeText(item))
        .filter(Boolean)
        .map((item, index) => htmlInfoCard(`Resposta ${index + 1}`, `<p style="margin:0;color:#374151;">${inlineHtml(item)}</p>`, "#10b981"));
      if (!items.length) continue;
      parts.push(renderHtmlSection(title, renderHtmlGrid(items), "Variações"));
      continue;
    }

    if (tipo === "comparison_table") {
      const title = safeText((conteudo as any).titulo) || "Comparativo visual";
      const items = safeArray<any>((conteudo as any).items)
        .filter((item) => isRecord(item))
        .map((item, index) => {
          const criterio = safeText(item.criterio) || `Critério ${index + 1}`;
          const nossaSolucao = safeText(item.nossa_solucao);
          const mercado = safeText(item.mercado);
          const recomendacao = safeText(item.recomendacao);
          if (!criterio && !nossaSolucao && !mercado) return "";
          const body = [
            nossaSolucao ? `<p style="margin:0 0 10px;color:#065f46;"><strong>Nossa solução:</strong> ${inlineHtml(nossaSolucao)}</p>` : "",
            mercado ? `<p style="margin:0 0 10px;color:#92400e;"><strong>Mercado / alternativa:</strong> ${inlineHtml(mercado)}</p>` : "",
            recomendacao ? `<p style="margin:0;color:#374151;"><strong>Leitura de decisão:</strong> ${inlineHtml(recomendacao)}</p>` : "",
          ].join("");
          return htmlInfoCard(criterio, body, "#0ea5e9");
        })
        .filter(Boolean);
      if (!items.length) continue;
      parts.push(renderHtmlSection(title, renderHtmlGrid(items), "Comparativo"));
      continue;
    }

    const fallback = renderGenericHtmlValue(isRecord(conteudo) ? conteudo : rawBlock);
    if (fallback) {
      parts.push(renderHtmlSection(toLabel(tipo || "conteudo"), fallback));
    }
  }

  return `<div style="${ROOT_HTML_STYLE}">${parts.join("") || `<pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`}</div>`;
}

function renderScriptPayloadHtml(payload: ScriptPayload): string {
  const parts: string[] = [];

  if (safeText(payload.titulo_da_tela)) {
    parts.push(renderHtmlTitle(safeText(payload.titulo_da_tela)));
  }

  const analysisHtml = markdownToHtml(safeText(payload.analise_do_tema));
  if (analysisHtml) {
    parts.push(renderHtmlSection("Análise do tema", analysisHtml, "Etapa 1"));
  }

  const strategyHtml = markdownToHtml(safeText(payload.estrategia_do_video));
  if (strategyHtml) {
    parts.push(renderHtmlSection("Estratégia do vídeo", strategyHtml, "Etapa 2"));
  }

  const formatCards: string[] = [];
  if (safeText(payload.video_format_selected)) {
    formatCards.push(htmlInfoCard("Formato escolhido", `<p style="margin:0;color:#374151;">${inlineHtml(payload.video_format_selected)}</p>`, "#2563eb"));
  }
  if (safeText(payload.video_format_recommended) || safeText(payload.video_format_rationale)) {
    formatCards.push(
      htmlInfoCard(
        "Melhor formato indicado",
        [
          safeText(payload.video_format_recommended)
            ? `<p style="margin:0;color:#374151;font-weight:700;">${inlineHtml(payload.video_format_recommended)}</p>`
            : "",
          safeText(payload.video_format_rationale)
            ? `<p style="margin:10px 0 0;color:#4b5563;">${inlineHtml(payload.video_format_rationale)}</p>`
            : "",
        ].join(""),
        "#10b981",
      ),
    );
  }
  if (formatCards.length) {
    parts.push(renderHtmlSection("Formato do vídeo", renderHtmlGrid(formatCards), "Etapa 3"));
  }

  const hooks = safeArray<string>(payload.hooks).map((item) => safeText(item)).filter(Boolean);
  if (hooks.length) {
    const hookCards = hooks.map((hook, index) => htmlInfoCard(`Hook ${index + 1}`, `<p style="margin:0;color:#374151;font-size:17px;font-weight:700;">${inlineHtml(hook)}</p>`, "#f59e0b"));
    parts.push(renderHtmlSection("Hooks", renderHtmlGrid(hookCards), "Etapa 4"));
  }

  const timeline = safeArray<ScriptTimelineItem>(payload.roteiro_segundo_a_segundo)
    .filter((item) => isRecord(item))
    .map((item, index) => {
      const tempo = safeText(item.tempo) || `Trecho ${index + 1}`;
      const acao = safeText(item.acao);
      const fala = safeText(item.fala);
      const body = [
        `<div style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2563eb;">${inlineHtml(tempo)}</div>`,
        acao ? `<p style="margin:0 0 10px;color:#111827;"><strong>Ação:</strong> ${inlineHtml(acao)}</p>` : "",
        fala ? `<div style="margin:0;padding:14px 16px;border-radius:16px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;"><strong>Fala:</strong> ${inlineHtml(fala)}</div>` : "",
      ].join("");
      return `<article style="${PANEL_HTML_STYLE}">${body}</article>`;
    });
  if (timeline.length) {
    parts.push(renderHtmlSection("Roteiro segundo a segundo", renderHtmlGrid(timeline), "Etapa 5"));
  }

  const screenTexts = safeArray<string>(payload.texto_na_tela).map((item) => safeText(item)).filter(Boolean);
  if (screenTexts.length) {
    const items = screenTexts.map((item, index) => htmlInfoCard(`Tela ${index + 1}`, `<p style="margin:0;color:#374151;">${inlineHtml(item)}</p>`, "#3b82f6"));
    parts.push(renderHtmlSection("Texto na tela", renderHtmlGrid(items), "Etapa 6"));
  }

  const variations = safeArray<string>(payload.variacoes).map((item) => safeText(item)).filter(Boolean);
  if (variations.length) {
    const items = variations.map((item, index) => htmlInfoCard(`Variação ${index + 1}`, `<p style="margin:0;color:#374151;">${inlineHtml(item)}</p>`, "#10b981"));
    parts.push(renderHtmlSection("Variações", renderHtmlGrid(items), "Etapa 7"));
  }

  const captionHtml = markdownToHtml(safeText(payload.legenda));
  if (captionHtml) {
    parts.push(renderHtmlSection("Legenda", captionHtml, "Etapa 8"));
  }

  return `<div style="${ROOT_HTML_STYLE}">${parts.join("") || `<pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`}</div>`;
}

function renderGenericHtmlValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return markdownToHtml(value) || `<p style="margin:0;color:#374151;">${inlineHtml(value)}</p>`;
  if (typeof value === "number" || typeof value === "boolean") return `<p style="margin:0;color:#374151;">${inlineHtml(String(value))}</p>`;

  if (Array.isArray(value)) {
    if (!value.length) return "";
    if (value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
      return `<ul style="margin:0;padding-left:20px;">${value.map((item) => `<li style="margin:0 0 8px;color:#374151;">${inlineHtml(String(item))}</li>`).join("")}</ul>`;
    }
    return renderHtmlGrid(
      value
        .map((item) => renderGenericHtmlValue(item, depth + 1))
        .filter(Boolean)
        .map((item) => `<div style="${PANEL_HTML_STYLE}">${item}</div>`),
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, current]) => current !== null && current !== undefined && current !== "");
    return entries
      .map(([key, current]) => {
        const headingTag = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
        const headingSize = depth === 0 ? "22px" : depth === 1 ? "18px" : "16px";
        const rendered = renderGenericHtmlValue(current, depth + 1);
        if (!rendered) return "";
        return `<section style="margin:0 0 16px;"><${headingTag} style="margin:0 0 8px;font-size:${headingSize};font-weight:800;color:#111827;">${inlineHtml(toLabel(key))}</${headingTag}>${rendered}</section>`;
      })
      .filter(Boolean)
      .join("");
  }

  return `<pre style="white-space:pre-wrap;">${escapeHtml(String(value))}</pre>`;
}

function linesToText(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderBlockPayloadText(payload: AuthorityBlockPayload, format: "txt" | "md" | "whatsapp"): string {
  const out: string[] = [];
  const title = safeText(payload.titulo_da_tela);

  if (title) {
    if (format === "md") {
      out.push(`# ${title}`, "");
    } else if (format === "whatsapp") {
      out.push(`*${title.toUpperCase()}*`, "");
    } else {
      out.push(title.toUpperCase(), "=".repeat(title.length), "");
    }
  }

  for (const rawBlock of safeArray<AuthorityBlock>(payload.blocos)) {
    const tipo = safeText(rawBlock?.tipo).toLowerCase();
    const conteudo = isRecord(rawBlock?.conteudo) ? rawBlock.conteudo : {};

    if (tipo === "markdown") {
      const body = markdownToText(safeText((conteudo as any).texto), format);
      if (body) out.push(body, "");
      continue;
    }

    if (tipo === "highlight") {
      const titleText = safeText((conteudo as any).titulo) || "Destaque";
      const bodyText = safeText((conteudo as any).texto);
      if (!bodyText) continue;
      if (format === "md") out.push(`> **${titleText}**`, `> ${bodyText}`, "");
      else if (format === "whatsapp") out.push(`💡 *${titleText.toUpperCase()}*`, bodyText, "");
      else out.push(`>> ${titleText.toUpperCase()}`, bodyText, "");
      continue;
    }

    if (tipo === "timeline") {
      const passos = safeArray<string>((conteudo as any).passos).map((item) => safeText(item)).filter(Boolean);
      if (!passos.length) continue;
      if (format === "md") out.push(`## Passo a passo`, "");
      else out.push(`PASSO A PASSO`, "");
      passos.forEach((passo, index) => {
        const bullet = format === "md" ? `${index + 1}. ${passo}` : `- ${passo}`;
        out.push(bullet);
      });
      out.push("");
      continue;
    }

    if (tipo === "quote") {
      const text = safeText((conteudo as any).texto);
      const author = safeText((conteudo as any).autor);
      if (!text) continue;
      if (format === "md") {
        out.push(`> "${text}"`);
        if (author) out.push(`> — ${author}`);
        out.push("");
      } else {
        out.push(`"${text}"`);
        if (author) out.push(`— ${author}`);
        out.push("");
      }
      continue;
    }

    if (tipo === "faq") {
      const questions = safeArray<any>((conteudo as any).perguntas).filter((item) => isRecord(item));
      if (!questions.length) continue;
      if (format === "md") out.push(`## FAQ`, "");
      else out.push(`FAQ`, "");
      for (const question of questions) {
        const q = safeText(question.pergunta);
        const a = markdownToText(safeText(question.resposta), format);
        if (!q || !a) continue;
        if (format === "md") {
          out.push(`### ${q}`, a, "");
        } else if (format === "whatsapp") {
          out.push(`❓ *${q}*`, a, "");
        } else {
          out.push(`P: ${q}`, `R: ${a}`, "");
        }
      }
      continue;
    }

    if (tipo === "keyword_list") {
      const sectionTitle = safeText((conteudo as any).titulo) || "Palavras-chave";
      const limit = safeText((conteudo as any).limite_por_item);
      const items = safeArray<string>((conteudo as any).items).map((item) => safeText(item)).filter(Boolean);
      if (!items.length) continue;
      out.push(format === "md" ? `## ${sectionTitle}` : sectionTitle);
      if (limit) out.push(format === "md" ? `**Limite por item:** ${limit}` : `Limite por item: ${limit}`);
      out.push("");
      items.forEach((item) => out.push(format === "md" ? `- ${item}` : `- ${item}`));
      out.push("");
      continue;
    }

    if (tipo === "service_cards") {
      const sectionTitle = safeText((conteudo as any).titulo) || "Serviços e descrições";
      const items = safeArray<any>((conteudo as any).items).filter((item) => isRecord(item));
      if (!items.length) continue;
      out.push(format === "md" ? `## ${sectionTitle}` : sectionTitle, "");
      for (const item of items) {
        const name = safeText(item.nome) || "Serviço";
        const description = safeText(item.descricao);
        const keywords = safeArray<string>(item.palavras_chave).map((value) => safeText(value)).filter(Boolean);
        if (format === "md") out.push(`### ${name}`);
        else out.push(name);
        if (description) out.push(description);
        if (keywords.length) {
          const prefix = format === "md" ? `**Palavras-chave:** ` : `Palavras-chave: `;
          out.push(`${prefix}${keywords.join(" • ")}`);
        }
        out.push("");
      }
      continue;
    }

    if (tipo === "response_variations") {
      const sectionTitle = safeText((conteudo as any).titulo) || "Respostas sugeridas";
      const items = safeArray<string>((conteudo as any).items).map((item) => safeText(item)).filter(Boolean);
      if (!items.length) continue;
      out.push(format === "md" ? `## ${sectionTitle}` : sectionTitle, "");
      items.forEach((item, index) => {
        if (format === "md") out.push(`### Resposta ${index + 1}`, item, "");
        else if (format === "whatsapp") out.push(`*Resposta ${index + 1}*`, item, "");
        else out.push(`Resposta ${index + 1}:`, item, "");
      });
      continue;
    }

    if (tipo === "comparison_table") {
      const sectionTitle = safeText((conteudo as any).titulo) || "Comparativo visual";
      const items = safeArray<any>((conteudo as any).items).filter((item) => isRecord(item));
      if (!items.length) continue;
      out.push(format === "md" ? `## ${sectionTitle}` : sectionTitle, "");
      items.forEach((item, index) => {
        const criterio = safeText(item.criterio) || `Critério ${index + 1}`;
        const nossaSolucao = safeText(item.nossa_solucao);
        const mercado = safeText(item.mercado);
        const recomendacao = safeText(item.recomendacao);
        if (format === "md") {
          out.push(`### ${criterio}`);
          if (nossaSolucao) out.push(`**Nossa solução:** ${nossaSolucao}`);
          if (mercado) out.push(`**Mercado / alternativa:** ${mercado}`);
          if (recomendacao) out.push(`**Leitura de decisão:** ${recomendacao}`);
          out.push("");
        } else if (format === "whatsapp") {
          out.push(`*${criterio}*`);
          if (nossaSolucao) out.push(`• Nossa solução: ${nossaSolucao}`);
          if (mercado) out.push(`• Mercado / alternativa: ${mercado}`);
          if (recomendacao) out.push(`• Leitura de decisão: ${recomendacao}`);
          out.push("");
        } else {
          out.push(`${criterio}:`);
          if (nossaSolucao) out.push(`Nossa solução: ${nossaSolucao}`);
          if (mercado) out.push(`Mercado / alternativa: ${mercado}`);
          if (recomendacao) out.push(`Leitura de decisão: ${recomendacao}`);
          out.push("");
        }
      });
      continue;
    }

    const fallback = renderGenericTextValue(isRecord(conteudo) ? conteudo : rawBlock, format);
    if (fallback) out.push(fallback, "");
  }

  return linesToText(out);
}

function renderScriptPayloadText(payload: ScriptPayload, format: "txt" | "md" | "whatsapp"): string {
  const out: string[] = [];
  const title = safeText(payload.titulo_da_tela) || "Roteiro gerado";

  if (format === "md") {
    out.push(`# ${title}`, "");
  } else if (format === "whatsapp") {
    out.push(`*${title.toUpperCase()}*`, "");
  } else {
    out.push(title.toUpperCase(), "=".repeat(title.length), "");
  }

  const pushSection = (sectionTitle: string, bodyLines: string[]) => {
    const cleaned = bodyLines.map((line) => line.trimEnd()).filter((line, index, arr) => line || (index > 0 && arr[index - 1] !== ""));
    if (!cleaned.length) return;
    if (format === "md") out.push(`## ${sectionTitle}`);
    else out.push(sectionTitle.toUpperCase());
    out.push("");
    out.push(...cleaned, "");
  };

  pushSection("Análise do tema", [markdownToText(safeText(payload.analise_do_tema), format)]);
  pushSection("Estratégia do vídeo", [markdownToText(safeText(payload.estrategia_do_video), format)]);

  const formatLines: string[] = [];
  if (safeText(payload.video_format_selected)) formatLines.push(`Formato escolhido: ${safeText(payload.video_format_selected)}`);
  if (safeText(payload.video_format_recommended)) formatLines.push(`Melhor formato indicado: ${safeText(payload.video_format_recommended)}`);
  if (safeText(payload.video_format_rationale)) formatLines.push(safeText(payload.video_format_rationale));
  pushSection("Formato do vídeo", formatLines);

  const hooks = safeArray<string>(payload.hooks).map((item) => safeText(item)).filter(Boolean);
  pushSection("Hooks", hooks.map((hook, index) => format === "md" ? `${index + 1}. ${hook}` : `- Hook ${index + 1}: ${hook}`));

  const timeline = safeArray<ScriptTimelineItem>(payload.roteiro_segundo_a_segundo)
    .filter((item) => isRecord(item))
    .flatMap((item, index) => {
      const tempo = safeText(item.tempo) || `Trecho ${index + 1}`;
      const section: string[] = [];
      if (format === "md") section.push(`### ${tempo}`);
      else section.push(tempo);
      if (safeText(item.acao)) section.push(`Ação: ${safeText(item.acao)}`);
      if (safeText(item.fala)) section.push(`Fala: ${safeText(item.fala)}`);
      section.push("");
      return section;
    });
  pushSection("Roteiro segundo a segundo", timeline);

  const screenTexts = safeArray<string>(payload.texto_na_tela).map((item) => safeText(item)).filter(Boolean);
  pushSection("Texto na tela", screenTexts.map((item, index) => format === "md" ? `- Tela ${index + 1}: ${item}` : `- Tela ${index + 1}: ${item}`));

  const variations = safeArray<string>(payload.variacoes).map((item) => safeText(item)).filter(Boolean);
  pushSection("Variações", variations.map((item, index) => format === "md" ? `- Variação ${index + 1}: ${item}` : `- Variação ${index + 1}: ${item}`));

  pushSection("Legenda", [markdownToText(safeText(payload.legenda), format)]);

  return linesToText(out);
}

function renderGenericTextValue(value: unknown, format: "txt" | "md" | "whatsapp", depth = 0): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return markdownToText(value, format);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return linesToText(
      value
        .map((item, index) => {
          const rendered = renderGenericTextValue(item, format, depth + 1);
          if (!rendered) return "";
          return `${format === "md" ? "-" : "-"} ${rendered}`;
        })
        .filter(Boolean),
    );
  }

  if (isRecord(value)) {
    const lines: string[] = [];
    for (const [key, current] of Object.entries(value)) {
      const rendered = renderGenericTextValue(current, format, depth + 1);
      if (!rendered) continue;
      const heading = toLabel(key);
      if (format === "md") {
        const hashes = depth === 0 ? "##" : depth === 1 ? "###" : "####";
        lines.push(`${hashes} ${heading}`, "", rendered, "");
      } else if (format === "whatsapp") {
        lines.push(`*${heading}*`, rendered, "");
      } else {
        lines.push(heading.toUpperCase(), rendered, "");
      }
    }
    return linesToText(lines);
  }

  return safeText(value);
}

function exportRawFallback(raw: string, format: AuthorityExportFormat): string {
  const text = normalizeText(raw).trim();
  if (format === "html") {
    return `<div style="${ROOT_HTML_STYLE}"><pre style="white-space:pre-wrap;font-family:Arial, Helvetica, sans-serif;">${escapeHtml(text)}</pre></div>`;
  }
  return markdownToText(text, format as "txt" | "md" | "whatsapp");
}

export function exportAuthorityFormat(raw: string, format: AuthorityExportFormat): string {
  const parsed = tryParseJson(raw);

  if (isScriptPayload(parsed)) {
    if (format === "html") return renderScriptPayloadHtml(parsed);
    return renderScriptPayloadText(parsed, format as "txt" | "md" | "whatsapp");
  }

  if (isBlockPayload(parsed)) {
    if (format === "html") return renderBlockPayloadHtml(parsed);
    return renderBlockPayloadText(parsed, format as "txt" | "md" | "whatsapp");
  }

  if (isRecord(parsed)) {
    const title = safeText((parsed as JsonRecord).titulo_da_tela) || "Resultado";
    if (format === "html") {
      return `<div style="${ROOT_HTML_STYLE}">${renderHtmlTitle(title)}${renderHtmlSection("", renderGenericHtmlValue(parsed))}</div>`;
    }
    const rendered = renderGenericTextValue(parsed, format as "txt" | "md" | "whatsapp");
    if (!rendered) return exportRawFallback(raw, format);
    if (format === "md") return linesToText([`# ${title}`, "", rendered]);
    if (format === "whatsapp") return linesToText([`*${title.toUpperCase()}*`, "", rendered]);
    return linesToText([title.toUpperCase(), "=".repeat(title.length), "", rendered]);
  }

  return exportRawFallback(raw, format);
}

export { exportAuthorityFormat as exportFormat };
