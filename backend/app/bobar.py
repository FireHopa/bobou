from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .db import get_session
from .deps import get_current_user
from .models import (
    BobarAttachment,
    BobarBoard,
    BobarBoardActivity,
    BobarBoardChatMessage,
    BobarBoardInvite,
    BobarBoardMember,
    BobarCard,
    BobarColumn,
    BobarLabel,
    User,
    utcnow,
)

router = APIRouter(prefix="/api/bobar", tags=["Bobar"])

DEFAULT_BOARD_TITLE = "Meu quadro"
DEFAULT_COLUMNS = ("Entrada", "Em produção", "Finalizados")
DEFAULT_LABEL_COLOR = "#22c55e"
LABEL_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
CARD_TYPES = {"manual", "roteiro", "conteudo", "ideia", "checklist", "fluxograma"}
ATTACHMENTS_ROOT = Path(__file__).resolve().parent.parent / "storage" / "bobar_attachments"
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024

AUTHORITY_IMPORT_SOURCE_PREFIXES = (
    "authority_agent_import:",
    "authority_agent:",
)
AUTHORITY_WORKSPACE_SOURCE_PREFIX = "authority_agent_workspace:"

IMPORTED_ROLE_SPECS = (
    {
        "key": "base_estrategica",
        "name": "Base estratégica",
        "titles": ("Análise do tema", "Estratégia do vídeo", "Formato do vídeo"),
    },
    {
        "key": "gancho_execucao",
        "name": "Gancho e execução",
        "titles": ("Hooks", "Roteiro segundo a segundo", "Variações"),
    },
    {
        "key": "apoio_publicacao",
        "name": "Apoio de publicação",
        "titles": ("Texto na tela", "Legenda"),
    },
)

TIME_RANGE_RE = re.compile(r"(?i)\b(\d+\s*(?:-|a|até|to)\s*\d+\s*s)\b")
TIME_SINGLE_RE = re.compile(r"(?i)\b(\d+\s*s)\b")


class BobarAttachmentOut(BaseModel):
    id: int
    card_id: int
    filename: str
    mime_type: Optional[str] = None
    size_bytes: int
    created_at: str


class BobarLabelOut(BaseModel):
    id: int
    name: str
    color: str
    position: int


class BobarCardOut(BaseModel):
    id: int
    board_id: int
    column_id: int
    title: str
    card_type: str
    source_kind: Optional[str] = None
    source_label: Optional[str] = None
    content_text: str
    note: str
    position: int
    structure_json: str
    due_at: Optional[str] = None
    label_ids: list[int] = Field(default_factory=list)
    attachments: list[BobarAttachmentOut] = Field(default_factory=list)
    is_hidden: bool = False
    hidden_at: Optional[str] = None
    is_archived: bool = False
    archived_at: Optional[str] = None
    assigned_user_id: Optional[int] = None
    created_at: str
    updated_at: str


class BobarColumnOut(BaseModel):
    id: int
    board_id: int
    name: str
    position: int
    cards: list[BobarCardOut]


class BobarBoardOut(BaseModel):
    id: int
    title: str
    total_cards: int
    labels: list[BobarLabelOut] = Field(default_factory=list)
    columns: list[BobarColumnOut]


class BobarBoardSummaryOut(BaseModel):
    id: int
    title: str
    position: int
    total_cards: int
    updated_at: str
    is_owner: bool = False
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    access_role: str = "owner"
    can_edit: bool = True


class BobarBoardListOut(BaseModel):
    boards: list[BobarBoardSummaryOut]


class BobarBoardCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class BobarBoardUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)


class BobarColumnCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class BobarColumnUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)


class BobarColumnMoveIn(BaseModel):
    position: int = Field(default=0, ge=0)


class BobarLabelCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: Optional[str] = Field(default=None, max_length=10)


class BobarLabelUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    color: Optional[str] = Field(default=None, max_length=10)


class BobarCardCreateIn(BaseModel):
    column_id: Optional[int] = None
    title: Optional[str] = Field(default=None, max_length=140)
    note: str = Field(default="", max_length=5000)
    content_text: str = Field(default="", max_length=200000)
    card_type: Optional[str] = Field(default=None, max_length=40)
    source_kind: Optional[str] = Field(default=None, max_length=60)
    source_label: Optional[str] = Field(default=None, max_length=120)
    structure_json: Optional[str] = Field(default=None, max_length=500000)
    due_at: Optional[str] = Field(default=None, max_length=60)
    label_ids: list[int] = Field(default_factory=list)
    is_hidden: bool = False
    is_archived: bool = False
    assigned_user_id: Optional[int] = None


class BobarCardUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=140)
    note: Optional[str] = Field(default=None, max_length=5000)
    content_text: Optional[str] = Field(default=None, max_length=200000)
    card_type: Optional[str] = Field(default=None, max_length=40)
    column_id: Optional[int] = None
    structure_json: Optional[str] = Field(default=None, max_length=500000)
    due_at: Optional[str] = Field(default=None, max_length=60)
    label_ids: Optional[list[int]] = None
    is_hidden: Optional[bool] = None
    is_archived: Optional[bool] = None
    assigned_user_id: Optional[int] = None


class BobarCardMoveIn(BaseModel):
    column_id: int
    position: int = Field(default=0, ge=0)


class BobarBoardMemberOut(BaseModel):
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_owner: bool = False
    joined_at: str


class BobarBoardInviteOut(BaseModel):
    id: int
    token: str
    role: str
    max_uses: Optional[int] = None
    uses_count: int = 0
    remaining_uses: Optional[int] = None
    is_active: bool
    created_at: str
    revoked_at: Optional[str] = None


class BobarBoardActivityOut(BaseModel):
    id: int
    board_id: int
    actor_user_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_email: Optional[str] = None
    event_type: str
    message: str
    created_at: str


class BobarBoardChatMessageOut(BaseModel):
    id: int
    board_id: int
    user_id: int
    user_name: Optional[str] = None
    user_email: str
    message: str
    created_at: str


class BobarBoardCollaborationOut(BaseModel):
    board_id: int
    can_manage_access: bool = False
    can_edit: bool = False
    current_user_role: str = "viewer"
    members: list[BobarBoardMemberOut] = Field(default_factory=list)
    invite: Optional[BobarBoardInviteOut] = None
    invites: list[BobarBoardInviteOut] = Field(default_factory=list)
    activities: list[BobarBoardActivityOut] = Field(default_factory=list)
    chat_messages: list[BobarBoardChatMessageOut] = Field(default_factory=list)


class BobarBoardSharePreviewOut(BaseModel):
    token: str
    board_id: int
    board_title: str
    owner_name: Optional[str] = None
    owner_email: str
    role: str = "editor"
    max_uses: Optional[int] = None
    uses_count: int = 0
    remaining_uses: Optional[int] = None
    already_has_access: bool = False
    can_accept: bool = False
    is_active: bool = False
    total_members: int = 0


class BobarBoardShareAcceptOut(BaseModel):
    board_id: int
    role: str = "viewer"


class BobarBoardCreateShareLinkIn(BaseModel):
    role: str = Field(default="editor", max_length=20)
    max_uses: Optional[int] = Field(default=None, ge=1, le=9999)


class BobarBoardChatMessageIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


def _clean_text(value: Optional[str]) -> str:
    return str(value or "").strip()


def _normalize_signature_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _canonical_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _canonical_json(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonical_json(item) for item in value]
    if isinstance(value, str):
        return value.strip()
    return value


def _is_authority_import_source_kind(source_kind: Optional[str]) -> bool:
    normalized = _clean_text(source_kind).lower()
    if normalized in {"authority_agent_import", "authority_agent"}:
        return True
    return any(normalized.startswith(prefix) for prefix in AUTHORITY_IMPORT_SOURCE_PREFIXES)


def _authority_workspace_source_kind(import_card_id: int) -> str:
    return f"{AUTHORITY_WORKSPACE_SOURCE_PREFIX}{int(import_card_id or 0)}"


def _extract_import_workspace_meta(structure_json: str) -> dict[str, Any]:
    parsed = _parse_json(structure_json or "")
    if not isinstance(parsed, dict):
        return {}

    payload = parsed.get("import_workspace")
    if not isinstance(payload, dict):
        return {}

    return payload


def _write_import_workspace_meta(
    structure_json: str,
    *,
    title: str,
    column_ids: list[int],
    created_at: Optional[str] = None,
) -> str:
    parsed = _parse_json(structure_json or "")
    root = parsed if isinstance(parsed, dict) else {}
    root["import_workspace"] = {
        "version": 1,
        "title": _clean_text(title) or "Roteiro importado",
        "column_ids": [int(item) for item in column_ids if int(item) > 0],
        "created_at": _clean_text(created_at) or utcnow().isoformat(),
    }
    return _json_dumps(root)


def _flowchart_semantic_signature(structure_json: str, fallback_title: str, fallback_content: str) -> dict[str, Any]:
    normalized = _normalize_flowchart_structure(structure_json or "{}", fallback_title, fallback_content)
    nodes = normalized.get("nodes") if isinstance(normalized, dict) else []
    semantic_nodes: list[dict[str, str]] = []

    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            semantic_nodes.append(
                {
                    "title": _clean_text(node.get("title")),
                    "content": _clean_text(node.get("content")),
                    "time": _clean_text(node.get("time")),
                    "kind": _clean_text(node.get("kind")),
                }
            )

    edges = normalized.get("edges") if isinstance(normalized, dict) else []
    return {
        "nodes": semantic_nodes,
        "edge_count": len(edges) if isinstance(edges, list) else 0,
    }


def _card_semantic_signature(card: BobarCard) -> str:
    payload: dict[str, Any] = {
        "title": _clean_text(card.title),
        "card_type": _clean_text(card.card_type).lower(),
        "content_text": _clean_text(card.content_text),
        "note": _clean_text(card.note),
    }

    if _clean_text(card.card_type).lower() == "fluxograma":
        payload["flow"] = _flowchart_semantic_signature(card.structure_json, card.title, card.content_text)
    else:
        structure = _parse_json(card.structure_json or "")
        payload["structure"] = _canonical_json(structure) if structure is not None else {}

    return _json_dumps(payload)


def _column_semantic_signature(column: BobarColumn, cards: list[BobarCard]) -> str:
    ordered_cards = sorted(cards, key=lambda item: (item.position, item.id or 0))
    payload = {
        "name": _clean_text(column.name),
        "cards": [_card_semantic_signature(card) for card in ordered_cards],
    }
    return _json_dumps(payload)


