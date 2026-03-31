import type { BobarBoard, BobarCard, BobarFlowchart, CreateBobarCardIn } from "@/services/bobar";

export type ImportedTimelineItem = {
  tempo: string;
  acao: string;
  fala: string;
};

export type ImportedScriptPayload = {
  titulo_da_tela: string;
  analise_do_tema: string;
  estrategia_do_video: string;
  formato_do_video: string;
  hooks: string[];
  roteiro_segundo_a_segundo: ImportedTimelineItem[];
  texto_na_tela: string[];
  variacoes: string[];
  legenda: string;
};

export type ImportedWorkspaceMeta = {
  version: number;
  title: string;
  column_ids: number[];
  created_at?: string;
};

export type ImportedWorkspaceCardDraft = Omit<CreateBobarCardIn, "column_id">;

export type ImportedWorkspaceColumnDraft = {
  name: string;
  cards: ImportedWorkspaceCardDraft[];
};

export type ImportedWorkspaceBlueprint = {
  title: string;
  columns: ImportedWorkspaceColumnDraft[];
};

function safeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeText(item)).filter(Boolean);
}

function safeTimeline(value: unknown): ImportedTimelineItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const tempo = safeText(record.tempo || record.time || record.etapa || `Trecho ${index + 1}`);
        const acao = safeText(record.acao || record.action);
        const fala = safeText(record.fala || record.speech || record.text);
        if (!tempo && !acao && !fala) return null;
        return {
          tempo: tempo || `Trecho ${index + 1}`,
          acao,
          fala,
        };
      }

      const text = safeText(item);
      if (!text) return null;

      return {
        tempo: `Trecho ${index + 1}`,
        acao: "",
        fala: text,
      };
    })
    .filter((item): item is ImportedTimelineItem => Boolean(item));
}

function buildFormatoDoVideo(raw: Record<string, unknown>): string {
  const explicit = safeText(raw.formato_do_video || raw.formato || raw.video_format);
  if (explicit) return explicit;

  const parts: string[] = [];
  const selected = safeText(raw.video_format_selected);
  const recommended = safeText(raw.video_format_recommended);
  const rationale = safeText(raw.video_format_rationale);

  if (selected) parts.push(`Formato escolhido: ${selected}`);
  if (recommended) parts.push(`Melhor formato indicado: ${recommended}`);
  if (rationale) parts.push(`Justificativa: ${rationale}`);

  return parts.join("\n\n");
}

export function normalizeImportedScriptPayload(
  raw: unknown,
  fallbackTitle = "Roteiro importado",
): ImportedScriptPayload {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;

    return {
      titulo_da_tela:
        safeText(record.titulo_da_tela || record.title || record.titulo || record.headline) ||
        fallbackTitle,
      analise_do_tema: safeText(record.analise_do_tema),
      estrategia_do_video: safeText(record.estrategia_do_video),
      formato_do_video: buildFormatoDoVideo(record),
      hooks: safeStringArray(record.hooks),
      roteiro_segundo_a_segundo: safeTimeline(record.roteiro_segundo_a_segundo),
      texto_na_tela: safeStringArray(record.texto_na_tela),
      variacoes: safeStringArray(record.variacoes),
      legenda: safeText(record.legenda),
    };
  }

  const fallbackText = safeText(raw);
  return {
    titulo_da_tela: fallbackTitle,
    analise_do_tema: "",
    estrategia_do_video: "",
    formato_do_video: "",
    hooks: [],
    roteiro_segundo_a_segundo: [],
    texto_na_tela: [],
    variacoes: [],
    legenda: fallbackText,
  };
}

export function parseImportedScriptPayload(
  raw: string | null | undefined,
  fallbackTitle = "Roteiro importado",
): ImportedScriptPayload {
  const text = safeText(raw);
  if (!text) return normalizeImportedScriptPayload({}, fallbackTitle);

  try {
    return normalizeImportedScriptPayload(JSON.parse(text), fallbackTitle);
  } catch {
    return normalizeImportedScriptPayload(text, fallbackTitle);
  }
}

