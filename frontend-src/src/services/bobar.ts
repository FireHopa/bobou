import { API_BASE_URL } from "@/constants/app";
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

export type BobarAttachment = {
  id: number;
  card_id: number;
  filename: string;
  mime_type?: string | null;
  size_bytes: number;
  created_at: string;
};

export type BobarLabel = {
  id: number;
  name: string;
  color: string;
  position: number;
};

export type BobarCard = {
  id: number;
  board_id: number;
  column_id: number;
  title: string;
  card_type: BobarCardType | string;
  source_kind?: string | null;
  source_label?: string | null;
  content_text: string;
  note: string;
  position: number;
  structure_json: string;
  due_at?: string | null;
  label_ids: number[];
  attachments: BobarAttachment[];
  created_at: string;
  updated_at: string;
};

export type BobarColumn = {
  id: number;
  board_id: number;
  name: string;
  position: number;
  cards: BobarCard[];
};

export type BobarBoard = {
  id: number;
  title: string;
  total_cards: number;
  labels: BobarLabel[];
  columns: BobarColumn[];
};

export type BobarBoardSummary = {
  id: number;
  title: string;
  position: number;
  total_cards: number;
  updated_at: string;
  is_owner: boolean;
  owner_name?: string | null;
  owner_email?: string | null;
  access_role: "owner" | "editor" | "viewer";
  can_edit: boolean;
};

export type BobarBoardList = {
  boards: BobarBoardSummary[];
};

export type BobarBoardMember = {
  user_id: number;
  email: string;
  full_name?: string | null;
  role: string;
  is_owner: boolean;
  joined_at: string;
};

export type BobarBoardInvite = {
  id: number;
  token: string;
  role: "editor" | "viewer";
  max_uses?: number | null;
  uses_count: number;
  remaining_uses?: number | null;
  is_active: boolean;
  created_at: string;
  revoked_at?: string | null;
};

export type BobarBoardActivity = {
  id: number;
  board_id: number;
  actor_user_id?: number | null;
  actor_name?: string | null;
  actor_email?: string | null;
  event_type: string;
  message: string;
  created_at: string;
};

export type BobarBoardChatMessage = {
  id: number;
  board_id: number;
  user_id: number;
  user_name?: string | null;
  user_email: string;
  message: string;
  created_at: string;
};

export type BobarBoardCollaboration = {
  board_id: number;
  can_manage_access: boolean;
  can_edit: boolean;
  current_user_role: "owner" | "editor" | "viewer";
  members: BobarBoardMember[];
  invite?: BobarBoardInvite | null;
  invites: BobarBoardInvite[];
  activities: BobarBoardActivity[];
  chat_messages: BobarBoardChatMessage[];
};

export type BobarBoardSharePreview = {
  token: string;
  board_id: number;
  board_title: string;
  owner_name?: string | null;
  owner_email: string;
  role: "editor" | "viewer";
  max_uses?: number | null;
  uses_count: number;
  remaining_uses?: number | null;
  already_has_access: boolean;
  can_accept: boolean;
  is_active: boolean;
  total_members: number;
};

export type BobarBoardShareAccept = {
  board_id: number;
  role: "owner" | "editor" | "viewer";
};

export type CreateBobarBoardShareLinkIn = {
  role: "editor" | "viewer";
  max_uses?: number | null;
};

export type CreateBobarBoardIn = {
  title: string;
};

export type UpdateBobarBoardIn = {
  title: string;
};

export type CreateBobarLabelIn = {
  name: string;
  color?: string | null;
};

export type UpdateBobarLabelIn = {
  name?: string;
  color?: string | null;
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
  due_at?: string | null;
  label_ids?: number[];
};

export type UpdateBobarCardIn = {
  title?: string;
  note?: string;
  content_text?: string;
  card_type?: string;
  column_id?: number;
  structure_json?: string;
  due_at?: string | null;
  label_ids?: number[];
};

export type MoveBobarCardIn = {
  column_id: number;
  position: number;
};

function authHeaders() {
  const headers = new Headers();
  const authStorageStr = localStorage.getItem("auth-store");
  if (!authStorageStr) return headers;

  try {
    const authData = JSON.parse(authStorageStr);
    const token = authData?.state?.token;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // noop
  }

  return headers;
}