def _match_imported_role(column: BobarColumn, cards: list[BobarCard]) -> Optional[str]:
    normalized_name = _normalize_signature_text(column.name)
    title_set = {_normalize_signature_text(card.title) for card in cards if _clean_text(card.title)}

    for spec in IMPORTED_ROLE_SPECS:
        expected_name = _normalize_signature_text(spec["name"])
        expected_titles = {_normalize_signature_text(title) for title in spec["titles"]}
        if normalized_name == expected_name and title_set == expected_titles:
            return str(spec["key"])

    return None


def _column_rank_key(column: BobarColumn, cards: list[BobarCard], referenced_column_ids: set[int]) -> tuple[int, Any, int, int, int]:
    latest_update = max([column.updated_at, *[card.updated_at for card in cards]])
    return (
        1 if (column.id or 0) in referenced_column_ids else 0,
        latest_update,
        len(cards),
        -(column.position or 0),
        -(column.id or 0),
    )


def _card_rank_key(card: BobarCard) -> tuple[int, Any, int]:
    return (
        -(card.position or 0),
        card.updated_at,
        -(card.id or 0),
    )




def _clip(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "…"


def _parse_json(value: str):
    text = _clean_text(value)
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _extract_first_meaningful_line(text: str) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        line = re.sub(r"^[#>*\-\d.\)\s]+", "", line).strip()
        if line:
            return line
    return ""


def _derive_card_type(explicit_card_type: Optional[str], content_text: str) -> str:
    normalized = _clean_text(explicit_card_type).lower().replace(" ", "_")
    if normalized in CARD_TYPES:
        return normalized

    parsed = _parse_json(content_text)
    if isinstance(parsed, dict):
        if any(key in parsed for key in ("roteiro_segundo_a_segundo", "hooks", "legenda", "estrategia_do_video")):
            return "roteiro"
        if "blocos" in parsed:
            return "conteudo"
        if any(key in parsed for key in ("checklist", "passos", "steps")):
            return "checklist"

    lower = content_text.lower()
    if "hook" in lower or "roteiro" in lower or "legenda" in lower:
        return "roteiro"
    if "checklist" in lower:
        return "checklist"
    if content_text.strip():
        return "conteudo"
    return "manual"


def _derive_card_title(title: Optional[str], source_label: Optional[str], content_text: str) -> str:
    explicit = _clean_text(title)
    if explicit:
        return _clip(explicit, 140)

    parsed = _parse_json(content_text)
    if isinstance(parsed, dict):
        for key in (
            "titulo_da_tela",
            "title",
            "titulo",
            "headline",
            "tema",
            "assunto",
            "requested_task",
            "selected_theme",
        ):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return _clip(value.strip(), 140)

        hooks = parsed.get("hooks")
        if isinstance(hooks, list) and hooks:
            first_hook = _clean_text(hooks[0])
            if first_hook:
                return _clip(first_hook, 140)

    first_line = _extract_first_meaningful_line(content_text)
    if first_line:
        return _clip(first_line, 140)

    if _clean_text(source_label):
        return _clip(_clean_text(source_label), 140)

    return "Novo card"


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def _new_node_id() -> str:
    return f"node-{uuid.uuid4().hex[:10]}"


def _new_edge_id() -> str:
    return f"edge-{uuid.uuid4().hex[:10]}"


def _build_node(title: str, content: str, index: int, time_label: str = "", kind: str = "step") -> dict[str, Any]:
    safe_title = _clip(_clean_text(title) or f"Bloco {index + 1}", 80)
    safe_content = content.strip()
    return {
        "id": _new_node_id(),
        "title": safe_title,
        "content": safe_content,
        "time": _clip(_clean_text(time_label), 40),
        "kind": _clean_text(kind).lower() or "step",
        "x": 80 + (index * 280),
        "y": 90 + ((index % 2) * 180),
    }


def _normalize_node(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return _build_node(f"Bloco {index + 1}", "", index)

    title = _clip(_clean_text(raw.get("title") or raw.get("label") or raw.get("name") or f"Bloco {index + 1}"), 80)
    content = str(raw.get("content") or raw.get("description") or raw.get("text") or "").strip()
    time_label = _clip(_clean_text(raw.get("time") or raw.get("tempo")), 40)
    kind = _clean_text(raw.get("kind") or raw.get("type") or "step").lower() or "step"

    try:
        x = int(raw.get("x", 80 + (index * 280)))
    except Exception:
        x = 80 + (index * 280)

    try:
        y = int(raw.get("y", 90 + ((index % 2) * 180)))
    except Exception:
        y = 90 + ((index % 2) * 180)

    return {
        "id": _clean_text(raw.get("id")) or _new_node_id(),
        "title": title,
        "content": content,
        "time": time_label,
        "kind": kind,
        "x": max(0, x),
        "y": max(0, y),
    }


def _normalize_edge(raw: Any, valid_ids: set[str]) -> Optional[dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    source = _clean_text(raw.get("source"))
    target = _clean_text(raw.get("target"))
    if not source or not target:
        return None
    if source not in valid_ids or target not in valid_ids or source == target:
        return None

    return {
        "id": _clean_text(raw.get("id")) or _new_edge_id(),
        "source": source,
        "target": target,
        "label": _clip(_clean_text(raw.get("label")), 60),
    }


def _edges_from_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for index in range(len(nodes) - 1):
        edges.append(
            {
                "id": _new_edge_id(),
                "source": nodes[index]["id"],
                "target": nodes[index + 1]["id"],
                "label": "",
            }
        )
    return edges


def _build_nodes_from_script_json(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    index = 0

    hooks = parsed.get("hooks")
    if isinstance(hooks, list):
        for hook in hooks:
            hook_text = _clean_text(hook if isinstance(hook, str) else json.dumps(hook, ensure_ascii=False))
            if not hook_text:
                continue
            nodes.append(_build_node(f"Hook {len(nodes) + 1}", hook_text, index, kind="hook"))
            index += 1

    second_by_second = parsed.get("roteiro_segundo_a_segundo")
    if isinstance(second_by_second, list):
        for item in second_by_second:
            if isinstance(item, dict):
                time_label = _clean_text(item.get("tempo"))
                action = _clean_text(item.get("acao"))
                speech = _clean_text(item.get("fala"))
                title = time_label or f"Bloco {index + 1}"
                parts = []
                if action:
                    parts.append(f"Ação: {action}")
                if speech:
                    parts.append(f"Fala: {speech}")
                content = "\n\n".join(parts).strip() or json.dumps(item, ensure_ascii=False)
            else:
                time_label = ""
                title = f"Bloco {index + 1}"
                content = _clean_text(item if isinstance(item, str) else json.dumps(item, ensure_ascii=False))

            if content:
                nodes.append(_build_node(title, content, index, time_label=time_label, kind="timeline"))
                index += 1

    blocks = parsed.get("blocos")
    if isinstance(blocks, list) and not nodes:
        for block in blocks:
            if isinstance(block, dict):
                title = _clean_text(block.get("titulo") or block.get("title") or f"Bloco {index + 1}")
                content = _clean_text(block.get("conteudo") or block.get("content") or "")
            else:
                title = f"Bloco {index + 1}"
                content = _clean_text(str(block))
            if content or title:
                nodes.append(_build_node(title, content, index, kind="step"))
                index += 1

    screen_texts = parsed.get("texto_na_tela")
    if isinstance(screen_texts, list) and screen_texts:
        joined = "\n".join(_clean_text(item) for item in screen_texts if _clean_text(str(item)))
        if joined:
            nodes.append(_build_node("Texto na tela", joined, index, kind="support"))
            index += 1

    legend = _clean_text(parsed.get("legenda") if isinstance(parsed.get("legenda"), str) else "")
    if legend:
        nodes.append(_build_node("Legenda", legend, index, kind="cta"))

    return nodes


def _build_nodes_from_text(content_text: str) -> list[dict[str, Any]]:
    text = content_text.strip()
    if not text:
        return []

    lines = [line.rstrip() for line in text.splitlines()]
    segments: list[tuple[str, str]] = []
    buffer: list[str] = []
    current_time = ""

    def flush():
        nonlocal buffer, current_time
        body = "\n".join(part for part in buffer if part.strip()).strip()
        if body:
            segments.append((current_time, body))
        buffer = []
        current_time = ""

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if buffer:
                flush()
            continue

        time_match = TIME_RANGE_RE.search(line) or TIME_SINGLE_RE.search(line)
        starts_new_segment = bool(
            time_match
            or re.match(r"^(hook|abertura|cta|call to action|encerramento|cena|bloco)\b", line.lower())
            or re.match(r"^\d+[\).\-\:]", line)
        )

        if starts_new_segment and buffer:
            flush()

        if time_match:
            current_time = _clean_text(time_match.group(1)).replace(" ", "")

        buffer.append(line)

    if buffer:
        flush()

    if not segments:
        paragraphs = [chunk.strip() for chunk in re.split(r"\n\s*\n", text) if chunk.strip()]
        if not paragraphs:
            paragraphs = [line.strip() for line in lines if line.strip()]
        segments = [("", paragraph) for paragraph in paragraphs]

    nodes: list[dict[str, Any]] = []
    for index, (time_label, body) in enumerate(segments):
        first_line = _extract_first_meaningful_line(body)
        title = time_label or _clip(first_line or f"Bloco {index + 1}", 80)
        kind = "timeline" if time_label else "step"
        nodes.append(_build_node(title, body, index, time_label=time_label, kind=kind))
    return nodes


def _normalize_flowchart_structure(raw_structure: Any, title: str, content_text: str) -> dict[str, Any]:
    parsed = raw_structure
    if isinstance(raw_structure, str):
        parsed = _parse_json(raw_structure) or {}

    nodes: list[dict[str, Any]] = []
    if isinstance(parsed, dict):
        raw_nodes = parsed.get("nodes")
        if isinstance(raw_nodes, list):
            nodes = [_normalize_node(node, index) for index, node in enumerate(raw_nodes)]

    if not nodes:
        content_json = _parse_json(content_text)
        if isinstance(content_json, dict):
            nodes = _build_nodes_from_script_json(content_json)
        if not nodes:
            nodes = _build_nodes_from_text(content_text)

    if not nodes:
        nodes = [_build_node(title or "Início", content_text.strip(), 0, kind="step")]

    valid_ids = {node["id"] for node in nodes}
    edges: list[dict[str, Any]] = []
    if isinstance(parsed, dict):
        raw_edges = parsed.get("edges")
        if isinstance(raw_edges, list):
            edges = [edge for edge in (_normalize_edge(item, valid_ids) for item in raw_edges) if edge]

    if not edges and len(nodes) > 1:
        edges = _edges_from_nodes(nodes)

    return {
        "nodes": nodes,
        "edges": edges,
    }


def _resolve_structure_json(card_type: str, provided_structure_json: Optional[str], title: str, content_text: str) -> str:
    if (card_type or "").lower() == "fluxograma":
        normalized = _normalize_flowchart_structure(provided_structure_json or "{}", title, content_text)
        return _json_dumps(normalized)

    parsed = _parse_json(provided_structure_json or "")
    if parsed is None:
        return "{}"

    return _json_dumps(parsed)





def _parse_due_at(value: Optional[str]) -> Optional[Any]:
    raw = _clean_text(value)
    if not raw:
        return None

    normalized = raw.replace("Z", "+00:00")
    try:
        return __import__("datetime").datetime.fromisoformat(normalized)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Data limite inválida. Use um formato ISO válido.",
        )


def _normalize_label_color(value: Optional[str]) -> str:
    raw = _clean_text(value) or DEFAULT_LABEL_COLOR
    if not LABEL_COLOR_RE.match(raw):
        raise HTTPException(status_code=400, detail="Cor da etiqueta inválida.")
    if len(raw) == 4:
        raw = "#" + "".join(ch * 2 for ch in raw[1:])
    return raw.lower()


def _parse_label_ids_json(value: Optional[str]) -> list[int]:
    parsed = _parse_json(value or "[]")
    if not isinstance(parsed, list):
        return []
    result: list[int] = []
    seen: set[int] = set()
    for item in parsed:
        try:
            label_id = int(item)
        except Exception:
            continue
        if label_id > 0 and label_id not in seen:
            seen.add(label_id)
            result.append(label_id)
    return result


def _safe_filename(value: Optional[str]) -> str:
    name = os.path.basename(_clean_text(value) or "arquivo")
    name = re.sub(r"[^\w\-. ]+", "_", name).strip(" .")
    return name or "arquivo"


def _attachment_storage_dir(user_id: int, board_id: int, card_id: int) -> Path:
    path = ATTACHMENTS_ROOT / str(user_id) / str(board_id) / str(card_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _guess_extension(filename: str, mime_type: Optional[str]) -> str:
    suffix = Path(filename).suffix.strip()
    if suffix:
        return suffix
    guessed = mimetypes.guess_extension(mime_type or "")
    return guessed or ""


def _touch_board(board: BobarBoard) -> None:
    board.updated_at = utcnow()


def _display_user_name(user: User | None) -> str:
    if not user:
        return "Usuário"
    return _clean_text(user.full_name) or _clean_text(user.email).split("@")[0] or "Usuário"


def _get_board_owner_user(session: Session, board: BobarBoard) -> User:
    owner = session.get(User, board.user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Dono do quadro não encontrado.")
    return owner


def _get_board_membership(
    session: Session,
    board_id: int,
    user_id: int,
) -> BobarBoardMember | None:
    return session.exec(
        select(BobarBoardMember)
        .where(BobarBoardMember.board_id == board_id, BobarBoardMember.user_id == user_id)
        .order_by(BobarBoardMember.id.desc())
    ).first()


def _normalize_board_role(value: Optional[str]) -> str:
    role = _clean_text(value).lower()
    return role if role in {"editor", "viewer"} else "editor"


def _invite_remaining_uses(invite: BobarBoardInvite) -> Optional[int]:
    if invite.max_uses is None:
        return None
    return max(0, int(invite.max_uses or 0) - int(invite.uses_count or 0))


def _invite_is_usable(invite: BobarBoardInvite) -> bool:
    return bool(invite.is_active and (_invite_remaining_uses(invite) is None or _invite_remaining_uses(invite) > 0))


def _board_role_for_user(session: Session, board: BobarBoard, current_user: User) -> str:
    if board.user_id == current_user.id:
        return "owner"

    membership = _get_board_membership(session, board.id or 0, current_user.id)
    if not membership:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este quadro.")

    return _normalize_board_role(membership.role)


def _board_can_edit(session: Session, board: BobarBoard, current_user: User) -> bool:
    return _board_role_for_user(session, board, current_user) in {"owner", "editor"}


def _require_board_owner(board: BobarBoard, current_user: User) -> None:
    if board.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Somente o dono do quadro pode gerenciar este acesso.")


def _require_board_editor(session: Session, board: BobarBoard, current_user: User) -> str:
    role = _board_role_for_user(session, board, current_user)
    if role not in {"owner", "editor"}:
        raise HTTPException(status_code=403, detail="Esse quadro está em modo visualização para você.")
    return role


def _board_has_collaboration(session: Session, board: BobarBoard) -> bool:
    if not (board.id or 0):
        return False
    membership = session.exec(
        select(BobarBoardMember.id)
        .where(BobarBoardMember.board_id == (board.id or 0))
        .limit(1)
    ).first()
    return bool(membership)


def _board_assignable_user_ids(session: Session, board: BobarBoard) -> set[int]:
    owner_id = board.user_id or 0
    member_ids = session.exec(
        select(BobarBoardMember.user_id).where(BobarBoardMember.board_id == (board.id or 0))
    ).all()
    valid_ids = {owner_id}
    for member_id in member_ids:
        if member_id:
            valid_ids.add(member_id)
    return valid_ids


def _resolve_assigned_user_id(
    session: Session,
    board: BobarBoard,
    raw_user_id: Optional[int],
) -> Optional[int]:
    if raw_user_id is None:
        return None

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Pessoa marcada inválida.") from None

    if user_id <= 0:
        return None

    if not _board_has_collaboration(session, board):
        raise HTTPException(
            status_code=400,
            detail="Só é possível marcar uma pessoa em cards de quadros compartilhados.",
        )

    if user_id not in _board_assignable_user_ids(session, board):
        raise HTTPException(
            status_code=400,
            detail="A pessoa marcada não pertence a este quadro compartilhado.",
        )

    return user_id


def _active_card_total(cards: list[BobarCard]) -> int:
    return len([card for card in cards if not bool(getattr(card, "is_archived", False))])


def _board_invite_out(invite: BobarBoardInvite) -> BobarBoardInviteOut:
    return BobarBoardInviteOut(
        id=invite.id or 0,
        token=invite.token,
        role=_normalize_board_role(invite.role),
        max_uses=invite.max_uses,
        uses_count=invite.uses_count or 0,
        remaining_uses=_invite_remaining_uses(invite),
        is_active=invite.is_active,
        created_at=invite.created_at.isoformat(),
        revoked_at=invite.revoked_at.isoformat() if invite.revoked_at else None,
    )


def _list_accessible_boards(session: Session, current_user: User) -> list[BobarBoard]:
    own_boards = _list_boards(session, current_user)
    own_ids = {board.id or 0 for board in own_boards}

    shared_board_ids = session.exec(
        select(BobarBoardMember.board_id)
        .where(BobarBoardMember.user_id == current_user.id)
        .order_by(BobarBoardMember.accepted_at.desc(), BobarBoardMember.id.desc())
    ).all()
    shared_ids = [board_id for board_id in shared_board_ids if board_id and board_id not in own_ids]

    shared_boards: list[BobarBoard] = []
    if shared_ids:
        shared_boards = session.exec(
            select(BobarBoard)
            .where(BobarBoard.id.in_(shared_ids))
            .order_by(BobarBoard.updated_at.desc(), BobarBoard.id.desc())
        ).all()

    return [*own_boards, *shared_boards]


def _get_accessible_board_or_default(
    session: Session,
    current_user: User,
    board_id: Optional[int] = None,
) -> BobarBoard:
    boards = _list_accessible_boards(session, current_user)
    if not boards:
        raise HTTPException(status_code=404, detail="Quadro do Bobar não encontrado.")

    if board_id is None:
        return boards[0]

    board = session.get(BobarBoard, board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Quadro do Bobar não encontrado.")

    if board.user_id == current_user.id:
        return board

    membership = _get_board_membership(session, board_id, current_user.id)
    if membership:
        return board

    raise HTTPException(status_code=404, detail="Quadro do Bobar não encontrado.")


def _get_accessible_column_or_404(session: Session, current_user: User, column_id: int) -> BobarColumn:
    column = session.get(BobarColumn, column_id)
    if not column:
        raise HTTPException(status_code=404, detail="Coluna do Bobar não encontrada.")
    _get_accessible_board_or_default(session, current_user, column.board_id)
    return column


def _get_accessible_card_or_404(session: Session, current_user: User, card_id: int) -> BobarCard:
    card = session.get(BobarCard, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card do Bobar não encontrado.")
    _get_accessible_board_or_default(session, current_user, card.board_id)
    if not card.label_ids_json:
        card.label_ids_json = "[]"
    return card


def _get_accessible_label_or_404(session: Session, current_user: User, label_id: int) -> BobarLabel:
    label = session.get(BobarLabel, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Etiqueta do Bobar não encontrada.")
    _get_accessible_board_or_default(session, current_user, label.board_id)
    return label


def _get_accessible_attachment_or_404(
    session: Session,
    current_user: User,
    attachment_id: int,
) -> BobarAttachment:
    attachment = session.get(BobarAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Anexo do Bobar não encontrado.")
    _get_accessible_board_or_default(session, current_user, attachment.board_id)
    return attachment


def _list_board_invites(session: Session, board_id: int) -> list[BobarBoardInvite]:
    return session.exec(
        select(BobarBoardInvite)
        .where(BobarBoardInvite.board_id == board_id)
        .order_by(BobarBoardInvite.is_active.desc(), BobarBoardInvite.created_at.desc(), BobarBoardInvite.id.desc())
    ).all()


def _get_active_board_invite(session: Session, board_id: int) -> BobarBoardInvite | None:
    invites = _list_board_invites(session, board_id)
    return next((invite for invite in invites if _invite_is_usable(invite)), None)


def _get_board_invite_or_404(session: Session, board_id: int, invite_id: int) -> BobarBoardInvite:
    invite = session.get(BobarBoardInvite, invite_id)
    if not invite or invite.board_id != board_id:
        raise HTTPException(status_code=404, detail="Link de compartilhamento não encontrado.")
    return invite


def _record_board_activity(
    session: Session,
    board: BobarBoard,
    *,
    actor: User | None,
    event_type: str,
    message: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    session.add(
        BobarBoardActivity(
            board_id=board.id or 0,
            actor_user_id=actor.id if actor else None,
            event_type=_clip(_clean_text(event_type) or "info", 60),
            message=_clip(_clean_text(message), 500),
            entity_type=_clean_text(entity_type) or None,
            entity_id=entity_id,
            metadata_json=_json_dumps(metadata or {}),
            created_at=utcnow(),
        )
    )


def _build_collaboration_payload(
    session: Session,
    board: BobarBoard,
    current_user: User,
    *,
    activity_limit: int = 50,
    chat_limit: int = 80,
) -> BobarBoardCollaborationOut:
    owner = _get_board_owner_user(session, board)
    current_user_role = _board_role_for_user(session, board, current_user)

    memberships = session.exec(
        select(BobarBoardMember)
        .where(BobarBoardMember.board_id == (board.id or 0))
        .order_by(BobarBoardMember.accepted_at.asc(), BobarBoardMember.created_at.asc(), BobarBoardMember.id.asc())
    ).all()

    member_user_ids = [membership.user_id for membership in memberships if membership.user_id != owner.id]
    users_by_id: dict[int, User] = {owner.id or 0: owner}
    if member_user_ids:
        for user in session.exec(select(User).where(User.id.in_(member_user_ids))).all():
            users_by_id[user.id or 0] = user

    members: list[BobarBoardMemberOut] = [
        BobarBoardMemberOut(
            user_id=owner.id or 0,
            email=owner.email,
            full_name=owner.full_name,
            role="owner",
            is_owner=True,
            joined_at=board.created_at.isoformat(),
        )
    ]

    added_user_ids = {owner.id or 0}
    for membership in memberships:
        user = users_by_id.get(membership.user_id)
        if not user:
            continue
        if (user.id or 0) in added_user_ids:
            continue
        added_user_ids.add(user.id or 0)
        members.append(
            BobarBoardMemberOut(
                user_id=user.id or 0,
                email=user.email,
                full_name=user.full_name,
                role=_normalize_board_role(membership.role),
                is_owner=False,
                joined_at=(membership.accepted_at or membership.created_at).isoformat(),
            )
        )

    invites_rows = _list_board_invites(session, board.id or 0)
    invite_out = None
    invites_out: list[BobarBoardInviteOut] = []
    if current_user.id == board.user_id:
        usable_invites = [invite for invite in invites_rows if _invite_is_usable(invite)]
        invites_out = [_board_invite_out(invite) for invite in usable_invites]
        invite_out = invites_out[0] if invites_out else None

    activities_rows = session.exec(
        select(BobarBoardActivity)
        .where(BobarBoardActivity.board_id == (board.id or 0))
        .order_by(BobarBoardActivity.created_at.desc(), BobarBoardActivity.id.desc())
    ).all()[: max(1, activity_limit)]

    activity_actor_ids = [row.actor_user_id for row in activities_rows if row.actor_user_id]
    if activity_actor_ids:
        for user in session.exec(select(User).where(User.id.in_(activity_actor_ids))).all():
            users_by_id[user.id or 0] = user

    activities = [
        BobarBoardActivityOut(
            id=row.id or 0,
            board_id=row.board_id,
            actor_user_id=row.actor_user_id,
            actor_name=_display_user_name(users_by_id.get(row.actor_user_id or 0)) if row.actor_user_id else None,
            actor_email=users_by_id.get(row.actor_user_id or 0).email if row.actor_user_id and users_by_id.get(row.actor_user_id or 0) else None,
            event_type=row.event_type,
            message=row.message,
            created_at=row.created_at.isoformat(),
        )
        for row in activities_rows
    ]

    chat_rows = session.exec(
        select(BobarBoardChatMessage)
        .where(BobarBoardChatMessage.board_id == (board.id or 0))
        .order_by(BobarBoardChatMessage.created_at.desc(), BobarBoardChatMessage.id.desc())
    ).all()[: max(1, chat_limit)]

    chat_user_ids = [row.user_id for row in chat_rows if row.user_id]
    if chat_user_ids:
        for user in session.exec(select(User).where(User.id.in_(chat_user_ids))).all():
            users_by_id[user.id or 0] = user

    chat_messages = [
        BobarBoardChatMessageOut(
            id=row.id or 0,
            board_id=row.board_id,
            user_id=row.user_id,
            user_name=_display_user_name(users_by_id.get(row.user_id)),
            user_email=users_by_id.get(row.user_id).email if users_by_id.get(row.user_id) else "",
            message=row.message,
            created_at=row.created_at.isoformat(),
        )
        for row in reversed(chat_rows)
    ]

    return BobarBoardCollaborationOut(
        board_id=board.id or 0,
        can_manage_access=current_user.id == board.user_id,
        can_edit=current_user_role in {"owner", "editor"},
        current_user_role=current_user_role,
        members=members,
        invite=invite_out,
        invites=invites_out,
        activities=activities,
        chat_messages=chat_messages,
    )

def _build_accessible_board_list(session: Session, current_user: User) -> BobarBoardListOut:
    boards = _list_accessible_boards(session, current_user)
    if not boards:
        return BobarBoardListOut(boards=[])

    board_ids = [board.id or 0 for board in boards if board.id]
    totals: dict[int, int] = {board_id: 0 for board_id in board_ids}
    if board_ids:
        rows = session.exec(select(BobarCard).where(BobarCard.board_id.in_(board_ids))).all()
        for card in rows:
            if card.board_id is None or bool(getattr(card, "is_archived", False)):
                continue
            totals[card.board_id] = totals.get(card.board_id, 0) + 1

    owners_by_id: dict[int, User] = {}
    owner_ids = {board.user_id for board in boards}
    if owner_ids:
        for owner in session.exec(select(User).where(User.id.in_(owner_ids))).all():
            owners_by_id[owner.id or 0] = owner

    return BobarBoardListOut(
        boards=[
            _board_summary_out(
                session,
                board,
                totals.get(board.id or 0, 0),
                current_user=current_user,
                owner=owners_by_id.get(board.user_id),
            )
            for board in boards
        ]
    )


def _board_summary_out(
    session: Session,
    board: BobarBoard,
    total_cards: int,
    *,
    current_user: User,
    owner: User | None = None,
) -> BobarBoardSummaryOut:
    owner_user = owner or _get_board_owner_user(session, board)
    role = _board_role_for_user(session, board, current_user)
    return BobarBoardSummaryOut(
        id=board.id or 0,
        title=board.title,
        position=board.position,
        total_cards=total_cards,
        updated_at=board.updated_at.isoformat(),
        is_owner=board.user_id == current_user.id,
        owner_name=owner_user.full_name,
        owner_email=owner_user.email,
        access_role=role,
        can_edit=role in {"owner", "editor"},
    )

def _list_boards(session: Session, current_user: User) -> list[BobarBoard]:
    boards = session.exec(
        select(BobarBoard)
        .where(BobarBoard.user_id == current_user.id)
        .order_by(BobarBoard.position.asc(), BobarBoard.id.asc())
    ).all()

    if not boards:
        board = BobarBoard(
            user_id=current_user.id,
            title=DEFAULT_BOARD_TITLE,
            position=0,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(board)
        session.commit()
        session.refresh(board)
        boards = [board]

    primary_board = boards[0]
    legacy_columns = session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == current_user.id, BobarColumn.board_id == None)
        .order_by(BobarColumn.position.asc(), BobarColumn.id.asc())
    ).all()

    if legacy_columns:
        for column in legacy_columns:
            column.board_id = primary_board.id or 0
            column.updated_at = utcnow()
            session.add(column)

    if legacy_columns:
        session.commit()

    column_board_ids = {
        column.id or 0: column.board_id or primary_board.id or 0 for column in legacy_columns
    }

    legacy_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.board_id == None)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    if legacy_cards:
        for card in legacy_cards:
            inferred_board_id = column_board_ids.get(card.column_id) or primary_board.id or 0
            card.board_id = inferred_board_id
            if not card.label_ids_json:
                card.label_ids_json = "[]"
            card.updated_at = utcnow()
            session.add(card)
        session.commit()

    return session.exec(
        select(BobarBoard)
        .where(BobarBoard.user_id == current_user.id)
        .order_by(BobarBoard.position.asc(), BobarBoard.id.asc())
    ).all()


def _get_board_or_default(
    session: Session,
    current_user: User,
    board_id: Optional[int] = None,
) -> BobarBoard:
    boards = _list_boards(session, current_user)
    if board_id is None:
        return boards[0]

    board = session.get(BobarBoard, board_id)
    if not board or board.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quadro do Bobar não encontrado.")
    return board


def _reindex_boards(session: Session, current_user: User) -> None:
    boards = session.exec(
        select(BobarBoard)
        .where(BobarBoard.user_id == current_user.id)
        .order_by(BobarBoard.position.asc(), BobarBoard.id.asc())
    ).all()

    changed = False
    for index, board in enumerate(boards):
        if board.position != index:
            board.position = index
            board.updated_at = utcnow()
            session.add(board)
            changed = True

    if changed:
        session.commit()


def _ensure_default_columns(
    session: Session,
    current_user: User,
    board: BobarBoard,
) -> list[BobarColumn]:
    columns = session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == current_user.id, BobarColumn.board_id == (board.id or 0))
        .order_by(BobarColumn.position.asc(), BobarColumn.id.asc())
    ).all()

    if columns:
        return columns

    now = utcnow()
    for index, name in enumerate(DEFAULT_COLUMNS):
        session.add(
            BobarColumn(
                user_id=current_user.id,
                board_id=board.id or 0,
                name=name,
                position=index,
                created_at=now,
                updated_at=now,
            )
        )

    _touch_board(board)
    session.add(board)
    session.commit()

    return session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == current_user.id, BobarColumn.board_id == (board.id or 0))
        .order_by(BobarColumn.position.asc(), BobarColumn.id.asc())
    ).all()


def _reindex_columns(session: Session, current_user: User, board_id: int) -> None:
    columns = session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == current_user.id, BobarColumn.board_id == board_id)
        .order_by(BobarColumn.position.asc(), BobarColumn.id.asc())
    ).all()

    changed = False
    for index, column in enumerate(columns):
        if column.position != index:
            column.position = index
            column.updated_at = utcnow()
            session.add(column)
            changed = True

    if changed:
        session.commit()


def _reindex_cards_for_column(session: Session, current_user: User, column_id: int) -> None:
    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.column_id == column_id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    changed = False
    for index, card in enumerate(cards):
        if card.position != index:
            card.position = index
            card.updated_at = utcnow()
            session.add(card)
            changed = True

    if changed:
        session.commit()


def _get_column_or_404(session: Session, current_user: User, column_id: int) -> BobarColumn:
    column = session.get(BobarColumn, column_id)
    if not column or column.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Coluna do Bobar não encontrada.")
    return column


def _get_card_or_404(session: Session, current_user: User, card_id: int) -> BobarCard:
    card = session.get(BobarCard, card_id)
    if not card or card.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Card do Bobar não encontrado.")
    if not card.label_ids_json:
        card.label_ids_json = "[]"
    return card


def _get_label_or_404(session: Session, current_user: User, label_id: int) -> BobarLabel:
    label = session.get(BobarLabel, label_id)
    if not label or label.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Etiqueta do Bobar não encontrada.")
    return label


def _get_attachment_or_404(session: Session, current_user: User, attachment_id: int) -> BobarAttachment:
    attachment = session.get(BobarAttachment, attachment_id)
    if not attachment or attachment.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Anexo do Bobar não encontrado.")
    return attachment


def _normalize_card_label_ids(
    session: Session,
    current_user: User,
    board_id: int,
    raw_label_ids: Optional[list[int]],
) -> list[int]:
    if raw_label_ids is None:
        return []

    valid_labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == current_user.id, BobarLabel.board_id == board_id)
        .order_by(BobarLabel.position.asc(), BobarLabel.id.asc())
    ).all()
    valid_ids = {label.id or 0 for label in valid_labels}
    result: list[int] = []
    seen: set[int] = set()
    for item in raw_label_ids:
        try:
            label_id = int(item)
        except Exception:
            continue
        if label_id > 0 and label_id in valid_ids and label_id not in seen:
            seen.add(label_id)
            result.append(label_id)
    return result


