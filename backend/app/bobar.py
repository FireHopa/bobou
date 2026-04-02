from __future__ import annotations

import json
import mimetypes
import os
import re
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


class BobarCardUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=140)
    note: Optional[str] = Field(default=None, max_length=5000)
    content_text: Optional[str] = Field(default=None, max_length=200000)
    card_type: Optional[str] = Field(default=None, max_length=40)
    column_id: Optional[int] = None
    structure_json: Optional[str] = Field(default=None, max_length=500000)
    due_at: Optional[str] = Field(default=None, max_length=60)
    label_ids: Optional[list[int]] = None


class BobarCardMoveIn(BaseModel):
    column_id: int
    position: int = Field(default=0, ge=0)

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


def _board_summary_out(board: BobarBoard, total_cards: int) -> BobarBoardSummaryOut:
    return BobarBoardSummaryOut(
        id=board.id or 0,
        title=board.title,
        position=board.position,
        total_cards=total_cards,
        updated_at=board.updated_at.isoformat(),
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
        total_cards=len(cards),
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
        select(BobarCard.board_id).where(BobarCard.user_id == current_user.id)
    ).all()
    for board_id in rows:
        if board_id is None:
            continue
        totals[board_id] = totals.get(board_id, 0) + 1

    return BobarBoardListOut(
        boards=[_board_summary_out(board, totals.get(board.id or 0, 0)) for board in boards]
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
    return _build_board_list(session, current_user)


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
    return _build_board_list(session, current_user)


@router.patch("/boards/{board_id}", response_model=BobarBoardListOut)
def bobar_rename_board(
    board_id: int,
    payload: BobarBoardUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    if payload.title is not None:
        title = _clean_text(payload.title)
        if not title:
            raise HTTPException(status_code=400, detail="O nome do quadro não pode ficar vazio.")
        board.title = _clip(title, 120)
    _touch_board(board)
    session.add(board)
    session.commit()
    return _build_board_list(session, current_user)


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

    attachments = session.exec(
        select(BobarAttachment)
        .where(BobarAttachment.user_id == current_user.id, BobarAttachment.board_id == (board.id or 0))
    ).all()
    for attachment in attachments:
        _delete_attachment_file(attachment)
        session.delete(attachment)

    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.board_id == (board.id or 0))
    ).all()
    for card in cards:
        session.delete(card)

    columns = session.exec(
        select(BobarColumn)
        .where(BobarColumn.user_id == current_user.id, BobarColumn.board_id == (board.id or 0))
    ).all()
    for column in columns:
        session.delete(column)

    labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == current_user.id, BobarLabel.board_id == (board.id or 0))
    ).all()
    for label in labels:
        session.delete(label)

    session.delete(board)
    session.commit()
    _reindex_boards(session, current_user)
    return _build_board_list(session, current_user)


