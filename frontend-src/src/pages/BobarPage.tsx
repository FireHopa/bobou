import * as React from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Columns3,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderKanban,
  GitBranch,
  GripVertical,
  Inbox,
  LayoutTemplate,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Unlink,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "react-router-dom";
import { exportAuthorityFormat } from "@/lib/authorityExport";
import { AUTHORITY_AGENTS, authorityAgentByKey } from "@/constants/authorityAgents";
import {
  buildAuthorityWorkspaceSourceKind,
  buildImportedWorkspaceBlueprint,
  extractAuthorityAgentKey,
  getImportedWorkspaceColumnIds,
  inferImportedWorkspaceColumnIds,
  isAuthorityImportCard,
  writeImportedWorkspaceMeta,
} from "@/lib/bobarImported";
import { toastApiError, toastInfo, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/state/authStore";
import {
  bobarService,
  type BobarAttachment,
  type BobarBoard,
  type BobarBoardCollaboration,
  type BobarBoardInvite,
  type BobarBoardSharePreview,
  type BobarBoardSummary,
  type BobarCard,
  type BobarCardType,
  type BobarColumn,
  type BobarFlowchart,
  type BobarFlowEdge,
  type BobarFlowNode,
  type BobarLabel,
} from "@/services/bobar";

type FlowTemplate = {
  key: string;
  label: string;
  description: string;
  cardType: BobarCardType;
  title: string;
  note: string;
  contentText: string;
  structure?: BobarFlowchart;
};

type CardEditorDraft = {
  title: string;
  card_type: BobarCardType | string;
  column_id: number;
  content_text: string;
  note: string;
  due_at: string;
  label_ids: number[];
};

type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};


type DropdownOption = {
  value: string;
  label: string;
  description?: string;
};

type DragCardState = {
  cardId: number;
  fromColumnId: number;
};

type ColumnDialogState = { mode: "create"; column: null } | { mode: "rename"; column: BobarColumn };

type BoardDialogState = { mode: "create"; board: null } | { mode: "rename"; board: BobarBoardSummary };

type AttachmentPreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "other";

type AttachmentInlinePreview = {
  status: "idle" | "loading" | "ready" | "error";
  kind: AttachmentPreviewKind;
  url?: string;
  textContent?: string;
  error?: string;
};

type AttachmentPreviewState = {
  attachment: BobarAttachment;
  kind: AttachmentPreviewKind;
  url: string;
  textContent?: string;
};

type LabelDraft = {
  name: string;
  color: string;
};

type DeleteDialogState =
  | { type: "board"; board: BobarBoardSummary }
  | { type: "column"; column: BobarColumn }
  | { type: "card"; card: BobarCard };

type BobarViewMode = "board" | "imports";
type ImportProgressStatus = "todo" | "in_progress" | "done";

const CARD_TYPE_OPTIONS: Array<{ value: BobarCardType; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "roteiro", label: "Roteiro" },
  { value: "conteudo", label: "Conteúdo" },
  { value: "ideia", label: "Ideia" },
  { value: "checklist", label: "Checklist" },
  { value: "fluxograma", label: "Fluxograma" },
];

function newNodeId() {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newEdgeId() {
  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function newChecklistItemId() {
  return `check-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createChecklistItem(text = "", checked = false): ChecklistItem {
  return {
    id: newChecklistItemId(),
    text,
    checked,
  };
}

function normalizeChecklistItems(items: ChecklistItem[]) {
  const normalized = items.map((item) => ({
    id: item.id || newChecklistItemId(),
    text: String(item.text || ""),
    checked: Boolean(item.checked),
  }));

  return normalized.length ? normalized : [createChecklistItem()];
}

function parseChecklistContent(value: string | null | undefined) {
  const lines = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const items: ChecklistItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const taskMatch = line.match(/^(?:[-*•]\s*)?\[(x|X| )\]\s+(.*)$/);
    if (taskMatch) {
      items.push(createChecklistItem(taskMatch[2], /x/i.test(taskMatch[1])));
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.*)$/);
    if (bulletMatch) {
      items.push(createChecklistItem(bulletMatch[1], false));
      continue;
    }

    items.push(createChecklistItem(line, false));
  }

  return normalizeChecklistItems(items);
}

function serializeChecklistContent(items: ChecklistItem[]) {
  return items
    .map((item) => ({
      checked: Boolean(item.checked),
      text: String(item.text || "").trim(),
    }))
    .filter((item) => item.text)
    .map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`)
    .join("\n");
}

function getChecklistStats(items: ChecklistItem[]) {
  const validItems = items.filter((item) => item.text.trim());
  const checked = validItems.filter((item) => item.checked).length;
  return {
    total: validItems.length,
    checked,
    pending: Math.max(validItems.length - checked, 0),
  };
}

function normalizeFlowNode(raw: Partial<BobarFlowNode>, index: number): BobarFlowNode {
  return {
    id: String(raw.id || newNodeId()),
    title: String(raw.title || raw.time || `Bloco ${index + 1}`).slice(0, 90),
    content: String(raw.content || ""),
    time: String(raw.time || ""),
    kind: String(raw.kind || "step"),
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 80 + (index % 3) * 300,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : 80 + Math.floor(index / 3) * 190,
  };
}

function normalizeFlowEdge(raw: Partial<BobarFlowEdge>, index: number): BobarFlowEdge {
  return {
    id: String(raw.id || `edge-${raw.source || "source"}-${raw.target || "target"}-${index}`),
    source: String(raw.source || ""),
    target: String(raw.target || ""),
    label: String(raw.label || ""),
  };
}

function dedupeEdges(edges: BobarFlowEdge[]) {
  const seen = new Set<string>();
  const next: BobarFlowEdge[] = [];
  for (const edge of edges) {
    if (!edge.source || !edge.target || edge.source === edge.target) continue;
    const key = `${edge.source}:${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(edge);
  }
  return next;
}

function buildSequentialEdges(nodes: BobarFlowNode[]): BobarFlowEdge[] {
  const next: BobarFlowEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    next.push({
      id: newEdgeId(),
      source: nodes[index].id,
      target: nodes[index + 1].id,
      label: "",
    });
  }
  return next;
}

function flowToContentText(flow: BobarFlowchart) {
  return flow.nodes
    .map((node, index) => {
      const header = [node.time || "", node.title || `Bloco ${index + 1}`]
        .filter(Boolean)
        .join(" · ");
      return [header, normalizeText(node.content)].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function parseFlowchart(
  structureJson?: string | null,
  fallbackTitle = "Novo fluxo",
  fallbackContent = "",
): BobarFlowchart {
  try {
    const parsed = JSON.parse(structureJson || "{}");
    const rawNodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    const nodes: BobarFlowNode[] = rawNodes.map((node: unknown, index: number) =>
      normalizeFlowNode((node || {}) as Partial<BobarFlowNode>, index),
    );
    const validIds = new Set<string>(nodes.map((node) => node.id));
    const rawEdges = Array.isArray(parsed?.edges) ? parsed.edges : [];
    const edges: BobarFlowEdge[] = dedupeEdges(
      rawEdges
        .map((edge: unknown, index: number) =>
          normalizeFlowEdge((edge || {}) as Partial<BobarFlowEdge>, index),
        )
        .filter((edge: BobarFlowEdge) => validIds.has(edge.source) && validIds.has(edge.target)),
    );

    if (nodes.length) {
      return {
        nodes,
        edges,
        meta: typeof parsed?.meta === "object" && parsed?.meta ? parsed.meta : { grid: 32 },
      };
    }
  } catch {
    // noop
  }

  const text = normalizeText(fallbackContent);
  const chunks = text
    ? text
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
    : [];

  const nodes =
    chunks.length > 0
      ? chunks.slice(0, 18).map((chunk, index) => {
          const lines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          const head = lines[0] || fallbackTitle;
          const timeMatch = head.match(/(\d+\s*(?:-|a|até|to)\s*\d+\s*s|\d+\s*s)/i);
          return normalizeFlowNode(
            {
              title: timeMatch
                ? head.replace(String(timeMatch[1]), "").replace(/^[-–·:\s]+|[-–·:\s]+$/g, "") ||
                  head
                : head.slice(0, 70),
              time: timeMatch ? String(timeMatch[1]).replace(/\s+/g, "") : "",
              content: lines.slice(1).join("\n") || chunk,
              kind: index === 0 ? "hook" : index === chunks.length - 1 ? "cta" : "step",
            },
            index,
          );
        })
      : [
          normalizeFlowNode(
            {
              title: fallbackTitle || "Novo bloco",
              content: fallbackContent,
              kind: "step",
            },
            0,
          ),
        ];

  return {
    nodes,
    edges: [],
    meta: { grid: 32 },
  };
}

function cloneFlow(flow?: BobarFlowchart | null): BobarFlowchart {
  const source = flow || { nodes: [], edges: [], meta: { grid: 32 } };
  const idMap = new Map<string, string>();
  const nodes = source.nodes.map((node, index) => {
    const nextId = newNodeId();
    idMap.set(node.id, nextId);
    return normalizeFlowNode({ ...node, id: nextId }, index);
  });
  const edges = dedupeEdges(
    source.edges.map((edge, index) =>
      normalizeFlowEdge(
        {
          ...edge,
          id: newEdgeId(),
          source: idMap.get(edge.source) || edge.source,
          target: idMap.get(edge.target) || edge.target,
        },
        index,
      ),
    ),
  );
  return {
    nodes,
    edges,
    meta: { ...(source.meta || {}), grid: Number(source.meta?.grid || 32) || 32 },
  };
}

function buildFlowTemplate(
  key: string,
  label: string,
  description: string,
  title: string,
  nodes: Array<Partial<BobarFlowNode>>,
): FlowTemplate {
  const normalizedNodes = nodes.map((node, index) =>
    normalizeFlowNode(
      {
        id: newNodeId(),
        title: String(node.title || `Bloco ${index + 1}`),
        content: String(node.content || ""),
        time: String(node.time || ""),
        kind: String(node.kind || "step"),
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : 80 + index * 280,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80 + (index % 2) * 160,
      },
      index,
    ),
  );

  const structure: BobarFlowchart = {
    nodes: normalizedNodes,
    edges: buildSequentialEdges(normalizedNodes),
    meta: { templateKey: key, grid: 32 },
  };

  return {
    key,
    label,
    description,
    cardType: "fluxograma",
    title,
    note: description,
    contentText: flowToContentText(structure),
    structure,
  };
}

const CARD_TEMPLATES: FlowTemplate[] = [
  buildFlowTemplate(
    "ugc-hook-30s",
    "UGC hook 30s",
    "Hook curto com dor, prova e CTA.",
    "Roteiro UGC · Hook 30s",
    [
      {
        time: "0-3s",
        title: "Hook",
        kind: "hook",
        content: "Abra com uma quebra forte, curiosidade ou contraste visual.",
      },
      {
        time: "4-8s",
        title: "Dor",
        kind: "step",
        content: "Mostre o problema principal da audiência.",
      },
      {
        time: "9-16s",
        title: "Prova",
        kind: "support",
        content: "Mostre evidência, exemplo ou resultado real.",
      },
      {
        time: "17-30s",
        title: "CTA",
        kind: "cta",
        content: "Finalize com um próximo passo claro.",
      },
    ],
  ),
  buildFlowTemplate(
    "storysell-45s",
    "Storysell 45s",
    "Narrativa com conflito, virada e fechamento comercial.",
    "Storysell · 45s",
    [
      {
        time: "0-5s",
        title: "Abertura",
        kind: "hook",
        content: "Entre já no contexto ou conflito.",
      },
      {
        time: "6-15s",
        title: "Tensão",
        kind: "step",
        content: "Aumente o peso do problema ou desafio.",
      },
      {
        time: "16-28s",
        title: "Virada",
        kind: "support",
        content: "Mostre o ponto de descoberta da solução.",
      },
      {
        time: "29-45s",
        title: "Resultado + CTA",
        kind: "cta",
        content: "Feche com transformação e chamada.",
      },
    ],
  ),
  {
    key: "pipeline-conteudo",
    label: "Pipeline de conteúdo",
    description: "Card de produção simples para acompanhar execução.",
    cardType: "conteudo",
    title: "Pipeline de conteúdo",
    note: "Use esse card para mover uma pauta entre etapas operacionais.",
    contentText: [
      "1. Definir objetivo do conteúdo",
      "2. Validar hook principal",
      "3. Aprovar roteiro",
      "4. Gravar versão principal",
      "5. Separar cortes e variações",
      "6. Publicar e revisar performance",
    ].join("\n"),
  },
  {
    key: "checklist-gravacao",
    label: "Checklist de gravação",
    description: "Checklist pronta para captação e revisão.",
    cardType: "checklist",
    title: "Checklist de gravação",
    note: "Use antes de liberar gravação ou edição.",
    contentText: [
      "- Confirmar hook e CTA aprovados",
      "- Validar enquadramento, lente e iluminação",
      "- Separar provas visuais e telas",
      "- Gravar variações de abertura",
      "- Revisar áudio, legenda e thumb",
    ].join("\n"),
  },
];

function buildConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const deltaX = Math.max(80, Math.abs(endX - startX) * 0.42);
  return `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
}

function buildEdgePath(source: BobarFlowNode, target: BobarFlowNode) {
  return buildConnectionPath(source.x + 256, source.y + 62, target.x, target.y + 62);
}

function clampPosition(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function autoArrangeFlow(flow: BobarFlowchart) {
  if (!flow.nodes.length) return flow;

  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of flow.nodes) {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of flow.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const timeValue = (node: BobarFlowNode) => {
    const match = String(node.time || node.title || "").match(/(\d+(?:[.,]\d+)?)/);
    return match ? Number(String(match[1]).replace(",", ".")) : Number.POSITIVE_INFINITY;
  };

  const queue = flow.nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort((a, b) => {
      const delta = timeValue(a) - timeValue(b);
      if (Number.isFinite(delta) && delta !== 0) return delta;
      return a.y === b.y ? a.x - b.x : a.y - b.y;
    })
    .map((node) => node.id);

  const visited = new Set<string>();
  const orderedIds: string[] = [];
  const depthById = new Map<string, number>();

  for (const node of flow.nodes) depthById.set(node.id, 0);

  while (queue.length) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    orderedIds.push(nodeId);

    for (const nextId of outgoing.get(nodeId) || []) {
      depthById.set(nextId, Math.max(depthById.get(nextId) || 0, (depthById.get(nodeId) || 0) + 1));
      indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
      if ((indegree.get(nextId) || 0) <= 0) queue.push(nextId);
    }

    queue.sort((leftId, rightId) => {
      const left = byId.get(leftId)!;
      const right = byId.get(rightId)!;
      const delta = timeValue(left) - timeValue(right);
      if (Number.isFinite(delta) && delta !== 0) return delta;
      return left.y === right.y ? left.x - right.x : left.y - right.y;
    });
  }

  for (const node of flow.nodes) {
    if (!visited.has(node.id)) orderedIds.push(node.id);
  }

  const lanes = new Map<number, BobarFlowNode[]>();
  for (const nodeId of orderedIds) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const lane = depthById.get(nodeId) || 0;
    const bucket = lanes.get(lane) || [];
    bucket.push(node);
    lanes.set(lane, bucket);
  }

  const nodes = orderedIds.map((nodeId, index) => {
    const node = byId.get(nodeId)!;
    const lane = depthById.get(nodeId) || 0;
    const laneNodes = lanes.get(lane) || [node];
    const laneIndex = laneNodes.findIndex((candidate) => candidate.id === nodeId);
    return normalizeFlowNode(
      {
        ...node,
        x: 88 + lane * 340,
        y: 88 + laneIndex * 244,
      },
      index,
    );
  });

  return { ...flow, nodes };
}

function readTemplateKeyFromStructure(structureJson?: string | null) {
  try {
    const parsed = JSON.parse(structureJson || "{}");
    return String(parsed?.meta?.templateKey || "");
  } catch {
    return "";
  }
}

const IMPORT_PROGRESS_OPTIONS: Array<{ value: ImportProgressStatus; label: string }> = [
  { value: "todo", label: "A fazer" },
  { value: "in_progress", label: "Em progresso" },
  { value: "done", label: "Finalizado" },
];

function readImportProgressStatus(structureJson?: string | null): ImportProgressStatus {
  try {
    const parsed = JSON.parse(structureJson || "{}");
    const value = String(parsed?.meta?.import_status || "").toLowerCase();
    if (value === "in_progress") return "in_progress";
    if (value === "done") return "done";
    return "todo";
  } catch {
    return "todo";
  }
}

function writeImportProgressStatus(
  structureJson: string | null | undefined,
  status: ImportProgressStatus,
) {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(structureJson || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const currentMeta =
    parsed.meta && typeof parsed.meta === "object" && !Array.isArray(parsed.meta)
      ? (parsed.meta as Record<string, unknown>)
      : {};

  return JSON.stringify(
    {
      ...parsed,
      meta: {
        ...currentMeta,
        import_status: status,
      },
    },
    null,
    2,
  );
}

function importProgressBadgeClasses(status: ImportProgressStatus) {
  if (status === "done") return "border-emerald-400/25 bg-emerald-400/12 text-emerald-100";
  if (status === "in_progress") return "border-amber-400/25 bg-amber-400/12 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-white/70";
}

function importProgressButtonClasses(active: boolean, status: ImportProgressStatus) {
  if (!active) {
    return "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:bg-white/[0.05] hover:text-white";
  }
  if (status === "done") return "border-emerald-400/35 bg-emerald-400/15 text-emerald-50";
  if (status === "in_progress") return "border-amber-400/35 bg-amber-400/15 text-amber-50";
  return "border-cyan-400/35 bg-cyan-400/15 text-cyan-50";
}

function formatImportProgressLabel(status: ImportProgressStatus) {
  return IMPORT_PROGRESS_OPTIONS.find((option) => option.value === status)?.label || "A fazer";
}

function parseFlowContentSections(value: string | null | undefined) {
  const lines = normalizeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const actionParts: string[] = [];
  const speechParts: string[] = [];
  const otherParts: string[] = [];
  let bucket: "action" | "speech" | "other" = "other";

  for (const line of lines) {
    const actionMatch = line.match(/^a[cç][aã]o\s*:\s*(.*)$/i);
    if (actionMatch) {
      bucket = "action";
      if (actionMatch[1]) actionParts.push(actionMatch[1].trim());
      continue;
    }

    const speechMatch = line.match(/^fala\s*:\s*(.*)$/i);
    if (speechMatch) {
      bucket = "speech";
      if (speechMatch[1]) speechParts.push(speechMatch[1].trim());
      continue;
    }

    if (bucket === "action") actionParts.push(line);
    else if (bucket === "speech") speechParts.push(line);
    else otherParts.push(line);
  }

  return {
    action: actionParts.join(" ").trim(),
    speech: speechParts.join(" ").trim(),
    other: otherParts.join("\n").trim(),
  };
}

function typeLabel(cardType?: string | null) {
  switch ((cardType || "").toLowerCase()) {
    case "roteiro":
      return "Roteiro";
    case "conteudo":
      return "Conteúdo";
    case "checklist":
      return "Checklist";
    case "ideia":
      return "Ideia";
    case "fluxograma":
      return "Fluxograma";
    default:
      return "Manual";
  }
}

function nodeKindLabel(kind?: string | null) {
  switch ((kind || "").toLowerCase()) {
    case "hook":
      return "Hook";
    case "cta":
      return "CTA";
    case "support":
      return "Prova";
    case "timeline":
      return "Linha do tempo";
    default:
      return "Passo";
  }
}

function typeBadgeClasses(cardType?: string | null) {
  const label = typeLabel(cardType);
  if (label === "Roteiro") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  if (label === "Conteúdo") return "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200";
  if (label === "Checklist") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (label === "Ideia") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (label === "Fluxograma") return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  return "border-white/10 bg-white/5 text-white/70";
}

function countImportedCards(board: BobarBoard | null) {
  if (!board) return 0;
  return board.columns.reduce(
    (acc, column) => acc + column.cards.filter((card) => isAuthorityImportCard(card)).length,
    0,
  );
}

function countFlowchartCards(board: BobarBoard | null) {
  if (!board) return 0;
  return board.columns.reduce(
    (acc, column) =>
      acc +
      column.cards.filter((card) => String(card.card_type || "").toLowerCase() === "fluxograma")
        .length,
    0,
  );
}

function countTemplateCards(board: BobarBoard | null) {
  if (!board) return 0;
  return board.columns.reduce((acc, column) => {
    return (
      acc +
      column.cards.filter((card) => Boolean(readTemplateKeyFromStructure(card.structure_json)))
        .length
    );
  }, 0);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function parseDueDateControls(value?: string | null) {
  const input = String(value || "").trim();
  if (!input) return { date: "", time: "" };

  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) return { date: "", time: "" };

  const [, dayValue, monthValue, yearValue, hourValue, minuteValue] = match;
  return {
    date: `${yearValue}-${monthValue}-${dayValue}`,
    time: hourValue && minuteValue ? `${hourValue}:${minuteValue}` : "",
  };
}

function buildDueDateFromControls(dateValue: string, timeValue: string) {
  const date = String(dateValue || "").trim();
  if (!date) return "";

  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const [, yearValue, monthValue, dayValue] = match;
  const time = String(timeValue || "").trim();
  return `${dayValue}/${monthValue}/${yearValue}${time ? ` ${time}` : ""}`;
}

function formatDueDateHint(value?: string | null) {
  const input = String(value || "").trim();
  if (!input) return "";
  return /\d{2}:\d{2}$/.test(input) ? input : `${input} 23:59`;
}

function formatDueDateInput(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);

  let output = day;
  if (month) output += `/${month}`;
  if (year) output += `/${year}`;
  if (hour) output += ` ${hour}`;
  if (minute) output += `:${minute}`;
  return output;
}

function toIsoDatetime(value: string) {
  const input = String(value || "").trim();
  if (!input) return null;

  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const [, dayValue, monthValue, yearValue, hourValue, minuteValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  const hour = hourValue ? Number(hourValue) : 23;
  const minute = minuteValue ? Number(minuteValue) : 59;

  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 1900) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

function isCardOverdue(card?: Pick<BobarCard, "due_at"> | null) {
  if (!card?.due_at) return false;
  const dueAt = new Date(card.due_at);
  if (Number.isNaN(dueAt.getTime())) return false;
  return dueAt.getTime() < Date.now();
}

function sameNumberArray(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function isTextLikeMimeType(mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+xml") ||
    mimeType === "application/javascript"
  );
}

function isAttachmentPreviewable(attachment: BobarAttachment) {
  const mimeType = String(attachment.mime_type || "").toLowerCase();
  if (!mimeType) return false;
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    isTextLikeMimeType(mimeType) ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/")
  );
}

function attachmentPreviewKind(attachment: BobarAttachment): AttachmentPreviewKind {
  const mimeType = String(attachment.mime_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (isTextLikeMimeType(mimeType)) return "text";
  return "other";
}

function attachmentPreviewLabel(kind: AttachmentPreviewKind) {
  switch (kind) {
    case "image":
      return "Imagem";
    case "pdf":
      return "PDF";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "text":
      return "Documento";
    default:
      return "Arquivo";
  }
}

function buildAttachmentTextSnippet(value?: string | null) {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "Arquivo sem conteúdo legível.";
  return normalized.length > 800 ? `${normalized.slice(0, 800)}…` : normalized;
}

function buildSnippet(card: BobarCard) {
  const cardType = String(card.card_type || "").toLowerCase();

  if (cardType === "fluxograma") {
    const flow = parseFlowchart(card.structure_json, card.title, card.content_text);
    const titles = flow.nodes
      .map((node) => node.time || node.title)
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length) return titles.join(" → ") + (flow.nodes.length > 3 ? "…" : "");
  }

  if (cardType === "checklist") {
    const items = parseChecklistContent(card.content_text);
    const stats = getChecklistStats(items);
    const preview = items
      .map((item) => item.text.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" • ");

    if (stats.total) {
      return `${stats.checked}/${stats.total} concluídos${preview ? ` • ${preview}` : ""}`;
    }
  }

  const cleanText = normalizeText(card.content_text);
  if (cleanText) {
    try {
      const exported = exportAuthorityFormat(cleanText, "txt").replace(/\s+/g, " ").trim();
      if (exported) return exported.slice(0, 180) + (exported.length > 180 ? "…" : "");
    } catch {
      // noop
    }
    return cleanText.replace(/\s+/g, " ").slice(0, 180) + (cleanText.length > 180 ? "…" : "");
  }

  const note = normalizeText(card.note).replace(/\s+/g, " ");
  if (note) return note.slice(0, 180) + (note.length > 180 ? "…" : "");
  return "Card vazio. Abra o editor e preencha o conteúdo.";
}

function findCard(board: BobarBoard | null, cardId: number | null) {
  if (!board || !cardId) return null;
  for (const column of board.columns) {
    const found = column.cards.find((card) => card.id === cardId);
    if (found) return found;
  }
  return null;
}

function firstCardId(board: BobarBoard | null) {
  if (!board) return null;
  for (const column of board.columns) {
    if (column.cards[0]) return column.cards[0].id;
  }
  return null;
}

function firstCardIdFromColumns(columns: BobarColumn[]) {
  for (const column of columns) {
    if (column.cards[0]) return column.cards[0].id;
  }
  return null;
}

function diffNewColumnId(previous: BobarBoard | null, next: BobarBoard) {
  const previousIds = new Set((previous?.columns || []).map((column) => column.id));
  const added = next.columns.find((column) => !previousIds.has(column.id));
  return added?.id || null;
}

function diffNewCardId(previous: BobarBoard | null, next: BobarBoard) {
  const previousIds = new Set((previous?.columns || []).flatMap((column) => column.cards.map((card) => card.id)));
  for (const column of next.columns) {
    const added = column.cards.find((card) => !previousIds.has(card.id));
    if (added) return added.id;
  }
  return null;
}


function uniquePositiveIds(...groups: number[][]) {
  const ids = new Set<number>();
  for (const group of groups) {
    for (const value of group) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  }
  return Array.from(ids);
}

function shallowEqualDraft(a: CardEditorDraft | null, b: CardEditorDraft | null) {
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.card_type === b.card_type &&
    a.column_id === b.column_id &&
    a.content_text === b.content_text &&
    a.note === b.note &&
    a.due_at === b.due_at &&
    sameNumberArray(a.label_ids, b.label_ids)
  );
}