def _attachment_out(attachment: BobarAttachment) -> BobarAttachmentOut:
    return BobarAttachmentOut(
        id=attachment.id or 0,
        card_id=attachment.card_id,
        filename=attachment.filename,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        created_at=attachment.created_at.isoformat(),
    )


def _card_out(
    card: BobarCard,
    *,
    valid_label_ids: set[int],
    attachments_by_card: dict[int, list[BobarAttachmentOut]],
) -> BobarCardOut:
    structure_json = card.structure_json or "{}"
    if (card.card_type or "").lower() == "fluxograma":
        structure_json = _resolve_structure_json("fluxograma", structure_json, card.title, card.content_text)

    label_ids = [label_id for label_id in _parse_label_ids_json(card.label_ids_json) if label_id in valid_label_ids]

    return BobarCardOut(
        id=card.id or 0,
        board_id=card.board_id or 0,
        column_id=card.column_id,
        title=card.title,
        card_type=card.card_type,
        source_kind=card.source_kind,
        source_label=card.source_label,
        content_text=card.content_text,
        note=card.note,
        position=card.position,
        structure_json=structure_json,
        due_at=card.due_at.isoformat() if card.due_at else None,
        label_ids=label_ids,
        attachments=attachments_by_card.get(card.id or 0, []),
        is_hidden=bool(getattr(card, "is_hidden", False)),
        hidden_at=card.hidden_at.isoformat() if getattr(card, "hidden_at", None) else None,
        is_archived=bool(getattr(card, "is_archived", False)),
        archived_at=card.archived_at.isoformat() if getattr(card, "archived_at", None) else None,
        assigned_user_id=getattr(card, "assigned_user_id", None),
        created_at=card.created_at.isoformat(),
        updated_at=card.updated_at.isoformat(),
    )