@router.get("", response_model=BobarBoardOut)
def bobar_board(
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    return _build_board(session, current_user, board)


@router.post("/labels", response_model=BobarBoardOut)
def bobar_create_label(
    payload: BobarLabelCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    labels = session.exec(
        select(BobarLabel)
        .where(BobarLabel.user_id == current_user.id, BobarLabel.board_id == (board.id or 0))
        .order_by(BobarLabel.position.asc(), BobarLabel.id.asc())
    ).all()

    name = _clean_text(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Informe um nome para a etiqueta.")

    label = BobarLabel(
        user_id=current_user.id,
        board_id=board.id or 0,
        name=_clip(name, 60),
        color=_normalize_label_color(payload.color),
        position=len(labels),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    _touch_board(board)
    session.add(label)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.patch("/labels/{label_id}", response_model=BobarBoardOut)
def bobar_update_label(
    label_id: int,
    payload: BobarLabelUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    label = _get_label_or_404(session, current_user, label_id)
    board = _get_board_or_default(session, current_user, label.board_id)

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
    session.commit()
    return _build_board(session, current_user, board)


@router.delete("/labels/{label_id}", response_model=BobarBoardOut)
def bobar_delete_label(
    label_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    label = _get_label_or_404(session, current_user, label_id)
    board = _get_board_or_default(session, current_user, label.board_id)
    removed_label_id = label.id or 0

    cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.board_id == (board.id or 0))
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
    session.commit()
    return _build_board(session, current_user, board)


@router.post("/columns", response_model=BobarBoardOut)
def bobar_create_column(
    payload: BobarColumnCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    columns = _ensure_default_columns(session, current_user, board)
    name = _clean_text(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Informe um nome para a coluna.")

    session.add(
        BobarColumn(
            user_id=current_user.id,
            board_id=board.id or 0,
            name=_clip(name, 80),
            position=len(columns),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    _touch_board(board)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.patch("/columns/{column_id}", response_model=BobarBoardOut)
def bobar_update_column(
    column_id: int,
    payload: BobarColumnUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    column = _get_column_or_404(session, current_user, column_id)
    board = _get_board_or_default(session, current_user, column.board_id)

    if payload.name is not None:
        name = _clean_text(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail="O nome da coluna não pode ficar vazio.")
        column.name = _clip(name, 80)

    column.updated_at = utcnow()
    _touch_board(board)
    session.add(column)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.delete("/columns/{column_id}", response_model=BobarBoardOut)
def bobar_delete_column(
    column_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    target = _get_column_or_404(session, current_user, column_id)
    board = _get_board_or_default(session, current_user, target.board_id)
    columns = _ensure_default_columns(session, current_user, board)

    if len(columns) <= 1:
        raise HTTPException(status_code=400, detail="Você precisa manter ao menos uma coluna no quadro.")

    destination = next((column for column in columns if column.id != target.id), None)
    if destination is None:
        raise HTTPException(status_code=400, detail="Não foi possível realocar os cards desta coluna.")

    destination_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.column_id == destination.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()
    next_position = len(destination_cards)

    target_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.column_id == target.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

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
    session.commit()
    _reindex_columns(session, current_user, board.id or 0)
    _reindex_cards_for_column(session, current_user, destination.id or 0)
    return _build_board(session, current_user, board)


@router.post("/cards", response_model=BobarBoardOut)
def bobar_create_card(
    payload: BobarCardCreateIn,
    board_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    board = _get_board_or_default(session, current_user, board_id)
    columns = _ensure_default_columns(session, current_user, board)
    column = _get_column_or_404(session, current_user, payload.column_id) if payload.column_id else columns[0]
    if (column.board_id or 0) != (board.id or 0):
        raise HTTPException(status_code=400, detail="A coluna selecionada pertence a outro quadro.")

    existing_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.column_id == column.id)
        .order_by(BobarCard.position.asc(), BobarCard.id.asc())
    ).all()

    content_text = payload.content_text or ""
    note = payload.note or ""
    title = _derive_card_title(payload.title, payload.source_label, content_text or note)
    card_type = _derive_card_type(payload.card_type, content_text)
    structure_json = _resolve_structure_json(card_type, payload.structure_json, title, content_text)
    label_ids = _normalize_card_label_ids(session, current_user, board.id or 0, payload.label_ids)

    session.add(
        BobarCard(
            user_id=current_user.id,
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
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    _touch_board(board)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


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
    card = _get_card_or_404(session, current_user, card_id)
    board = _get_board_or_default(session, current_user, card.board_id)
    old_column_id = card.column_id

    if payload.column_id is not None and payload.column_id != card.column_id:
        new_column = _get_column_or_404(session, current_user, payload.column_id)
        if (new_column.board_id or 0) != (board.id or 0):
            raise HTTPException(status_code=400, detail="A coluna selecionada pertence a outro quadro.")
        existing_cards = session.exec(
            select(BobarCard)
            .where(BobarCard.user_id == current_user.id, BobarCard.column_id == new_column.id)
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

    if payload.due_at is not None:
        card.due_at = _parse_due_at(payload.due_at)

    if payload.label_ids is not None:
        card.label_ids_json = _json_dumps(
            _normalize_card_label_ids(session, current_user, board.id or 0, payload.label_ids)
        )

    card.updated_at = utcnow()
    _touch_board(board)
    session.add(card)
    session.add(board)
    session.commit()

    if old_column_id != card.column_id:
        _reindex_cards_for_column(session, current_user, old_column_id)
        _reindex_cards_for_column(session, current_user, card.column_id)

    return _build_board(session, current_user, board)


@router.post("/cards/{card_id}/attachments", response_model=BobarBoardOut)
async def bobar_upload_attachment(
    card_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_card_or_404(session, current_user, card_id)
    board = _get_board_or_default(session, current_user, card.board_id)

    filename = _safe_filename(file.filename)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="O arquivo está vazio.")
    if len(content) > MAX_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="O arquivo excede o limite de 25 MB.")

    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    extension = _guess_extension(filename, mime_type)
    storage_name = f"{uuid.uuid4().hex}{extension}"
    storage_path = _attachment_storage_dir(current_user.id, board.id or 0, card.id or 0) / storage_name
    storage_path.write_bytes(content)

    attachment = BobarAttachment(
        user_id=current_user.id,
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
    session.add(card)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.delete("/attachments/{attachment_id}", response_model=BobarBoardOut)
def bobar_delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    attachment = _get_attachment_or_404(session, current_user, attachment_id)
    card = _get_card_or_404(session, current_user, attachment.card_id)
    board = _get_board_or_default(session, current_user, attachment.board_id)

    _delete_attachment_file(attachment)
    session.delete(attachment)
    card.updated_at = utcnow()
    _touch_board(board)
    session.add(card)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.get("/attachments/{attachment_id}/content")
def bobar_attachment_content(
    attachment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    attachment = _get_attachment_or_404(session, current_user, attachment_id)
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
    import_card = _get_card_or_404(session, current_user, import_card_id)
    if not _is_authority_import_source_kind(import_card.source_kind):
        raise HTTPException(status_code=400, detail="Esse card não é um roteiro importado.")
    board = _get_board_or_default(session, current_user, import_card.board_id)
    return _cleanup_duplicate_workspace_for_import(session, current_user, import_card, board)


@router.post("/cards/{card_id}/move", response_model=BobarBoardOut)
def bobar_move_card(
    card_id: int,
    payload: BobarCardMoveIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_card_or_404(session, current_user, card_id)
    board = _get_board_or_default(session, current_user, card.board_id)
    target_column = _get_column_or_404(session, current_user, payload.column_id)
    if (target_column.board_id or 0) != (board.id or 0):
        raise HTTPException(status_code=400, detail="A coluna de destino pertence a outro quadro.")

    source_column_id = card.column_id
    destination_column_id = target_column.id or 0
    now = utcnow()

    source_cards = session.exec(
        select(BobarCard)
        .where(BobarCard.user_id == current_user.id, BobarCard.column_id == source_column_id)
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
            .where(BobarCard.user_id == current_user.id, BobarCard.column_id == destination_column_id)
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
    session.commit()
    return _build_board(session, current_user, board)


@router.post("/cards/{card_id}/transform-to-flowchart", response_model=BobarBoardOut)
def bobar_transform_to_flowchart(
    card_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_card_or_404(session, current_user, card_id)
    board = _get_board_or_default(session, current_user, card.board_id)
    card.card_type = "fluxograma"
    card.structure_json = _resolve_structure_json("fluxograma", card.structure_json, card.title, card.content_text)
    card.updated_at = utcnow()
    _touch_board(board)
    session.add(card)
    session.add(board)
    session.commit()
    return _build_board(session, current_user, board)


@router.delete("/cards/{card_id}", response_model=BobarBoardOut)
def bobar_delete_card(
    card_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    card = _get_card_or_404(session, current_user, card_id)
    board = _get_board_or_default(session, current_user, card.board_id)
    column_id = card.column_id
    _delete_card_attachments(session, current_user, card)
    session.delete(card)
    _touch_board(board)
    session.add(board)
    session.commit()
    _reindex_cards_for_column(session, current_user, column_id)
    return _build_board(session, current_user, board)