const CALENDAR_WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type CalendarDayCell = {
  key: string;
  date: Date;
  currentMonth: boolean;
};

function parseControlDateValue(value?: string | null) {
  const input = String(value || "").trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatControlDateValue(date: Date) {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameCalendarDate(a?: Date | null, b?: Date | null) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function shiftCalendarMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12, 0, 0, 0);
}

function buildCalendarGrid(cursor: Date): CalendarDayCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1, 12, 0, 0, 0);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0, 12, 0, 0, 0).getDate();
  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - firstWeekday + 1;
    let cellDate: Date;
    let currentMonth = true;

    if (dayOffset <= 0) {
      currentMonth = false;
      cellDate = new Date(year, month - 1, daysInPreviousMonth + dayOffset, 12, 0, 0, 0);
    } else if (dayOffset > daysInMonth) {
      currentMonth = false;
      cellDate = new Date(year, month + 1, dayOffset - daysInMonth, 12, 0, 0, 0);
    } else {
      cellDate = new Date(year, month, dayOffset, 12, 0, 0, 0);
    }

    cells.push({
      key: `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`,
      date: cellDate,
      currentMonth,
    });
  }

  return cells;
}

function formatCalendarHeader(date: Date) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function DueDatePickerField({
  value,
  onChange,
  onClear,
  invalid,
  overdue,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  onClear: () => void;
  invalid?: boolean;
  overdue?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({});

  const controls = React.useMemo(() => parseDueDateControls(value), [value]);
  const selectedDate = React.useMemo(() => parseControlDateValue(controls.date), [controls.date]);
  const selectedTime = controls.time || "";
  const [selectedHour = "23", selectedMinute = "59"] = (selectedTime || "23:59").split(":");
  const [monthCursor, setMonthCursor] = React.useState<Date>(() => {
    const base = selectedDate || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0, 0);
  });

  React.useEffect(() => {
    const base = selectedDate || new Date();
    setMonthCursor((current) => {
      if (
        current.getFullYear() === base.getFullYear() &&
        current.getMonth() === base.getMonth()
      ) {
        return current;
      }
      return new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0, 0);
    });
  }, [selectedDate]);

  const updatePanelPosition = React.useCallback(() => {
    if (typeof window === "undefined" || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gutter = 16;
    const desiredWidth = Math.min(980, Math.max(320, viewportWidth - gutter * 2));
    const maxLeft = Math.max(gutter, viewportWidth - desiredWidth - gutter);
    const left = Math.min(Math.max(rect.left, gutter), maxLeft);
    const top = Math.min(rect.bottom + 12, Math.max(16, viewportHeight - 360));
    const maxHeight = Math.max(320, viewportHeight - top - gutter);

    setPanelStyle({
      position: "fixed",
      top,
      left,
      width: desiredWidth,
      maxHeight,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const handleViewportChange = () => updatePanelPosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  const calendarCells = React.useMemo(() => buildCalendarGrid(monthCursor), [monthCursor]);
  const quickTimes = React.useMemo(() => ["09:00", "12:00", "18:00", "23:59"], []);
  const hourOptions = React.useMemo(
    () => Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")),
    [],
  );
  const minuteOptions = React.useMemo(
    () => Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")),
    [],
  );

  const buttonDateLabel = React.useMemo(() => {
    if (invalid) return "Prazo inválido";
    if (!selectedDate) return "Definir prazo";
    const pad = (input: number) => String(input).padStart(2, "0");
    return `${pad(selectedDate.getDate())}/${pad(selectedDate.getMonth() + 1)}/${selectedDate.getFullYear()}`;
  }, [invalid, selectedDate]);

  const buttonTimeLabel = React.useMemo(() => {
    if (invalid) return "Limpe e selecione novamente.";
    if (!selectedDate) return "Escolha uma data no calendário";
    return selectedTime ? `${selectedTime} definido` : "23:59 automático";
  }, [invalid, selectedDate, selectedTime]);

  const applyDate = React.useCallback(
    (date: Date) => {
      onChange(buildDueDateFromControls(formatControlDateValue(date), selectedTime));
    },
    [onChange, selectedTime],
  );

  const applyTime = React.useCallback(
    (time: string) => {
      if (!controls.date) return;
      onChange(buildDueDateFromControls(controls.date, time));
    },
    [controls.date, onChange],
  );

  const clearTime = React.useCallback(() => {
    if (!controls.date) return;
    onChange(buildDueDateFromControls(controls.date, ""));
  }, [controls.date, onChange]);

  return (
    <div className="space-y-3" ref={wrapperRef}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Data limite
        </div>
        <div className="text-[11px] font-medium text-white/40">
          Calendário + relógio
        </div>
      </div>

      <div
        className={cn(
          "rounded-[1.6rem] border bg-[#081224] p-3 transition",
          invalid
            ? "border-amber-400/25 bg-amber-500/8"
            : overdue
              ? "border-red-400/25 bg-red-500/8"
              : "border-cyan-400/15",
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "group flex min-w-0 flex-1 items-center gap-3 rounded-[1.3rem] border px-4 py-3 text-left transition",
              invalid
                ? "border-amber-400/35 bg-amber-500/10 text-amber-50"
                : overdue
                  ? "border-red-400/35 bg-red-500/10 text-red-50"
                  : "border-cyan-400/20 bg-[#0a1225] text-white hover:border-cyan-300/45 hover:bg-[#0c1830]",
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                invalid
                  ? "border-amber-300/25 bg-amber-500/10 text-amber-100"
                  : overdue
                    ? "border-red-300/25 bg-red-500/10 text-red-100"
                    : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
              )}
            >
              <CalendarClock className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{buttonDateLabel}</div>
              <div className="truncate text-xs text-white/50">{buttonTimeLabel}</div>
            </div>

            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-white/55 transition", open && "rotate-180")}
            />
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDate ? (
              <button
                type="button"
                onClick={clearTime}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-2xl border px-3 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  selectedTime
                    ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300/45"
                    : "border-white/10 bg-white/[0.04] text-white/45 hover:text-white/70",
                )}
              >
                23:59 auto
              </button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              disabled={!value}
              className="h-11 rounded-2xl border-white/12 bg-white/[0.03] px-4"
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>

        <div className="mt-3 text-xs leading-5 text-white/45">
          Escolha a data no calendário. A hora é opcional; sem hora definida, o sistema assume 23:59.
        </div>

        {open && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={panelRef}
                style={panelStyle}
                className="z-[2147483000] overflow-hidden rounded-[1.8rem] border border-cyan-400/20 bg-[#050d1c]/98 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/65">
                      Calendário + relógio
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      Selecione o dia e, se quiser, defina uma hora específica.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDate ? (
                      <button
                        type="button"
                        onClick={clearTime}
                        className={cn(
                          "inline-flex h-10 items-center justify-center rounded-2xl border px-3 text-xs font-semibold uppercase tracking-[0.16em] transition",
                          selectedTime
                            ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300/45"
                            : "border-white/10 bg-white/[0.04] text-white/45 hover:text-white/70",
                        )}
                      >
                        23:59 auto
                      </button>
                    ) : null}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setOpen(false)}
                      className="h-10 w-10 rounded-2xl border-white/12 bg-white/[0.03]"
                      aria-label="Fechar calendário"
                    >
                      <X className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onClear();
                        setOpen(false);
                      }}
                      disabled={!value}
                      className="h-10 rounded-2xl border-white/12 bg-white/[0.03] px-4"
                    >
                      Limpar
                    </Button>
                  </div>
                </div>

                <div
                  className="custom-scrollbar grid gap-4 overflow-y-auto pr-1 xl:grid-cols-[minmax(0,1fr)_320px]"
                  style={{ maxHeight: panelStyle.maxHeight ? `calc(${panelStyle.maxHeight}px - 110px)` : undefined }}
                >
                  <div className="rounded-[1.35rem] border border-cyan-400/15 bg-[#081224] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                          Calendário
                        </div>
                        <div className="mt-1 text-base font-bold text-white">
                          {formatCalendarHeader(monthCursor)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMonthCursor((current) => shiftCalendarMonth(current, -1))}
                          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-cyan-300/35 hover:text-white"
                          aria-label="Mês anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMonthCursor((current) => shiftCalendarMonth(current, 1))}
                          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-cyan-300/35 hover:text-white"
                          aria-label="Próximo mês"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mb-2 grid grid-cols-7 gap-2">
                      {CALENDAR_WEEKDAY_LABELS.map((label) => (
                        <div
                          key={label}
                          className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35"
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                      {calendarCells.map((cell) => {
                        const isSelected = sameCalendarDate(cell.date, selectedDate);
                        const isToday = sameCalendarDate(cell.date, new Date());
                        return (
                          <button
                            key={cell.key}
                            type="button"
                            onClick={() => applyDate(cell.date)}
                            className={cn(
                              "flex h-11 items-center justify-center rounded-2xl border text-sm font-semibold transition",
                              isSelected
                                ? "border-cyan-300/50 bg-cyan-400/18 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
                                : cell.currentMonth
                                  ? "border-white/8 bg-white/[0.03] text-white/80 hover:border-cyan-300/25 hover:bg-cyan-400/8"
                                  : "border-white/5 bg-white/[0.02] text-white/25 hover:text-white/55",
                              isToday && !isSelected && "border-cyan-400/18 text-cyan-100",
                            )}
                          >
                            {cell.date.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date();
                          setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0));
                          applyDate(today);
                        }}
                        className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/40"
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          setMonthCursor(
                            new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1, 12, 0, 0, 0),
                          );
                          applyDate(tomorrow);
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-cyan-300/25 hover:text-white"
                      >
                        Amanhã
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-cyan-400/15 bg-[#081224] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                          Relógio
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-2xl font-black text-white">
                          <Clock3 className="h-5 w-5 text-cyan-200/70" />
                          <span>{selectedDate ? `${selectedHour}:${selectedMinute}` : "--:--"}</span>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-white/45">
                          {selectedDate
                            ? selectedTime
                              ? "Hora fixa definida para este prazo."
                              : "Sem hora fixa. O sistema usa 23:59."
                            : "Escolha um dia no calendário para habilitar o relógio."}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-2">
                        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                          Hora
                        </div>
                        <div className="custom-scrollbar max-h-56 overflow-y-auto pr-1">
                          <div className="grid gap-1">
                            {hourOptions.map((hour) => {
                              const active = selectedDate && selectedHour === hour && Boolean(selectedTime);
                              return (
                                <button
                                  key={hour}
                                  type="button"
                                  disabled={!selectedDate}
                                  onClick={() => applyTime(`${hour}:${selectedMinute}`)}
                                  className={cn(
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    !selectedDate
                                      ? "cursor-not-allowed bg-white/[0.02] text-white/20"
                                      : active
                                        ? "bg-cyan-400/18 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.14)]"
                                        : "bg-white/[0.04] text-white/70 hover:bg-cyan-400/10 hover:text-white",
                                  )}
                                >
                                  {hour}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-2">
                        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                          Minuto
                        </div>
                        <div className="custom-scrollbar max-h-56 overflow-y-auto pr-1">
                          <div className="grid gap-1">
                            {minuteOptions.map((minute) => {
                              const active = selectedDate && selectedMinute === minute && Boolean(selectedTime);
                              return (
                                <button
                                  key={minute}
                                  type="button"
                                  disabled={!selectedDate}
                                  onClick={() => applyTime(`${selectedHour}:${minute}`)}
                                  className={cn(
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    !selectedDate
                                      ? "cursor-not-allowed bg-white/[0.02] text-white/20"
                                      : active
                                        ? "bg-cyan-400/18 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.14)]"
                                        : "bg-white/[0.04] text-white/70 hover:bg-cyan-400/10 hover:text-white",
                                  )}
                                >
                                  {minute}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!selectedDate}
                        onClick={clearTime}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          !selectedDate
                            ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/25"
                            : !selectedTime
                              ? "border-cyan-400/20 bg-cyan-400/12 text-cyan-100"
                              : "border-white/10 bg-white/[0.04] text-white/70 hover:border-cyan-300/30 hover:text-white",
                        )}
                      >
                        Sem hora
                      </button>
                      {quickTimes.map((time) => (
                        <button
                          key={time}
                          type="button"
                          disabled={!selectedDate}
                          onClick={() => applyTime(time)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            !selectedDate
                              ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/25"
                              : selectedTime === time
                                ? "border-cyan-400/20 bg-cyan-400/12 text-cyan-100"
                                : "border-white/10 bg-white/[0.04] text-white/70 hover:border-cyan-300/30 hover:text-white",
                          )}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {selectedDate ? (
          <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
            Prazo atual: <span className="font-semibold text-white">{formatDueDateHint(value)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const shouldOpenAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(320, shouldOpenAbove ? spaceAbove : spaceBelow));

    setMenuStyle({
      position: "fixed",
      left: rect.left,
      top: shouldOpenAbove ? Math.max(16, rect.top - maxHeight - 8) : rect.bottom + 8,
      width: rect.width,
      maxHeight,
      zIndex: 120,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const handleReposition = () => updateMenuPosition();

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuPosition]);

  const active = options.find((option) => option.value === value);

  return (
    <div className="space-y-2" ref={wrapperRef}>
      {label ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          {label}
        </div>
      ) : null}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-left shadow-[0_16px_40px_rgba(0,0,0,0.2)] transition",
            "border-cyan-400/30 bg-[#0a1225] text-white hover:border-cyan-300/50 hover:bg-[#0d1830]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <div className="min-w-0">
            <div
              className={cn(
                "truncate text-sm font-medium",
                active ? "text-white" : "text-white/45",
              )}
            >
              {active?.label || placeholder || "Selecionar"}
            </div>
            {active?.description ? (
              <div className="truncate text-xs text-white/45">{active.description}</div>
            ) : null}
          </div>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-white/55 transition", open && "rotate-180")}
          />
        </button>

        {open && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={menuRef}
                style={menuStyle}
                className="overflow-hidden rounded-[1.4rem] border border-cyan-400/20 bg-[#07101f] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              >
                <div className="overflow-y-auto pr-1" style={{ maxHeight: menuStyle.maxHeight }}>
                  {options.map((option) => {
                    const activeOption = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left transition",
                          activeOption
                            ? "bg-cyan-400/12 text-cyan-100"
                            : "text-white/80 hover:bg-white/5",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{option.label}</div>
                          {option.description ? (
                            <div className="mt-1 text-xs leading-5 text-white/45">
                              {option.description}
                            </div>
                          ) : null}
                        </div>
                        {activeOption ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            {label}
          </div>
          <div className="mt-1 text-2xl font-black text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/40">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="mt-4 text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/55">{description}</div>
    </div>
  );
}

function GuideStep({
  step,
  title,
  description,
  className,
}: {
  step: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[184px] flex-1 items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3.5",
        className,
      )}
    >
      <div className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
        {step}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-5 text-white">{title}</div>
        {description ? <div className="mt-1 text-sm leading-5 text-white/55">{description}</div> : null}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-white/45">{label}</span>
      <span
        className={cn("min-w-0 text-right text-white/72", emphasized && "font-semibold text-white")}
      >
        {value}
      </span>
    </div>
  );
}


function ColumnLane({
  column,
  selectedCardId,
  labelsById,
  onSelectCard,
  onCreateCard,
  onRenameColumn,
  onDeleteColumn,
  dragState,
  dragOverColumnId,
  onStartDragCard,
  onEndDragCard,
  onDragColumn,
  onDropColumn,
}: {
  column: BobarColumn;
  selectedCardId: number | null;
  labelsById: Record<number, BobarLabel>;
  onSelectCard: (cardId: number) => void;
  onCreateCard: (columnId: number) => void;
  onRenameColumn: (column: BobarColumn) => void;
  onDeleteColumn: (column: BobarColumn) => void;
  dragState: DragCardState | null;
  dragOverColumnId: number | null;
  onStartDragCard: (card: BobarCard, event: React.DragEvent<HTMLButtonElement>) => void;
  onEndDragCard: () => void;
  onDragColumn: (columnId: number) => void;
  onDropColumn: (columnId: number) => void;
}) {
  const isDropActive =
    dragState && dragOverColumnId === column.id && dragState.fromColumnId !== column.id;
  const selectedCount = column.cards.filter((card) => card.id === selectedCardId).length;

  return (
    <Card
      variant="glass"
      className={cn(
        "flex w-[min(340px,82vw)] min-w-[296px] max-w-[340px] snap-start flex-col overflow-hidden rounded-[2rem] border bg-[#07101f]/80 backdrop-blur",
        isDropActive
          ? "border-cyan-300/60 shadow-[0_0_0_1px_rgba(34,211,238,0.28),0_24px_48px_rgba(8,145,178,0.18)]"
          : "border-cyan-400/12",
      )}
      onDragOver={(event) => {
        if (!dragState) return;
        event.preventDefault();
        onDragColumn(column.id);
      }}
      onDragLeave={(event) => {
        if (!dragState) return;
        const related = event.relatedTarget as Node | null;
        if (related && event.currentTarget.contains(related)) return;
        onDragColumn(-1);
      }}
      onDrop={(event) => {
        if (!dragState) return;
        event.preventDefault();
        onDropColumn(column.id);
      }}
    >
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
                Coluna
              </div>
            </div>
            <CardTitle className="break-words text-[1.45rem] leading-tight text-white">
              {column.name}
            </CardTitle>
            <CardDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-white/45">
              <span>
                {column.cards.length} {column.cards.length === 1 ? "card" : "cards"}
              </span>
              {selectedCount ? (
                <span className="text-cyan-100/80">card selecionado aqui</span>
              ) : null}
            </CardDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-2xl"
              onClick={() => onRenameColumn(column)}
              aria-label={`Renomear coluna ${column.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-2xl"
              onClick={() => onDeleteColumn(column)}
              aria-label={`Excluir coluna ${column.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-5">
        <Button
          className="h-10 w-full rounded-2xl"
          variant="outline"
          onClick={() => onCreateCard(column.id)}
        >
          <Plus className="h-4 w-4" />
          Novo card nesta coluna
        </Button>

        {isDropActive ? (
          <div className="rounded-[1.6rem] border border-dashed border-cyan-300/50 bg-cyan-400/8 px-4 py-5 text-center text-sm font-medium text-cyan-100">
            Solte aqui para mover o card para <span className="break-words">{column.name}</span>.
          </div>
        ) : null}

        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
          {column.cards.length ? (
            column.cards.map((card) => {
              const active = selectedCardId === card.id;
              const dragging = dragState?.cardId === card.id;
              const overdue = isCardOverdue(card);
              const cardLabels = (card.label_ids || [])
                .map((labelId) => labelsById[labelId])
                .filter(Boolean)
                .slice(0, 3);

              return (
                <button
                  key={card.id}
                  type="button"
                  draggable
                  onDragStart={(event) => onStartDragCard(card, event)}
                  onDragEnd={onEndDragCard}
                  onClick={() => onSelectCard(card.id)}
                  className={cn(
                    "w-full overflow-hidden rounded-[1.7rem] border p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.22)] transition",
                    active
                      ? overdue
                        ? "border-red-300/50 bg-red-500/10 ring-2 ring-red-400/20"
                        : "border-cyan-400/50 bg-cyan-400/10 ring-2 ring-cyan-400/25"
                      : overdue
                        ? "border-red-400/25 bg-red-500/10 hover:bg-red-500/14"
                        : "border-white/10 bg-white/[0.045] hover:bg-white/[0.07]",
                    dragging && "opacity-45",
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            typeBadgeClasses(card.card_type),
                          )}
                        >
                          {typeLabel(card.card_type)}
                        </Badge>
                        {card.source_label ? (
                          <Badge className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/65">
                            {card.source_label}
                          </Badge>
                        ) : null}
                        {overdue ? (
                          <Badge className="rounded-full border border-red-400/30 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-100">
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                            Atrasado
                          </Badge>
                        ) : null}
                      </div>
                      <div className="break-words text-base font-semibold leading-6 text-white">
                        {card.title}
                      </div>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  </div>

                  {cardLabels.length ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {cardLabels.map((label) => (
                        <span
                          key={label.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            borderColor: `${label.color}55`,
                            backgroundColor: `${label.color}22`,
                            color: label.color,
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span className="truncate">{label.name}</span>
                        </span>
                      ))}
                      {(card.label_ids?.length || 0) > cardLabels.length ? (
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
                          +{(card.label_ids?.length || 0) - cardLabels.length}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="break-words text-sm leading-6 text-white/60">
                    {buildSnippet(card)}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
                    <span>{formatDate(card.updated_at)}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {card.attachments.length ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/60">
                          <Paperclip className="h-3.5 w-3.5" />
                          {card.attachments.length}
                        </span>
                      ) : null}
                      {card.due_at ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]",
                            overdue
                              ? "border-red-400/30 bg-red-500/15 text-red-100"
                              : "border-white/10 bg-white/5 text-white/60",
                          )}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(card.due_at)}
                        </span>
                      ) : null}
                      <span>
                        {String(card.card_type || "").toLowerCase() === "fluxograma"
                          ? `${parseFlowchart(card.structure_json, card.title, card.content_text).nodes.length} blocos`
                          : String(card.card_type || "").toLowerCase() === "checklist"
                            ? `${getChecklistStats(parseChecklistContent(card.content_text)).checked}/${getChecklistStats(parseChecklistContent(card.content_text)).total || 0} concluídos`
                            : "Texto"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-10 text-center text-sm leading-6 text-white/45">
              Arraste cards para essa coluna ou crie um novo card.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function FlowchartCanvas({
  flow,
  selectedNodeId,
  selectedEdgeId,
  pendingConnectionNodeId,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onHandleClick,
  viewportClassName,
}: {
  flow: BobarFlowchart;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  pendingConnectionNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onMoveNode: (nodeId: string, patch: Partial<BobarFlowNode>) => void;
  onHandleClick: (nodeId: string, role: "source" | "target") => void;
  viewportClassName?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const panGestureRef = React.useRef<{
    startClientX: number;
    startClientY: number;
    originScrollLeft: number;
    originScrollTop: number;
    moved: boolean;
  } | null>(null);
  const [connectionPointer, setConnectionPointer] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [isPanning, setIsPanning] = React.useState(false);

  const width = Math.max(1680, ...flow.nodes.map((node) => node.x + 760));
  const height = Math.max(1480, ...flow.nodes.map((node) => node.y + 760));
  const byId = React.useMemo(
    () => new Map(flow.nodes.map((node) => [node.id, node])),
    [flow.nodes],
  );
  const outgoingCountByNode = React.useMemo(() => {
    const next = new Map<string, number>();
    for (const edge of flow.edges) next.set(edge.source, (next.get(edge.source) || 0) + 1);
    return next;
  }, [flow.edges]);
  const incomingCountByNode = React.useMemo(() => {
    const next = new Map<string, number>();
    for (const edge of flow.edges) next.set(edge.target, (next.get(edge.target) || 0) + 1);
    return next;
  }, [flow.edges]);
  const pendingSourceNode = pendingConnectionNodeId
    ? byId.get(pendingConnectionNodeId) || null
    : null;

  const updateConnectionPointer = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    setConnectionPointer({
      x: event.clientX - bounds.left + container.scrollLeft,
      y: event.clientY - bounds.top + container.scrollTop,
    });
  }, []);

  React.useEffect(() => {
    if (!pendingSourceNode) {
      setConnectionPointer(null);
      return;
    }

    setConnectionPointer({
      x: pendingSourceNode.x + 256,
      y: pendingSourceNode.y + 76,
    });
  }, [pendingSourceNode]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const panGesture = panGestureRef.current;
      if (panGesture) {
        const container = containerRef.current;
        if (!container) return;
        const dx = event.clientX - panGesture.startClientX;
        const dy = event.clientY - panGesture.startClientY;
        if (!panGesture.moved && Math.hypot(dx, dy) > 3) panGesture.moved = true;
        container.scrollLeft = panGesture.originScrollLeft - dx;
        container.scrollTop = panGesture.originScrollTop - dy;
        return;
      }

      const gesture = gestureRef.current;
      if (!gesture) return;
      const dx = event.clientX - gesture.startClientX;
      const dy = event.clientY - gesture.startClientY;
      if (!gesture.moved && Math.hypot(dx, dy) > 4) gesture.moved = true;
      if (!gesture.moved) return;

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const edge = 72;
        const speed = 28;
        if (event.clientY > rect.bottom - edge) container.scrollTop += speed;
        if (event.clientY < rect.top + edge) container.scrollTop -= speed;
        if (event.clientX > rect.right - edge) container.scrollLeft += speed;
        if (event.clientX < rect.left + edge) container.scrollLeft -= speed;
      }

      onMoveNode(gesture.nodeId, {
        x: clampPosition(gesture.originX + dx, 32, width - 320),
        y: clampPosition(gesture.originY + dy, 32, height - 220),
      });
    };

    const handlePointerUp = () => {
      const panGesture = panGestureRef.current;
      if (panGesture) {
        panGestureRef.current = null;
        setIsPanning(false);
        return;
      }

      const gesture = gestureRef.current;
      if (!gesture) return;
      if (!gesture.moved) onSelectNode(gesture.nodeId);
      gestureRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [height, onMoveNode, onSelectNode, width]);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#040914]">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
            Fluxograma
          </Badge>
          <Badge className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {flow.nodes.length} blocos
          </Badge>
          <Badge className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {flow.edges.length} conexões
          </Badge>
          {pendingSourceNode ? (
            <Badge className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Escolha o destino da nova conexão
            </Badge>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={(event) => {
          const container = containerRef.current;
          if (!container) return;

          const isDirectCanvasTarget = event.target === event.currentTarget;
          const isMiddleMouse = event.button === 1;
          const isLeftMouseCanvasDrag = event.button === 0 && isDirectCanvasTarget;

          if (!isMiddleMouse && !isLeftMouseCanvasDrag) return;

          event.preventDefault();
          panGestureRef.current = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            originScrollLeft: container.scrollLeft,
            originScrollTop: container.scrollTop,
            moved: false,
          };
          setIsPanning(true);
        }}
        onAuxClick={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onWheel={(event) => {
          const container = containerRef.current;
          if (!container) return;

          const hasVerticalOverflow = container.scrollHeight > container.clientHeight;
          const hasHorizontalOverflow = container.scrollWidth > container.clientWidth;
          if (!hasVerticalOverflow && !hasHorizontalOverflow) return;

          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
          const deltaX = event.deltaX * unit;
          const deltaY = event.deltaY * unit;
          const prefersHorizontal = event.shiftKey || (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 0);

          event.preventDefault();

          if (prefersHorizontal && hasHorizontalOverflow) {
            container.scrollLeft += deltaX || deltaY;
            return;
          }

          if (hasVerticalOverflow) {
            container.scrollTop += deltaY || deltaX;
          }

          if (Math.abs(deltaX) > 0 && hasHorizontalOverflow) {
            container.scrollLeft += deltaX;
          }
        }}
        onPointerMove={pendingSourceNode ? updateConnectionPointer : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          const container = containerRef.current;
          if (!container) return;

          const step = event.shiftKey ? 220 : 96;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            container.scrollLeft -= step;
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            container.scrollLeft += step;
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            container.scrollTop -= step;
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            container.scrollTop += step;
          }
        }}
        className={cn(
          "custom-scrollbar relative overflow-auto overscroll-none bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.08),transparent_35%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:auto,32px_32px,32px_32px] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40",
          isPanning && "cursor-grabbing select-none",
          viewportClassName || "h-[min(78vh,900px)]",
        )}
        style={{ touchAction: "pan-x pan-y" }}
      >
        <div className="relative min-h-full" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {flow.edges.map((edge) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              const selected = edge.id === selectedEdgeId;
              return (
                <path
                  key={edge.id}
                  d={buildEdgePath(source, target)}
                  fill="none"
                  stroke={selected ? "rgba(34,211,238,0.95)" : "rgba(148,163,184,0.45)"}
                  strokeWidth={selected ? 3 : 2}
                  strokeLinecap="round"
                  className="pointer-events-auto cursor-pointer transition"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectEdge(edge.id);
                  }}
                />
              );
            })}

            {pendingSourceNode && connectionPointer ? (
              <path
                d={buildConnectionPath(
                  pendingSourceNode.x + 256,
                  pendingSourceNode.y + 76,
                  connectionPointer.x,
                  connectionPointer.y,
                )}
                fill="none"
                stroke="rgba(34,211,238,0.85)"
                strokeWidth={2}
                strokeDasharray="10 8"
                strokeLinecap="round"
              />
            ) : null}
          </svg>

          {flow.nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const isPendingSource = node.id === pendingConnectionNodeId;
            const incomingCount = incomingCountByNode.get(node.id) || 0;
            const outgoingCount = outgoingCountByNode.get(node.id) || 0;
            const sections = parseFlowContentSections(node.content);

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  gestureRef.current = {
                    nodeId: node.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    originX: node.x,
                    originY: node.y,
                    moved: false,
                  };
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectNode(node.id);
                  }
                }}
                className={cn(
                  "absolute w-72 cursor-grab overflow-hidden rounded-[1.8rem] border p-4 shadow-[0_20px_40px_rgba(0,0,0,0.28)] transition active:cursor-grabbing",
                  selected
                    ? "border-cyan-300/55 bg-[#10213d] ring-2 ring-cyan-300/25"
                    : "border-white/10 bg-[#0b1426]/95 hover:border-white/20",
                )}
                style={{ left: node.x, top: node.y, touchAction: "none" }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                        {nodeKindLabel(node.kind)}
                      </Badge>
                      {node.time ? (
                        <Badge className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                          {node.time}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="break-words text-2xl font-black leading-tight text-white">
                      {node.title || "Bloco sem título"}
                    </div>
                  </div>
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/45">
                    <GripVertical className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  {sections.action ? (
                    <div className="rounded-[1.3rem] border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                        Ação
                      </div>
                      <div className="mt-1 break-words text-sm leading-6 text-cyan-50/90">
                        {sections.action}
                      </div>
                    </div>
                  ) : null}

                  {sections.speech ? (
                    <div className="rounded-[1.3rem] border border-violet-400/15 bg-violet-400/[0.06] px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">
                        Fala
                      </div>
                      <div className="mt-1 break-words text-sm leading-6 text-violet-50/90">
                        {sections.speech}
                      </div>
                    </div>
                  ) : null}

                  {sections.other ? (
                    <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.035] px-3 py-3">
                      <div className="break-words text-sm leading-6 text-white/65">
                        {sections.other}
                      </div>
                    </div>
                  ) : null}

                  {!sections.action && !sections.speech && !sections.other ? (
                    <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.035] px-3 py-3 text-sm leading-6 text-white/55">
                      Sem conteúdo.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    title={pendingSourceNode && pendingSourceNode.id !== node.id ? "Concluir conexão aqui" : "Selecionar entrada"}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onHandleClick(node.id, "target");
                    }}
                    className="h-4 w-4 rounded-full bg-cyan-300/80 shadow-[0_0_0_6px_rgba(34,211,238,0.12)] transition hover:scale-110 hover:bg-cyan-200"
                  >
                    <span className="sr-only">Entrada</span>
                  </button>

                  <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    {isPendingSource ? "Conexão iniciada" : `${incomingCount} entr. · ${outgoingCount} saíd.`}
                  </div>

                  <button
                    type="button"
                    title={isPendingSource ? "Cancelar nova conexão" : "Iniciar nova conexão"}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onHandleClick(node.id, "source");
                    }}
                    className={cn(
                      "h-4 w-4 rounded-full transition hover:scale-110",
                      isPendingSource
                        ? "bg-cyan-300 shadow-[0_0_0_6px_rgba(34,211,238,0.18)]"
                        : "bg-violet-300/80 shadow-[0_0_0_6px_rgba(167,139,250,0.12)] hover:bg-violet-200",
                    )}
                  >
                    <span className="sr-only">Saída</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function ChecklistEditor({
  items,
  summary,
  onToggleItem,
  onChangeItemText,
  onAddItem,
  onRemoveItem,
  onClearCompleted,
}: {
  items: ChecklistItem[];
  summary: { total: number; checked: number; pending: number };
  onToggleItem: (itemId: string) => void;
  onChangeItemText: (itemId: string, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onClearCompleted: () => void;
}) {
  const progress = summary.total ? Math.round((summary.checked / summary.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        Checklist do card
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Itens
          </div>
          <div className="mt-2 text-2xl font-black text-white">{summary.total}</div>
        </div>

        <div className="rounded-[1.6rem] border border-emerald-400/15 bg-emerald-400/10 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
            Concluídos
          </div>
          <div className="mt-2 text-2xl font-black text-white">{summary.checked}</div>
        </div>

        <div className="rounded-[1.6rem] border border-amber-400/15 bg-amber-400/10 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">
            Pendentes
          </div>
          <div className="mt-2 text-2xl font-black text-white">{summary.pending}</div>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Progresso</div>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm font-semibold text-cyan-100">
            {progress}%
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-300/80 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-[1.5rem] border p-3 transition",
              item.checked
                ? "border-emerald-400/20 bg-emerald-400/10"
                : "border-white/10 bg-white/[0.035]",
            )}
          >
            <button
              type="button"
              onClick={() => onToggleItem(item.id)}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition",
                item.checked
                  ? "border-emerald-300/40 bg-emerald-300/20 text-emerald-100"
                  : "border-white/10 bg-[#0a1225] text-white/45 hover:border-cyan-300/40 hover:text-cyan-100",
              )}
              aria-label={item.checked ? "Desmarcar item" : "Marcar item"}
            >
              <Check className="h-5 w-5" />
            </button>

            <Input
              value={item.text}
              onChange={(event) => onChangeItemText(item.id, event.target.value)}
              placeholder={`Item ${index + 1}`}
              className={cn(
                "h-12 border-white/10 bg-[#0a1225]",
                item.checked && "text-white/60 line-through",
              )}
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-2xl"
              onClick={() => onRemoveItem(item.id)}
              aria-label={`Remover item ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-11 rounded-2xl" onClick={onAddItem}>
          <Plus className="h-4 w-4" />
          Adicionar item
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-2xl"
          onClick={onClearCompleted}
          disabled={!summary.checked}
        >
          <Trash2 className="h-4 w-4" />
          Limpar concluídos
        </Button>
      </div>
    </div>
  );
}


function AttachmentPreviewTile({
  attachment,
  busy,
  loadPreview,
  onOpenPreview,
  onDownload,
  onDelete,
}: {
  attachment: BobarAttachment;
  busy: boolean;
  loadPreview: (
    attachment: BobarAttachment,
  ) => Promise<{ kind: AttachmentPreviewKind; url: string; textContent?: string }>;
  onOpenPreview: (attachment: BobarAttachment) => void | Promise<void>;
  onDownload: (attachment: BobarAttachment) => void | Promise<void>;
  onDelete: (attachment: BobarAttachment) => void | Promise<void>;
}) {
  const canPreview = isAttachmentPreviewable(attachment);
  const baseKind = attachmentPreviewKind(attachment);
  const [preview, setPreview] = React.useState<AttachmentInlinePreview>({
    status: canPreview ? "loading" : "idle",
    kind: baseKind,
  });

  React.useEffect(() => {
    let cancelled = false;

    if (!canPreview) {
      setPreview({ status: "idle", kind: baseKind });
      return;
    }

    setPreview((current) =>
      current.status === "ready" && current.kind === baseKind
        ? current
        : { status: "loading", kind: baseKind },
    );

    void loadPreview(attachment)
      .then((resolved) => {
        if (cancelled) return;
        setPreview({
          status: "ready",
          kind: resolved.kind,
          url: resolved.url,
          textContent: resolved.textContent,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPreview({
          status: "error",
          kind: baseKind,
          error: "Não foi possível carregar a preview.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.mime_type, baseKind, canPreview, loadPreview]);

  const renderSurface = () => {
    if (!canPreview) {
      return (
        <div className="flex h-full items-center justify-center p-5 text-center">
          <div>
            <Paperclip className="mx-auto h-8 w-8 text-white/35" />
            <div className="mt-3 text-sm font-medium text-white/70">{attachment.filename}</div>
            <div className="mt-1 text-xs text-white/40">Sem preview embutida para esse formato.</div>
          </div>
        </div>
      );
    }

    if (preview.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center p-5 text-center">
          <div>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-100/80" />
            <div className="mt-3 text-sm text-white/60">Carregando preview…</div>
          </div>
        </div>
      );
    }

    if (preview.status === "error") {
      return (
        <div className="flex h-full items-center justify-center p-5 text-center">
          <div>
            <CircleAlert className="mx-auto h-8 w-8 text-amber-300/80" />
            <div className="mt-3 text-sm text-white/70">{preview.error}</div>
          </div>
        </div>
      );
    }

    if (preview.kind === "image" && preview.url) {
      return <img src={preview.url} alt={attachment.filename} className="h-full w-full object-cover" />;
    }

    if (preview.kind === "pdf" && preview.url) {
      return (
        <iframe
          src={preview.url}
          title={attachment.filename}
          className="h-full w-full bg-white pointer-events-none"
        />
      );
    }

    if (preview.kind === "video" && preview.url) {
      return (
        <video
          src={preview.url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      );
    }

    if (preview.kind === "audio" && preview.url) {
      return (
        <div className="flex h-full flex-col justify-center gap-4 p-5">
          <div>
            <div className="text-sm font-medium text-white">{attachment.filename}</div>
            <div className="mt-1 text-xs text-white/45">Áudio anexado</div>
          </div>
          <audio src={preview.url} controls className="w-full" />
        </div>
      );
    }

    return (
      <div className="h-full overflow-hidden p-5 text-left">
        <div
          className="whitespace-pre-wrap break-words text-sm leading-6 text-white/72"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {buildAttachmentTextSnippet(preview.textContent)}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.035]">
      <button
        type="button"
        className={cn("block w-full text-left", canPreview ? "group" : "cursor-default")}
        onClick={() => canPreview && void onOpenPreview(attachment)}
        disabled={!canPreview}
      >
        <div className="relative h-48 overflow-hidden border-b border-white/10 bg-[#020817]">
          {renderSurface()}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-[#020817] via-[#020817]/90 to-transparent px-4 pb-4 pt-8">
            <Badge className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
              {attachmentPreviewLabel(preview.kind)}
            </Badge>
            {canPreview ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                Clique para ampliar
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{attachment.filename}</div>
          <div className="mt-1 text-xs text-white/45">
            {formatFileSize(attachment.size_bytes)} · {formatDate(attachment.created_at)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canPreview ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl"
              onClick={() => void onOpenPreview(attachment)}
            >
              <Eye className="h-4 w-4" />
              Abrir
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl"
            onClick={() => void onDownload(attachment)}
          >
            <Download className="h-4 w-4" />
            Baixar
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl text-red-200 hover:text-red-100"
            onClick={() => void onDelete(attachment)}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            Remover
          </Button>
        </div>
      </div>
    </div>
  );
}


function FlowEditorInspector({
  selectedNode,
  selectedEdge,
  selectedEdgeNodes,
  pendingConnectionNode,
  onPatchNode,
  onDeleteSelectedEdge,
  className,
  contentClassName,
}: {
  selectedNode: BobarFlowNode | null;
  selectedEdge: BobarFlowEdge | null;
  selectedEdgeNodes: { source: BobarFlowNode; target: BobarFlowNode } | null;
  pendingConnectionNode: BobarFlowNode | null;
  onPatchNode: (nodeId: string, patch: Partial<BobarFlowNode>) => void;
  onDeleteSelectedEdge: () => void;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      variant="glass"
      className={cn("rounded-[2rem] border-white/10 bg-[#06101f]", className)}
    >
      <CardHeader>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
          Inspector
        </div>
        <CardTitle className="text-2xl font-black text-white">
          {selectedNode
            ? "Editar bloco"
            : selectedEdge
              ? "Conexão selecionada"
              : pendingConnectionNode
                ? "Finalizar conexão"
                : "Selecione um item"}
        </CardTitle>

      </CardHeader>

      <CardContent className={cn("space-y-4", contentClassName)}>
        {pendingConnectionNode ? (
          <div className="rounded-[1.6rem] border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm leading-6 text-cyan-50/85">
            Conectando <strong>{pendingConnectionNode.title}</strong>. Clique na entrada do próximo bloco.
          </div>
        ) : null}

        {selectedNode ? (
          <>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Título do bloco
              </div>
              <Input
                value={selectedNode.title}
                onChange={(event) => onPatchNode(selectedNode.id, { title: event.target.value })}
                className="h-12 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Tempo
                </div>
                <Input
                  value={selectedNode.time || ""}
                  onChange={(event) => onPatchNode(selectedNode.id, { time: event.target.value })}
                  placeholder="0-3s"
                  className="h-12 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
                />
              </div>

              <SelectField
                label="Tipo do bloco"
                value={selectedNode.kind || "step"}
                options={[
                  { value: "step", label: "Passo" },
                  { value: "hook", label: "Hook" },
                  { value: "support", label: "Prova" },
                  { value: "cta", label: "CTA" },
                  { value: "timeline", label: "Linha do tempo" },
                ]}
                onChange={(value) => onPatchNode(selectedNode.id, { kind: value })}
              />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Conteúdo do bloco
              </div>
              <Textarea
                value={selectedNode.content}
                onChange={(event) => onPatchNode(selectedNode.id, { content: event.target.value })}
                placeholder="Texto, fala, ação ou instrução desse bloco."
                className="min-h-[220px] rounded-[1.6rem] border-cyan-400/15 bg-[#0a1225]"
              />
            </div>

            <div className="rounded-[1.6rem] border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm leading-6 text-cyan-50/85">
              Saída do bloco → entrada do destino.
            </div>
          </>
        ) : selectedEdge && selectedEdgeNodes ? (
          <>
            <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-4 py-4 text-sm leading-6 text-white/70">
              <strong>{selectedEdgeNodes.source.title}</strong> → <strong>{selectedEdgeNodes.target.title}</strong>.
            </div>

            <Button className="h-11 rounded-2xl" variant="outline" onClick={onDeleteSelectedEdge}>
              <Unlink className="h-4 w-4" />
              Remover conexão selecionada
            </Button>
          </>
        ) : (
          <EmptyState
            title="Nada selecionado"
            description="Clique no bloco ou na conexão."
          />
        )}
      </CardContent>
    </Card>
  );
}


export default function BobarPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const shareTokenFromUrl = React.useMemo(() => new URLSearchParams(location.search).get("share"), [location.search]);
  const [collaboration, setCollaboration] = React.useState<BobarBoardCollaboration | null>(null);
  const [collaborationLoading, setCollaborationLoading] = React.useState(false);
  const [sharePreview, setSharePreview] = React.useState<BobarBoardSharePreview | null>(null);
  const [shareBusy, setShareBusy] = React.useState(false);
  const [shareLink, setShareLink] = React.useState<BobarBoardInvite | null>(null);
  const [chatMessageDraft, setChatMessageDraft] = React.useState("");
  const [board, setBoard] = React.useState<BobarBoard | null>(null);
  const [boards, setBoards] = React.useState<BobarBoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [activeView, setActiveView] = React.useState<BobarViewMode>("board");
  const [selectedImportCardId, setSelectedImportCardId] = React.useState<number | null>(null);
  const [hydratingImportId, setHydratingImportId] = React.useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  const [cardDraft, setCardDraft] = React.useState<CardEditorDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = React.useState<CardEditorDraft | null>(null);
  const [checklistDraft, setChecklistDraft] = React.useState<ChecklistItem[]>([]);
  const [baselineChecklist, setBaselineChecklist] = React.useState<ChecklistItem[]>([]);
  const [flowDraft, setFlowDraft] = React.useState<BobarFlowchart | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null);
  const [pendingConnectionNodeId, setPendingConnectionNodeId] = React.useState<string | null>(null);
  const [isFlowEditorOpen, setIsFlowEditorOpen] = React.useState(false);
  const [templateKey, setTemplateKey] = React.useState("");
  const [dragState, setDragState] = React.useState<DragCardState | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = React.useState<number | null>(null);
  const [columnDialog, setColumnDialog] = React.useState<ColumnDialogState | null>(null);
  const [boardDialog, setBoardDialog] = React.useState<BoardDialogState | null>(null);
  const [columnNameDraft, setColumnNameDraft] = React.useState("");
  const [boardNameDraft, setBoardNameDraft] = React.useState("");
  const [deleteDialog, setDeleteDialog] = React.useState<DeleteDialogState | null>(null);
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState("#22c55e");
  const [labelDrafts, setLabelDrafts] = React.useState<Record<number, LabelDraft>>({});
  const [labelSavingIds, setLabelSavingIds] = React.useState<number[]>([]);
  const [labelDeletingIds, setLabelDeletingIds] = React.useState<number[]>([]);
  const [attachmentPreview, setAttachmentPreview] = React.useState<AttachmentPreviewState | null>(null);
  const attachmentInputRef = React.useRef<HTMLInputElement | null>(null);
  const attachmentUrlCacheRef = React.useRef<Map<number, string>>(new Map());
  const labelSaveTimersRef = React.useRef<Map<number, number>>(new Map());
  const hydrationLocksRef = React.useRef<Set<number>>(new Set());
  const importMetaSyncRef = React.useRef<Set<number>>(new Set());

  const allCards = React.useMemo(
    () => board?.columns.flatMap((column) => column.cards) || [],
    [board],
  );
  const importedCards = React.useMemo(
    () => allCards.filter((card) => isAuthorityImportCard(card)),
    [allCards],
  );
  const activeImportCard = React.useMemo(
    () => importedCards.find((card) => card.id === selectedImportCardId) || importedCards[0] || null,
    [importedCards, selectedImportCardId],
  );
  const activeWorkspaceColumnIds = React.useMemo(() => {
    if (!activeImportCard || !board) return [];
    const boardColumnIds = new Set(board.columns.map((column) => column.id));
    return uniquePositiveIds(
      getImportedWorkspaceColumnIds(activeImportCard),
      inferImportedWorkspaceColumnIds(board, activeImportCard.id),
    ).filter((columnId) => boardColumnIds.has(columnId));
  }, [activeImportCard, board]);
  const visibleColumns = React.useMemo(() => {
    if (!board) return [];
    if (activeView !== "imports" || !activeImportCard) return board.columns;
    if (!activeWorkspaceColumnIds.length) return [];
    const workspaceIds = new Set(activeWorkspaceColumnIds);
    return board.columns.filter((column) => workspaceIds.has(column.id));
  }, [activeImportCard, activeView, activeWorkspaceColumnIds, board]);
  const cards = React.useMemo(
    () => visibleColumns.flatMap((column) => column.cards),
    [visibleColumns],
  );
  const selectedCard = React.useMemo(
    () => findCard(board, selectedCardId),
    [board, selectedCardId],
  );
  const activeImportAgent = React.useMemo(
    () => authorityAgentByKey(extractAuthorityAgentKey(activeImportCard?.source_kind)),
    [activeImportCard?.source_kind],
  );
  const activeImportTitle = React.useMemo(() => {
    if (!activeImportCard) return "Roteiro importado";
    const blueprint = buildImportedWorkspaceBlueprint(activeImportCard.content_text, activeImportCard.title);
    return blueprint.title || activeImportCard.title;
  }, [activeImportCard]);
  const isImportMode = activeView === "imports";
  const selectedCardType = String(
    cardDraft?.card_type || selectedCard?.card_type || "",
  ).toLowerCase();
  const isChecklistCard = selectedCardType === "checklist";
  const isFlowCard = selectedCardType === "fluxograma";
  const boardHasColumns = Boolean(visibleColumns.length);
  const selectedColumn = React.useMemo(
    () =>
      visibleColumns.find(
        (column) => column.id === Number(cardDraft?.column_id ?? selectedCard?.column_id ?? 0),
      ) || null,
    [visibleColumns, cardDraft?.column_id, selectedCard?.column_id],
  );
  const recentCards = React.useMemo(
    () =>
      [...cards]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 6),
    [cards],
  );
  const labelsById = React.useMemo(
    () =>
      Object.fromEntries((board?.labels || []).map((label) => [label.id, label])) as Record<
        number,
        BobarLabel
      >,
    [board?.labels],
  );
  const boardOptions = React.useMemo<DropdownOption[]>(
    () =>
      boards.map((currentBoard) => ({
        value: String(currentBoard.id),
        label: currentBoard.title,
        description: `${currentBoard.total_cards} ${currentBoard.total_cards === 1 ? "card" : "cards"}`,
      })),
    [boards],
  );
  const selectedCardLabels = React.useMemo(
    () => (cardDraft?.label_ids || []).map((labelId) => labelsById[labelId]).filter(Boolean),
    [cardDraft?.label_ids, labelsById],
  );
  const dueDateIso = React.useMemo(() => toIsoDatetime(cardDraft?.due_at || ""), [cardDraft?.due_at]);
  const dueDateIsInvalid = Boolean(cardDraft?.due_at.trim()) && !dueDateIso;
  const handleDueDateChange = React.useCallback((nextValue: string) => {
    setCardDraft((current) => (current ? { ...current, due_at: nextValue } : current));
  }, []);
  const clearDueDate = React.useCallback(() => {
    setCardDraft((current) => (current ? { ...current, due_at: "" } : current));
  }, []);
  const selectedCardIsOverdue = React.useMemo(
    () => isCardOverdue({ due_at: dueDateIso ?? selectedCard?.due_at ?? null }),
    [dueDateIso, selectedCard?.due_at],
  );

  const templateOptions = React.useMemo<DropdownOption[]>(
    () =>
      CARD_TEMPLATES.map((template) => ({
        value: template.key,
        label: template.label,
        description: template.description,
      })),
    [],
  );

  const cardTypeOptions = React.useMemo<DropdownOption[]>(
    () =>
      CARD_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [],
  );

  const columnOptions = React.useMemo<DropdownOption[]>(
    () =>
      visibleColumns.map((column) => ({
        value: String(column.id),
        label: column.name,
      })),
    [visibleColumns],
  );

  const selectedNode = React.useMemo(
    () => (flowDraft?.nodes || []).find((node) => node.id === selectedNodeId) || null,
    [flowDraft, selectedNodeId],
  );

  const selectedEdge = React.useMemo(
    () => (flowDraft?.edges || []).find((edge) => edge.id === selectedEdgeId) || null,
    [flowDraft, selectedEdgeId],
  );

  const activeFlow = React.useMemo(
    () =>
      selectedCard
        ? flowDraft ||
          parseFlowchart(selectedCard.structure_json, selectedCard.title, selectedCard.content_text)
        : null,
    [flowDraft, selectedCard],
  );

  const selectedEdgeNodes = React.useMemo(() => {
    if (!selectedEdge || !activeFlow) return null;
    const source = activeFlow.nodes.find((node) => node.id === selectedEdge.source) || null;
    const target = activeFlow.nodes.find((node) => node.id === selectedEdge.target) || null;
    if (!source || !target) return null;
    return { source, target };
  }, [activeFlow, selectedEdge]);

  const pendingConnectionNode = React.useMemo(
    () => (activeFlow?.nodes || []).find((node) => node.id === pendingConnectionNodeId) || null,
    [activeFlow, pendingConnectionNodeId],
  );

  const checklistSummary = React.useMemo(
    () => getChecklistStats(checklistDraft),
    [checklistDraft],
  );

  const hasPendingChanges = React.useMemo(() => {
    if (!selectedCard || !cardDraft || !baselineDraft) return false;
    if (!shallowEqualDraft(cardDraft, baselineDraft)) return true;
    if (isChecklistCard) {
      return serializeChecklistContent(checklistDraft) !== serializeChecklistContent(baselineChecklist);
    }
    if (isFlowCard) {
      const current = JSON.stringify(
        flowDraft ||
          parseFlowchart(
            selectedCard.structure_json,
            selectedCard.title,
            selectedCard.content_text,
          ),
      );
      const persisted = JSON.stringify(
        parseFlowchart(selectedCard.structure_json, selectedCard.title, selectedCard.content_text),
      );
      return current !== persisted;
    }
    return false;
  }, [
    baselineChecklist,
    baselineDraft,
    cardDraft,
    checklistDraft,
    flowDraft,
    isChecklistCard,
    isFlowCard,
    selectedCard,
  ]);

  const syncSelection = React.useCallback(
    (nextBoard: BobarBoard | null, preferredCardId?: number | null) => {
      const nextId =
        preferredCardId && findCard(nextBoard, preferredCardId)
          ? preferredCardId
          : firstCardId(nextBoard);
      setSelectedCardId(nextId);
    },
    [],
  );

  const syncBoardSummary = React.useCallback((nextBoard: BobarBoard | null) => {
    if (!nextBoard) return;
    setBoards((currentBoards) => {
      if (!currentBoards.length) return currentBoards;
      const existing = currentBoards.find((boardItem) => boardItem.id === nextBoard.id);
      const nextSummary: BobarBoardSummary = {
        id: nextBoard.id,
        title: nextBoard.title,
        position: existing?.position ?? currentBoards.length,
        total_cards: nextBoard.total_cards,
        updated_at: new Date().toISOString(),
      };
      if (!existing) return [...currentBoards, nextSummary];
      return currentBoards.map((boardItem) => (boardItem.id === nextBoard.id ? nextSummary : boardItem));
    });
    setActiveBoardId(nextBoard.id);
  }, []);

  const loadBoardsAndBoard = React.useCallback(
    async (preferredBoardId?: number | null, preferredCardId?: number | null) => {
      try {
        setLoading(true);
        const boardList = await bobarService.boards();
        setBoards(boardList.boards);

        const fallbackBoardId = preferredBoardId || activeBoardId || boardList.boards[0]?.id || null;
        setActiveBoardId(fallbackBoardId);

        if (!fallbackBoardId) {
          setBoard(null);
          setSelectedCardId(null);
          return;
        }

        const nextBoard = await bobarService.board(fallbackBoardId);
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, preferredCardId);
      } catch (error) {
        toastApiError(error, "Não foi possível carregar o Bobar.");
      } finally {
        setLoading(false);
      }
    },
    [activeBoardId, syncBoardSummary, syncSelection],
  );

  const loadCollaboration = React.useCallback(
    async (boardId: number, options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) {
          setCollaborationLoading(true);
        }
        const payload = await bobarService.collaboration(boardId);
        setCollaboration(payload);
        setShareLink(payload.invite || null);
        return payload;
      } catch (error) {
        if (!options?.silent) {
          toastApiError(error, "Não foi possível carregar os dados de colaboração do quadro.");
        }
        return null;
      } finally {
        if (!options?.silent) {
          setCollaborationLoading(false);
        }
      }
    },
    [],
  );

  const refreshBoardSilently = React.useCallback(
    async (boardId: number, preferredCardId?: number | null) => {
      try {
        const nextBoard = await bobarService.board(boardId);
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, preferredCardId ?? selectedCardId);
        return nextBoard;
      } catch {
        return null;
      }
    },
    [selectedCardId, syncBoardSummary, syncSelection],
  );

  const updateImportWorkspaceColumns = React.useCallback(
    async (
      boardSnapshot: BobarBoard,
      importCardId: number,
      columnIds: number[],
      preferredCardId?: number | null,
    ) => {
      const importCard = findCard(boardSnapshot, importCardId);
      if (!importCard) return boardSnapshot;

      const normalizedColumnIds = uniquePositiveIds(columnIds);
      const currentColumnIds = uniquePositiveIds(getImportedWorkspaceColumnIds(importCard));

      const isSameColumns =
        normalizedColumnIds.length === currentColumnIds.length &&
        normalizedColumnIds.every((value, index) => value === currentColumnIds[index]);

      if (isSameColumns) {
        return boardSnapshot;
      }

      const nextStructureJson = writeImportedWorkspaceMeta(importCard.structure_json, {
        version: 1,
        title: buildImportedWorkspaceBlueprint(importCard.content_text, importCard.title).title,
        column_ids: normalizedColumnIds,
        created_at: new Date().toISOString(),
      });

      const nextBoard = await bobarService.updateCard(importCardId, {
        structure_json: nextStructureJson,
      });

      setBoard(nextBoard);
      syncBoardSummary(nextBoard);
      syncSelection(nextBoard, preferredCardId ?? selectedCardId);
      return nextBoard;
    },
    [selectedCardId, syncBoardSummary, syncSelection],
  );

  const ensureImportWorkspace = React.useCallback(
    async (importCard: BobarCard) => {
      if (!board) return null;

      const existingWorkspaceIds = uniquePositiveIds(
        getImportedWorkspaceColumnIds(importCard),
        inferImportedWorkspaceColumnIds(board, importCard.id),
      ).filter((columnId) => board.columns.some((column) => column.id === columnId));

      if (existingWorkspaceIds.length) {
        return board;
      }

      if (hydrationLocksRef.current.has(importCard.id)) {
        return board;
      }

      const blueprint = buildImportedWorkspaceBlueprint(importCard.content_text, importCard.title);
      const createdColumnIds: number[] = [];
      let preferredWorkspaceCardId: number | null = null;
      let workingBoard = board;

      try {
        hydrationLocksRef.current.add(importCard.id);
        setBusy(true);
        setHydratingImportId(importCard.id);

        for (const columnBlueprint of blueprint.columns) {
          const beforeColumnCreation = workingBoard;
          workingBoard = await bobarService.createColumn({ name: columnBlueprint.name }, activeBoardId);
          const createdColumnId = diffNewColumnId(beforeColumnCreation, workingBoard);
          if (!createdColumnId) {
            throw new Error("Não foi possível identificar a nova coluna importada.");
          }

          createdColumnIds.push(createdColumnId);

          for (const cardBlueprint of columnBlueprint.cards) {
            const beforeCardCreation = workingBoard;
            workingBoard = await bobarService.createCard(
              {
                ...cardBlueprint,
                column_id: createdColumnId,
                source_kind: buildAuthorityWorkspaceSourceKind(importCard.id),
                source_label: importCard.source_label || "Importado",
              },
              activeBoardId,
            );
            preferredWorkspaceCardId = preferredWorkspaceCardId || diffNewCardId(beforeCardCreation, workingBoard);
          }
        }

        const finalWorkspaceColumnIds = uniquePositiveIds(
          createdColumnIds,
          inferImportedWorkspaceColumnIds(workingBoard, importCard.id),
        );

        workingBoard = await updateImportWorkspaceColumns(
          workingBoard,
          importCard.id,
          finalWorkspaceColumnIds,
          preferredWorkspaceCardId,
        );

        const workspaceColumns = workingBoard.columns.filter((column) =>
          finalWorkspaceColumnIds.includes(column.id),
        );
        setSelectedImportCardId(importCard.id);
        syncSelection(
          workingBoard,
          preferredWorkspaceCardId || firstCardIdFromColumns(workspaceColumns),
        );
        toastSuccess("Roteiro importado montado no quadro.");
        return workingBoard;
      } catch (error) {
        toastApiError(error, "Não foi possível abrir esse roteiro importado no quadro.");
        return null;
      } finally {
        hydrationLocksRef.current.delete(importCard.id);
        setBusy(false);
        setHydratingImportId(null);
      }
    },
    [board, syncSelection, updateImportWorkspaceColumns],
  );

  React.useEffect(() => {
    void loadBoardsAndBoard();
  }, [loadBoardsAndBoard]);

  React.useEffect(() => {
    if (!activeBoardId) {
      setCollaboration(null);
      setShareLink(null);
      return;
    }
    void loadCollaboration(activeBoardId);
  }, [activeBoardId, loadCollaboration]);

  React.useEffect(() => {
    if (!activeBoardId) return;
    const interval = window.setInterval(() => {
      void loadCollaboration(activeBoardId, { silent: true });
      if (!busy && !loading && !hasPendingChanges) {
        void refreshBoardSilently(activeBoardId, selectedCardId);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [
    activeBoardId,
    busy,
    hasPendingChanges,
    loadCollaboration,
    loading,
    refreshBoardSilently,
    selectedCardId,
  ]);

  React.useEffect(() => {
    if (!shareTokenFromUrl) {
      setSharePreview(null);
      return;
    }

    let cancelled = false;
    bobarService
      .sharePreview(shareTokenFromUrl)
      .then((payload) => {
        if (!cancelled) {
          setSharePreview(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSharePreview(null);
          toastApiError(error, "Esse link de compartilhamento não está disponível.");
          const params = new URLSearchParams(location.search);
          params.delete("share");
          navigate(
            {
              pathname: location.pathname,
              search: params.toString() ? `?${params.toString()}` : "",
            },
            { replace: true },
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, shareTokenFromUrl]);

  React.useEffect(() => {
    if (!importedCards.length) {
      setSelectedImportCardId(null);
      if (activeView === "imports") setActiveView("board");
      return;
    }

    if (!selectedImportCardId || !importedCards.some((card) => card.id === selectedImportCardId)) {
      setSelectedImportCardId(importedCards[0].id);
    }
  }, [activeView, importedCards, selectedImportCardId]);

  React.useEffect(() => {
    if (!board || !activeImportCard || loading) return;
    const inferredColumnIds = inferImportedWorkspaceColumnIds(board, activeImportCard.id);
    if (!inferredColumnIds.length) return;
    if (getImportedWorkspaceColumnIds(activeImportCard).length) return;
    if (importMetaSyncRef.current.has(activeImportCard.id)) return;

    importMetaSyncRef.current.add(activeImportCard.id);
    void updateImportWorkspaceColumns(board, activeImportCard.id, inferredColumnIds, selectedCardId).finally(() => {
      importMetaSyncRef.current.delete(activeImportCard.id);
    });
  }, [activeImportCard, board, loading, selectedCardId, updateImportWorkspaceColumns]);

  React.useEffect(() => {
    if (!isImportMode || !activeImportCard || loading) return;
    if (hydratingImportId === activeImportCard.id) return;
    if (hydrationLocksRef.current.has(activeImportCard.id)) return;
    if (activeWorkspaceColumnIds.length) return;
    void ensureImportWorkspace(activeImportCard);
  }, [
    activeImportCard,
    activeWorkspaceColumnIds.length,
    ensureImportWorkspace,
    hydratingImportId,
    isImportMode,
    loading,
  ]);

  React.useEffect(() => {
    if (!cards.length) {
      setSelectedCardId(null);
      return;
    }

    if (!selectedCardId || !cards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(cards[0].id);
    }
  }, [cards, selectedCardId]);

  React.useEffect(() => {
    if (!selectedCard) {
      setCardDraft(null);
      setBaselineDraft(null);
      setChecklistDraft([]);
      setBaselineChecklist([]);
      setFlowDraft(null);
      setTemplateKey("");
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingConnectionNodeId(null);
      return;
    }

    const draft: CardEditorDraft = {
      title: selectedCard.title || "",
      card_type: selectedCard.card_type || "manual",
      column_id: selectedCard.column_id,
      content_text: selectedCard.content_text || "",
      note: selectedCard.note || "",
      due_at: toDatetimeLocalValue(selectedCard.due_at),
      label_ids: [...(selectedCard.label_ids || [])],
    };

    const nextChecklist = parseChecklistContent(selectedCard.content_text || "");

    setCardDraft(draft);
    setBaselineDraft(draft);
    setChecklistDraft(nextChecklist);
    setBaselineChecklist(nextChecklist);
    const nextFlow = parseFlowchart(
      selectedCard.structure_json,
      selectedCard.title,
      selectedCard.content_text,
    );
    setFlowDraft(nextFlow);
    setTemplateKey(readTemplateKeyFromStructure(selectedCard.structure_json));
    setSelectedNodeId(nextFlow.nodes[0]?.id || null);
    setSelectedEdgeId(null);
    setPendingConnectionNodeId(null);
  }, [selectedCard]);

  React.useEffect(() => {
    const nextDrafts = Object.fromEntries(
      (board?.labels || []).map((label) => [
        label.id,
        {
          name: label.name,
          color: label.color,
        },
      ]),
    ) as Record<number, LabelDraft>;
    setLabelDrafts(nextDrafts);
  }, [board?.labels]);

  React.useEffect(
    () => () => {
      for (const timeoutId of labelSaveTimersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      labelSaveTimersRef.current.clear();
    },
    [],
  );

  React.useEffect(
    () => () => {
      for (const url of attachmentUrlCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      attachmentUrlCacheRef.current.clear();
    },
    [],
  );

  const runBoardMutation = React.useCallback(
    async (
      task: () => Promise<BobarBoard>,
      successMessage?: string,
      preferredCardId?: number | null,
    ) => {
      try {
        setBusy(true);
        const nextBoard = await task();
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, preferredCardId ?? selectedCardId);
        if (successMessage) toastSuccess(successMessage);
        return nextBoard;
      } catch (error) {
        toastApiError(error);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [selectedCardId, syncBoardSummary, syncSelection],
  );


  const handleCreateShareLink = React.useCallback(async () => {
    if (!board) return;
    try {
      setShareBusy(true);
      const invite = await bobarService.createShareLink(board.id);
      setShareLink(invite);
      await loadCollaboration(board.id, { silent: true });
      await navigator.clipboard.writeText(`${window.location.origin}/bobar?share=${invite.token}`);
      toastSuccess("Link de compartilhamento copiado.");
    } catch (error) {
      toastApiError(error, "Não foi possível gerar o link de compartilhamento.");
    } finally {
      setShareBusy(false);
    }
  }, [board, loadCollaboration]);

  const handleRevokeShareLink = React.useCallback(async () => {
    if (!board) return;
    try {
      setShareBusy(true);
      await bobarService.revokeShareLink(board.id);
      setShareLink(null);
      await loadCollaboration(board.id, { silent: true });
      toastSuccess("Link de compartilhamento revogado.");
    } catch (error) {
      toastApiError(error, "Não foi possível revogar o link de compartilhamento.");
    } finally {
      setShareBusy(false);
    }
  }, [board, loadCollaboration]);

  const handleCopyShareLink = React.useCallback(async (token?: string | null) => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/bobar?share=${token}`);
      toastSuccess("Link copiado.");
    } catch {
      toastInfo("Não foi possível copiar automaticamente. Copie manualmente.");
    }
  }, []);

  const handleAcceptSharedBoard = React.useCallback(async () => {
    if (!shareTokenFromUrl) return;
    try {
      setShareBusy(true);
      const result = await bobarService.acceptShare(shareTokenFromUrl);
      const params = new URLSearchParams(location.search);
      params.delete("share");
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
        },
        { replace: true },
      );
      setSharePreview(null);
      await loadBoardsAndBoard(result.board_id);
      await loadCollaboration(result.board_id, { silent: true });
      toastSuccess("Acesso ao quadro confirmado.");
    } catch (error) {
      toastApiError(error, "Não foi possível confirmar o acesso ao quadro.");
    } finally {
      setShareBusy(false);
    }
  }, [loadBoardsAndBoard, loadCollaboration, location.pathname, location.search, navigate, shareTokenFromUrl]);

  const handleRemoveMember = React.useCallback(
    async (memberUserId: number, memberName: string) => {
      if (!board) return;
      const confirmed = window.confirm(`Remover o acesso de ${memberName}?`);
      if (!confirmed) return;

      try {
        setShareBusy(true);
        const payload = await bobarService.removeMember(board.id, memberUserId);
        setCollaboration(payload);
        setShareLink(payload.invite || null);
        toastSuccess("Acesso removido.");
      } catch (error) {
        toastApiError(error, "Não foi possível remover esse acesso.");
      } finally {
        setShareBusy(false);
      }
    },
    [board],
  );

  const handleSendProjectMessage = React.useCallback(async () => {
    if (!board) return;
    const message = chatMessageDraft.trim();
    if (!message) return;

    try {
      setShareBusy(true);
      const payload = await bobarService.sendChatMessage(board.id, { message });
      setCollaboration(payload);
      setShareLink(payload.invite || null);
      setChatMessageDraft("");
    } catch (error) {
      toastApiError(error, "Não foi possível enviar a mensagem.");
    } finally {
      setShareBusy(false);
    }
  }, [board, chatMessageDraft]);

  const openCreateBoardDialog = React.useCallback(() => {
    setBoardNameDraft("");
    setBoardDialog({ mode: "create", board: null });
  }, []);

  const handleRenameBoard = React.useCallback((boardItem: BobarBoardSummary) => {
    setBoardNameDraft(boardItem.title);
    setBoardDialog({ mode: "rename", board: boardItem });
  }, []);

  const handleSubmitBoardDialog = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const title = boardNameDraft.trim();
      if (!title || !boardDialog) return;

      try {
        setBusy(true);
        if (boardDialog.mode === "create") {
          const boardList = await bobarService.createBoard({ title });
          setBoards(boardList.boards);
          const createdBoard =
            boardList.boards.find((boardItem) => !boards.some((existingBoard) => existingBoard.id === boardItem.id)) ||
            boardList.boards.find((boardItem) => boardItem.title === title) ||
            null;
          setBoardDialog(null);
          setBoardNameDraft("");
          if (createdBoard) {
            await loadBoardsAndBoard(createdBoard.id);
            toastSuccess("Quadro criado.");
          }
          return;
        }

        const boardList = await bobarService.renameBoard(boardDialog.board.id, { title });
        setBoards(boardList.boards);
        setBoardDialog(null);
        setBoardNameDraft("");
        await loadBoardsAndBoard(boardDialog.board.id, selectedCardId);
        toastSuccess("Quadro renomeado.");
      } catch (error) {
        toastApiError(error, "Não foi possível salvar o quadro.");
      } finally {
        setBusy(false);
      }
    },
    [boardDialog, boardNameDraft, boards, loadBoardsAndBoard, selectedCardId],
  );

  const handleDeleteBoard = React.useCallback((boardItem: BobarBoardSummary) => {
    setDeleteDialog({ type: "board", board: boardItem });
  }, []);

  const handleSwitchBoard = React.useCallback(
    async (value: string) => {
      const nextBoardId = Number(value);
      if (!Number.isFinite(nextBoardId) || nextBoardId <= 0 || nextBoardId === activeBoardId) return;
      await loadBoardsAndBoard(nextBoardId);
      setActiveView("board");
      setSelectedImportCardId(null);
    },
    [activeBoardId, loadBoardsAndBoard],
  );

  const clearLabelAutosave = React.useCallback((labelId: number) => {
    const timeoutId = labelSaveTimersRef.current.get(labelId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      labelSaveTimersRef.current.delete(labelId);
    }
  }, []);

  const persistLabelDraft = React.useCallback(
    async (labelId: number, draftOverride?: LabelDraft) => {
      const draft = draftOverride || labelDrafts[labelId];
      const original = board?.labels.find((label) => label.id === labelId);
      if (!draft || !original) return;

      const normalizedName = draft.name.trim();
      const normalizedColor = (draft.color || original.color || "#22c55e").trim() || "#22c55e";

      if (!normalizedName) {
        setLabelDrafts((current) => ({
          ...current,
          [labelId]: { name: original.name, color: original.color },
        }));
        return;
      }

      if (normalizedName === original.name && normalizedColor.toLowerCase() === original.color.toLowerCase()) {
        return;
      }

      setLabelSavingIds((current) => (current.includes(labelId) ? current : [...current, labelId]));

      try {
        const nextBoard = await bobarService.updateLabel(labelId, {
          name: normalizedName,
          color: normalizedColor,
        });
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, selectedCardId);
      } catch (error) {
        toastApiError(error, "Não foi possível atualizar a etiqueta.");
        setLabelDrafts((current) => ({
          ...current,
          [labelId]: { name: original.name, color: original.color },
        }));
      } finally {
        setLabelSavingIds((current) => current.filter((currentId) => currentId !== labelId));
      }
    },
    [board?.labels, labelDrafts, selectedCardId, syncBoardSummary, syncSelection],
  );

  const scheduleLabelAutosave = React.useCallback(
    (labelId: number, nextDraft: LabelDraft) => {
      clearLabelAutosave(labelId);
      if (!nextDraft.name.trim()) return;

      const timeoutId = window.setTimeout(() => {
        void persistLabelDraft(labelId, nextDraft);
      }, 450);

      labelSaveTimersRef.current.set(labelId, timeoutId);
    },
    [clearLabelAutosave, persistLabelDraft],
  );

  const updateLabelDraft = React.useCallback(
    (label: BobarLabel, nextDraft: LabelDraft) => {
      setLabelDrafts((current) => ({
        ...current,
        [label.id]: nextDraft,
      }));
      scheduleLabelAutosave(label.id, nextDraft);
    },
    [scheduleLabelAutosave],
  );

  const handleLabelDraftBlur = React.useCallback(
    (label: BobarLabel) => {
      const currentDraft = labelDrafts[label.id] || { name: label.name, color: label.color };
      if (!currentDraft.name.trim()) {
        setLabelDrafts((current) => ({
          ...current,
          [label.id]: { name: label.name, color: label.color },
        }));
        return;
      }

      clearLabelAutosave(label.id);
      void persistLabelDraft(label.id, currentDraft);
    },
    [clearLabelAutosave, labelDrafts, persistLabelDraft],
  );

  const handleCreateLabel = React.useCallback(async () => {
    const name = newLabelName.trim();
    if (!name || !activeBoardId) return;

    try {
      setBusy(true);
      const nextBoard = await bobarService.createLabel(
        { name, color: newLabelColor || "#22c55e" },
        activeBoardId,
      );
      setBoard(nextBoard);
      syncBoardSummary(nextBoard);
      syncSelection(nextBoard, selectedCardId);
      setNewLabelName("");
      setNewLabelColor("#22c55e");
      toastSuccess("Etiqueta criada.");
    } catch (error) {
      toastApiError(error, "Não foi possível criar a etiqueta.");
    } finally {
      setBusy(false);
    }
  }, [activeBoardId, newLabelColor, newLabelName, selectedCardId, syncBoardSummary, syncSelection]);

  const handleDeleteLabel = React.useCallback(
    async (label: BobarLabel) => {
      clearLabelAutosave(label.id);
      setLabelDeletingIds((current) => (current.includes(label.id) ? current : [...current, label.id]));

      try {
        const nextBoard = await bobarService.deleteLabel(label.id);
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, selectedCardId);
        toastSuccess(`Etiqueta "${label.name}" removida.`);
      } catch (error) {
        toastApiError(error, "Não foi possível remover a etiqueta.");
      } finally {
        setLabelDeletingIds((current) => current.filter((currentId) => currentId !== label.id));
      }
    },
    [clearLabelAutosave, selectedCardId, syncBoardSummary, syncSelection],
  );

  const handleToggleCardLabel = React.useCallback((labelId: number) => {
    setCardDraft((current) => {
      if (!current) return current;
      const exists = current.label_ids.includes(labelId);
      const nextLabelIds = exists
        ? current.label_ids.filter((currentLabelId) => currentLabelId !== labelId)
        : [...current.label_ids, labelId];
      return {
        ...current,
        label_ids: nextLabelIds,
      };
    });
  }, []);

  const getAttachmentUrl = React.useCallback(async (attachment: BobarAttachment) => {
    const cached = attachmentUrlCacheRef.current.get(attachment.id);
    if (cached) return cached;
    const blob = await bobarService.fetchAttachmentBlob(attachment.id);
    const url = URL.createObjectURL(blob);
    attachmentUrlCacheRef.current.set(attachment.id, url);
    return url;
  }, []);

  const loadAttachmentPreview = React.useCallback(
    async (attachment: BobarAttachment) => {
      const kind = attachmentPreviewKind(attachment);
      const blob = await bobarService.fetchAttachmentBlob(attachment.id);

      const cached = attachmentUrlCacheRef.current.get(attachment.id);
      const url = cached || URL.createObjectURL(blob);
      if (!cached) {
        attachmentUrlCacheRef.current.set(attachment.id, url);
      }

      return {
        kind,
        url,
        textContent: kind === "text" ? await blob.text() : undefined,
      };
    },
    [],
  );

  const handleOpenAttachmentPicker = React.useCallback(() => {
    if (!selectedCard) {
      toastInfo("Selecione um card antes de anexar arquivo.");
      return;
    }
    attachmentInputRef.current?.click();
  }, [selectedCard]);

  const handleUploadAttachments = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!selectedCard || !files.length) return;

      try {
        setBusy(true);
        let workingBoard: BobarBoard | null = board;
        for (const file of files) {
          workingBoard = await bobarService.uploadAttachment(selectedCard.id, file);
        }
        if (workingBoard) {
          setBoard(workingBoard);
          syncBoardSummary(workingBoard);
          syncSelection(workingBoard, selectedCard.id);
        }
        toastSuccess(files.length === 1 ? "Anexo enviado." : "Anexos enviados.");
      } catch (error) {
        toastApiError(error, "Não foi possível enviar o anexo.");
      } finally {
        setBusy(false);
      }
    },
    [board, selectedCard, syncBoardSummary, syncSelection],
  );

  const handleDeleteAttachment = React.useCallback(
    async (attachment: BobarAttachment) => {
      try {
        setBusy(true);
        const cached = attachmentUrlCacheRef.current.get(attachment.id);
        if (cached) {
          URL.revokeObjectURL(cached);
          attachmentUrlCacheRef.current.delete(attachment.id);
        }
        const nextBoard = await bobarService.deleteAttachment(attachment.id);
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        syncSelection(nextBoard, selectedCardId);
        if (attachmentPreview?.attachment.id === attachment.id) {
          setAttachmentPreview(null);
        }
        toastSuccess("Anexo removido.");
      } catch (error) {
        toastApiError(error, "Não foi possível remover o anexo.");
      } finally {
        setBusy(false);
      }
    },
    [attachmentPreview?.attachment.id, selectedCardId, syncBoardSummary, syncSelection],
  );

  const handlePreviewAttachment = React.useCallback(
    async (attachment: BobarAttachment) => {
      try {
        const preview = await loadAttachmentPreview(attachment);
        setAttachmentPreview({
          attachment,
          kind: preview.kind,
          url: preview.url,
          textContent: preview.textContent,
        });
      } catch (error) {
        toastApiError(error, "Não foi possível abrir o preview do anexo.");
      }
    },
    [loadAttachmentPreview],
  );

  const handleDownloadAttachment = React.useCallback(
    async (attachment: BobarAttachment) => {
      try {
        const url = await getAttachmentUrl(attachment);
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        toastApiError(error, "Não foi possível baixar o anexo.");
      }
    },
    [getAttachmentUrl],
  );

  const openCreateColumnDialog = React.useCallback(() => {
    setColumnNameDraft("");
    setColumnDialog({ mode: "create", column: null });
  }, []);

  const handleRenameColumn = React.useCallback((column: BobarColumn) => {
    setColumnNameDraft(column.name);
    setColumnDialog({ mode: "rename", column });
  }, []);

  const handleSubmitColumnDialog = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const name = columnNameDraft.trim();
      if (!name || !columnDialog) return;

      if (columnDialog.mode === "create") {
        if (isImportMode && activeImportCard && board) {
          try {
            setBusy(true);
            const createdBoard = await bobarService.createColumn({ name }, activeBoardId);
            const createdColumnId = diffNewColumnId(board, createdBoard);
            if (!createdColumnId) {
              throw new Error("Não foi possível identificar a nova coluna criada.");
            }

            const nextColumnIds = [...activeWorkspaceColumnIds, createdColumnId];
            const syncedBoard = await updateImportWorkspaceColumns(
              createdBoard,
              activeImportCard.id,
              nextColumnIds,
              selectedCardId,
            );

            setColumnDialog(null);
            setColumnNameDraft("");
            setBoard(syncedBoard);
            syncBoardSummary(syncedBoard);
            toastSuccess("Coluna criada dentro do roteiro importado.");
          } catch (error) {
            toastApiError(error, "Não foi possível criar a nova coluna.");
          } finally {
            setBusy(false);
          }
          return;
        }

        const nextBoard = await runBoardMutation(
          () => bobarService.createColumn({ name }, activeBoardId),
          "Coluna criada.",
        );
        if (nextBoard) {
          setColumnDialog(null);
          setColumnNameDraft("");
        }
        return;
      }

      if (name === columnDialog.column.name) {
        setColumnDialog(null);
        return;
      }

      const nextBoard = await runBoardMutation(
        () => bobarService.renameColumn(columnDialog.column.id, { name }),
        "Coluna atualizada.",
      );

      if (nextBoard) {
        setColumnDialog(null);
        setColumnNameDraft("");
      }
    },
    [
      activeImportCard,
      activeWorkspaceColumnIds,
      board,
      columnDialog,
      columnNameDraft,
      isImportMode,
      runBoardMutation,
      selectedCardId,
      updateImportWorkspaceColumns,
    ],
  );

  const handleDeleteColumn = React.useCallback((column: BobarColumn) => {
    setDeleteDialog({ type: "column", column });
  }, []);

  const handleCreateCard = React.useCallback(
    async (columnId?: number) => {
      const fallbackColumnId = columnId || visibleColumns[0]?.id;
      if (!fallbackColumnId) {
        toastInfo("Crie uma coluna antes de adicionar cards.");
        return;
      }

      await runBoardMutation(
        () =>
          bobarService.createCard(
            {
              column_id: fallbackColumnId,
              title: "Novo card",
              note: "",
              content_text: "",
              card_type: "manual",
            },
            activeBoardId,
          ),
        "Card criado.",
      );
    },
    [runBoardMutation, visibleColumns],
  );

  const handleCleanupImportDuplicates = React.useCallback(async () => {
    if (!activeImportCard) {
      toastInfo("Selecione um roteiro importado para limpar os duplicados.");
      return;
    }

    try {
      setBusy(true);
      const nextBoard = await bobarService.cleanupImportDuplicates(activeImportCard.id);
      setBoard(nextBoard);
      syncBoardSummary(nextBoard);
      setSelectedImportCardId(activeImportCard.id);

      const nextImportCard = findCard(nextBoard, activeImportCard.id);
      const nextWorkspaceIds = nextImportCard
        ? uniquePositiveIds(
            getImportedWorkspaceColumnIds(nextImportCard),
            inferImportedWorkspaceColumnIds(nextBoard, activeImportCard.id),
          ).filter((columnId) => nextBoard.columns.some((column) => column.id === columnId))
        : [];

      const nextWorkspaceColumns = nextBoard.columns.filter((column) =>
        nextWorkspaceIds.includes(column.id),
      );

      syncSelection(
        nextBoard,
        firstCardIdFromColumns(nextWorkspaceColumns) || selectedCardId,
      );

      toastSuccess("Limpeza segura concluída. Os duplicados antigos foram removidos.");
    } catch (error) {
      toastApiError(error, "Não foi possível limpar os duplicados antigos.");
    } finally {
      setBusy(false);
    }
  }, [activeImportCard, selectedCardId, syncSelection]);


  const handleSetImportProgressStatus = React.useCallback(
    async (card: BobarCard, status: ImportProgressStatus) => {
      if (readImportProgressStatus(card.structure_json) === status) return;

      try {
        setBusy(true);
        const nextBoard = await bobarService.updateCard(card.id, {
          structure_json: writeImportProgressStatus(card.structure_json, status),
        });
        setBoard(nextBoard);
        syncBoardSummary(nextBoard);
        setSelectedImportCardId(card.id);
        syncSelection(nextBoard, selectedCardId);
        toastSuccess(`Status atualizado para ${formatImportProgressLabel(status)}.`);
      } catch (error) {
        toastApiError(error, "Não foi possível atualizar o status da base importada.");
      } finally {
        setBusy(false);
      }
    },
    [selectedCardId, syncSelection],
  );

  const handleStartDragCard = React.useCallback(
    (card: BobarCard, event: React.DragEvent<HTMLButtonElement>) => {
      setDragState({ cardId: card.id, fromColumnId: card.column_id });
      setDragOverColumnId(card.column_id);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleEndDragCard = React.useCallback(() => {
    setDragState(null);
    setDragOverColumnId(null);
  }, []);

  const handleDropColumn = React.useCallback(
    async (columnId: number) => {
      const drag = dragState;
      setDragState(null);
      setDragOverColumnId(null);
      if (!drag) return;

      const targetColumn = visibleColumns.find((column) => column.id === columnId);
      if (
        !targetColumn ||
        (drag.fromColumnId === columnId &&
          targetColumn.cards.some((card) => card.id === drag.cardId))
      )
        return;

      await runBoardMutation(
        () =>
          bobarService.moveCard(drag.cardId, {
            column_id: columnId,
            position: targetColumn.cards.length,
          }),
        "Card movido.",
        drag.cardId,
      );
    },
    [dragState, runBoardMutation, visibleColumns],
  );

  const handleSaveCard = React.useCallback(async () => {
    if (!selectedCard || !cardDraft) return;

    if (cardDraft.due_at.trim() && !dueDateIso) {
      toastInfo("Use a data no padrão DIA/MÊS/ANO. Ex.: 31/12/2025 18:30.");
      return;
    }

    const normalizedFlow = isFlowCard
      ? flowDraft && flowDraft.nodes.length
        ? flowDraft
        : parseFlowchart(selectedCard.structure_json, cardDraft.title, cardDraft.content_text)
      : null;

    const checklistContent = isChecklistCard
      ? serializeChecklistContent(checklistDraft)
      : cardDraft.content_text;

    const payload = {
      title: cardDraft.title.trim() || "Card sem título",
      card_type: String(cardDraft.card_type || "manual"),
      column_id: Number(cardDraft.column_id),
      note: cardDraft.note,
      content_text: normalizedFlow ? flowToContentText(normalizedFlow) : checklistContent,
      structure_json: normalizedFlow
        ? JSON.stringify({
            ...normalizedFlow,
            meta: { ...(normalizedFlow.meta || {}), templateKey: templateKey || null, grid: 32 },
          })
        : "",
      due_at: dueDateIso,
      label_ids: cardDraft.label_ids,
    };

    await runBoardMutation(
      () => bobarService.updateCard(selectedCard.id, payload),
      "Card salvo.",
      selectedCard.id,
    );
  }, [
    cardDraft,
    checklistDraft,
    dueDateIso,
    flowDraft,
    isChecklistCard,
    isFlowCard,
    runBoardMutation,
    selectedCard,
    templateKey,
  ]);

  const openDeleteSelectedCardDialog = React.useCallback(() => {
    if (!selectedCard) return;
    setDeleteDialog({ type: "card", card: selectedCard });
  }, [selectedCard]);

  const handleConfirmDelete = React.useCallback(async () => {
    if (!deleteDialog) return;

    if (deleteDialog.type === "board") {
      try {
        setBusy(true);
        const boardList = await bobarService.deleteBoard(deleteDialog.board.id);
        setBoards(boardList.boards);
        setDeleteDialog(null);

        const fallbackBoardId = boardList.boards[0]?.id || null;
        if (fallbackBoardId) {
          await loadBoardsAndBoard(fallbackBoardId);
        } else {
          setBoard(null);
          setActiveBoardId(null);
          setSelectedCardId(null);
        }

        toastSuccess("Quadro removido.");
      } catch (error) {
        toastApiError(error, "Não foi possível remover o quadro.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (deleteDialog.type === "column") {
      if (isImportMode && activeImportCard && board) {
        const targetColumnId = deleteDialog.column.id;
        const remainingWorkspaceColumns = visibleColumns.filter((column) => column.id !== targetColumnId);

        if (!remainingWorkspaceColumns.length) {
          toastInfo("Mantenha pelo menos uma coluna no roteiro importado.");
          return;
        }

        try {
          setBusy(true);
          let workingBoard = board;
          const destinationColumnId = remainingWorkspaceColumns[0].id;
          const sourceColumn = workingBoard.columns.find((column) => column.id === targetColumnId) || null;

          for (const card of sourceColumn?.cards || []) {
            workingBoard = await bobarService.moveCard(card.id, {
              column_id: destinationColumnId,
              position:
                (workingBoard.columns.find((column) => column.id === destinationColumnId)?.cards.length || 0),
            });
          }

          workingBoard = await bobarService.deleteColumn(targetColumnId);
          const nextWorkspaceColumnIds = activeWorkspaceColumnIds.filter((columnId) => columnId !== targetColumnId);
          workingBoard = await updateImportWorkspaceColumns(
            workingBoard,
            activeImportCard.id,
            nextWorkspaceColumnIds,
            selectedCardId,
          );

          setDeleteDialog(null);
          setBoard(workingBoard);
          syncBoardSummary(workingBoard);
          toastSuccess("Coluna removida do roteiro importado.");
        } catch (error) {
          toastApiError(error, "Não foi possível remover a coluna importada.");
        } finally {
          setBusy(false);
        }
        return;
      }

      const nextBoard = await runBoardMutation(
        () => bobarService.deleteColumn(deleteDialog.column.id),
        "Coluna removida.",
      );
      if (nextBoard) setDeleteDialog(null);
      return;
    }

    const deletingId = deleteDialog.card.id;
    const nextBoard = await runBoardMutation(
      () => bobarService.deleteCard(deletingId),
      "Card removido.",
    );
    if (nextBoard) setDeleteDialog(null);
  }, [
    activeImportCard,
    activeWorkspaceColumnIds,
    board,
    deleteDialog,
    isImportMode,
    loadBoardsAndBoard,
    runBoardMutation,
    selectedCardId,
    syncBoardSummary,
    updateImportWorkspaceColumns,
    visibleColumns,
  ]);

  const applyTemplateByKey = React.useCallback((nextTemplateKey: string) => {
    if (!nextTemplateKey) {
      setTemplateKey("");
      return;
    }

    const template = CARD_TEMPLATES.find((item) => item.key === nextTemplateKey);
    if (!template) return;

    const nextChecklist =
      template.cardType === "checklist"
        ? parseChecklistContent(template.contentText)
        : normalizeChecklistItems([createChecklistItem()]);

    setTemplateKey(nextTemplateKey);
    setCardDraft((current) =>
      current
        ? {
            ...current,
            title: template.title,
            note: template.note,
            card_type: template.cardType,
            content_text:
              template.cardType === "checklist"
                ? serializeChecklistContent(nextChecklist)
                : template.contentText,
          }
        : current,
    );
    setChecklistDraft(nextChecklist);

    if (template.structure) {
      const cloned = cloneFlow(template.structure);
      setFlowDraft({
        ...cloned,
        meta: { ...(cloned.meta || {}), templateKey: template.key, grid: 32 },
      });
      setSelectedNodeId(cloned.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      setPendingConnectionNodeId(null);
    } else {
      setFlowDraft(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingConnectionNodeId(null);
    }

    toastSuccess("Template aplicado automaticamente.");
  }, []);

  const handleCardTypeChange = React.useCallback(
    (value: string) => {
      setCardDraft((current) => {
        if (!current) return current;

        if (value === "checklist") {
          const nextChecklist = parseChecklistContent(current.content_text || selectedCard?.content_text);
          setChecklistDraft(nextChecklist);
          return {
            ...current,
            card_type: value,
            content_text: serializeChecklistContent(nextChecklist),
          };
        }

        if (value === "fluxograma") {
          setFlowDraft((currentFlow) => {
            if (currentFlow?.nodes.length) {
              setSelectedNodeId(currentFlow.nodes[0]?.id || null);
              setSelectedEdgeId(null);
              setPendingConnectionNodeId(null);
              return currentFlow;
            }

            const nextFlow = parseFlowchart(
              "",
              current.title || selectedCard?.title || "",
              current.content_text || selectedCard?.content_text || "",
            );
            setSelectedNodeId(nextFlow.nodes[0]?.id || null);
            setSelectedEdgeId(null);
            setPendingConnectionNodeId(null);
            return nextFlow;
          });
        }

        return {
          ...current,
          card_type: value,
        };
      });
    },
    [selectedCard],
  );

  const updateChecklistDraft = React.useCallback(
    (updater: ChecklistItem[] | ((current: ChecklistItem[]) => ChecklistItem[])) => {
      setChecklistDraft((current) => {
        const nextRaw =
          typeof updater === "function"
            ? (updater as (current: ChecklistItem[]) => ChecklistItem[])(current)
            : updater;
        const nextItems = normalizeChecklistItems(nextRaw);
        setCardDraft((draft) =>
          draft
            ? {
                ...draft,
                content_text: serializeChecklistContent(nextItems),
              }
            : draft,
        );
        return nextItems;
      });
    },
    [],
  );

  const handleChecklistItemToggle = React.useCallback(
    (itemId: string) => {
      updateChecklistDraft((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item,
        ),
      );
    },
    [updateChecklistDraft],
  );

  const handleChecklistItemTextChange = React.useCallback(
    (itemId: string, value: string) => {
      updateChecklistDraft((current) =>
        current.map((item) => (item.id === itemId ? { ...item, text: value } : item)),
      );
    },
    [updateChecklistDraft],
  );

  const handleAddChecklistItem = React.useCallback(() => {
    updateChecklistDraft((current) => [...current, createChecklistItem()]);
  }, [updateChecklistDraft]);

  const handleRemoveChecklistItem = React.useCallback(
    (itemId: string) => {
      updateChecklistDraft((current) => current.filter((item) => item.id !== itemId));
    },
    [updateChecklistDraft],
  );

  const handleClearCompletedChecklistItems = React.useCallback(() => {
    updateChecklistDraft((current) => current.filter((item) => !item.checked));
  }, [updateChecklistDraft]);

  const setNodePatch = React.useCallback((nodeId: string, patch: Partial<BobarFlowNode>) => {
    setFlowDraft((current) => {
      const source = current || { nodes: [], edges: [], meta: { grid: 32 } };
      return {
        ...source,
        nodes: source.nodes.map((node, index) =>
          node.id === nodeId ? normalizeFlowNode({ ...node, ...patch }, index) : node,
        ),
      };
    });
  }, []);

  const handleSelectNode = React.useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);


  const handleConnectionHandleClick = React.useCallback(
    (nodeId: string, role: "source" | "target") => {
      const base =
        flowDraft ||
        parseFlowchart(
          selectedCard?.structure_json,
          cardDraft?.title || selectedCard?.title || "Novo fluxo",
          cardDraft?.content_text || selectedCard?.content_text || "",
        );

      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);

      if (role === "source") {
        setPendingConnectionNodeId((current) => (current === nodeId ? null : nodeId));
        if (!flowDraft) setFlowDraft(base);
        return;
      }

      if (!pendingConnectionNodeId) {
        const hadIncomingEdges = base.edges.some((edge) => edge.target === nodeId);
        if (hadIncomingEdges) {
          const nextEdges = base.edges.filter((edge) => edge.target !== nodeId);
          setFlowDraft({
            ...base,
            edges: nextEdges,
          });
          toastSuccess("Conexões removidas da entrada selecionada.");
        } else if (!flowDraft) {
          setFlowDraft(base);
        }
        setPendingConnectionNodeId(null);
        return;
      }

      if (pendingConnectionNodeId === nodeId) {
        setPendingConnectionNodeId(null);
        if (!flowDraft) setFlowDraft(base);
        return;
      }

      const duplicated = base.edges.some(
        (edge) => edge.source === pendingConnectionNodeId && edge.target === nodeId,
      );
      if (duplicated) {
        setPendingConnectionNodeId(null);
        return;
      }

      const createdEdge = {
        id: newEdgeId(),
        source: pendingConnectionNodeId,
        target: nodeId,
        label: "",
      };

      setFlowDraft({
        ...base,
        edges: dedupeEdges([...base.edges, createdEdge]),
      });
      setSelectedEdgeId(createdEdge.id);
      setPendingConnectionNodeId(null);
    },
    [cardDraft?.content_text, cardDraft?.title, flowDraft, pendingConnectionNodeId, selectedCard],
  );

  const handleAddNode = React.useCallback(() => {
    setFlowDraft((current) => {
      const base =
        current ||
        parseFlowchart("", cardDraft?.title || "Novo fluxo", cardDraft?.content_text || "");
      const anchor =
        base.nodes.find((node) => node.id === selectedNodeId) ||
        base.nodes[base.nodes.length - 1] ||
        null;
      const node = normalizeFlowNode(
        {
          id: newNodeId(),
          title: `Bloco ${base.nodes.length + 1}`,
          content: "",
          kind: "step",
          x: anchor ? anchor.x + 300 : 80,
          y: anchor ? anchor.y : 80,
        },
        base.nodes.length,
      );
      return {
        ...base,
        nodes: [...base.nodes, node],
      };
    });
    setPendingConnectionNodeId(null);
  }, [cardDraft?.content_text, cardDraft?.title, selectedNodeId]);

  const handleDeleteSelectedNode = React.useCallback(() => {
    if (!selectedNodeId) return;
    setFlowDraft((current) => {
      if (!current) return current;
      const nextNodes = current.nodes.filter((node) => node.id !== selectedNodeId);
      const nextEdges = current.edges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      );
      const nextFlow = {
        ...current,
        nodes: nextNodes,
        edges: nextEdges,
      };
      setSelectedNodeId(nextNodes[0]?.id || null);
      setSelectedEdgeId(null);
      return nextFlow;
    });
    if (pendingConnectionNodeId === selectedNodeId) {
      setPendingConnectionNodeId(null);
    }
  }, [pendingConnectionNodeId, selectedNodeId]);

  const handleDeleteSelectedEdge = React.useCallback(() => {
    if (!selectedEdgeId) return;
    setFlowDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        edges: current.edges.filter((edge) => edge.id !== selectedEdgeId),
      };
    });
    setSelectedEdgeId(null);
    setPendingConnectionNodeId(null);
  }, [selectedEdgeId]);

  const handleAutoArrange = React.useCallback(() => {
    setFlowDraft((current) => (current ? autoArrangeFlow(current) : current));
    setPendingConnectionNodeId(null);
    toastSuccess("Fluxograma reorganizado em ordem de fluxo.");
  }, []);

  const handleExportText = React.useCallback(() => {
    if (!selectedCard) return;
    const element = document.createElement("a");
    const blob = new Blob([selectedCard.content_text || ""], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(blob);
    element.download = `${selectedCard.title || "card"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(element.href);
  }, [selectedCard]);


  const openFlowEditor = React.useCallback(() => {
    if (!isFlowCard) return;
    setIsFlowEditorOpen(true);
  }, [isFlowCard]);

  const closeFlowEditor = React.useCallback(() => {
    setIsFlowEditorOpen(false);
    setPendingConnectionNodeId(null);
  }, []);

  React.useEffect(() => {
    setIsFlowEditorOpen(false);
    setPendingConnectionNodeId(null);
  }, [selectedCardId]);

  React.useEffect(() => {
    if (isFlowCard) return;
    setIsFlowEditorOpen(false);
  }, [isFlowCard]);

  React.useEffect(() => {
    if (!isFlowEditorOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isFlowEditorOpen]);

  React.useEffect(() => {
    if (!isFlowEditorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFlowEditorOpen(false);
        setPendingConnectionNodeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlowEditorOpen]);

  const flowEditorOverlay =
    isFlowEditorOpen && isFlowCard && activeFlow && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[2147483647] h-screen w-screen overflow-hidden bg-[#020611] text-white"
            style={{ position: "fixed", inset: 0 }}
          >
            <div className="flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_28%),#020611]">
              <div className="shrink-0 border-b border-white/10 bg-[#040914]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <Button
                      variant="outline"
                      className="h-11 w-full rounded-2xl sm:w-auto"
                      onClick={closeFlowEditor}
                    >
                      Voltar
                    </Button>

                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                        Fluxograma · tela cheia
                      </div>
                      <div className="truncate text-xl font-black text-white sm:text-2xl">
                        {cardDraft?.title?.trim() || selectedCard?.title || "Fluxograma"}
                      </div>
                      <div className="text-sm text-white/55">
                        Edite blocos e conexões no canvas.
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      className="h-11 rounded-2xl"
                      variant="outline"
                      onClick={handleAddNode}
                    >
                      <Plus className="h-4 w-4" />
                      Novo bloco
                    </Button>
                    <Button
                      className="h-11 rounded-2xl"
                      variant="outline"
                      onClick={handleAutoArrange}
                    >
                      <Sparkles className="h-4 w-4" />
                      Auto-organizar
                    </Button>
                    <Button
                      className="h-11 rounded-2xl"
                      variant="outline"
                      onClick={handleDeleteSelectedNode}
                      disabled={!selectedNodeId}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover bloco
                    </Button>
                    <Button
                      className="h-11 rounded-2xl"
                      variant="outline"
                      onClick={handleDeleteSelectedEdge}
                      disabled={!selectedEdgeId}
                    >
                      <Unlink className="h-4 w-4" />
                      Remover conexão
                    </Button>
                    <Button
                      className="h-11 rounded-2xl px-6"
                      onClick={() => void handleSaveCard()}
                      disabled={busy || !hasPendingChanges}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar card
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex h-full min-h-0 flex-col gap-4 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="min-h-0 min-w-0 overflow-hidden">
                    <FlowchartCanvas
                      flow={activeFlow}
                      selectedNodeId={selectedNodeId}
                      selectedEdgeId={selectedEdgeId}
                      pendingConnectionNodeId={pendingConnectionNodeId}
                      onSelectNode={handleSelectNode}
                      onSelectEdge={(edgeId) => {
                        setSelectedEdgeId(edgeId);
                        setSelectedNodeId(null);
                        setPendingConnectionNodeId(null);
                      }}
                      onMoveNode={setNodePatch}
                      onHandleClick={handleConnectionHandleClick}
                      viewportClassName="h-full min-h-[55vh] 2xl:min-h-0"
                    />
                  </div>

                  <FlowEditorInspector
                    selectedNode={selectedNode}
                    selectedEdge={selectedEdge}
                    selectedEdgeNodes={selectedEdgeNodes}
                    pendingConnectionNode={pendingConnectionNode}
                    onPatchNode={setNodePatch}
                    onDeleteSelectedEdge={handleDeleteSelectedEdge}
                    className="flex h-full min-h-0 flex-col overflow-hidden"
                    contentClassName="min-h-0 flex-1 overflow-y-auto pb-6"
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const selectedTemplate = CARD_TEMPLATES.find((template) => template.key === templateKey) || null;
  const ActiveImportIcon = activeImportAgent?.Icon || AUTHORITY_AGENTS[0]?.Icon;

  return (
    <div className="min-h-screen bg-[#020611] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1820px] flex-col gap-6">
        <Card
          variant="glass"
          className="overflow-hidden rounded-[2.4rem] border-cyan-400/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_28%),#040914]"
        >
          <CardHeader className="gap-6">
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_520px]">
              <div className="max-w-5xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
                  <Sparkles className="h-4 w-4" />
                  Bobar · quadro premium
                </div>
                <CardTitle className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                  {isImportMode
                    ? "Abra a base e siga no mesmo quadro."
                    : "Cards e fluxos no mesmo quadro."}
                </CardTitle>
                <CardDescription className="mt-4 max-w-3xl text-base leading-8 text-white/65">
                  {isImportMode
                    ? "Abra e continue no quadro."
                    : "Coluna, card e fluxo no mesmo lugar."}
                </CardDescription>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatChip
                  icon={<FilePlus2 className="h-5 w-5" />}
                  label="Cards"
                  value={board?.total_cards || 0}
                />
                <StatChip
                  icon={<Sparkles className="h-5 w-5" />}
                  label="Importados"
                  value={countImportedCards(board)}
                />
                <StatChip
                  icon={<GitBranch className="h-5 w-5" />}
                  label="Fluxogramas"
                  value={countFlowchartCards(board)}
                />
                <StatChip
                  icon={<LayoutTemplate className="h-5 w-5" />}
                  label="Com template"
                  value={countTemplateCards(board)}
                />
              </div>
            </div>

            <div className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,34,0.98),rgba(6,11,23,0.92))] p-5 sm:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                    Quadros
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                      {board?.title || "Quadro"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                      {board?.total_cards || 0} cards
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                      {(board?.columns || []).length} colunas
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                      {(board?.labels || []).length} etiquetas
                    </span>
                  </div>
                </div>

                <div className="inline-flex w-full rounded-full border border-white/10 bg-white/[0.03] p-1 sm:w-auto">
                  <Button
                    className={cn(
                      "h-10 flex-1 rounded-full px-4 text-sm shadow-none sm:flex-none",
                      activeView === "board"
                        ? "bg-cyan-400 text-[#03111d] hover:bg-cyan-300"
                        : "border-0 bg-transparent text-white/60 hover:bg-white/[0.05] hover:text-white",
                    )}
                    variant="ghost"
                    onClick={() => setActiveView("board")}
                  >
                    <FolderKanban className="h-4 w-4" />
                    Quadro
                  </Button>
                  <Button
                    className={cn(
                      "h-10 flex-1 rounded-full px-4 text-sm shadow-none sm:flex-none",
                      activeView === "imports"
                        ? "bg-cyan-400 text-[#03111d] hover:bg-cyan-300"
                        : "border-0 bg-transparent text-white/60 hover:bg-white/[0.05] hover:text-white",
                    )}
                    variant="ghost"
                    onClick={() => setActiveView("imports")}
                  >
                    <Inbox className="h-4 w-4" />
                    Importados
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
                <SelectField
                  label="Quadro ativo"
                  value={activeBoardId ? String(activeBoardId) : ""}
                  options={boardOptions}
                  placeholder="Escolha um quadro"
                  onChange={(value) => void handleSwitchBoard(value)}
                  disabled={busy || !boardOptions.length}
                />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Button className="h-11 rounded-2xl px-4" onClick={openCreateBoardDialog}>
                    <Plus className="h-4 w-4" />
                    Novo quadro
                  </Button>
                  <Button
                    className="h-11 rounded-2xl px-4"
                    variant="outline"
                    onClick={() =>
                      board &&
                      handleRenameBoard({
                        id: board.id,
                        title: board.title,
                        position: boards.find((boardItem) => boardItem.id === board.id)?.position || 0,
                        total_cards: board.total_cards,
                        updated_at:
                          boards.find((boardItem) => boardItem.id === board.id)?.updated_at ||
                          new Date().toISOString(),
                      })
                    }
                    disabled={busy || !board || !collaboration?.can_manage_access}
                  >
                    <Pencil className="h-4 w-4" />
                    Renomear
                  </Button>
                  <Button
                    className="h-11 rounded-2xl px-4"
                    variant="outline"
                    onClick={() => void handleCreateShareLink()}
                    disabled={busy || shareBusy || !board || !collaboration?.can_manage_access}
                  >
                    <Link2 className="h-4 w-4" />
                    Compartilhar
                  </Button>
                  <Button
                    className="h-11 rounded-2xl px-4"
                    variant="outline"
                    onClick={() =>
                      board &&
                      handleDeleteBoard({
                        id: board.id,
                        title: board.title,
                        position: boards.find((boardItem) => boardItem.id === board.id)?.position || 0,
                        total_cards: board.total_cards,
                        updated_at:
                          boards.find((boardItem) => boardItem.id === board.id)?.updated_at ||
                          new Date().toISOString(),
                      })
                    }
                    disabled={busy || !board || boards.length <= 1 || !collaboration?.can_manage_access}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                  {isImportMode ? (
                    <Button
                      className="h-11 rounded-2xl px-4"
                      variant="outline"
                      onClick={() => void handleCleanupImportDuplicates()}
                      disabled={busy || !activeImportCard}
                    >
                      <Trash2 className="h-4 w-4" />
                      Limpar duplicados
                    </Button>
                  ) : null}
                </div>
              </div>

              {isImportMode && activeImportCard ? (
                <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/58">
                  <span className="block truncate">
                    Importado ativo: <span className="font-semibold text-white">{activeImportTitle}</span>
                  </span>
                </div>
              ) : selectedCard ? (
                <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/58">
                  <span className="block truncate">
                    Card selecionado: <span className="font-semibold text-white">{selectedCard.title}</span>
                  </span>
                </div>
              ) : !boardHasColumns ? (
                <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/58">
                  Crie a primeira coluna para começar.
                </div>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {activeView === "imports" ? (
          <div className="grid gap-6">
            <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
              <CardHeader>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                  Importados
                </div>
                <CardTitle className="text-3xl font-black text-white">
                  Escolha a base do quadro
                </CardTitle>
                <CardDescription className="max-w-3xl text-white/55">
                  Escolha a base que vai abrir no quadro e acompanhe o estágio de execução de cada importação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {importedCards.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {importedCards.map((card) => {
                      const agent = authorityAgentByKey(extractAuthorityAgentKey(card.source_kind));
                      const AgentIcon = agent?.Icon || AUTHORITY_AGENTS[0]?.Icon;
                      const title = buildImportedWorkspaceBlueprint(card.content_text, card.title).title;
                      const ready = getImportedWorkspaceColumnIds(card).length > 0;
                      const status = readImportProgressStatus(card.structure_json);

                      return (
                        <div
                          key={card.id}
                          className={cn(
                            "rounded-[1.8rem] border p-4 transition",
                            activeImportCard?.id === card.id
                              ? "border-cyan-400/35 bg-cyan-400/10 ring-2 ring-cyan-400/20"
                              : "border-white/10 bg-white/[0.03]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedImportCardId(card.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-cyan-400/10 text-cyan-100">
                                {AgentIcon ? <AgentIcon className="h-11 w-11" /> : <Sparkles className="h-5 w-5" />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <Badge className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", importProgressBadgeClasses(status))}>
                                    {formatImportProgressLabel(status)}
                                  </Badge>
                                  <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                                    {hydratingImportId === card.id ? "Montando" : ready ? "Pronto" : "Importado"}
                                  </Badge>
                                </div>
                                <div className="truncate text-sm font-semibold text-cyan-100">
                                  {card.source_label || agent?.name || "Agente"}
                                </div>
                                <div className="mt-1 break-words text-2xl font-black leading-tight text-white">
                                  {title}
                                </div>
                                <div className="mt-2 text-sm text-white/45">{formatDate(card.updated_at)}</div>
                              </div>
                            </div>
                          </button>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {IMPORT_PROGRESS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSetImportProgressStatus(card, option.value);
                                }}
                                disabled={busy}
                                className={cn(
                                  "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60",
                                  importProgressButtonClasses(status === option.value, option.value),
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhum roteiro importado ainda"
                    description="Quando a pessoa clicar em Mandar pro Bobar, a base importada aparece aqui pronta para virar um quadro editável."
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="glass" className="hidden rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
              <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] bg-cyan-400/10 text-cyan-100">
                    {ActiveImportIcon ? <ActiveImportIcon className="h-12 w-12" /> : <Sparkles className="h-6 w-6" />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                      Importado no quadro
                    </div>
                    <CardTitle className="mt-2 max-w-4xl break-words text-3xl font-black text-white sm:text-4xl">
                      {activeImportTitle}
                    </CardTitle>
                    <CardDescription className="mt-2 text-base leading-7 text-white/60">
                      {activeImportCard
                        ? `${activeImportCard.source_label || activeImportAgent?.name || "Agente"} · atualizado em ${formatDate(activeImportCard.updated_at)}`
                        : "Selecione um roteiro importado para abrir a base no quadro visual."}
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    3 colunas-base
                  </Badge>
                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    Fluxograma editável
                  </Badge>
                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    Mesmo quadro do Bobar
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[1.9rem] border border-white/10 bg-white/[0.035] p-5">
                  <div className="text-base font-semibold text-white">
                    A base importada vira quadro real.
                  </div>
                  <div className="mt-3 text-sm leading-7 text-white/60">
                    Cada seção entra como card editável, sem ficar presa em um card único.
                  </div>
                </div>

                <div className="rounded-[1.9rem] border border-cyan-400/15 bg-cyan-400/[0.07] p-5 text-sm leading-7 text-cyan-50/90">
                  {hydratingImportId && activeImportCard?.id === hydratingImportId
                    ? "Montando as colunas e os cards importados agora. Assim que terminar, o quadro fica pronto para edição."
                    : activeImportCard
                      ? activeWorkspaceColumnIds.length
                        ? "Quadro importado pronto. Você já pode editar cards, criar novas colunas e ajustar o fluxograma."
                        : "Clique no roteiro para o Bobar materializar a base em colunas reais."
                      : "Selecione um roteiro importado para começar."}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                {isImportMode ? "Quadro importado" : "Quadro visual"}
              </div>
              <CardTitle className="mt-2 text-3xl font-black text-white">
                {isImportMode ? activeImportTitle : board?.title || "Quadro por coluna"}
              </CardTitle>
              <CardDescription className="mt-2 max-w-4xl text-white/55">
                {isImportMode
                  ? "Arraste cards, crie colunas e edite a base no mesmo quadro."
                  : "Bateu o olho, entendeu. Clique para editar e arraste para mover."}
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                {visibleColumns.length || 0} colunas
              </Badge>
              <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                {cards.length} cards
              </Badge>
              {selectedCard ? (
                <Badge className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  {typeLabel(cardDraft?.card_type)}
                </Badge>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="h-11 rounded-2xl px-4"
                variant="outline"
                onClick={() => void handleCreateCard()}
                disabled={busy || !boardHasColumns}
              >
                <FilePlus2 className="h-4 w-4" />
                Novo card
              </Button>
              <Button
                className="h-11 rounded-2xl px-4"
                variant="outline"
                onClick={openCreateColumnDialog}
                disabled={busy || (isImportMode && !activeImportCard)}
              >
                <Columns3 className="h-4 w-4" />
                Criar coluna
              </Button>
            </div>

            {loading || (isImportMode && hydratingImportId === activeImportCard?.id && !visibleColumns.length) ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
                <div className="text-sm text-white/55">
                  {isImportMode ? "Montando o quadro importado..." : "Carregando Bobar..."}
                </div>
              </div>
            ) : visibleColumns.length ? (
              <div className="custom-scrollbar overflow-x-auto pb-4">
                <div className="flex min-w-max gap-5">
                  {visibleColumns.map((column) => (
                    <ColumnLane
                      key={column.id}
                      column={column}
                      selectedCardId={selectedCardId}
                      labelsById={labelsById}
                      onSelectCard={setSelectedCardId}
                      onCreateCard={(columnId) => void handleCreateCard(columnId)}
                      onRenameColumn={handleRenameColumn}
                      onDeleteColumn={handleDeleteColumn}
                      dragState={dragState}
                      dragOverColumnId={dragOverColumnId}
                      onStartDragCard={handleStartDragCard}
                      onEndDragCard={handleEndDragCard}
                      onDragColumn={(columnId) =>
                        setDragOverColumnId(columnId > 0 ? columnId : null)
                      }
                      onDropColumn={(columnId) => void handleDropColumn(columnId)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <EmptyState
                  title={isImportMode ? "Escolha um roteiro importado" : "Sem colunas ainda"}
                  description={
                    isImportMode
                      ? "Selecione um item em Importados para abrir a base no quadro."
                      : "Crie a primeira coluna para dar forma ao quadro."
                  }
                />
                <div className="flex justify-center">
                  <Button
                    className="h-12 rounded-2xl px-6"
                    onClick={isImportMode ? () => setActiveView("imports") : openCreateColumnDialog}
                  >
                    {isImportMode ? <Inbox className="h-4 w-4" /> : <Columns3 className="h-4 w-4" />}
                    {isImportMode ? "Ver importados" : "Criar primeira coluna"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 2xl:items-start 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card
            id="bobar-editor"
            variant="glass"
            className="self-start overflow-visible rounded-[2.2rem] border-cyan-400/10 bg-[#040914]"
          >
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Editor principal
                  </div>
                  <CardTitle className="mt-2 break-words text-3xl font-black text-white">
                    {selectedCard?.title || "Selecione um card"}
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-white/55">
                    {selectedCard
                      ? "Edite sem sair do quadro."
                      : "Selecione um card."}
                  </CardDescription>
                </div>

                {selectedCard ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
                        typeBadgeClasses(cardDraft?.card_type),
                      )}
                    >
                      {typeLabel(cardDraft?.card_type)}
                    </Badge>
                    <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
                      Atualizado {formatDate(selectedCard.updated_at)}
                    </Badge>
                    {hasPendingChanges ? (
                      <Badge className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                        Alterações pendentes
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {selectedCard && cardDraft ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <SelectField
                      label="Tipo do card"
                      value={String(cardDraft.card_type || "")}
                      options={cardTypeOptions}
                      onChange={handleCardTypeChange}
                    />

                    <SelectField
                      label="Template"
                      value={templateKey}
                      options={templateOptions}
                      placeholder="Escolha um template"
                      onChange={applyTemplateByKey}
                    />
                  </div>

                  {selectedTemplate ? (
                    <div className="rounded-[1.6rem] border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm leading-6 text-cyan-50/85">
                      <div className="font-semibold text-white">{selectedTemplate.label}</div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Título do card
                      </div>
                      <Input
                        value={cardDraft.title}
                        onChange={(event) =>
                          setCardDraft((current) =>
                            current ? { ...current, title: event.target.value } : current,
                          )
                        }
                        placeholder="Dê um nome claro para o card"
                        className="h-12 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
                      />
                    </div>

                    <SelectField
                      label="Coluna"
                      value={String(cardDraft.column_id)}
                      options={columnOptions}
                      onChange={(value) =>
                        setCardDraft((current) =>
                          current ? { ...current, column_id: Number(value) } : current,
                        )
                      }
                    />
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-3">
                      <DueDatePickerField
                        value={cardDraft.due_at}
                        onChange={handleDueDateChange}
                        onClear={clearDueDate}
                        invalid={dueDateIsInvalid}
                        overdue={selectedCardIsOverdue}
                      />

                      {dueDateIsInvalid ? (
                        <div className="flex items-center gap-2 rounded-[1.2rem] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                          <CircleAlert className="h-4 w-4" />
                          Data inválida encontrada no card. Limpe e selecione novamente no calendário.
                        </div>
                      ) : null}
                      {selectedCardIsOverdue ? (
                        <div className="flex items-center gap-2 rounded-[1.2rem] border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                          <AlertTriangle className="h-4 w-4" />
                          A data limite já passou. Esse card aparece em vermelho no quadro.
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Etiquetas selecionadas
                      </div>
                      <div className="min-h-12 rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-3">
                        {selectedCardLabels.length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedCardLabels.map((label) => (
                              <button
                                key={label.id}
                                type="button"
                                onClick={() => handleToggleCardLabel(label.id)}
                                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
                                style={{
                                  borderColor: `${label.color}55`,
                                  backgroundColor: `${label.color}22`,
                                  color: label.color,
                                }}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: label.color }}
                                />
                                {label.name}
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-white/45">
                            Nenhuma etiqueta aplicada neste card.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                          Etiquetas
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          Clique para aplicar ou remover no card atual.
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/50">
                        <Tags className="h-3.5 w-3.5" />
                        {(board?.labels || []).length} etiquetas
                      </div>
                    </div>

                    {(board?.labels || []).length ? (
                      <div className="flex flex-wrap gap-2">
                        {board?.labels.map((label) => {
                          const active = cardDraft.label_ids.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => handleToggleCardLabel(label.id)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition",
                                active ? "ring-2 ring-white/15" : "opacity-80 hover:opacity-100",
                              )}
                              style={{
                                borderColor: `${label.color}55`,
                                backgroundColor: active ? `${label.color}2c` : `${label.color}18`,
                                color: label.color,
                              }}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                              {active ? <Check className="h-3.5 w-3.5" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[1.4rem] border border-dashed border-white/10 px-4 py-4 text-sm text-white/45">
                        Crie etiquetas no painel lateral para começar a organizar os cards.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleUploadAttachments(event)}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                          Anexos
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          Preview real no card. Clique para ampliar imagem, PDF, vídeo, áudio ou texto.
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="h-11 rounded-2xl"
                        variant="outline"
                        onClick={handleOpenAttachmentPicker}
                        disabled={busy}
                      >
                        <Paperclip className="h-4 w-4" />
                        Anexar arquivo
                      </Button>
                    </div>

                    {selectedCard.attachments.length ? (
                      <div className="grid gap-4 xl:grid-cols-2">
                        {selectedCard.attachments.map((attachment) => (
                          <AttachmentPreviewTile
                            key={attachment.id}
                            attachment={attachment}
                            busy={busy}
                            loadPreview={loadAttachmentPreview}
                            onOpenPreview={handlePreviewAttachment}
                            onDownload={handleDownloadAttachment}
                            onDelete={handleDeleteAttachment}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[1.4rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">
                        Nenhum arquivo anexado ainda.
                      </div>
                    )}
                  </div>

                  {isFlowCard ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-4">
                      <Button className="h-11 rounded-2xl" onClick={openFlowEditor}>
                        <Pencil className="h-4 w-4" />
                        Editar fluxograma
                      </Button>

                      <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        {activeFlow?.nodes.length || 0} blocos
                      </Badge>

                      <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        {activeFlow?.edges.length || 0} conexões
                      </Badge>
                    </div>
                  ) : null}

                  {isFlowCard ? (
                    <Card variant="glass" className="rounded-[2rem] border-white/10 bg-[#06101f]">
                      <CardHeader className="gap-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                          Fluxograma em tela cheia
                        </div>
                        <CardTitle className="text-2xl font-black text-white">
                          Edite o fluxo fora do layout apertado
                        </CardTitle>
                        <CardDescription className="text-white/55">
                          O editor do fluxograma agora abre ocupando a tela toda, inclusive por
                          cima do menu lateral, com botão de voltar e todos os controles de edição.
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-5">
                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-4 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                              Blocos
                            </div>
                            <div className="mt-2 text-2xl font-black text-white">
                              {activeFlow?.nodes.length || 0}
                            </div>
                          </div>

                          <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-4 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                              Conexões
                            </div>
                            <div className="mt-2 text-2xl font-black text-white">
                              {activeFlow?.edges.length || 0}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <Button className="h-11 rounded-2xl" onClick={openFlowEditor}>
                            <Pencil className="h-4 w-4" />
                            Editar fluxograma
                          </Button>

                          {pendingConnectionNode ? (
                            <div className="rounded-[1.6rem] border border-cyan-400/15 bg-cyan-400/8 px-4 py-3 text-sm leading-6 text-cyan-50/85">
                              Conexão iniciada em <strong>{pendingConnectionNode.title}</strong>.
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ) : isChecklistCard ? (
                    <ChecklistEditor
                      items={checklistDraft}
                      summary={checklistSummary}
                      onToggleItem={handleChecklistItemToggle}
                      onChangeItemText={handleChecklistItemTextChange}
                      onAddItem={handleAddChecklistItem}
                      onRemoveItem={handleRemoveChecklistItem}
                      onClearCompleted={handleClearCompletedChecklistItems}
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Conteúdo do card
                      </div>
                      <Textarea
                        value={cardDraft.content_text}
                        onChange={(event) =>
                          setCardDraft((current) =>
                            current ? { ...current, content_text: event.target.value } : current,
                          )
                        }
                        placeholder="Escreva o conteúdo principal do card."
                        className="custom-scrollbar min-h-[320px] rounded-[1.8rem] border-cyan-400/15 bg-[#0a1225]"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                      Observações
                    </div>
                    <Textarea
                      value={cardDraft.note}
                      onChange={(event) =>
                        setCardDraft((current) =>
                          current ? { ...current, note: event.target.value } : current,
                        )
                      }
                      placeholder="Observações rápidas, responsáveis ou contexto do card."
                      className="custom-scrollbar min-h-[120px] rounded-[1.6rem] border-cyan-400/15 bg-[#0a1225]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="text-sm text-white/60">
                      {hasPendingChanges
                        ? "Alterações pendentes."
                        : "Sem alterações pendentes."}
                    </div>
                    <Button
                      className="h-12 rounded-2xl px-6"
                      onClick={() => void handleSaveCard()}
                      disabled={busy || !hasPendingChanges}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar card
                    </Button>
                  </div>
                </>              ) : (
                <EmptyState
                  title="Selecione um card"
                  description="Clique em um card para abrir o editor."
                />
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
              <CardHeader>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                  Etiquetas do quadro
                </div>
                <CardTitle className="text-3xl font-black text-white">Organização visual</CardTitle>
                <CardDescription className="text-white/55">
                  Crie, renomeie e troque a cor das etiquetas do quadro atual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                        Nova etiqueta
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        Nome curto, cor clara e tudo alinhado mesmo em telas menores.
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/50">
                      <Tags className="h-3.5 w-3.5" />
                      {(board?.labels || []).length} etiquetas
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_84px_auto]">
                    <Input
                      value={newLabelName}
                      onChange={(event) => setNewLabelName(event.target.value)}
                      placeholder="Nova etiqueta"
                      className="min-w-0 h-11 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
                    />
                    <Input
                      type="color"
                      value={newLabelColor}
                      onChange={(event) => setNewLabelColor(event.target.value)}
                      className="h-11 rounded-2xl border-cyan-400/20 bg-[#0a1225] p-2"
                    />
                    <Button
                      type="button"
                      className="h-11 rounded-2xl md:px-5"
                      onClick={() => void handleCreateLabel()}
                      disabled={busy || !newLabelName.trim()}
                    >
                      <Plus className="h-4 w-4" />
                      Criar
                    </Button>
                  </div>
                </div>

                {(board?.labels || []).length ? (
                  <div className="grid gap-3">
                    {board?.labels.map((label) => {
                      const draft = labelDrafts[label.id] || { name: label.name, color: label.color };
                      const isSaving = labelSavingIds.includes(label.id);
                      const isDeleting = labelDeletingIds.includes(label.id);

                      return (
                        <div
                          key={label.id}
                          className="group rounded-[1.45rem] border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.045]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
                              style={{
                                borderColor: `${draft.color}55`,
                                backgroundColor: `${draft.color}22`,
                                color: draft.color,
                              }}
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: draft.color }}
                              />
                              <span className="truncate">{draft.name || "Etiqueta sem nome"}</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => void handleDeleteLabel(label)}
                              disabled={isDeleting}
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-white/35 transition",
                                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-100",
                                isDeleting && "cursor-not-allowed opacity-100 text-white/20",
                              )}
                              aria-label={`Excluir etiqueta ${label.name}`}
                              title="Excluir etiqueta"
                            >
                              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_88px]">
                            <Input
                              value={draft.name}
                              onChange={(event) =>
                                updateLabelDraft(label, {
                                  ...draft,
                                  name: event.target.value,
                                })
                              }
                              onBlur={() => handleLabelDraftBlur(label)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  (event.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              className="min-w-0 h-10 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
                            />
                            <Input
                              type="color"
                              value={draft.color}
                              onChange={(event) =>
                                updateLabelDraft(label, {
                                  ...draft,
                                  color: event.target.value,
                                })
                              }
                              onBlur={() => handleLabelDraftBlur(label)}
                              className="h-10 rounded-2xl border-cyan-400/20 bg-[#0a1225] p-2"
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/40">
                            <span>Salvamento automático.</span>
                            <span className={cn("transition", isSaving ? "text-cyan-100" : "text-white/30")}>
                              {isSaving ? "Salvando..." : "Salvo automaticamente"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="Sem etiquetas ainda"
                    description="Crie a primeira etiqueta para começar a classificar seus cards."
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
              <CardHeader>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                  Últimos cards
                </div>
                <CardTitle className="text-3xl font-black text-white">Retome rápido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentCards.length ? (
                  recentCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className={cn(
                        "w-full rounded-[1.4rem] border px-4 py-3 text-left transition",
                        selectedCardId === card.id
                          ? "border-cyan-300/50 bg-cyan-400/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium text-white">
                            {card.title}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {typeLabel(card.card_type)} · {formatDate(card.updated_at)}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-white/35" />
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState
                    title="Sem cards recentes"
                    description="Quando houver edição recente, ela aparece aqui."
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
              <CardHeader>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                  Contexto do card
                </div>
                <CardTitle className="text-3xl font-black text-white">Resumo rápido</CardTitle>
                <CardDescription className="text-white/55">
                  Contexto, prazo, etiquetas e ações sem repetir o editor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedCard ? (
                  <>
                    <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                          <FolderKanban className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="break-words text-base font-semibold text-white">
                            {selectedCard.title}
                          </div>
                          <div className="text-sm text-white/45">
                            {typeLabel(cardDraft?.card_type)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <InfoRow label="Quadro" value={board?.title || "—"} emphasized />
                        <InfoRow label="Coluna" value={selectedColumn?.name || "—"} emphasized />
                        <InfoRow label="Origem" value={selectedCard.source_label || "Manual"} />
                        <InfoRow
                          label="Última atualização"
                          value={formatDate(selectedCard.updated_at)}
                        />
                        <InfoRow
                          label="Prazo"
                          value={
                            selectedCard.due_at ? (
                              <span className={cn("font-medium", selectedCardIsOverdue && "text-red-100")}>
                                {formatDate(selectedCard.due_at)}
                              </span>
                            ) : (
                              "Sem prazo"
                            )
                          }
                        />
                        <InfoRow
                          label="Etiquetas"
                          value={
                            selectedCardLabels.length ? (
                              <span className="text-right">
                                {selectedCardLabels.map((label) => label.name).join(", ")}
                              </span>
                            ) : (
                              "Nenhuma"
                            )
                          }
                        />
                        <InfoRow
                          label="Anexos"
                          value={`${selectedCard.attachments.length} ${selectedCard.attachments.length === 1 ? "arquivo" : "arquivos"}`}
                        />
                        <InfoRow
                          label="Status"
                          value={
                            hasPendingChanges ? (
                              <span className="font-semibold text-amber-100">
                                Alterações pendentes
                              </span>
                            ) : selectedCardIsOverdue ? (
                              <span className="font-semibold text-red-100">Atrasado</span>
                            ) : (
                              <span className="font-semibold text-emerald-100">Sem pendências</span>
                            )
                          }
                        />
                        {String(cardDraft?.card_type || "").toLowerCase() === "checklist" ? (
                          <InfoRow
                            label="Checklist"
                            value={`${checklistSummary.checked}/${checklistSummary.total} concluídos`}
                          />
                        ) : null}
                        {String(cardDraft?.card_type || "").toLowerCase() === "fluxograma" ? (
                          <InfoRow
                            label="Estrutura"
                            value={`${(flowDraft || parseFlowchart(selectedCard.structure_json, selectedCard.title, selectedCard.content_text)).nodes.length} blocos`}
                          />
                        ) : null}
                      </div>
                    </div>

                    {selectedCardIsOverdue ? (
                      <div className="flex items-center gap-2 rounded-[1.6rem] border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        <AlertTriangle className="h-4 w-4" />
                        Esse card está atrasado e o quadro sinaliza isso em vermelho.
                      </div>
                    ) : null}

                    <div className="grid gap-3">
                      <Button
                        className="h-11 rounded-2xl"
                        onClick={() => void handleSaveCard()}
                        disabled={busy || !hasPendingChanges}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar card
                      </Button>
                      <Button
                        className="h-11 rounded-2xl"
                        variant="outline"
                        onClick={handleExportText}
                      >
                        <FilePlus2 className="h-4 w-4" />
                        Exportar texto
                      </Button>
                      <Button
                        className="h-11 rounded-2xl text-red-200 hover:text-red-100"
                        variant="outline"
                        onClick={openDeleteSelectedCardDialog}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir card
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Nenhum card aberto"
                    description="Selecione um card para ver contexto e ações."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {board ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
            <CardHeader>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                Compartilhamento do quadro
              </div>
              <CardTitle className="text-3xl font-black text-white">Acesso e membros</CardTitle>
              <CardDescription className="text-white/55">
                Compartilhe por link com quem já tem conta e acompanhe quem pode acessar esse quadro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {collaboration?.can_manage_access ? "Você gerencia esse acesso" : "Quadro compartilhado"}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/55">
                    <Users className="h-3.5 w-3.5" />
                    {collaboration?.members.length || 0} pessoas
                  </div>
                </div>

                {collaboration?.can_manage_access ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-[1.3rem] border border-white/10 bg-[#07101f] p-3 text-sm text-white/70">
                      {shareLink?.token ? (
                        <div className="break-all">
                          {`${window.location.origin}/bobar?share=${shareLink.token}`}
                        </div>
                      ) : (
                        <div>Gere um link para convidar outra pessoa que já tenha conta no site.</div>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button
                        className="h-11 rounded-2xl"
                        onClick={() =>
                          shareLink?.token ? void handleCopyShareLink(shareLink.token) : void handleCreateShareLink()
                        }
                        disabled={shareBusy || busy}
                      >
                        {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        {shareLink?.token ? "Copiar link" : "Gerar link"}
                      </Button>
                      <Button
                        className="h-11 rounded-2xl"
                        variant="outline"
                        onClick={() => void handleRevokeShareLink()}
                        disabled={shareBusy || busy || !shareLink?.token}
                      >
                        <Unlink className="h-4 w-4" />
                        Revogar link
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-[#07101f] p-3 text-sm text-white/70">
                    Você pode editar o quadro e conversar no projeto, mas apenas o dono gerencia o link e os acessos.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {(collaboration?.members || []).length ? (
                  collaboration?.members.map((member) => {
                    const displayName =
                      member.full_name?.trim() || member.email.split("@")[0] || "Usuário";
                    const isCurrentUser = currentUser?.email === member.email;

                    return (
                      <div
                        key={member.user_id}
                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                              <Badge
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                  member.is_owner
                                    ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                                    : "border-white/10 bg-white/[0.06] text-white/70",
                                )}
                              >
                                {member.is_owner ? "Dono" : member.role}
                              </Badge>
                              {isCurrentUser ? (
                                <Badge className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                                  Você
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-white/45">{member.email}</div>
                            <div className="mt-2 text-xs text-white/40">
                              Entrou em {formatDate(member.joined_at)}
                            </div>
                          </div>

                          {collaboration?.can_manage_access && !member.is_owner ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 rounded-2xl"
                              onClick={() => void handleRemoveMember(member.user_id, displayName)}
                              disabled={shareBusy}
                              aria-label={`Remover acesso de ${displayName}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    title="Sem membros ainda"
                    description="Quando alguém confirmar o link, o acesso aparece aqui."
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Colaboração em tempo real
                  </div>
                  <CardTitle className="text-3xl font-black text-white">Chat e atividade</CardTitle>
                  <CardDescription className="text-white/55">
                    Mensagens entre quem está no quadro e histórico do que foi feito. Atualização automática a cada 3 segundos.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-2xl px-4"
                  onClick={() => {
                    void loadCollaboration(board.id);
                    if (!hasPendingChanges) {
                      void refreshBoardSilently(board.id, selectedCardId);
                    }
                  }}
                  disabled={collaborationLoading || shareBusy}
                >
                  {collaborationLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Atualizar agora
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <MessageSquare className="h-4 w-4 text-cyan-200" />
                    Chat do projeto
                  </div>

                  <div className="custom-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-1">
                    {(collaboration?.chat_messages || []).length ? (
                      collaboration?.chat_messages.map((message) => {
                        const mine = currentUser?.email === message.user_email;
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "rounded-[1.3rem] border px-4 py-3",
                              mine
                                ? "ml-auto border-cyan-400/20 bg-cyan-400/10"
                                : "border-white/10 bg-[#07101f]",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                                {message.user_name || message.user_email}
                              </div>
                              <div className="text-[11px] text-white/35">{formatDate(message.created_at)}</div>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap break-words text-sm text-white/82">
                              {message.message}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[1.3rem] border border-white/10 bg-[#07101f] px-4 py-8 text-center text-sm text-white/50">
                        Nenhuma mensagem ainda. Use o campo abaixo para começar o chat do projeto.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Textarea
                      value={chatMessageDraft}
                      onChange={(event) => setChatMessageDraft(event.target.value)}
                      placeholder="Escreva uma mensagem para quem está colaborando nesse quadro..."
                      className="min-h-[88px] rounded-[1.6rem] border-cyan-400/20 bg-[#0a1225]"
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.preventDefault();
                          void handleSendProjectMessage();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-auto min-h-[88px] rounded-[1.6rem] px-5"
                      onClick={() => void handleSendProjectMessage()}
                      disabled={shareBusy || !chatMessageDraft.trim()}
                    >
                      {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Enviar
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <Clock3 className="h-4 w-4 text-cyan-200" />
                    Log do projeto
                  </div>

                  <div className="custom-scrollbar max-h-[460px] space-y-3 overflow-y-auto pr-1">
                    {(collaboration?.activities || []).length ? (
                      collaboration?.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-[1.3rem] border border-white/10 bg-[#07101f] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                              {activity.actor_name || activity.actor_email || "Sistema"}
                            </div>
                            <div className="text-[11px] text-white/35">{formatDate(activity.created_at)}</div>
                          </div>
                          <div className="mt-2 break-words text-sm text-white/80">{activity.message}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[1.3rem] border border-white/10 bg-[#07101f] px-4 py-8 text-center text-sm text-white/50">
                        O histórico de ações aparece aqui conforme alguém mexe no quadro.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {sharePreview ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              const params = new URLSearchParams(location.search);
              params.delete("share");
              navigate(
                {
                  pathname: location.pathname,
                  search: params.toString() ? `?${params.toString()}` : "",
                },
                { replace: true },
              );
              setSharePreview(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <Link2 className="h-3.5 w-3.5" />
                Quadro compartilhado
              </div>
              <DialogTitle>Confirmar acesso ao quadro</DialogTitle>
              <DialogDescription>
                Você está entrando em um quadro compartilhado. Depois de confirmar, ele vai aparecer na sua lista de quadros.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-[1.6rem] border border-white/10 bg-[#07101f] p-4">
              <InfoRow label="Quadro" value={<span className="font-medium text-white">{sharePreview.board_title}</span>} />
              <InfoRow
                label="Dono"
                value={
                  <span className="font-medium text-white">
                    {sharePreview.owner_name || sharePreview.owner_email}
                  </span>
                }
              />
              <InfoRow label="Membros" value={`${sharePreview.total_members} com acesso`} />
              <InfoRow
                label="Status"
                value={
                  sharePreview.already_has_access
                    ? "Você já tem acesso"
                    : sharePreview.is_active
                      ? "Link ativo"
                      : "Link indisponível"
                }
              />
            </div>

            <DialogFooter className="gap-3 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={() => {
                  const params = new URLSearchParams(location.search);
                  params.delete("share");
                  navigate(
                    {
                      pathname: location.pathname,
                      search: params.toString() ? `?${params.toString()}` : "",
                    },
                    { replace: true },
                  );
                  setSharePreview(null);
                }}
              >
                Fechar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl"
                onClick={() => void handleAcceptSharedBoard()}
                disabled={shareBusy || !sharePreview.can_accept}
              >
                {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {sharePreview.already_has_access ? "Você já acessa esse quadro" : "Confirmar acesso"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {flowEditorOverlay}

      <Dialog
        open={Boolean(boardDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setBoardDialog(null);
            setBoardNameDraft("");
          }
        }}
      >
        <DialogContent>
          <form className="space-y-5" onSubmit={handleSubmitBoardDialog}>
            <DialogHeader>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <FolderKanban className="h-3.5 w-3.5" />
                {boardDialog?.mode === "rename" ? "Estrutura do quadro" : "Novo quadro"}
              </div>
              <DialogTitle>
                {boardDialog?.mode === "rename" ? "Renomear quadro" : "Criar quadro"}
              </DialogTitle>
              <DialogDescription>
                {boardDialog?.mode === "rename"
                  ? "Use um nome direto para esse quadro. Isso melhora navegação quando houver vários quadros."
                  : "Crie quantos quadros precisar. Cada quadro terá suas próprias colunas, etiquetas, cards e anexos."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Nome do quadro
              </div>
              <Input
                value={boardNameDraft}
                onChange={(event) => setBoardNameDraft(event.target.value)}
                placeholder="Ex.: Operação comercial"
                autoFocus
                className="h-12 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={() => setBoardDialog(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-11 rounded-2xl"
                disabled={busy || !boardNameDraft.trim()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {boardDialog?.mode === "rename" ? "Salvar nome" : "Criar quadro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(columnDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setColumnDialog(null);
            setColumnNameDraft("");
          }
        }}
      >
        <DialogContent>
          <form className="space-y-5" onSubmit={handleSubmitColumnDialog}>
            <DialogHeader>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <Columns3 className="h-3.5 w-3.5" />
                {columnDialog?.mode === "rename" ? "Editar estrutura" : "Nova estrutura"}
              </div>
              <DialogTitle>
                {columnDialog?.mode === "rename" ? "Renomear coluna" : "Criar coluna"}
              </DialogTitle>
              <DialogDescription>
                {columnDialog?.mode === "rename"
                  ? "Use um nome direto e previsível. Isso melhora a leitura do quadro para qualquer pessoa que entrar depois."
                  : "Crie uma coluna com nome objetivo. Bons exemplos: Entrada, Em produção, Revisão, Publicado."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Nome da coluna
              </div>
              <Input
                value={columnNameDraft}
                onChange={(event) => setColumnNameDraft(event.target.value)}
                placeholder="Ex.: Em produção"
                autoFocus
                className="h-12 rounded-2xl border-cyan-400/20 bg-[#0a1225]"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={() => setColumnDialog(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-11 rounded-2xl"
                disabled={busy || !columnNameDraft.trim()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {columnDialog?.mode === "rename" ? "Salvar nome" : "Criar coluna"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(attachmentPreview)}
        onOpenChange={(open) => {
          if (!open) setAttachmentPreview(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{attachmentPreview?.attachment.filename || "Preview do anexo"}</DialogTitle>
            <DialogDescription>
              {attachmentPreview
                ? `${formatFileSize(attachmentPreview.attachment.size_bytes)} · ${attachmentPreview.attachment.mime_type || "arquivo"}`
                : "Abra arquivos anexados diretamente no card."}
            </DialogDescription>
          </DialogHeader>

          {attachmentPreview ? (
            <div className="max-h-[75vh] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#020617]">
              {attachmentPreview.kind === "image" ? (
                <img
                  src={attachmentPreview.url}
                  alt={attachmentPreview.attachment.filename}
                  className="max-h-[75vh] w-full object-contain"
                />
              ) : attachmentPreview.kind === "pdf" ? (
                <iframe
                  src={attachmentPreview.url}
                  title={attachmentPreview.attachment.filename}
                  className="h-[75vh] w-full bg-white"
                />
              ) : attachmentPreview.kind === "video" ? (
                <video src={attachmentPreview.url} controls className="max-h-[75vh] w-full" />
              ) : attachmentPreview.kind === "audio" ? (
                <div className="flex h-[220px] items-center justify-center p-8">
                  <audio src={attachmentPreview.url} controls className="w-full" />
                </div>
              ) : attachmentPreview.kind === "text" ? (
                <div className="max-h-[75vh] overflow-auto p-6">
                  <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-white/80">
                    {String(attachmentPreview.textContent || "").trim() || "Arquivo sem conteúdo legível."}
                  </pre>
                </div>
              ) : (
                <div className="flex h-[240px] items-center justify-center px-6 text-center text-sm text-white/55">
                  Esse tipo de arquivo não possui preview embutido. Use o botão de download no card.
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteDialog)} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100">
              <CircleAlert className="h-3.5 w-3.5" />
              Ação destrutiva
            </div>
            <DialogTitle>
              {deleteDialog?.type === "board"
                ? "Excluir quadro"
                : deleteDialog?.type === "column"
                  ? "Excluir coluna"
                  : "Excluir card"}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog?.type === "board"
                ? `O quadro "${deleteDialog.board.title}" será excluído com todas as colunas, cards, etiquetas e anexos vinculados.`
                : deleteDialog?.type === "column"
                  ? `A coluna "${deleteDialog.column.name}" será removida. Os cards serão movidos automaticamente para outra coluna pelo backend.`
                  : `O card "${deleteDialog?.type === "card" ? deleteDialog.card.title : ""}" será excluído permanentemente.`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
            {deleteDialog?.type === "board"
              ? "Essa ação remove todo o conteúdo do quadro atual. Use apenas quando tiver certeza."
              : "Confirme apenas se tiver certeza. A interface foi ajustada para evitar pop-ups nativos e deixar essa decisão mais clara."}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={() => setDeleteDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 rounded-2xl"
              onClick={() => void handleConfirmDelete()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Confirmar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>    </div>
  );
}