def _build_board(session: Session, current_user: User, board: BobarBoard) -> BobarBoardOut:
    columns = _ensure_default_columns(session, current_user, board)

    labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == current_user.id, BobarLabel.board_id == (board.id or 0))
        .order_by(BobarLabel.position.asc(), BobarLabel.id.asc())
    ).all()
    valid_label_ids = {label.id or 0 for label in labels}

    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.board_id == (board.id or 0))
        .order_by(BobarCard.column_id.asc(), BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    attachments = session.exec(
        select(BobarAttachment)
        .where(BobarAttachment.user_id == current_user.id, BobarAttachment.board_id == (board.id or 0))
        .order_by(BobarAttachment.created_at.desc(), BobarAttachment.id.desc())
    ).all()
    attachments_by_card: dict[int, list[BobarAttachmentOut]] = {}
    for attachment in attachments:
        attachments_by_card.setdefault(attachment.card_id, []).append(_attachment_out(attachment))

    by_column: dict[int, list[BobarCardOut]] = {column.id or 0: [] for column in columns}
    for card in cards:
        by_column.setdefault(card.column_id, []).append(
            _card_out(card, valid_label_ids=valid_label_ids, attachments_by_card=attachments_by_card)
        )

    return BobarBoardOut(
        id=board.id or 0,
        title=board.title,
        total_cards=_active_card_total(cards),
        labels=[
            BobarLabelOut(
                id=label.id or 0,
                name=label.name,
                color=label.color,
                position=label.position,
            )
            for label in labels
        ],
        columns=[
            BobarColumnOut(
                id=column.id or 0,
                board_id=column.board_id or 0,
                name=column.name,
                position=column.position,
                cards=by_column.get(column.id or 0, []),
            )
            for column in columns
        ],
    )


def _build_board_list(session: Session, current_user: User) -> BobarBoardListOut:
    boards = _list_boards(session, current_user)
    totals: dict[int, int] = {}

    rows = session.exec(
        select(BobarCard).where(BobarCard.user_id == current_user.id)
    ).all()
    for card in rows:
        if card.board_id is None or bool(getattr(card, "is_archived", False)):
            continue
        totals[card.board_id] = totals.get(card.board_id, 0) + 1

    return BobarBoardListOut(
        boards=[
            _board_summary_out(
                session,
                board,
                totals.get(board.id or 0, 0),
                current_user=current_user,
                owner=current_user,
            )
            for board in boards
        ]
    )


def _delete_attachment_file(attachment: BobarAttachment) -> None:
    path = Path(attachment.storage_path or "")
    if path.exists() and path.is_file():
        try:
            path.unlink()
        except Exception:
            pass


def _delete_card_attachments(session: Session, current_user: User, card: BobarCard) -> None:
    attachments = session.exec(
        select(BobarAttachment)
        .where(BobarAttachment.user_id == current_user.id, BobarAttachment.card_id == (card.id or 0))
    ).all()
    for attachment in attachments:
        _delete_attachment_file(attachment)
        session.delete(attachment)


def _cleanup_duplicate_workspace_for_import(
    session: Session,
    current_user: User,
    import_card: BobarCard,
    board: BobarBoard,
) -> BobarBoardOut:
    import_card_id = import_card.id or 0
    if import_card_id <= 0:
        return _build_board(session, current_user, board)

    workspace_source_kind = _authority_workspace_source_kind(import_card_id)
    workspace_cards = session.exec(
        select(BobarCard)
        .where(
            BobarCard.user_id == current_user.id,
            BobarCard.board_id == (board.id or 0),
            BobarCard.source_kind == workspace_source_kind,
        )
        .order_by(BobarCard.column_id.asc(), BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    if not workspace_cards:
        meta = _extract_import_workspace_meta(import_card.structure_json)
        next_structure_json = _write_import_workspace_meta(
            import_card.structure_json,
            title=_clean_text(meta.get("title")) or import_card.title,
            column_ids=[],
            created_at=_clean_text(meta.get("created_at")),
        )
        if next_structure_json != import_card.structure_json:
            import_card.structure_json = next_structure_json
            import_card.updated_at = utcnow()
            session.add(import_card)
            session.commit()
        return _build_board(session, current_user, board)

    column_ids = sorted({card.column_id for card in workspace_cards if card.column_id})
    workspace_columns = session.exec(
        select(BobarColumn)
        .where(
            BobarColumn.user_id == current_user.id,
            BobarColumn.board_id == (board.id or 0),
            BobarColumn.id.in_(column_ids),
        )
        .order_by(BobarColumn.position.asc(), BobarColumn.id.asc())
    ).all()

    cards_by_column: dict[int, list[BobarCard]] = {column_id: [] for column_id in column_ids}
    for card in workspace_cards:
        cards_by_column.setdefault(card.column_id, []).append(card)

    meta = _extract_import_workspace_meta(import_card.structure_json)
    referenced_column_ids = {
        int(item)
        for item in meta.get("column_ids", [])
        if isinstance(item, (int, float, str)) and str(item).isdigit() and int(item) > 0
    }

    candidates = [
        {
            "column": column,
            "cards": cards_by_column.get(column.id or 0, []),
            "signature": _column_semantic_signature(column, cards_by_column.get(column.id or 0, [])),
            "role_key": _match_imported_role(column, cards_by_column.get(column.id or 0, [])),
        }
        for column in workspace_columns
    ]

    column_ids_to_delete: set[int] = set()

    signature_groups: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        signature_groups.setdefault(candidate["signature"], []).append(candidate)

    for group in signature_groups.values():
        if len(group) <= 1:
            continue
        keeper = max(
            group,
            key=lambda item: _column_rank_key(item["column"], item["cards"], referenced_column_ids),
        )
        keeper_id = keeper["column"].id or 0
        for item in group:
            column_id = item["column"].id or 0
            if column_id != keeper_id:
                column_ids_to_delete.add(column_id)

    role_groups: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        column_id = candidate["column"].id or 0
        role_key = candidate["role_key"]
        if not role_key or column_id in column_ids_to_delete:
            continue
        role_groups.setdefault(role_key, []).append(candidate)

    for group in role_groups.values():
        if len(group) <= 1:
            continue
        keeper = max(
            group,
            key=lambda item: _column_rank_key(item["column"], item["cards"], referenced_column_ids),
        )
        keeper_id = keeper["column"].id or 0
        for item in group:
            column_id = item["column"].id or 0
            if column_id != keeper_id:
                column_ids_to_delete.add(column_id)

    card_ids_to_delete: set[int] = set()
    affected_column_ids: set[int] = set()

    for candidate in candidates:
        column = candidate["column"]
        column_id = column.id or 0
        if column_id in column_ids_to_delete:
            continue

        signature_groups_for_cards: dict[str, list[BobarCard]] = {}
        for card in candidate["cards"]:
            signature_groups_for_cards.setdefault(_card_semantic_signature(card), []).append(card)

        for group in signature_groups_for_cards.values():
            if len(group) <= 1:
                continue
            keeper = max(group, key=_card_rank_key)
            keeper_id = keeper.id or 0
            for card in group:
                card_id = card.id or 0
                if card_id and card_id != keeper_id:
                    card_ids_to_delete.add(card_id)
                    affected_column_ids.add(column_id)

    if card_ids_to_delete:
        duplicate_cards = session.exec(
            select(BobarCard)
            .where(BobarCard.user_id == current_user.id, BobarCard.id.in_(sorted(card_ids_to_delete)))
        ).all()
        for card in duplicate_cards:
            _delete_card_attachments(session, current_user, card)
            session.delete(card)

    if column_ids_to_delete:
        duplicate_columns = session.exec(
            select(BobarColumn)
            .where(BobarColumn.user_id == current_user.id, BobarColumn.id.in_(sorted(column_ids_to_delete)))
        ).all()
        for column in duplicate_columns:
            session.delete(column)

    surviving_columns = [
        candidate["column"]
        for candidate in candidates
        if (candidate["column"].id or 0) not in column_ids_to_delete
    ]
    surviving_column_ids = [column.id or 0 for column in surviving_columns if (column.id or 0) > 0]

    next_structure_json = _write_import_workspace_meta(
        import_card.structure_json,
        title=_clean_text(meta.get("title")) or import_card.title,
        column_ids=surviving_column_ids,
        created_at=_clean_text(meta.get("created_at")),
    )

    changed = bool(card_ids_to_delete or column_ids_to_delete or next_structure_json != import_card.structure_json)
    if next_structure_json != import_card.structure_json:
        import_card.structure_json = next_structure_json
        import_card.updated_at = utcnow()
        session.add(import_card)

    if changed:
        _touch_board(board)
        session.add(board)
        session.commit()
        for column_id in sorted(affected_column_ids.union(surviving_column_ids)):
            _reindex_cards_for_column(session, current_user, column_id)
        _reindex_columns(session, current_user, board.id or 0)

    return _build_board(session, current_user, board)



@router.get("/boards", response_model=BobarBoardListOut)
def bobar_list_boards(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return _build_accessible_board_list(session, current_user)


@router.post("/boards", response_model=BobarBoardListOut)
def bobar_create_board(
    payload: BobarBoardCreateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    boards = _list_boards(session, current_user)
    title = _clean_text(payload.title)
    if not title:
        raise HTTPException(status_code=400, detail="Informe um nome para o quadro.")

    board = BobarBoard(
        user_id=current_user.id,
        title=_clip(title, 120),
        position=len(boards),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(board)
    session.commit()
    session.refresh(board)
    _ensure_default_columns(session, current_user, board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="board_created",
        message=f"{_display_user_name(current_user)} criou o quadro {board.title}.",
        entity_type="board",
        entity_id=board.id or 0,
    )
    session.commit()
    return _build_accessible_board_list(session, current_user)


@router.patch("/boards/{board_id}", response_model=BobarBoardListOut)
def bobar_rename_board(
    board_id: int,
    payload: BobarBoardUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    _require_board_owner(board, current_user)

    previous_title = board.title
    if payload.title is not None:
        title = _clean_text(payload.title)
        if not title:
            raise HTTPException(status_code=400, detail="O nome do quadro não pode ficar vazio.")
        board.title = _clip(title, 120)

    _touch_board(board)
    session.add(board)
    if board.title != previous_title:
        _record_board_activity(
            session,
            board,
            actor=current_user,
            event_type="board_renamed",
            message=f"{_display_user_name(current_user)} renomeou o quadro de {previous_title} para {board.title}.",
            entity_type="board",
            entity_id=board.id or 0,
        )
    session.commit()
    return _build_accessible_board_list(session, current_user)


@router.delete("/boards/{board_id}", response_model=BobarBoardListOut)
def bobar_delete_board(
    board_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    boards = _list_boards(session, current_user)
    if len(boards) <= 1:
        raise HTTPException(status_code=400, detail="Você precisa manter ao menos um quadro.")

    board = _get_board_or_default(session, current_user, board_id)
    _require_board_owner(board, current_user)

    owner_user = _get_board_owner_user(session, board)

    attachments = session.exec(
        select(BobarAttachment)
        .where(BobarAttachment.user_id == owner_user.id, BobarAttachment.board_id == (board.id or 0))
    ).all()
    for attachment in attachments:
        _delete_attachment_file(attachment)
        session.delete(attachment)

    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.board_id == (board.id or 0))
    ).all()
    for card in cards:
        session.delete(card)

    columns = session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == owner_user.id, BobarColumn.board_id == (board.id or 0))
    ).all()
    for column in columns:
        session.delete(column)

    labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == owner_user.id, BobarLabel.board_id == (board.id or 0))
    ).all()
    for label in labels:
        session.delete(label)

    for membership in session.exec(
        select(BobarBoardMember).where(BobarBoardMember.board_id == (board.id or 0))
    ).all():
        session.delete(membership)

    for invite in session.exec(
        select(BobarBoardInvite).where(BobarBoardInvite.board_id == (board.id or 0))
    ).all():
        session.delete(invite)

    for activity in session.exec(
        select(BobarBoardActivity).where(BobarBoardActivity.board_id == (board.id or 0))
    ).all():
        session.delete(activity)

    for message in session.exec(
        select(BobarBoardChatMessage).where(BobarBoardChatMessage.board_id == (board.id or 0))
    ).all():
        session.delete(message)

    session.delete(board)
    session.commit()
    _reindex_boards(session, current_user)
    return _build_accessible_board_list(session, current_user)


@router.get("", response_model=BobarBoardOut)
def bobar_board(
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    owner_user = _get_board_owner_user(session, board)
    return _build_board(session, owner_user, board)


@router.post("/labels", response_model=BobarBoardOut)
def bobar_create_label(
    payload: BobarLabelCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == owner_user.id, BobarLabel.board_id == (board.id or 0))
        .order_by(BobarLabel.position.asc(), BobarLabel.id.asc())
    ).all()

    name = _clean_text(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Informe um nome para a etiqueta.")

    label = BobarLabel(
        user_id=owner_user.id,
        board_id=board.id or 0,
        name=_clip(name, 60),
        color=_normalize_label_color(payload.color),
        position=len(labels),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    _touch_board(board)
    session.add(label)
    session.flush()
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="label_created",
        message=f"{_display_user_name(current_user)} criou a etiqueta {label.name}.",
        entity_type="label",
        entity_id=label.id or 0,
    )
    session.add(board)
    session.commit()
    return _build_board(session, owner_user, board)


@router.patch("/labels/{label_id}", response_model=BobarBoardOut)
def bobar_update_label(
    label_id: int,
    payload: BobarLabelUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    label = _get_accessible_label_or_404(session, current_user, label_id)
    board = _get_accessible_board_or_default(session, current_user, label.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    previous_name = label.name
    previous_color = label.color

    if payload.name is not None:
        name = _clean_text(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail="O nome da etiqueta não pode ficar vazio.")
        label.name = _clip(name, 60)

    if payload.color is not None:
        label.color = _normalize_label_color(payload.color)

    label.updated_at = utcnow()
    _touch_board(board)
    session.add(label)
    session.add(board)
    if label.name != previous_name or label.color != previous_color:
        _record_board_activity(
            session,
            board,
            actor=current_user,
            event_type="label_updated",
            message=f"{_display_user_name(current_user)} atualizou a etiqueta {label.name}.",
            entity_type="label",
            entity_id=label.id or 0,
        )
    session.commit()
    return _build_board(session, owner_user, board)


@router.delete("/labels/{label_id}", response_model=BobarBoardOut)
def bobar_delete_label(
    label_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    label = _get_accessible_label_or_404(session, current_user, label_id)
    board = _get_accessible_board_or_default(session, current_user, label.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    removed_label_id = label.id or 0
    removed_label_name = label.name

    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.board_id == (board.id or 0))
    ).all()
    now = utcnow()
    for card in cards:
        label_ids = [item for item in _parse_label_ids_json(card.label_ids_json) if item != removed_label_id]
        serialized = _json_dumps(label_ids)
        if serialized != (card.label_ids_json or "[]"):
            card.label_ids_json = serialized
            card.updated_at = now
            session.add(card)

    session.delete(label)
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="label_deleted",
        message=f"{_display_user_name(current_user)} removeu a etiqueta {removed_label_name}.",
        entity_type="label",
        entity_id=removed_label_id,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.post("/columns", response_model=BobarBoardOut)
def bobar_create_column(
    payload: BobarColumnCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    columns = _ensure_default_columns(session, owner_user, board)
    name = _clean_text(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Informe um nome para a coluna.")

    column = BobarColumn(
        user_id=owner_user.id,
        board_id=board.id or 0,
        name=_clip(name, 80),
        position=len(columns),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(column)
    session.flush()
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="column_created",
        message=f"{_display_user_name(current_user)} criou a coluna {column.name}.",
        entity_type="column",
        entity_id=column.id or 0,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.patch("/columns/{column_id}", response_model=BobarBoardOut)
def bobar_update_column(
    column_id: int,
    payload: BobarColumnUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    column = _get_accessible_column_or_404(session, current_user, column_id)
    board = _get_accessible_board_or_default(session, current_user, column.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    previous_name = column.name
    if payload.name is not None:
        name = _clean_text(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail="O nome da coluna não pode ficar vazio.")
        column.name = _clip(name, 80)

    column.updated_at = utcnow()
    _touch_board(board)
    session.add(column)
    session.add(board)
    if column.name != previous_name:
        _record_board_activity(
            session,
            board,
            actor=current_user,
            event_type="column_updated",
            message=f"{_display_user_name(current_user)} renomeou a coluna de {previous_name} para {column.name}.",
            entity_type="column",
            entity_id=column.id or 0,
        )
    session.commit()
    return _build_board(session, owner_user, board)


@router.post("/columns/{column_id}/move", response_model=BobarBoardOut)
def bobar_move_column(
    column_id: int,
    payload: BobarColumnMoveIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    column = _get_accessible_column_or_404(session, current_user, column_id)
    board = _get_accessible_board_or_default(session, current_user, column.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    columns = _ensure_default_columns(session, owner_user, board)

    ordered = [item for item in columns if (item.id or 0) != (column.id or 0)]
    target_position = min(max(payload.position, 0), len(ordered))
    ordered.insert(target_position, column)

    now = utcnow()
    for index, item in enumerate(ordered):
        item.position = index
        item.updated_at = now
        session.add(item)

    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="column_moved",
        message=f"{_display_user_name(current_user)} reordenou a coluna {column.name}.",
        entity_type="column",
        entity_id=column.id or 0,
        metadata={"position": target_position},
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.delete("/columns/{column_id}", response_model=BobarBoardOut)
def bobar_delete_column(
    column_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    target = _get_accessible_column_or_404(session, current_user, column_id)
    board = _get_accessible_board_or_default(session, current_user, target.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    columns = _ensure_default_columns(session, owner_user, board)

    if len(columns) <= 1:
        raise HTTPException(status_code=400, detail="Você precisa manter ao menos uma coluna no quadro.")

    destination = next((column for column in columns if column.id != target.id), None)
    if destination is None:
        raise HTTPException(status_code=400, detail="Não foi possível realocar os cards desta coluna.")

    destination_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == destination.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()
    next_position = len(destination_cards)

    target_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == target.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    moved_cards_count = len(target_cards)
    removed_column_name = target.name
    destination_name = destination.name

    now = utcnow()
    for card in target_cards:
        card.column_id = destination.id or 0
        card.board_id = board.id or 0
        card.position = next_position
        card.updated_at = now
        next_position += 1
        session.add(card)

    session.delete(target)
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="column_deleted",
        message=f"{_display_user_name(current_user)} excluiu a coluna {removed_column_name} e realocou {moved_cards_count} card(s) para {destination_name}.",
        entity_type="column",
        entity_id=column_id,
    )
    session.commit()
    _reindex_columns(session, owner_user, board.id or 0)
    _reindex_cards_for_column(session, owner_user, destination.id or 0)
    return _build_board(session, owner_user, board)


@router.post("/cards", response_model=BobarBoardOut)
def bobar_create_card(
    payload: BobarCardCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    columns = _ensure_default_columns(session, owner_user, board)
    column = _get_accessible_column_or_404(session, current_user, payload.column_id) if payload.column_id else columns[0]
    if (column.board_id or 0) != (board.id or 0):
        raise HTTPException(status_code=400, detail="A coluna selecionada pertence a outro quadro.")

    existing_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == column.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    content_text = payload.content_text or ""
    note = payload.note or ""
    title = _derive_card_title(payload.title, payload.source_label, content_text or note)
    card_type = _derive_card_type(payload.card_type, content_text)
    structure_json = _resolve_structure_json(card_type, payload.structure_json, title, content_text)
    label_ids = _normalize_card_label_ids(session, owner_user, board.id or 0, payload.label_ids)
    assigned_user_id = _resolve_assigned_user_id(session, board, payload.assigned_user_id)
    is_archived = bool(payload.is_archived)
    is_hidden = False if is_archived else bool(payload.is_hidden)
    now = utcnow()

    card = BobarCard(
        user_id=owner_user.id,
        board_id=board.id or 0,
        column_id=column.id or 0,
        title=title,
        card_type=card_type,
        source_kind=_clean_text(payload.source_kind) or None,
        source_label=_clean_text(payload.source_label) or None,
        content_text=content_text,
        note=note,
        position=len(existing_cards),
        structure_json=structure_json,
        due_at=_parse_due_at(payload.due_at),
        label_ids_json=_json_dumps(label_ids),
        is_hidden=is_hidden,
        hidden_at=now if is_hidden else None,
        is_archived=is_archived,
        archived_at=now if is_archived else None,
        assigned_user_id=assigned_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(card)
    session.flush()
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="card_created",
        message=f"{_display_user_name(current_user)} criou o card {card.title}.",
        entity_type="card",
        entity_id=card.id or 0,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.post("/cards/import", response_model=BobarBoardOut)
def bobar_import_card(
    payload: BobarCardCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return bobar_create_card(payload, board_id, session, current_user)


@router.patch("/cards/{card_id}", response_model=BobarBoardOut)
def bobar_update_card(
    card_id: int,
    payload: BobarCardUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_accessible_card_or_404(session, current_user, card_id)
    board = _get_accessible_board_or_default(session, current_user, card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    old_column_id = card.column_id
    previous_title = card.title
    previous_hidden = bool(getattr(card, "is_hidden", False))
    previous_archived = bool(getattr(card, "is_archived", False))
    previous_assigned_user_id = getattr(card, "assigned_user_id", None)

    if payload.column_id is not None and payload.column_id != card.column_id:
        new_column = _get_accessible_column_or_404(session, current_user, payload.column_id)
        if (new_column.board_id or 0) != (board.id or 0):
            raise HTTPException(status_code=400, detail="A coluna selecionada pertence a outro quadro.")
        existing_cards = session.exec(
            select(BobarCard)
            .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == new_column.id)
            .order_by(BobarCard.position.asc(), BobarCard.id.asc())
        ).all()
        card.column_id = new_column.id or 0
        card.board_id = board.id or 0
        card.position = len(existing_cards)

    if payload.title is not None:
        title = _clean_text(payload.title)
        if not title:
            raise HTTPException(status_code=400, detail="O título do card não pode ficar vazio.")
        card.title = _clip(title, 140)

    if payload.note is not None:
        card.note = payload.note

    if payload.content_text is not None:
        card.content_text = payload.content_text

    if payload.card_type is not None:
        card.card_type = _derive_card_type(payload.card_type, payload.content_text or card.content_text)

    if payload.structure_json is not None:
        card.structure_json = _resolve_structure_json(
            card.card_type,
            payload.structure_json,
            card.title,
            payload.content_text if payload.content_text is not None else card.content_text,
        )
    elif card.card_type == "fluxograma" and not _clean_text(card.structure_json):
        card.structure_json = _resolve_structure_json(
            "fluxograma",
            card.structure_json,
            card.title,
            payload.content_text if payload.content_text is not None else card.content_text,
        )

    if "due_at" in payload.model_fields_set:
        card.due_at = _parse_due_at(payload.due_at)

    if payload.label_ids is not None:
        card.label_ids_json = _json_dumps(
            _normalize_card_label_ids(session, owner_user, board.id or 0, payload.label_ids)
        )

    if "assigned_user_id" in payload.model_fields_set:
        card.assigned_user_id = _resolve_assigned_user_id(session, board, payload.assigned_user_id)

    now = utcnow()

    if "is_archived" in payload.model_fields_set:
        next_archived = bool(payload.is_archived)
        card.is_archived = next_archived
        card.archived_at = now if next_archived else None
        if next_archived:
            card.is_hidden = False
            card.hidden_at = None

    if "is_hidden" in payload.model_fields_set:
        next_hidden = bool(payload.is_hidden)
        card.is_hidden = False if bool(getattr(card, "is_archived", False)) and next_hidden else next_hidden
        card.hidden_at = now if card.is_hidden else None
        if card.is_hidden:
            card.is_archived = False
            card.archived_at = None

    card.updated_at = now
    _touch_board(board)
    session.add(card)
    session.add(board)

    event_type = "card_updated"
    message = f"{_display_user_name(current_user)} editou o card {card.title or previous_title}."

    if previous_archived != bool(getattr(card, "is_archived", False)):
        if card.is_archived:
            event_type = "card_archived"
            message = f"{_display_user_name(current_user)} arquivou o card {card.title or previous_title}."
        else:
            event_type = "card_restored"
            message = f"{_display_user_name(current_user)} restaurou o card {card.title or previous_title}."
    elif previous_hidden != bool(getattr(card, "is_hidden", False)):
        if card.is_hidden:
            event_type = "card_hidden"
            message = f"{_display_user_name(current_user)} ocultou o card {card.title or previous_title}."
        else:
            event_type = "card_unhidden"
            message = f"{_display_user_name(current_user)} voltou a exibir o card {card.title or previous_title}."
    elif previous_assigned_user_id != getattr(card, "assigned_user_id", None):
        if card.assigned_user_id:
            event_type = "card_assigned"
            message = (
                f"{_display_user_name(current_user)} marcou uma pessoa no card "
                f"{card.title or previous_title}."
            )
        else:
            event_type = "card_unassigned"
            message = f"{_display_user_name(current_user)} removeu a marcação do card {card.title or previous_title}."

    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type=event_type,
        message=message,
        entity_type="card",
        entity_id=card.id or 0,
    )
    session.commit()

    if old_column_id != card.column_id:
        _reindex_cards_for_column(session, owner_user, old_column_id)
        _reindex_cards_for_column(session, owner_user, card.column_id)

    return _build_board(session, owner_user, board)


@router.post("/cards/{card_id}/attachments", response_model=BobarBoardOut)
async def bobar_upload_attachment(
    card_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_accessible_card_or_404(session, current_user, card_id)
    board = _get_accessible_board_or_default(session, current_user, card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    filename = _safe_filename(file.filename)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="O arquivo está vazio.")
    if len(content) > MAX_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="O arquivo excede o limite de 25 MB.")

    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    extension = _guess_extension(filename, mime_type)
    storage_name = f"{uuid.uuid4().hex}{extension}"
    storage_path = _attachment_storage_dir(owner_user.id, board.id or 0, card.id or 0) / storage_name
    storage_path.write_bytes(content)

    attachment = BobarAttachment(
        user_id=owner_user.id,
        board_id=board.id or 0,
        card_id=card.id or 0,
        filename=filename,
        storage_path=str(storage_path),
        mime_type=mime_type,
        size_bytes=len(content),
        created_at=utcnow(),
    )
    card.updated_at = utcnow()
    _touch_board(board)
    session.add(attachment)
    session.flush()
    session.add(card)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="attachment_created",
        message=f"{_display_user_name(current_user)} anexou {filename} ao card {card.title}.",
        entity_type="attachment",
        entity_id=attachment.id or 0,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.delete("/attachments/{attachment_id}", response_model=BobarBoardOut)
def bobar_delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    attachment = _get_accessible_attachment_or_404(session, current_user, attachment_id)
    card = _get_accessible_card_or_404(session, current_user, attachment.card_id)
    board = _get_accessible_board_or_default(session, current_user, attachment.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    attachment_name = attachment.filename
    _delete_attachment_file(attachment)
    session.delete(attachment)
    card.updated_at = utcnow()
    _touch_board(board)
    session.add(card)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="attachment_deleted",
        message=f"{_display_user_name(current_user)} removeu o anexo {attachment_name} do card {card.title}.",
        entity_type="attachment",
        entity_id=attachment_id,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.get("/attachments/{attachment_id}/content")
def bobar_attachment_content(
    attachment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    attachment = _get_accessible_attachment_or_404(session, current_user, attachment_id)
    path = Path(attachment.storage_path or "")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo anexado não encontrado.")
    return FileResponse(path, media_type=attachment.mime_type or "application/octet-stream", filename=attachment.filename)


@router.post("/imports/{import_card_id}/cleanup-duplicates", response_model=BobarBoardOut)
def bobar_cleanup_import_duplicates(
    import_card_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    import_card = _get_accessible_card_or_404(session, current_user, import_card_id)
    if not _is_authority_import_source_kind(import_card.source_kind):
        raise HTTPException(status_code=400, detail="Esse card não é um roteiro importado.")
    board = _get_accessible_board_or_default(session, current_user, import_card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    result = _cleanup_duplicate_workspace_for_import(session, owner_user, import_card, board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="workspace_cleanup",
        message=f"{_display_user_name(current_user)} limpou colunas duplicadas do roteiro importado {import_card.title}.",
        entity_type="card",
        entity_id=import_card.id or 0,
    )
    session.commit()
    return result


@router.post("/cards/{card_id}/move", response_model=BobarBoardOut)
def bobar_move_card(
    card_id: int,
    payload: BobarCardMoveIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_accessible_card_or_404(session, current_user, card_id)
    board = _get_accessible_board_or_default(session, current_user, card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)
    target_column = _get_accessible_column_or_404(session, current_user, payload.column_id)
    if (target_column.board_id or 0) != (board.id or 0):
        raise HTTPException(status_code=400, detail="A coluna de destino pertence a outro quadro.")

    source_column_id = card.column_id
    destination_column_id = target_column.id or 0
    destination_column_name = target_column.name
    now = utcnow()

    source_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == source_column_id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    if destination_column_id == source_column_id:
        ordered = [item for item in source_cards if item.id != card.id]
        target_position = min(max(payload.position, 0), len(ordered))
        ordered.insert(target_position, card)
        for index, item in enumerate(ordered):
            item.column_id = destination_column_id
            item.board_id = board.id or 0
            item.position = index
            item.updated_at = now
            session.add(item)
    else:
        source_remaining = [item for item in source_cards if item.id != card.id]
        destination_cards = session.exec(
            select(BobarCard)
            .where(BobarCard.user_id == owner_user.id, BobarCard.column_id == destination_column_id)
            .order_by(BobarCard.position.asc(), BobarCard.id.asc())
        ).all()

        target_position = min(max(payload.position, 0), len(destination_cards))
        destination_cards.insert(target_position, card)

        for index, item in enumerate(source_remaining):
            item.position = index
            item.updated_at = now
            session.add(item)

        for index, item in enumerate(destination_cards):
            item.column_id = destination_column_id
            item.board_id = board.id or 0
            item.position = index
            item.updated_at = now
            session.add(item)

    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="card_moved",
        message=f"{_display_user_name(current_user)} moveu o card {card.title} para a coluna {destination_column_name}.",
        entity_type="card",
        entity_id=card.id or 0,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.post("/cards/{card_id}/transform-to-flowchart", response_model=BobarBoardOut)
def bobar_transform_to_flowchart(
    card_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_accessible_card_or_404(session, current_user, card_id)
    board = _get_accessible_board_or_default(session, current_user, card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    card.card_type = "fluxograma"
    card.structure_json = _resolve_structure_json("fluxograma", card.structure_json, card.title, card.content_text)
    card.updated_at = utcnow()
    _touch_board(board)
    session.add(card)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="card_flowchart",
        message=f"{_display_user_name(current_user)} transformou o card {card.title} em fluxograma.",
        entity_type="card",
        entity_id=card.id or 0,
    )
    session.commit()
    return _build_board(session, owner_user, board)


@router.delete("/cards/{card_id}", response_model=BobarBoardOut)
def bobar_delete_card(
    card_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_accessible_card_or_404(session, current_user, card_id)
    board = _get_accessible_board_or_default(session, current_user, card.board_id)
    _require_board_editor(session, board, current_user)
    owner_user = _get_board_owner_user(session, board)

    column_id = card.column_id
    card_title = card.title
    _delete_card_attachments(session, owner_user, card)
    session.delete(card)
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="card_deleted",
        message=f"{_display_user_name(current_user)} excluiu o card {card_title}.",
        entity_type="card",
        entity_id=card_id,
    )
    session.commit()
    _reindex_cards_for_column(session, owner_user, column_id)
    return _build_board(session, owner_user, board)


@router.get("/boards/{board_id}/collaboration", response_model=BobarBoardCollaborationOut)
def bobar_board_collaboration(
    board_id: int,
    activity_limit: int = Query(default=50, ge=10, le=200),
    chat_limit: int = Query(default=80, ge=10, le=200),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    return _build_collaboration_payload(
        session,
        board,
        current_user,
        activity_limit=activity_limit,
        chat_limit=chat_limit,
    )


@router.post("/boards/{board_id}/share-link", response_model=BobarBoardInviteOut)
def bobar_create_share_link(
    board_id: int,
    payload: BobarBoardCreateShareLinkIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    _require_board_owner(board, current_user)

    role = _normalize_board_role(payload.role)
    invite = BobarBoardInvite(
        board_id=board.id or 0,
        created_by_user_id=current_user.id,
        token=secrets.token_urlsafe(24),
        role=role,
        max_uses=payload.max_uses,
        uses_count=0,
        is_active=True,
        created_at=utcnow(),
        revoked_at=None,
    )
    _touch_board(board)
    session.add(invite)
    session.flush()
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="share_link_created",
        message=(
            f"{_display_user_name(current_user)} gerou um novo link de acesso "
            f"({role}, {'uso ilimitado' if payload.max_uses is None else f'{payload.max_uses} uso(s)'})."
        ),
        entity_type="invite",
        entity_id=invite.id or 0,
        metadata={
            "role": role,
            "max_uses": payload.max_uses,
        },
    )
    session.commit()
    return _board_invite_out(invite)


@router.post("/boards/{board_id}/share-links/{invite_id}/revoke", response_model=BobarBoardInviteOut)
def bobar_revoke_share_link(
    board_id: int,
    invite_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    _require_board_owner(board, current_user)

    invite = _get_board_invite_or_404(session, board.id or 0, invite_id)
    if not invite.is_active:
        return _board_invite_out(invite)

    invite.is_active = False
    invite.revoked_at = utcnow()
    _touch_board(board)
    session.add(invite)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="share_link_revoked",
        message=f"{_display_user_name(current_user)} revogou um link de acesso ({_normalize_board_role(invite.role)}).",
        entity_type="invite",
        entity_id=invite.id or 0,
        metadata={
            "role": _normalize_board_role(invite.role),
            "max_uses": invite.max_uses,
            "uses_count": invite.uses_count,
        },
    )
    session.commit()
    return _board_invite_out(invite)


@router.get("/share/{token}", response_model=BobarBoardSharePreviewOut)
def bobar_share_preview(
    token: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    invite = session.exec(
        select(BobarBoardInvite).where(BobarBoardInvite.token == token)
    ).first()
    if not invite or not _invite_is_usable(invite):
        raise HTTPException(status_code=404, detail="Link de compartilhamento não encontrado.")

    board = session.get(BobarBoard, invite.board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Quadro compartilhado não encontrado.")

    owner = _get_board_owner_user(session, board)
    members_count = 1 + len(
        session.exec(
            select(BobarBoardMember).where(BobarBoardMember.board_id == (board.id or 0))
        ).all()
    )
    already_has_access = board.user_id == current_user.id or _get_board_membership(session, board.id or 0, current_user.id) is not None

    return BobarBoardSharePreviewOut(
        token=invite.token,
        board_id=board.id or 0,
        board_title=board.title,
        owner_name=owner.full_name,
        owner_email=owner.email,
        role=_normalize_board_role(invite.role),
        max_uses=invite.max_uses,
        uses_count=invite.uses_count or 0,
        remaining_uses=_invite_remaining_uses(invite),
        already_has_access=already_has_access,
        can_accept=_invite_is_usable(invite) and not already_has_access,
        is_active=invite.is_active,
        total_members=members_count,
    )


@router.post("/share/{token}/accept", response_model=BobarBoardShareAcceptOut)
def bobar_accept_share(
    token: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    invite = session.exec(
        select(BobarBoardInvite).where(BobarBoardInvite.token == token)
    ).first()
    if not invite or not _invite_is_usable(invite):
        raise HTTPException(status_code=404, detail="Esse link de compartilhamento não está mais disponível.")

    board = session.get(BobarBoard, invite.board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Quadro compartilhado não encontrado.")

    invite_role = _normalize_board_role(invite.role)

    if board.user_id == current_user.id:
        return BobarBoardShareAcceptOut(board_id=board.id or 0, role="owner")

    membership = _get_board_membership(session, board.id or 0, current_user.id)
    if membership:
        return BobarBoardShareAcceptOut(
            board_id=board.id or 0,
            role=_normalize_board_role(membership.role),
        )

    membership = BobarBoardMember(
        board_id=board.id or 0,
        user_id=current_user.id,
        role=invite_role,
        created_at=utcnow(),
        updated_at=utcnow(),
        accepted_at=utcnow(),
    )
    invite.uses_count = int(invite.uses_count or 0) + 1
    if invite.max_uses is not None and invite.uses_count >= invite.max_uses:
        invite.is_active = False
        invite.revoked_at = invite.revoked_at or utcnow()

    _touch_board(board)
    session.add(membership)
    session.add(invite)
    session.add(board)
    session.flush()
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="member_joined",
        message=f"{_display_user_name(current_user)} entrou no quadro compartilhado como {invite_role}.",
        entity_type="member",
        entity_id=current_user.id,
        metadata={
            "invite_id": invite.id,
            "role": invite_role,
        },
    )
    if invite.max_uses is not None and invite.uses_count >= invite.max_uses:
        _record_board_activity(
            session,
            board,
            actor=current_user,
            event_type="share_link_exhausted",
            message=f"O link {invite.id or 0} atingiu o limite de uso e foi encerrado automaticamente.",
            entity_type="invite",
            entity_id=invite.id or 0,
            metadata={
                "max_uses": invite.max_uses,
                "uses_count": invite.uses_count,
            },
        )
    session.commit()
    return BobarBoardShareAcceptOut(board_id=board.id or 0, role=invite_role)


@router.delete("/boards/{board_id}/members/{member_user_id}", response_model=BobarBoardCollaborationOut)
def bobar_remove_member(
    board_id: int,
    member_user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    _require_board_owner(board, current_user)

    if member_user_id == board.user_id:
        raise HTTPException(status_code=400, detail="O dono do quadro não pode ser removido.")

    membership = _get_board_membership(session, board.id or 0, member_user_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Esse usuário não tem acesso a esse quadro.")

    removed_user = session.get(User, member_user_id)
    session.delete(membership)
    _touch_board(board)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="member_removed",
        message=f"{_display_user_name(current_user)} removeu o acesso de {_display_user_name(removed_user)}.",
        entity_type="member",
        entity_id=member_user_id,
    )
    session.commit()
    return _build_collaboration_payload(session, board, current_user)


@router.post("/boards/{board_id}/chat-messages", response_model=BobarBoardCollaborationOut)
def bobar_send_chat_message(
    board_id: int,
    payload: BobarBoardChatMessageIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_accessible_board_or_default(session, current_user, board_id)
    _require_board_editor(session, board, current_user)
    message_text = _clean_text(payload.message)
    if not message_text:
        raise HTTPException(status_code=400, detail="A mensagem não pode ficar vazia.")

    chat_message = BobarBoardChatMessage(
        board_id=board.id or 0,
        user_id=current_user.id,
        message=_clip(message_text, 2000),
        created_at=utcnow(),
    )
    _touch_board(board)
    session.add(chat_message)
    session.add(board)
    _record_board_activity(
        session,
        board,
        actor=current_user,
        event_type="chat_message",
        message=f"{_display_user_name(current_user)} enviou uma mensagem no chat do projeto.",
        entity_type="chat_message",
        entity_id=chat_message.id or 0,
    )
    session.commit()
    return _build_collaboration_payload(session, board, current_user)

