import { http } from "@/services/http";

export type BobarCardType =
  | "manual"
  | "roteiro"
  | "conteudo"
  | "ideia"
  | "checklist"
  | "fluxograma";

export type BobarFlowNode = {
  id: string;
  title: string;
  content: string;
  time?: string;
  kind?: string;
  x: number;
  y: number;
};

export type BobarFlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type BobarFlowMeta = {
  templateKey?: string | null;
  zoom?: number;
  grid?: number;
};

export type BobarFlowchart = {
  nodes: BobarFlowNode[];
  edges: BobarFlowEdge[];
  meta?: BobarFlowMeta;
};

export type BobarCard = {
  id: number;
  column_id: number;
  title: string;
  card_type: BobarCardType | string;
  source_kind?: string | null;
  source_label?: string | null;
  content_text: string;
  note: string;
  position: number;
  structure_json: string;
  created_at: string;
  updated_at: string;
};

export type BobarColumn = {
  id: number;
  name: string;
  position: number;
  cards: BobarCard[];
};

export type BobarBoard = {
  title: string;
  total_cards: number;
  columns: BobarColumn[];
};

export type CreateBobarColumnIn = {
  name: string;
};

export type CreateBobarCardIn = {
  column_id?: number | null;
  title?: string | null;
  note?: string;
  content_text?: string;
  card_type?: string | null;
  source_kind?: string | null;
  source_label?: string | null;
  structure_json?: string | null;
};

export type UpdateBobarCardIn = {
  title?: string;
  note?: string;
  content_text?: string;
  card_type?: string;
  column_id?: number;
  structure_json?: string;
};

export type MoveBobarCardIn = {
  column_id: number;
  position: number;
};

export const bobarService = {
  board: () => http<BobarBoard>("/api/bobar"),

  createColumn: (payload: CreateBobarColumnIn) =>
    http<BobarBoard>("/api/bobar/columns", { method: "POST", json: payload }),

  renameColumn: (columnId: number, payload: { name: string }) =>
    http<BobarBoard>(`/api/bobar/columns/${columnId}`, { method: "PATCH", json: payload }),

  deleteColumn: (columnId: number) =>
    http<BobarBoard>(`/api/bobar/columns/${columnId}`, { method: "DELETE" }),

  createCard: (payload: CreateBobarCardIn) =>
    http<BobarBoard>("/api/bobar/cards", { method: "POST", json: payload }),

  importCard: (payload: CreateBobarCardIn) =>
    http<BobarBoard>("/api/bobar/cards/import", { method: "POST", json: payload }),

  cleanupImportDuplicates: (importCardId: number) =>
    http<BobarBoard>(`/api/bobar/imports/${importCardId}/cleanup-duplicates`, { method: "POST" }),

  updateCard: (cardId: number, payload: UpdateBobarCardIn) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}`, { method: "PATCH", json: payload }),

  moveCard: (cardId: number, payload: MoveBobarCardIn) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}/move`, { method: "POST", json: payload }),

  transformToFlowchart: (cardId: number) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}/transform-to-flowchart`, { method: "POST" }),

  deleteCard: (cardId: number) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}`, { method: "DELETE" }),
};