export function isAuthorityImportSourceKind(sourceKind?: string | null): boolean {
  const normalized = safeText(sourceKind).toLowerCase();
  return (
    normalized === "authority_agent_import" ||
    normalized.startsWith("authority_agent_import:") ||
    normalized === "authority_agent" ||
    normalized.startsWith("authority_agent:")
  );
}

export function extractAuthorityAgentKey(sourceKind?: string | null): string {
  const normalized = safeText(sourceKind);
  if (!normalized) return "";
  const match = normalized.match(/^authority_agent(?:_import)?:(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function isAuthorityImportCard(card?: Pick<BobarCard, "source_kind"> | null): boolean {
  return isAuthorityImportSourceKind(card?.source_kind);
}


export function buildAuthorityWorkspaceSourceKind(importCardId: number | string): string {
  return `authority_agent_workspace:${Number(importCardId) || 0}`;
}

export function isAuthorityWorkspaceSourceKind(sourceKind?: string | null): boolean {
  const normalized = safeText(sourceKind).toLowerCase();
  return normalized.startsWith("authority_agent_workspace:");
}

export function extractAuthorityWorkspaceImportId(sourceKind?: string | null): number | null {
  const normalized = safeText(sourceKind);
  const match = normalized.match(/^authority_agent_workspace:(\d+)$/i);
  const value = Number(match?.[1] || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function inferImportedWorkspaceColumnIds(
  board: Pick<BobarBoard, "columns"> | null | undefined,
  importCardId: number,
): number[] {
  if (!board || !Number.isFinite(importCardId) || importCardId <= 0) return [];

  const ids = new Set<number>();

  for (const column of board.columns || []) {
    const hasWorkspaceCard = (column.cards || []).some(
      (card) => extractAuthorityWorkspaceImportId(card.source_kind) === importCardId,
    );

    if (hasWorkspaceCard && Number.isFinite(column.id) && column.id > 0) {
      ids.add(column.id);
    }
  }

  return Array.from(ids);
}

function newNodeId() {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newEdgeId() {
  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toChecklistContent(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function toTimelineText(items: ImportedTimelineItem[]) {
  return items
    .map((item, index) => {
      const title = safeText(item.tempo) || `Trecho ${index + 1}`;
      const parts = [title];
      if (safeText(item.acao)) parts.push(`Ação: ${safeText(item.acao)}`);
      if (safeText(item.fala)) parts.push(`Fala: ${safeText(item.fala)}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export function buildImportedFlowchart(script: ImportedScriptPayload): BobarFlowchart {
  const nodes = script.roteiro_segundo_a_segundo.map((item, index) => {
    const content = [item.acao ? `Ação: ${item.acao}` : "", item.fala ? `Fala: ${item.fala}` : ""]
      .filter(Boolean)
      .join("\n\n");

    return {
      id: newNodeId(),
      title: item.tempo || `Trecho ${index + 1}`,
      content,
      time: item.tempo || `Trecho ${index + 1}`,
      kind:
        index === 0
          ? "hook"
          : index === script.roteiro_segundo_a_segundo.length - 1
            ? "cta"
            : "timeline",
      x: 110 + (index % 2) * 320,
      y: 90 + index * 180,
    };
  });

  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: newEdgeId(),
    source: node.id,
    target: nodes[index + 1].id,
    label: "",
  }));

  return {
    nodes,
    edges,
    meta: { grid: 32, templateKey: "authority-imported-script" },
  };
}

export function buildImportedWorkspaceBlueprint(
  raw: string | ImportedScriptPayload,
  fallbackTitle = "Roteiro importado",
): ImportedWorkspaceBlueprint {
  const script =
    typeof raw === "string" ? parseImportedScriptPayload(raw, fallbackTitle) : normalizeImportedScriptPayload(raw, fallbackTitle);
  const flow = buildImportedFlowchart(script);

  return {
    title: script.titulo_da_tela || fallbackTitle,
    columns: [
      {
        name: "Base estratégica",
        cards: [
          {
            title: "Análise do tema",
            card_type: "conteudo",
            content_text: script.analise_do_tema,
            note: "Importado automaticamente do agente.",
          },
          {
            title: "Estratégia do vídeo",
            card_type: "conteudo",
            content_text: script.estrategia_do_video,
            note: "Importado automaticamente do agente.",
          },
          {
            title: "Formato do vídeo",
            card_type: "conteudo",
            content_text: script.formato_do_video,
            note: "Importado automaticamente do agente.",
          },
        ],
      },
      {
        name: "Gancho e execução",
        cards: [
          {
            title: "Hooks",
            card_type: "checklist",
            content_text: toChecklistContent(script.hooks),
            note: "Cards em lista para facilitar ajustes rápidos no quadro.",
          },
          {
            title: "Roteiro segundo a segundo",
            card_type: "fluxograma",
            content_text: toTimelineText(script.roteiro_segundo_a_segundo),
            note: "Importado como fluxograma editável do Bobar.",
            structure_json: JSON.stringify(flow),
          },
          {
            title: "Variações",
            card_type: "checklist",
            content_text: toChecklistContent(script.variacoes),
            note: "Importado automaticamente do agente.",
          },
        ],
      },
      {
        name: "Apoio de publicação",
        cards: [
          {
            title: "Texto na tela",
            card_type: "checklist",
            content_text: toChecklistContent(script.texto_na_tela),
            note: "Importado automaticamente do agente.",
          },
          {
            title: "Legenda",
            card_type: "conteudo",
            content_text: script.legenda,
            note: "Importado automaticamente do agente.",
          },
        ],
      },
    ],
  };
}

export function readImportedWorkspaceMeta(raw: string | null | undefined): ImportedWorkspaceMeta | null {
  const text = safeText(raw);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const payload = parsed?.import_workspace;
    if (!payload || typeof payload !== "object") return null;

    const record = payload as Record<string, unknown>;
    const column_ids = Array.isArray(record.column_ids)
      ? record.column_ids
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item) && item > 0)
      : [];

    return {
      version: Number(record.version || 1) || 1,
      title: safeText(record.title) || "Roteiro importado",
      column_ids,
      created_at: safeText(record.created_at) || undefined,
    };
  } catch {
    return null;
  }
}

export function writeImportedWorkspaceMeta(
  raw: string | null | undefined,
  meta: ImportedWorkspaceMeta,
): string {
  let parsed: Record<string, unknown> = {};
  try {
    const next = JSON.parse(safeText(raw) || "{}");
    if (next && typeof next === "object" && !Array.isArray(next)) {
      parsed = next as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  parsed.import_workspace = {
    version: meta.version || 1,
    title: safeText(meta.title) || "Roteiro importado",
    column_ids: (meta.column_ids || []).filter((item) => Number.isFinite(item) && item > 0),
    created_at: safeText(meta.created_at) || new Date().toISOString(),
  };

  return JSON.stringify(parsed);
}

export function getImportedWorkspaceColumnIds(card?: Pick<BobarCard, "structure_json"> | null): number[] {
  return readImportedWorkspaceMeta(card?.structure_json)?.column_ids || [];
}

export function buildAuthorityImportPayload(
  outputText: string,
  agent: { key: string; name: string },
): CreateBobarCardIn {
  const script = parseImportedScriptPayload(outputText, agent.name);

  return {
    title: script.titulo_da_tela || agent.name,
    content_text: JSON.stringify(script),
    card_type: "roteiro",
    source_kind: `authority_agent_import:${agent.key}`,
    source_label: agent.name,
    structure_json: writeImportedWorkspaceMeta("", {
      version: 1,
      title: script.titulo_da_tela || agent.name,
      column_ids: [],
      created_at: new Date().toISOString(),
    }),
  };
}