function withBoardQuery(path: string, boardId?: number | null) {
  if (!boardId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}board_id=${boardId}`;
}

export const bobarService = {
  boards: () => http<BobarBoardList>("/api/bobar/boards"),

  createBoard: (payload: CreateBobarBoardIn) =>
    http<BobarBoardList>("/api/bobar/boards", { method: "POST", json: payload }),

  renameBoard: (boardId: number, payload: UpdateBobarBoardIn) =>
    http<BobarBoardList>(`/api/bobar/boards/${boardId}`, { method: "PATCH", json: payload }),

  deleteBoard: (boardId: number) =>
    http<BobarBoardList>(`/api/bobar/boards/${boardId}`, { method: "DELETE" }),

  board: (boardId?: number | null) => http<BobarBoard>(withBoardQuery("/api/bobar", boardId)),

  createLabel: (payload: CreateBobarLabelIn, boardId?: number | null) =>
    http<BobarBoard>(withBoardQuery("/api/bobar/labels", boardId), { method: "POST", json: payload }),

  updateLabel: (labelId: number, payload: UpdateBobarLabelIn) =>
    http<BobarBoard>(`/api/bobar/labels/${labelId}`, { method: "PATCH", json: payload }),

  deleteLabel: (labelId: number) =>
    http<BobarBoard>(`/api/bobar/labels/${labelId}`, { method: "DELETE" }),

  createColumn: (payload: CreateBobarColumnIn, boardId?: number | null) =>
    http<BobarBoard>(withBoardQuery("/api/bobar/columns", boardId), { method: "POST", json: payload }),

  renameColumn: (columnId: number, payload: { name: string }) =>
    http<BobarBoard>(`/api/bobar/columns/${columnId}`, { method: "PATCH", json: payload }),

  deleteColumn: (columnId: number) =>
    http<BobarBoard>(`/api/bobar/columns/${columnId}`, { method: "DELETE" }),

  createCard: (payload: CreateBobarCardIn, boardId?: number | null) =>
    http<BobarBoard>(withBoardQuery("/api/bobar/cards", boardId), { method: "POST", json: payload }),

  importCard: (payload: CreateBobarCardIn, boardId?: number | null) =>
    http<BobarBoard>(withBoardQuery("/api/bobar/cards/import", boardId), { method: "POST", json: payload }),

  cleanupImportDuplicates: (importCardId: number) =>
    http<BobarBoard>(`/api/bobar/imports/${importCardId}/cleanup-duplicates`, { method: "POST" }),

  updateCard: (cardId: number, payload: UpdateBobarCardIn) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}`, { method: "PATCH", json: payload }),

  moveCard: (cardId: number, payload: MoveBobarCardIn) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}/move`, { method: "POST", json: payload }),

  transformToFlowchart: (cardId: number) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}/transform-to-flowchart`, { method: "POST" }),

  uploadAttachment: async (cardId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE_URL}/api/bobar/cards/${cardId}/attachments`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Falha ao anexar arquivo.");
    }

    return (await res.json()) as BobarBoard;
  },

  deleteAttachment: (attachmentId: number) =>
    http<BobarBoard>(`/api/bobar/attachments/${attachmentId}`, { method: "DELETE" }),

  fetchAttachmentBlob: async (attachmentId: number) => {
    const res = await fetch(`${API_BASE_URL}/api/bobar/attachments/${attachmentId}/content`, {
      headers: authHeaders(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Falha ao carregar anexo.");
    }

    return await res.blob();
  },

  deleteCard: (cardId: number) =>
    http<BobarBoard>(`/api/bobar/cards/${cardId}`, { method: "DELETE" }),

  collaboration: (boardId: number, params?: { activityLimit?: number; chatLimit?: number }) => {
    const search = new URLSearchParams();
    if (params?.activityLimit) search.set("activity_limit", String(params.activityLimit));
    if (params?.chatLimit) search.set("chat_limit", String(params.chatLimit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return http<BobarBoardCollaboration>(`/api/bobar/boards/${boardId}/collaboration${suffix}`);
  },

  createShareLink: (boardId: number, payload: CreateBobarBoardShareLinkIn) =>
    http<BobarBoardInvite>(`/api/bobar/boards/${boardId}/share-link`, { method: "POST", json: payload }),

  revokeShareLink: (boardId: number, inviteId: number) =>
    http<BobarBoardInvite>(`/api/bobar/boards/${boardId}/share-links/${inviteId}/revoke`, { method: "POST" }),

  sharePreview: (token: string) =>
    http<BobarBoardSharePreview>(`/api/bobar/share/${encodeURIComponent(token)}`),

  acceptShare: (token: string) =>
    http<BobarBoardShareAccept>(`/api/bobar/share/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),

  removeMember: (boardId: number, userId: number) =>
    http<BobarBoardCollaboration>(`/api/bobar/boards/${boardId}/members/${userId}`, {
      method: "DELETE",
    }),

  sendChatMessage: (boardId: number, payload: { message: string }) =>
    http<BobarBoardCollaboration>(`/api/bobar/boards/${boardId}/chat-messages`, {
      method: "POST",
      json: payload,
    }),
};
