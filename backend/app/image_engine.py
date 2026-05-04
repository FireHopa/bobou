from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
from PIL import Image, ImageOps, ImageChops, ImageDraw, ImageFilter, ImageEnhance, UnidentifiedImageError

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from sqlmodel import Session, select

from .credits import (
    attach_credit_headers,
    charge_credits,
    ensure_credits,
)
from .db import get_session
from .deps import get_current_user
from .models import ImageEngineHistoryEntry, ImageEngineProject, User
from .image_recomposition import adapt_image_to_custom_layout


router = APIRouter()

OPENAI_CHAT_MODEL = "gpt-5.4"
OPENAI_IMAGE_MODEL = "gpt-image-1.5"

GEMINI_NATIVE_PRO_MODEL = "gemini-3-pro-image-preview"
GEMINI_NATIVE_FAST_MODEL = "gemini-3.1-flash-image-preview"
GOOGLE_IMAGEN_MODEL = "imagen-4.0-ultra-generate-001"

FAL_MODEL_PATH = "fal-ai/flux-pro/v1.1-ultra"

HTTP_TIMEOUT = httpx.Timeout(connect=20.0, read=180.0, write=60.0, pool=60.0)


class ImageEngineRequest(BaseModel):
    formato: str = Field(..., description="quadrado_1_1, vertical_9_16 ou horizontal_16_9")
    qualidade: str = Field(..., description="baixa, media ou alta")
    onde_postar: Optional[str] = Field(default=None, description="Campo legado ignorado")
    paleta_cores: str = Field(..., description="Paleta pronta ou personalizada")
    headline: str = ""
    subheadline: str = ""
    descricao_visual: str = ""
    width: Optional[int] = Field(default=None, description="Largura final customizada em pixels")
    height: Optional[int] = Field(default=None, description="Altura final customizada em pixels")

class ImageEditRequest(BaseModel):
    formato: str = Field(..., description="quadrado_1_1, vertical_9_16 ou horizontal_16_9")
    qualidade: str = Field(..., description="baixa, media ou alta")
    instrucoes_edicao: str = ""
    width: Optional[int] = Field(default=None, description="Largura final customizada em pixels")
    height: Optional[int] = Field(default=None, description="Altura final customizada em pixels")
    preserve_original_frame: bool = Field(default=False, description="Preserva o enquadramento visível da base durante o resize final")
    allow_resize_crop: bool = Field(default=False, description="Permite crop para preencher 100% do tamanho final customizado")
    edit_scope: str = Field(default="auto", description="auto, local_patch ou global")

class ImageHistoryItemPayload(BaseModel):
    type: str = Field(default="edited")
    url: str
    thumbnailUrl: Optional[str] = None
    motor: str = ""
    engine_id: str = ""
    format: str = ""
    quality: str = ""
    width: Optional[int] = None
    height: Optional[int] = None
    prompt: Optional[str] = None
    improvedPrompt: Optional[str] = None

class ImageHistoryPayload(BaseModel):
    items: List[ImageHistoryItemPayload] = Field(default_factory=list)





class ImageEngineProjectPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    position: int = Field(default=0, ge=0)
    is_current: bool = False
    snapshot: Dict[str, Any] = Field(default_factory=dict)


class ImageEngineProjectOut(BaseModel):
    id: str
    name: str
    position: int
    is_current: bool
    snapshot: Dict[str, Any]
    updated_at: str


class ImageEngineProjectReorderItem(BaseModel):
    id: str
    position: int = Field(default=0, ge=0)


class ImageEngineProjectReorderPayload(BaseModel):
    items: List[ImageEngineProjectReorderItem] = Field(default_factory=list)
    current_project_id: Optional[str] = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)



async def _apply_postprocess_if_needed(
    client: httpx.AsyncClient,
    result: Dict[str, Any],
    target_dimensions: Optional[Tuple[int, int]],
    preserve_original_frame: bool = False,
    allow_resize_crop: bool = False,
    original_reference_bytes: Optional[bytes] = None,
) -> Dict[str, Any]:
    if not target_dimensions:
        return result

    target_width, target_height = target_dimensions
    url = result.get("url")
    if not url:
        return result

    if url.startswith("data:"):
        source_bytes, _ = _image_bytes_from_result_url(url)
    else:
        response = await client.get(url)
        response.raise_for_status()
        source_bytes = response.content

    source_width, source_height = _read_image_dimensions(source_bytes)
    if source_width == target_width and source_height == target_height:
        next_result = dict(result)
        next_result["postprocessed"] = False
        next_result["postprocess_skipped"] = "already_exact_dimensions"
        next_result["target_dimensions"] = {"width": target_width, "height": target_height}
        return next_result

    normalized_allow_resize_crop = bool(allow_resize_crop and not preserve_original_frame)

    processed_bytes = _resize_image_bytes_exact(
        source_bytes,
        target_width,
        target_height,
        preserve_original_frame=preserve_original_frame,
        allow_resize_crop=normalized_allow_resize_crop,
        original_reference_bytes=original_reference_bytes,
    )
    next_result = dict(result)
    next_result["url"] = _result_url_from_image_bytes(processed_bytes, "image/png")
    next_result["postprocessed"] = True
    next_result["target_dimensions"] = {"width": target_width, "height": target_height}
    if normalized_allow_resize_crop:
        resize_label = "Resize exato com crop"
    else:
        resize_label = "Resize exato sem crop"
    next_result["motor"] = (
        f"{result.get('motor', 'Imagem')} + "
        f"{resize_label}"
    )
    return next_result

def _size_label(width: int, height: int) -> str:
    return f"{width}x{height}"

def _sse(data: Dict[str, Any]) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

def _build_debug_payload(stage: str, message: str, details: Optional[Dict[str, Any]] = None, image: Optional[str] = None, level: str = "info") -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "stage": stage,
        "message": message,
        "level": level,
    }
    if details:
        payload["details"] = details
    if image:
        payload["image"] = image
    return payload

logger = logging.getLogger("app.image_engine")


_RUNTIME_IMAGE_EDIT_LOG_DIR = os.path.join(
    os.path.dirname(__file__),
    "_runtime",
    "image_edit_resolution_logs",
)


def _coerce_optional_form_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    return int(raw)


def _coerce_form_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    raw = str(value).strip().lower()
    if raw in {"1", "true", "t", "yes", "y", "on", "sim"}:
        return True
    if raw in {"0", "false", "f", "no", "n", "off", "nao", "não"}:
        return False
    return default


def _append_runtime_image_edit_log(
    request_id: str,
    stage: str,
    message: str,
    level: str = "info",
    details: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        os.makedirs(_RUNTIME_IMAGE_EDIT_LOG_DIR, exist_ok=True)
        file_name = f"{datetime.now(timezone.utc).date().isoformat()}.ndjson"
        path = os.path.join(_RUNTIME_IMAGE_EDIT_LOG_DIR, file_name)
        entry = {
            "request_id": request_id,
            "created_at": _utcnow().isoformat(),
            "stage": stage,
            "message": message,
            "level": level,
            "details": details or {},
        }
        with open(path, "a", encoding="utf-8") as fp:
            fp.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        logger.exception("Falha ao persistir log de runtime da edição por referência.")


def _runtime_debug_payload(
    request_id: str,
    stage: str,
    message: str,
    *,
    details: Optional[Dict[str, Any]] = None,
    level: str = "info",
    image: Optional[str] = None,
) -> Dict[str, Any]:
    _append_runtime_image_edit_log(
        request_id=request_id,
        stage=stage,
        message=message,
        level=level,
        details=details,
    )
    return _build_debug_payload(
        stage=stage,
        message=message,
        details=details,
        image=image,
        level=level,
    )


def list_local_text_candidate_rects(image_bytes: bytes) -> List[Tuple[int, int, int, int]]:
    return []


def should_use_local_text_erase(
    localized_analysis: Optional[Dict[str, Any]],
    instruction_info: Dict[str, Any],
) -> bool:
    return False


def should_use_local_text_render(
    localized_analysis: Optional[Dict[str, Any]],
    instruction_info: Dict[str, Any],
) -> bool:
    return False



def _sse_comment(comment: str = "keepalive") -> str:
    return f": {comment}\n\n"


async def _stream_sse_with_heartbeat(
    event_generator: Any,
    heartbeat_interval: float = 10.0,
):
    queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

    async def _producer() -> None:
        try:
            async for chunk in event_generator:
                if chunk is None:
                    continue
                await queue.put(chunk)
        except asyncio.CancelledError:
            logger.warning("SSE producer cancelado pelo cliente.")
            raise
        except Exception:
            logger.exception("Falha não tratada no producer do SSE.")
            fallback = _sse({
                "error": "Erro interno no stream antes da entrega final.",
            })
            await queue.put(fallback)
        finally:
            await queue.put(None)

    producer_task = asyncio.create_task(_producer())

    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=max(1.0, heartbeat_interval))
            except asyncio.TimeoutError:
                yield _sse_comment()
                continue

            if item is None:
                break
            yield item
    finally:
        if not producer_task.done():
            producer_task.cancel()
        try:
            await producer_task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Falha ao finalizar producer do SSE.")

def _clamp_text(text: str, max_len: int = 7000) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]

def _parse_json_safe(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:
        cleaned = text.strip()
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned)

def _data_uri_from_b64(b64_data: str, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{b64_data}"

def _normalize_quality(qualidade: str) -> str:
    q = (qualidade or "").strip().lower()
    if q in {"baixa", "low", "economica", "econômica"}:
        return "low"
    if q in {"media", "média", "medium", "equilibrada"}:
        return "medium"
    return "high"

def _quality_label(q: str) -> str:
    return {"low": "Baixa", "medium": "Média", "high": "Alta"}.get(q, "Alta")

def _normalize_edit_scope(value: Optional[str]) -> str:
    raw = (value or "auto").strip().lower()
    if raw in {"local", "local_patch", "patch_local", "patch"}:
        return "local_patch"
    if raw in {"global", "wide", "generative", "generativa_ampla"}:
        return "global"
    return "auto"

def _requires_strict_local_text_preservation(
    edit_scope: str,
    instruction_info: Dict[str, Any],
) -> bool:
    normalized_scope = _normalize_edit_scope(edit_scope)
    return bool(
        instruction_info.get("is_pure_text_edit")
        and normalized_scope in {"auto", "local_patch"}
    )

def _is_result_from_ai(result: Optional[Dict[str, Any]]) -> bool:
    if not result:
        return False
    engine_id = str(result.get("engine_id") or "").lower()
    motor = str(result.get("motor") or "").lower()
    if engine_id.startswith("local_") or "edição local estruturada" in motor or "remoção local estruturada" in motor:
        return False
    return True

def _analysis_guard_rect(
    analysis: Dict[str, Any],
    base_width: int,
    base_height: int,
) -> Optional[Tuple[int, int, int, int]]:
    operation = str((analysis or {}).get("operation") or "").lower()
    rect = _norm_box_to_px_engine(
        (analysis or {}).get("text_bbox")
        or (analysis or {}).get("bbox")
        or (analysis or {}).get("container_bbox"),
        base_width,
        base_height,
    )
    if not rect:
        return None

    rw = max(1, rect[2] - rect[0])
    rh = max(1, rect[3] - rect[1])

    if operation == "text_remove":
        pad_x = max(5, int(round(rw * 0.12)))
        pad_y = max(4, int(round(rh * 0.22)))
    elif operation in {"append_right", "append_left"}:
        pad_x = max(12, int(round(rw * 0.34)))
        pad_y = max(8, int(round(rh * 0.28)))
    else:
        pad_x = max(8, int(round(rw * 0.20)))
        pad_y = max(6, int(round(rh * 0.30)))

    return _inflate_rect_engine(rect, pad_x, pad_y, base_width, base_height)

def _scale_rect_for_size(
    rect: Tuple[int, int, int, int],
    src_width: int,
    src_height: int,
    dst_width: int,
    dst_height: int,
) -> Tuple[int, int, int, int]:
    sx = dst_width / float(max(1, src_width))
    sy = dst_height / float(max(1, src_height))
    return (
        max(0, min(dst_width, int(round(rect[0] * sx)))),
        max(0, min(dst_height, int(round(rect[1] * sy)))),
        max(0, min(dst_width, int(round(rect[2] * sx)))),
        max(0, min(dst_height, int(round(rect[3] * sy)))),
    )

def _compute_outside_edit_metrics(
    original_bytes: bytes,
    edited_bytes: bytes,
    analysis: Dict[str, Any],
) -> Optional[Dict[str, float]]:
    with Image.open(io.BytesIO(original_bytes)) as orig_im, Image.open(io.BytesIO(edited_bytes)) as edited_im:
        original = orig_im.convert("RGB")
        edited = edited_im.convert("RGB")

        if original.size != edited.size:
            original = original.resize(edited.size, Image.Resampling.LANCZOS)

        base_rect = _analysis_guard_rect(analysis, orig_im.size[0], orig_im.size[1])
        if not base_rect:
            return None

        rect = _scale_rect_for_size(base_rect, orig_im.size[0], orig_im.size[1], edited.size[0], edited.size[1])
        rect = _inflate_rect_engine(rect, 6, 6, edited.size[0], edited.size[1])

        original = original.filter(ImageFilter.GaussianBlur(radius=0.35))
        edited = edited.filter(ImageFilter.GaussianBlur(radius=0.35))

        orig_arr = np.asarray(original, dtype=np.int16)
        edited_arr = np.asarray(edited, dtype=np.int16)
        diff = np.abs(orig_arr - edited_arr).mean(axis=2)

        mask = np.ones((edited.size[1], edited.size[0]), dtype=bool)
        x1, y1, x2, y2 = rect
        if x2 > x1 and y2 > y1:
            mask[y1:y2, x1:x2] = False

        if not mask.any():
            return None

        outside = diff[mask]
        if outside.size == 0:
            return None

        changed_ratio = float((outside >= 18.0).mean())
        mean_diff = float(outside.mean())
        p95 = float(np.percentile(outside, 95))
        p99 = float(np.percentile(outside, 99))
        return {
            "outside_mean": round(mean_diff, 4),
            "outside_changed_ratio": round(changed_ratio, 6),
            "outside_p95": round(p95, 4),
            "outside_p99": round(p99, 4),
        }

def _preservation_guard_failed(metrics: Optional[Dict[str, float]]) -> bool:
    if not metrics:
        return False
    return bool(
        (metrics["outside_changed_ratio"] >= 0.010 and metrics["outside_mean"] >= 6.6)
        or (metrics["outside_changed_ratio"] >= 0.006 and metrics["outside_p95"] >= 24.0)
        or (metrics["outside_changed_ratio"] >= 0.0035 and metrics["outside_p99"] >= 36.0)
    )


async def _read_result_bytes(
    client: httpx.AsyncClient,
    result: Dict[str, Any],
) -> Tuple[bytes, str]:
    result_url = result.get("url")
    if not result_url:
        raise ValueError("Resultado sem URL para validação.")
    if str(result_url).startswith("data:"):
        return _image_bytes_from_result_url(result_url)
    fetched = await client.get(result_url)
    fetched.raise_for_status()
    return fetched.content, _guess_image_content_type("", fetched.headers.get("content-type"))

def _load_snapshot_json(raw_value: Optional[str]) -> Dict[str, Any]:
    if not raw_value:
        return {}
    try:
        data = json.loads(raw_value)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _serialize_image_project(project: ImageEngineProject) -> ImageEngineProjectOut:
    return ImageEngineProjectOut(
        id=project.public_id,
        name=project.name,
        position=project.position,
        is_current=project.is_current,
        snapshot=_load_snapshot_json(project.snapshot_json),
        updated_at=project.updated_at.isoformat() if project.updated_at else _utcnow().isoformat(),
    )


def _serialize_image_history_item(entry: ImageEngineHistoryEntry) -> Dict[str, Any]:
    return {
        "id": entry.public_id,
        "type": entry.type,
        "url": entry.url,
        "thumbnailUrl": entry.thumbnail_url,
        "motor": entry.motor,
        "engine_id": entry.engine_id,
        "format": entry.format,
        "quality": entry.quality,
        "createdAt": entry.created_at.isoformat() if entry.created_at else _utcnow().isoformat(),
        "width": entry.width,
        "height": entry.height,
        "prompt": entry.prompt,
        "improvedPrompt": entry.improved_prompt,
    }


def _get_user_image_project_or_404(
    session: Session,
    user_id: int,
    public_id: str,
) -> ImageEngineProject:
    project = session.exec(
        select(ImageEngineProject).where(
            ImageEngineProject.user_id == user_id,
            ImageEngineProject.public_id == public_id,
        )
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@router.get("/api/image-engine/projects")
def list_image_engine_projects(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    projects = session.exec(
        select(ImageEngineProject)
        .where(ImageEngineProject.user_id == current_user.id)
        .order_by(ImageEngineProject.position.asc(), ImageEngineProject.updated_at.desc())
    ).all()
    return {"projects": [_serialize_image_project(project).model_dump() for project in projects]}


@router.post("/api/image-engine/projects")
def create_image_engine_project(
    payload: ImageEngineProjectPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = _utcnow()

    if payload.is_current:
        current_projects = session.exec(
            select(ImageEngineProject).where(ImageEngineProject.user_id == current_user.id)
        ).all()
        for item in current_projects:
            item.is_current = False
            item.updated_at = now
            session.add(item)

    project = ImageEngineProject(
        user_id=current_user.id,
        public_id=f"image-project-{os.urandom(8).hex()}",
        name=payload.name.strip(),
        position=payload.position,
        snapshot_json=json.dumps(payload.snapshot or {}, ensure_ascii=False),
        is_current=payload.is_current,
        created_at=now,
        updated_at=now,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return {"project": _serialize_image_project(project).model_dump()}


@router.get("/api/image-engine/history")
def read_image_engine_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    entries = session.exec(
        select(ImageEngineHistoryEntry)
        .where(ImageEngineHistoryEntry.user_id == current_user.id)
        .order_by(ImageEngineHistoryEntry.created_at.desc(), ImageEngineHistoryEntry.id.desc())
    ).all()
    return {"items": [_serialize_image_history_item(entry) for entry in entries]}


@router.post("/api/image-engine/history")
def write_image_engine_history(
    payload: ImageHistoryPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    created_entries: List[ImageEngineHistoryEntry] = []
    for item in payload.items:
        entry = ImageEngineHistoryEntry(
            user_id=current_user.id,
            public_id=f"image-history-{os.urandom(8).hex()}",
            type=(item.type or "edited").strip() or "edited",
            url=item.url,
            thumbnail_url=item.thumbnailUrl,
            motor=item.motor,
            engine_id=item.engine_id,
            format=item.format,
            quality=item.quality,
            width=item.width,
            height=item.height,
            prompt=item.prompt,
            improved_prompt=item.improvedPrompt,
            created_at=_utcnow(),
        )
        session.add(entry)
        created_entries.append(entry)

    session.commit()
    for entry in created_entries:
        session.refresh(entry)

    return {"items": [_serialize_image_history_item(entry) for entry in created_entries]}


@router.delete("/api/image-engine/history")
def clear_image_engine_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    entries = session.exec(
        select(ImageEngineHistoryEntry).where(ImageEngineHistoryEntry.user_id == current_user.id)
    ).all()
    for entry in entries:
        session.delete(entry)
    session.commit()
    return {"ok": True}


@router.put("/api/image-engine/projects/{public_id}")
def update_image_engine_project(
    public_id: str,
    payload: ImageEngineProjectPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = _utcnow()
    project = _get_user_image_project_or_404(session, current_user.id, public_id)

    if payload.is_current:
        current_projects = session.exec(
            select(ImageEngineProject).where(ImageEngineProject.user_id == current_user.id)
        ).all()
        for item in current_projects:
            item.is_current = False
            item.updated_at = now
            session.add(item)

    project.name = payload.name.strip()
    project.position = payload.position
    project.snapshot_json = json.dumps(payload.snapshot or {}, ensure_ascii=False)
    project.is_current = payload.is_current
    project.updated_at = now

    session.add(project)
    session.commit()
    session.refresh(project)
    return {"project": _serialize_image_project(project).model_dump()}


@router.patch("/api/image-engine/projects/reorder")
def reorder_image_engine_projects(
    payload: ImageEngineProjectReorderPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = _utcnow()
    projects = session.exec(
        select(ImageEngineProject).where(ImageEngineProject.user_id == current_user.id)
    ).all()
    if not projects:
        return {"ok": True, "projects": []}

    by_public_id = {project.public_id: project for project in projects}
    explicit_positions = {
        item.id: int(item.position)
        for item in list(payload.items or [])
        if item.id in by_public_id
    }
    ordered_ids = [item.id for item in sorted(list(payload.items or []), key=lambda entry: entry.position) if item.id in by_public_id]
    remaining_ids = [project.public_id for project in sorted(projects, key=lambda item: (item.position, item.updated_at)) if project.public_id not in explicit_positions]

    next_position = 0
    seen: set[str] = set()

    for public_id in ordered_ids + remaining_ids:
        if public_id in seen:
            continue
        project = by_public_id.get(public_id)
        if project is None:
            continue
        project.position = explicit_positions.get(public_id, next_position)
        project.is_current = bool(public_id == payload.current_project_id)
        project.updated_at = now
        session.add(project)
        seen.add(public_id)
        next_position = max(next_position + 1, project.position + 1)

    if payload.current_project_id and payload.current_project_id in by_public_id:
        for public_id, project in by_public_id.items():
            expected_current = public_id == payload.current_project_id
            if project.is_current != expected_current:
                project.is_current = expected_current
                project.updated_at = now
                session.add(project)

    session.commit()

    refreshed_projects = session.exec(
        select(ImageEngineProject)
        .where(ImageEngineProject.user_id == current_user.id)
        .order_by(ImageEngineProject.position.asc(), ImageEngineProject.updated_at.desc())
    ).all()
    return {"ok": True, "projects": [_serialize_image_project(project).model_dump() for project in refreshed_projects]}


@router.delete("/api/image-engine/projects/{public_id}")
def delete_image_engine_project(
    public_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _get_user_image_project_or_404(session, current_user.id, public_id)
    session.delete(project)
    session.commit()
    return {"ok": True, "deleted_project_id": public_id}




SUPPORTED_BASE_SIZES: List[Tuple[int, int]] = [
    (1024, 1024),
    (1024, 1536),
    (1536, 1024),
]


def _normalize_dimension_value(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        raise ValueError("Width e height precisam ser números inteiros.")

    if normalized < 256 or normalized > 4096:
        raise ValueError("Width e height precisam estar entre 256 e 4096 pixels.")

    return normalized


def _resolve_target_dimensions(width: Optional[int], height: Optional[int]) -> Optional[Tuple[int, int]]:
    normalized_width = _normalize_dimension_value(width)
    normalized_height = _normalize_dimension_value(height)

    if normalized_width is None and normalized_height is None:
        return None

    if normalized_width is None or normalized_height is None:
        raise ValueError("Para usar tamanho customizado, informe width e height.")

    return normalized_width, normalized_height


def _base_size_to_aspect_ratio(width: int, height: int) -> str:
    if width == height:
        return "1:1"
    if height > width:
        return "9:16"
    return "16:9"


def _choose_best_supported_base_size(target_width: int, target_height: int) -> Tuple[int, int]:
    best_size: Optional[Tuple[int, int]] = None
    best_score: Optional[Tuple[float, float, int]] = None

    for base_width, base_height in SUPPORTED_BASE_SIZES:
        scale = max(target_width / base_width, target_height / base_height)
        scaled_width = base_width * scale
        scaled_height = base_height * scale
        waste = (scaled_width * scaled_height) - (target_width * target_height)
        orientation_penalty = 0
        if (target_height > target_width and base_height < base_width) or (target_width > target_height and base_width < base_height):
            orientation_penalty = 1
        score = (orientation_penalty, waste, abs((base_width / base_height) - (target_width / target_height)))
        if best_score is None or score < best_score:
            best_score = score
            best_size = (base_width, base_height)

    return best_size or (1024, 1024)


def _preset_dimensions_from_formato(formato: str) -> Tuple[int, int]:
    normalized = (formato or "").strip().lower()
    if normalized == "vertical_9_16":
        return (1024, 1536)
    if normalized == "horizontal_16_9":
        return (1536, 1024)
    return (1024, 1024)


def _resolve_edit_target_dimensions(payload: ImageEditRequest) -> Optional[Tuple[int, int]]:
    explicit = _resolve_target_dimensions(payload.width, payload.height)
    if explicit:
        return explicit
    return _preset_dimensions_from_formato(payload.formato)



def _normalize_instruction_text(value: str) -> str:
    normalized = (value or "").strip().lower()
    normalized = re.sub(r"[_\-]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _contains_instruction_phrase(normalized_text: str, phrases: List[str]) -> bool:
    padded = f" {normalized_text} "
    for phrase in phrases:
        candidate = f" {(phrase or '').strip().lower()} "
        if candidate.strip() and candidate in padded:
            return True
    return False


def _has_explicit_destructive_edit_intent(normalized_text: str) -> bool:
    edit_verbs = [
        "trocar",
        "substituir",
        "mudar",
        "alterar",
        "remover",
        "apagar",
        "corrigir",
        "reescrever",
        "traduzir",
        "adicionar",
        "inserir",
        "retirar",
        "deletar",
    ]
    edit_targets = [
        "texto",
        "headline",
        "subheadline",
        "titulo",
        "título",
        "cta",
        "botão",
        "botao",
        "logo",
        "marca",
        "produto",
        "pessoa",
        "rosto",
        "objeto",
        "carro",
        "moto",
        "bike",
        "céu",
        "céu",
        "cor",
        "sombra",
        "luz",
        "iluminação",
        "iluminacao",
        "fundo",
        "personagem",
    ]

    has_verb = _contains_instruction_phrase(normalized_text, edit_verbs)
    has_target = _contains_instruction_phrase(normalized_text, edit_targets)
    return bool(has_verb and has_target)


def _is_canvas_only_edit_request(
    payload: ImageEditRequest,
    instruction_info: Optional[Dict[str, Any]] = None,
) -> bool:
    instruction_info = instruction_info or {}
    normalized = _normalize_instruction_text(payload.instrucoes_edicao)

    if instruction_info.get("is_pure_text_edit"):
        return False

    if _has_explicit_destructive_edit_intent(normalized):
        return False

    negative_phrases = [
        "trocar o texto",
        "trocar texto",
        "mudar o texto",
        "alterar o texto",
        "remover o texto",
        "apagar o texto",
        "corrigir o texto",
        "reescrever o texto",
        "traduzir o texto",
        "adicionar texto",
        "inserir texto",
        "mudar a cor",
        "alterar a cor",
        "trocar o logo",
        "mudar o logo",
        "alterar o logo",
        "remover logo",
        "tirar logo",
        "trocar a logo",
        "trocar a marca",
        "alterar a marca",
        "trocar produto",
        "mudar produto",
        "alterar produto",
    ]
    if _contains_instruction_phrase(normalized, negative_phrases):
        return False

    canvas_keywords = [
        "9:16",
        "16:9",
        "1:1",
        "formato",
        "proporção",
        "proporcao",
        "aspect ratio",
        "canvas",
        "expandir",
        "estender",
        "aumentar área",
        "aumentar area",
        "sem crop",
        "sem cortar",
        "reencaixar",
        "reenquadrar",
        "ajustar tamanho",
        "mudar tamanho",
        "banner",
        "stories",
        "story",
        "reels",
        "reel",
        "shorts",
        "short",
        "vertical",
        "horizontal",
        "quadrado",
        "adaptar para",
        "transforme essa imagem em",
        "transforme essa imagem para",
        "transformar essa imagem em",
        "transformar essa imagem para",
        "converter para",
        "resolução",
        "resolucao",
        "redimensionar",
    ]

    preserve_only_phrases = [
        "mantenha todos os elementos",
        "mantendo todos os elementos",
        "preserve todos os elementos",
        "mantendo os elementos visuais",
        "preserve os elementos visuais",
        "fazendo somente as adaptações necessárias",
        "fazendo apenas as adaptações necessárias",
        "somente as adaptações necessárias",
        "apenas as adaptações necessárias",
        "sem alterar o conteúdo",
        "sem mudar o conteúdo",
    ]

    return _contains_instruction_phrase(normalized, canvas_keywords) or _contains_instruction_phrase(normalized, preserve_only_phrases)


def _is_strong_canvas_recompose_case(
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> bool:
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = target_width / max(1.0, float(target_height))
    orientation_changed = (source_width >= source_height) != (target_width >= target_height)
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    return bool(orientation_changed or ratio_delta >= 0.32)



def _is_custom_resolution_layout_adaptation(
    payload: ImageEditRequest,
    source_width: int,
    source_height: int,
    target_dimensions: Optional[Tuple[int, int]],
    resolution_source: Optional[str] = None,
) -> bool:
    if not target_dimensions:
        return False

    target_width, target_height = target_dimensions
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = target_width / max(1.0, float(target_height))
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    normalized = _normalize_instruction_text(payload.instrucoes_edicao)
    resolution_source_label = (resolution_source or "").strip().lower()

    custom_resolution_requested = bool(payload.width and payload.height) or resolution_source_label in {
        "chat_instruction",
        "panel",
        "manual",
        "explicit",
    }
    layout_words = [
        "resolução",
        "resolucao",
        "tamanho",
        "formato",
        "proporção",
        "proporcao",
        "adaptar",
        "transforme",
        "transformar",
        "converter",
        "redimensionar",
        "horizontal",
        "vertical",
        "banner",
        "stories",
        "reels",
    ]
    layout_intent = _contains_instruction_phrase(normalized, layout_words)

    # Para resolução customizada, o padrão correto é recompor layout, não preservar frame antigo.
    # A antiga expansão guardada só entra quando não há intenção/tamanho customizado claro.
    return bool(custom_resolution_requested or layout_intent or ratio_delta >= 0.08)

def _smart_expand_strength_from_geometry(
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> str:
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = target_width / max(1.0, float(target_height))
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    if ratio_delta >= 0.72:
        return "high"
    if ratio_delta >= 0.36:
        return "medium"
    return "low"


def _build_local_result_from_bytes(
    image_bytes: bytes,
    engine_id: str,
    motor: str,
    raw: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "engine_id": engine_id,
        "motor": motor,
        "url": _result_url_from_image_bytes(image_bytes, "image/png"),
        "raw": raw or {},
    }


def _build_canvas_only_resize_result(
    image_bytes: bytes,
    payload: ImageEditRequest,
    target_dimensions: Tuple[int, int],
) -> Dict[str, Any]:
    target_width, target_height = target_dimensions
    source_width, source_height = _read_image_dimensions(image_bytes)
    normalized_allow_resize_crop = bool(payload.allow_resize_crop and not payload.preserve_original_frame)

    if _needs_exact_canvas_expand(
        source_width,
        source_height,
        target_width,
        target_height,
        allow_resize_crop=normalized_allow_resize_crop,
    ):
        raise ValueError(
            "A adaptação solicitada exige expansão real de canvas por IA. "
            "O fallback determinístico com blur, espelhamento ou duplicação foi desativado."
        )

    resized = _resize_image_bytes_exact(
        image_bytes,
        target_width,
        target_height,
        preserve_original_frame=payload.preserve_original_frame,
        allow_resize_crop=normalized_allow_resize_crop,
        original_reference_bytes=image_bytes,
    )
    return _build_local_result_from_bytes(
        resized,
        engine_id="local_canvas_resize",
        motor="Resize Determinístico",
        raw={
            "strategy": "canvas_only_resize",
            "source_size": [source_width, source_height],
            "target_size": [target_width, target_height],
            "preserve_original_frame": payload.preserve_original_frame,
            "allow_resize_crop": normalized_allow_resize_crop,
        },
    )



def _image_bytes_from_result_url(url: str) -> Tuple[bytes, str]:
    if url.startswith("data:"):
        header, b64_data = url.split(",", 1)
        mime = header.split(";")[0].replace("data:", "") or "image/png"
        return base64.b64decode(b64_data), mime
    raise ValueError("Resultado externo precisa ser baixado antes do pós-processamento.")


def _result_url_from_image_bytes(image_bytes: bytes, mime: str = "image/png") -> str:
    return _data_uri_from_b64(base64.b64encode(image_bytes).decode("utf-8"), mime)


def _read_image_dimensions(image_bytes: bytes) -> Tuple[int, int]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            return image.size
    except UnidentifiedImageError as exc:
        raise ValueError(f"Não foi possível ler as dimensões da imagem enviada: {exc}")



def _trim_uniform_borders(image: Image.Image) -> Image.Image:
    """
    Remove apenas padding realmente transparente.
    Não corta bordas opacas, vinheta, sombra, glow nem margens escuras do layout.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    if width < 8 or height < 8:
        return rgba

    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return rgba

    if bbox == (0, 0, width, height):
        return rgba

    left, top, right, bottom = bbox
    trimmed_width = right - left
    trimmed_height = bottom - top
    if trimmed_width <= 0 or trimmed_height <= 0:
        return rgba

    coverage_ratio = (trimmed_width * trimmed_height) / max(1, width * height)
    if coverage_ratio < 0.55:
        return rgba

    transparent_margin = max(left, top, width - right, height - bottom)
    if transparent_margin <= 0:
        return rgba

    return rgba.crop(bbox)


def _encode_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _resize_to_cover(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    return ImageOps.fit(
        image,
        (target_width, target_height),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def _resize_to_contain(image: Image.Image, target_width: int, target_height: int) -> Tuple[Image.Image, Tuple[int, int, int, int]]:
    prepared = image.convert("RGBA")
    src_width, src_height = prepared.size
    if src_width <= 0 or src_height <= 0:
        raise ValueError("Imagem inválida para contain.")

    scale = min(target_width / max(1, src_width), target_height / max(1, src_height))
    fitted_width = max(1, int(round(src_width * scale)))
    fitted_height = max(1, int(round(src_height * scale)))
    fitted = prepared.resize((fitted_width, fitted_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - fitted_width) // 2)
    y = max(0, (target_height - fitted_height) // 2)
    return fitted, (x, y, x + fitted_width, y + fitted_height)


def _resize_mask_to_contain(mask: Image.Image, target_width: int, target_height: int) -> Image.Image:
    mask_l = mask.convert("L")
    fitted, placement = _resize_to_contain(mask_l.convert("RGBA"), target_width, target_height)
    canvas = Image.new("L", (target_width, target_height), 0)
    x1, y1, _, _ = placement
    canvas.paste(fitted.getchannel("A"), (x1, y1))
    return canvas


def _resize_mask_to_cover(mask: Image.Image, target_width: int, target_height: int) -> Image.Image:
    return _resize_to_cover(mask.convert("L"), target_width, target_height)



def _build_directional_alpha_mask(width: int, height: int, orientation: str) -> Image.Image:
    if width <= 0 or height <= 0:
        return Image.new("L", (max(1, width), max(1, height)), 0)

    if orientation == "left":
        gradient = np.linspace(1.0, 0.0, width, dtype=np.float32)
        alpha = np.tile(gradient, (height, 1))
    elif orientation == "right":
        gradient = np.linspace(0.0, 1.0, width, dtype=np.float32)
        alpha = np.tile(gradient, (height, 1))
    elif orientation == "top":
        gradient = np.linspace(1.0, 0.0, height, dtype=np.float32)
        alpha = np.tile(gradient[:, None], (1, width))
    else:
        gradient = np.linspace(0.0, 1.0, height, dtype=np.float32)
        alpha = np.tile(gradient[:, None], (1, width))

    alpha = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(alpha, mode="L")


def _build_edge_repeat_fill(
    strip: Image.Image,
    target_width: int,
    target_height: int,
    orientation: str,
) -> Image.Image:
    rgba = strip.convert("RGBA")
    if orientation in {"left", "right"}:
        seam_column_x = 0 if orientation == "left" else max(0, rgba.width - 1)
        seam_column = rgba.crop((seam_column_x, 0, seam_column_x + 1, rgba.height))
        return seam_column.resize((target_width, target_height), Image.Resampling.BILINEAR)

    seam_row_y = 0 if orientation == "top" else max(0, rgba.height - 1)
    seam_row = rgba.crop((0, seam_row_y, rgba.width, seam_row_y + 1))
    return seam_row.resize((target_width, target_height), Image.Resampling.BILINEAR)


def _build_edge_texture_fill(
    strip: Image.Image,
    target_width: int,
    target_height: int,
) -> Image.Image:
    rgba = strip.convert("RGBA")
    return rgba.resize((target_width, target_height), Image.Resampling.LANCZOS)


def _compose_edge_fill(
    strip: Image.Image,
    target_width: int,
    target_height: int,
    orientation: str,
) -> Image.Image:
    if target_width <= 0 or target_height <= 0:
        return Image.new("RGBA", (max(1, target_width), max(1, target_height)), (0, 0, 0, 0))

    repeat_fill = _build_edge_repeat_fill(
        strip,
        target_width=target_width,
        target_height=target_height,
        orientation=orientation,
    )
    texture_fill = _build_edge_texture_fill(
        strip,
        target_width=target_width,
        target_height=target_height,
    )
    alpha_mask = _build_directional_alpha_mask(
        width=target_width,
        height=target_height,
        orientation=orientation,
    )
    return Image.composite(texture_fill, repeat_fill, alpha_mask)


def _edge_extend_fill(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    prepared = image.convert("RGBA")
    src_width, src_height = prepared.size
    if src_width <= 0 or src_height <= 0:
        raise ValueError("Imagem inválida para expansão de borda.")

    src_ratio = src_width / max(1, src_height)
    target_ratio = target_width / max(1, target_height)

    if abs(src_ratio - target_ratio) <= 0.012:
        return prepared.resize((target_width, target_height), Image.Resampling.LANCZOS)

    fitted, placement = _resize_to_contain(prepared, target_width, target_height)
    x1, y1, x2, y2 = placement
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 255))
    canvas.alpha_composite(fitted, (x1, y1))

    if x1 > 0:
        strip_width = min(fitted.width, max(24, min(96, x1 * 2, fitted.width // 5 or fitted.width)))
        left_source = fitted.crop((0, 0, strip_width, fitted.height))
        right_source = fitted.crop((fitted.width - strip_width, 0, fitted.width, fitted.height))
        left_fill = _compose_edge_fill(left_source, x1, fitted.height, "left")
        right_fill = _compose_edge_fill(right_source, target_width - x2, fitted.height, "right")
        canvas.alpha_composite(left_fill, (0, y1))
        canvas.alpha_composite(right_fill, (x2, y1))

    if y1 > 0:
        strip_height = min(fitted.height, max(24, min(96, y1 * 2, fitted.height // 5 or fitted.height)))
        top_source = fitted.crop((0, 0, fitted.width, strip_height))
        bottom_source = fitted.crop((0, fitted.height - strip_height, fitted.width, fitted.height))
        top_fill = _compose_edge_fill(top_source, fitted.width, y1, "top")
        bottom_fill = _compose_edge_fill(bottom_source, fitted.width, target_height - y2, "bottom")
        canvas.alpha_composite(top_fill, (x1, 0))
        canvas.alpha_composite(bottom_fill, (x1, y2))

    if x1 > 0 and y1 > 0:
        top_left = _compose_edge_fill(fitted.crop((0, 0, min(fitted.width, max(24, fitted.width // 6)), min(fitted.height, max(24, fitted.height // 6)))), x1, y1, "left")
        top_right = _compose_edge_fill(fitted.crop((max(0, fitted.width - max(24, fitted.width // 6)), 0, fitted.width, min(fitted.height, max(24, fitted.height // 6)))), target_width - x2, y1, "right")
        bottom_left = _compose_edge_fill(fitted.crop((0, max(0, fitted.height - max(24, fitted.height // 6)), min(fitted.width, max(24, fitted.width // 6)), fitted.height)), x1, target_height - y2, "left")
        bottom_right = _compose_edge_fill(fitted.crop((max(0, fitted.width - max(24, fitted.width // 6)), max(0, fitted.height - max(24, fitted.height // 6)), fitted.width, fitted.height)), target_width - x2, target_height - y2, "right")
        canvas.alpha_composite(top_left, (0, 0))
        canvas.alpha_composite(top_right, (x2, 0))
        canvas.alpha_composite(bottom_left, (0, y2))
        canvas.alpha_composite(bottom_right, (x2, y2))

    return canvas


def _needs_preserve_frame_expand(
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> bool:
    if source_width <= 0 or source_height <= 0 or target_width <= 0 or target_height <= 0:
        return False
    source_ratio = source_width / max(1, source_height)
    target_ratio = target_width / max(1, target_height)
    return abs(source_ratio - target_ratio) > 0.012


def _needs_exact_canvas_expand(
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
    allow_resize_crop: bool,
) -> bool:
    if allow_resize_crop:
        return False
    return _needs_preserve_frame_expand(
        source_width,
        source_height,
        target_width,
        target_height,
    )


def _build_fast_canvas_only_improvement(
    target_dimensions: Optional[Tuple[int, int]],
    expand_without_crop_needed: bool,
) -> Dict[str, str]:
    target_label = (
        f"{target_dimensions[0]}x{target_dimensions[1]}"
        if target_dimensions
        else "tamanho original"
    )
    flow_label = (
        "expand_canvas_layer_preserve_local"
        if expand_without_crop_needed
        else "deterministic_resize"
    )
    return {
        "prompt_final": "",
        "negative_prompt": "",
        "creative_direction": (
            "Fluxo rápido de adaptação de canvas local, preservando a imagem original como camada intacta."
            if expand_without_crop_needed
            else "Fluxo rápido de resize determinístico sem chamadas extras de linguagem."
        ),
        "layout_notes": f"Saída final orientada para {target_label}.",
        "preservation_rules": (
            "Preservar a peça original como camada protegida e construir somente o canvas externo."
            if expand_without_crop_needed
            else "Preservar a composição e apenas ajustar o resize final."
        ),
        "edit_strategy": flow_label,
        "micro_detail_rules": "",
        "consistency_rules": (
            "Sem chamada de IA, sem redesenhar textos/logos e sem alterar a camada original."
            if expand_without_crop_needed
            else "Sem crop adicional e sem deformação."
        ),
    }


def _expand_sides_from_placement(
    placement: Dict[str, int],
) -> List[str]:
    sides: List[str] = []
    if int(placement.get("x", 0)) > 0:
        sides.extend(["esquerda", "direita"])
    if int(placement.get("y", 0)) > 0:
        sides.extend(["topo", "base"])
    if not sides:
        return ["externas"]
    return sides


def _build_preserve_frame_canvas(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
) -> Tuple[bytes, bytes, Dict[str, int]]:
    with Image.open(io.BytesIO(image_bytes)) as im:
        source = im.convert("RGBA")
        fitted, placement = _resize_to_contain(source, target_width, target_height)
        x1, y1, x2, y2 = placement

        canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        canvas.alpha_composite(fitted, (x1, y1))

        mask = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(mask)
        draw.rectangle((x1, y1, x2, y2), fill=(255, 255, 255, 255))

        canvas_bytes = _encode_png_bytes(canvas)
        mask_bytes = _encode_png_bytes(mask)
        return canvas_bytes, mask_bytes, {
            "x": x1,
            "y": y1,
            "width": x2 - x1,
            "height": y2 - y1,
            "target_width": target_width,
            "target_height": target_height,
        }


def _overlay_preserved_region(
    expanded_bytes: bytes,
    original_bytes: bytes,
    placement: Dict[str, int],
    feather_px: int = 18,
) -> bytes:
    with Image.open(io.BytesIO(expanded_bytes)) as expanded_im, Image.open(io.BytesIO(original_bytes)) as original_im:
        expanded = expanded_im.convert("RGBA")
        fitted_original, _ = _resize_to_contain(
            original_im.convert("RGBA"),
            placement["target_width"],
            placement["target_height"],
        )

        original_canvas = Image.new("RGBA", expanded.size, (0, 0, 0, 0))
        original_canvas.alpha_composite(fitted_original, (placement["x"], placement["y"]))

        mask = Image.new("L", expanded.size, 0)
        draw = ImageDraw.Draw(mask)

        x1 = int(placement["x"])
        y1 = int(placement["y"])
        x2 = x1 + fitted_original.width
        y2 = y1 + fitted_original.height

        max_feather = max(2, min(fitted_original.width, fitted_original.height) // 14)
        feather = max(4, min(int(feather_px), max_feather))
        inner_x1 = min(x2, x1 + feather)
        inner_y1 = min(y2, y1 + feather)
        inner_x2 = max(x1, x2 - feather)
        inner_y2 = max(y1, y2 - feather)

        if inner_x2 > inner_x1 and inner_y2 > inner_y1:
            draw.rectangle((inner_x1, inner_y1, inner_x2, inner_y2), fill=255)
            mask = mask.filter(ImageFilter.GaussianBlur(radius=max(2, feather // 2)))
        else:
            draw.rectangle((x1, y1, x2, y2), fill=255)

        blended = Image.composite(original_canvas, expanded, mask)
        return _encode_png_bytes(blended)



def _build_preserve_frame_expand_prompt(
    requested_width: int,
    requested_height: int,
    placement: Dict[str, int],
) -> str:
    sides = ", ".join(_expand_sides_from_placement(placement))
    return (
        "Expanda a peça somente nas áreas externas transparentes do novo canvas. "
        f"As extensões necessárias estão principalmente nas regiões: {sides}. "
        "A área central já existente deve continuar intacta e coerente com o original. "
        "Não mova, não recorte, não redimensione, não traduza, não reescreva e não redesenhe "
        "textos, datas, CTA, logos, botões, selos, labels, ícones ou qualquer elemento já presente. "
        "Continue cenário, perspectiva, linhas de fuga, sombras, reflexos, vegetação, arquitetura, céu, solo, trilhas de luz, gradientes e fundos "
        "como uma continuação natural da arte. "
        "É proibido espelhar a imagem, repetir faixas verticais ou horizontais, duplicar estruturas inteiras, clonar objetos, criar costuras retas "
        "ou copiar a mesma borda para preencher espaço. "
        "Se algum elemento toca a borda atual, prolongue esse elemento com perspectiva e escala corretas em vez de repetir o trecho existente. "
        "Não crie textos novos. Não duplique botões. Não invente lettering. "
        f"Entregue a composição final pronta para {requested_width}x{requested_height}."
    )



def _largest_centered_exact_aspect_rect(
    container_width: int,
    container_height: int,
    target_width: int,
    target_height: int,
) -> Tuple[int, int, int, int]:
    if container_width <= 0 or container_height <= 0 or target_width <= 0 or target_height <= 0:
        raise ValueError("Dimensões inválidas para calcular área exata de aspect ratio.")

    common_divisor = math.gcd(int(target_width), int(target_height)) or 1
    ratio_w = max(1, int(target_width) // common_divisor)
    ratio_h = max(1, int(target_height) // common_divisor)

    scale = min(container_width // ratio_w, container_height // ratio_h)
    if scale <= 0:
        target_ratio = target_width / max(1.0, float(target_height))
        container_ratio = container_width / max(1.0, float(container_height))
        if container_ratio >= target_ratio:
            rect_height = max(1, container_height)
            rect_width = max(1, int(round(rect_height * target_ratio)))
        else:
            rect_width = max(1, container_width)
            rect_height = max(1, int(round(rect_width / max(1e-6, target_ratio))))
    else:
        rect_width = ratio_w * scale
        rect_height = ratio_h * scale

    rect_width = min(container_width, max(1, rect_width))
    rect_height = min(container_height, max(1, rect_height))

    x = max(0, (container_width - rect_width) // 2)
    y = max(0, (container_height - rect_height) // 2)
    return (x, y, x + rect_width, y + rect_height)



def _build_exact_size_ai_canvas(
    image_bytes: bytes,
    requested_width: int,
    requested_height: int,
    base_width: int,
    base_height: int,
    overlap_profile: str = "balanced",
) -> Tuple[bytes, bytes, Dict[str, Any]]:
    with Image.open(io.BytesIO(image_bytes)) as im:
        source = im.convert("RGBA")
        target_rect = _largest_centered_exact_aspect_rect(
            base_width,
            base_height,
            requested_width,
            requested_height,
        )

        target_rect_width = max(1, target_rect[2] - target_rect[0])
        target_rect_height = max(1, target_rect[3] - target_rect[1])

        fitted, local_placement = _resize_to_contain(source, target_rect_width, target_rect_height)
        source_rect = (
            target_rect[0] + local_placement[0],
            target_rect[1] + local_placement[1],
            target_rect[0] + local_placement[2],
            target_rect[1] + local_placement[3],
        )

        left_gap = max(0, source_rect[0] - target_rect[0])
        right_gap = max(0, target_rect[2] - source_rect[2])
        top_gap = max(0, source_rect[1] - target_rect[1])
        bottom_gap = max(0, target_rect[3] - source_rect[3])

        source_rect_width = max(1, source_rect[2] - source_rect[0])
        source_rect_height = max(1, source_rect[3] - source_rect[1])
        min_side = max(1, min(source_rect_width, source_rect_height))
        normalized_profile = (overlap_profile or "balanced").strip().lower()
        ratio_delta = abs(
            math.log(
                max(1e-6, (requested_width / max(1.0, float(requested_height))))
                / max(1e-6, (source.width / max(1.0, float(source.height))))
            )
        )
        dominant_gap = max(left_gap, right_gap, top_gap, bottom_gap)

        if normalized_profile == "strict":
            horizontal_overlap = max(16, min(30, int(round(min_side * 0.024))))
            vertical_overlap = max(14, min(26, int(round(min_side * 0.021))))
            min_protected_ratio = 0.91
        elif normalized_profile == "wide":
            horizontal_overlap = max(24, min(46, int(round(min_side * 0.038))))
            vertical_overlap = max(20, min(40, int(round(min_side * 0.034))))
            min_protected_ratio = 0.80
        elif normalized_profile == "coverage":
            horizontal_overlap = max(30, min(56, int(round(min_side * 0.048))))
            vertical_overlap = max(24, min(48, int(round(min_side * 0.042))))
            min_protected_ratio = 0.74
        else:
            horizontal_overlap = max(18, min(34, int(round(min_side * 0.030))))
            vertical_overlap = max(16, min(30, int(round(min_side * 0.026))))
            min_protected_ratio = 0.86

        geometry_boost = 0
        if ratio_delta >= 0.18:
            geometry_boost += 4
        if ratio_delta >= 0.30:
            geometry_boost += 4
        if dominant_gap >= max(source_rect_width, source_rect_height) * 0.12:
            geometry_boost += 4
        if dominant_gap >= max(source_rect_width, source_rect_height) * 0.20:
            geometry_boost += 4
        horizontal_overlap += geometry_boost
        vertical_overlap += geometry_boost

        max_h_overlap = max(0, source_rect_width // 5)
        max_v_overlap = max(0, source_rect_height // 5)
        overlap = {
            "left": min(horizontal_overlap, max_h_overlap) if left_gap > 0 else 0,
            "right": min(horizontal_overlap, max_h_overlap) if right_gap > 0 else 0,
            "top": min(vertical_overlap, max_v_overlap) if top_gap > 0 else 0,
            "bottom": min(vertical_overlap, max_v_overlap) if bottom_gap > 0 else 0,
        }

        protected_rect = (
            source_rect[0] + overlap["left"],
            source_rect[1] + overlap["top"],
            source_rect[2] - overlap["right"],
            source_rect[3] - overlap["bottom"],
        )

        min_protected_width = max(48, int(round(source_rect_width * min_protected_ratio)))
        min_protected_height = max(48, int(round(source_rect_height * min_protected_ratio)))
        if (protected_rect[2] - protected_rect[0]) < min_protected_width:
            excess = min_protected_width - (protected_rect[2] - protected_rect[0])
            shrink_left = min(overlap["left"], excess // 2 + excess % 2)
            shrink_right = min(overlap["right"], excess // 2)
            overlap["left"] -= shrink_left
            overlap["right"] -= shrink_right
        if (protected_rect[3] - protected_rect[1]) < min_protected_height:
            excess = min_protected_height - (protected_rect[3] - protected_rect[1])
            shrink_top = min(overlap["top"], excess // 2 + excess % 2)
            shrink_bottom = min(overlap["bottom"], excess // 2)
            overlap["top"] -= shrink_top
            overlap["bottom"] -= shrink_bottom

        protected_rect = (
            source_rect[0] + overlap["left"],
            source_rect[1] + overlap["top"],
            source_rect[2] - overlap["right"],
            source_rect[3] - overlap["bottom"],
        )

        scaffold_patch = _edge_extend_fill(source, target_rect_width, target_rect_height)
        canvas = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
        canvas.alpha_composite(scaffold_patch, (target_rect[0], target_rect[1]))
        canvas.alpha_composite(fitted, (source_rect[0], source_rect[1]))

        mask_l = Image.new("L", (base_width, base_height), 255)
        draw = ImageDraw.Draw(mask_l)
        draw.rectangle(target_rect, fill=0)
        draw.rectangle(source_rect, fill=255)

        if overlap["left"] > 0:
            draw.rectangle(
                (source_rect[0], source_rect[1], min(source_rect[2], source_rect[0] + overlap["left"]), source_rect[3]),
                fill=0,
            )
        if overlap["right"] > 0:
            draw.rectangle(
                (max(source_rect[0], source_rect[2] - overlap["right"]), source_rect[1], source_rect[2], source_rect[3]),
                fill=0,
            )
        if overlap["top"] > 0:
            draw.rectangle(
                (source_rect[0], source_rect[1], source_rect[2], min(source_rect[3], source_rect[1] + overlap["top"])),
                fill=0,
            )
        if overlap["bottom"] > 0:
            draw.rectangle(
                (source_rect[0], max(source_rect[1], source_rect[3] - overlap["bottom"]), source_rect[2], source_rect[3]),
                fill=0,
            )

        mask = Image.merge("RGBA", (mask_l, mask_l, mask_l, mask_l))

        return (
            _encode_png_bytes(canvas),
            _encode_png_bytes(mask),
            {
                "base_width": base_width,
                "base_height": base_height,
                "target_rect": {
                    "x1": target_rect[0],
                    "y1": target_rect[1],
                    "x2": target_rect[2],
                    "y2": target_rect[3],
                    "width": target_rect_width,
                    "height": target_rect_height,
                },
                "source_rect": {
                    "x1": source_rect[0],
                    "y1": source_rect[1],
                    "x2": source_rect[2],
                    "y2": source_rect[3],
                    "width": source_rect_width,
                    "height": source_rect_height,
                },
                "protected_rect": {
                    "x1": protected_rect[0],
                    "y1": protected_rect[1],
                    "x2": protected_rect[2],
                    "y2": protected_rect[3],
                    "width": max(1, protected_rect[2] - protected_rect[0]),
                    "height": max(1, protected_rect[3] - protected_rect[1]),
                },
                "overlap": overlap,
                "requested_width": requested_width,
                "requested_height": requested_height,
                "profile": normalized_profile,
                "gaps": {
                    "left": left_gap,
                    "right": right_gap,
                    "top": top_gap,
                    "bottom": bottom_gap,
                },
                "ratio_delta": float(ratio_delta),
                "scaffold_used": True,
            },
        )


def _build_exact_size_expand_prompt(
    requested_width: int,
    requested_height: int,
    canvas_meta: Dict[str, Any],
    prompt_mode: str = "balanced",
) -> str:
    target_rect = canvas_meta.get("target_rect") or {}
    source_rect = canvas_meta.get("source_rect") or {}
    protected_rect = canvas_meta.get("protected_rect") or {}
    overlap = canvas_meta.get("overlap") or {}
    gaps = canvas_meta.get("gaps") or {}
    normalized_mode = (prompt_mode or canvas_meta.get("profile") or "balanced").strip().lower()

    if normalized_mode == "strict":
        mode_clause = (
            "Trate a área original inteira como congelada e imutável, com exceção exclusiva das faixas mínimas liberadas na máscara. "
            "Mesmo nessas faixas, ajuste apenas continuidade de textura, perspectiva, microcontraste e luz. "
        )
    elif normalized_mode == "wide":
        mode_clause = (
            "Use as faixas de transição um pouco mais largas apenas para costura invisível e continuidade estrutural. "
            "Aproveite esse espaço para dissipar qualquer diferença de iluminação, grão, ruído fino e textura perto da junção. "
        )
    elif normalized_mode == "coverage":
        mode_clause = (
            "Priorize cobertura perfeita da moldura útil inteira, sem buracos, sem barras pretas, sem áreas transparentes e sem regiões chapadas. "
            "Mesmo priorizando cobertura total, mantenha a identidade visual da área original praticamente intacta. "
        )
    else:
        mode_clause = (
            "A área original inteira deve continuar com o mesmo desenho e alinhamento percebido, usando as faixas liberadas apenas para costura invisível. "
        )

    return (
        "Você recebeu uma arte pronta posicionada dentro de um canvas maior. "
        "Faça somente a extensão real do cenário nas áreas faltantes da moldura útil. "
        "A região original já presente no canvas é a referência dominante e deve continuar praticamente idêntica. "
        + mode_clause +
        "Não altere, não reescreva e não redesenhe nenhum texto, data, local, logo, ícone, tipografia, branding, bicicleta, luz, vitrine, prédio, chão, perspectiva ou qualquer outro elemento já presente na área original. "
        "Continue apenas o que falta nas laterais e demais faixas vazias como continuação natural, física e visual da mesma cena. "
        "Respeite rigorosamente a mesma escuridão, temperatura de cor, contraste, textura, linhas de fuga, reflexos, ruído fino, nitidez e profundidade da arte original. "
        "As áreas novas não podem ficar mais claras, mais limpas, mais saturadas, mais suaves ou com iluminação diferente dos pixels vizinhos da arte original. "
        "A junção entre área original e área nova precisa ficar contínua, sem linha vertical, sem linha horizontal, sem halo, sem degrau de luminância e sem quebra de textura. "
        "É proibido usar blur, glow, espelhamento, stretch, smear, duplicação de borda, repetição de coluna, repetição de faixa, padrão clonado, costura visível, preenchimento genérico ou reconstrução estilizada. "
        "É proibido devolver barras pretas, padding preto, moldura vazia, áreas transparentes, faixas escuras artificiais ou regiões subpreenchidas. "
        "Não crie texto novo. Não duplique objetos inteiros. Não mude o enquadramento percebido da arte protegida. "
        f"A moldura útil final corresponde a {requested_width}x{requested_height}. "
        f"Área original aproximada: x={source_rect.get('x1', 0)}..{source_rect.get('x2', 0)}, y={source_rect.get('y1', 0)}..{source_rect.get('y2', 0)}. "
        f"Área central totalmente protegida aproximada: x={protected_rect.get('x1', 0)}..{protected_rect.get('x2', 0)}, y={protected_rect.get('y1', 0)}..{protected_rect.get('y2', 0)}. "
        f"Faixas de transição liberadas aproximadas: esquerda={overlap.get('left', 0)}px, direita={overlap.get('right', 0)}px, topo={overlap.get('top', 0)}px, base={overlap.get('bottom', 0)}px. "
        f"Áreas faltantes aproximadas fora da arte original: esquerda={gaps.get('left', 0)}px, direita={gaps.get('right', 0)}px, topo={gaps.get('top', 0)}px, base={gaps.get('bottom', 0)}px. "
        f"Moldura útil aproximada: x={target_rect.get('x1', 0)}..{target_rect.get('x2', 0)}, y={target_rect.get('y1', 0)}..{target_rect.get('y2', 0)}. "
        "Entregue uma expansão coerente e quase imperceptível, como se a arte inteira já tivesse sido criada nesse enquadramento final desde o início."
    )


def _build_exact_expand_preservation_alpha(
    source_width: int,
    source_height: int,
    overlap: Dict[str, Any],
) -> Image.Image:
    alpha = np.ones((max(1, source_height), max(1, source_width)), dtype=np.float32)

    def _smootherstep_ramp(length: int, invert: bool = False) -> np.ndarray:
        if length <= 1:
            ramp = np.ones((max(1, length),), dtype=np.float32)
        else:
            t = np.linspace(0.0, 1.0, length, dtype=np.float32)
            ramp = t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
            ramp = np.clip((ramp - 0.015) / 0.985, 0.0, 1.0)
        if invert:
            ramp = ramp[::-1]
        return ramp

    left = int(overlap.get("left", 0) or 0)
    right = int(overlap.get("right", 0) or 0)
    top = int(overlap.get("top", 0) or 0)
    bottom = int(overlap.get("bottom", 0) or 0)

    feather_left = min(source_width, max(left, int(round(left * 1.30)))) if left > 0 else 0
    feather_right = min(source_width, max(right, int(round(right * 1.30)))) if right > 0 else 0
    feather_top = min(source_height, max(top, int(round(top * 1.30)))) if top > 0 else 0
    feather_bottom = min(source_height, max(bottom, int(round(bottom * 1.30)))) if bottom > 0 else 0

    if feather_left > 0:
        ramp = _smootherstep_ramp(feather_left, invert=False)
        alpha[:, :feather_left] = np.minimum(alpha[:, :feather_left], ramp.reshape(1, feather_left))
    if feather_right > 0:
        ramp = _smootherstep_ramp(feather_right, invert=True)
        alpha[:, source_width - feather_right:source_width] = np.minimum(alpha[:, source_width - feather_right:source_width], ramp.reshape(1, feather_right))
    if feather_top > 0:
        ramp = _smootherstep_ramp(feather_top, invert=False)
        alpha[:feather_top, :] = np.minimum(alpha[:feather_top, :], ramp.reshape(feather_top, 1))
    if feather_bottom > 0:
        ramp = _smootherstep_ramp(feather_bottom, invert=True)
        alpha[source_height - feather_bottom:source_height, :] = np.minimum(alpha[source_height - feather_bottom:source_height, :], ramp.reshape(feather_bottom, 1))

    alpha_u8 = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha_u8, mode="L")
    blur_radius = 0.8 if max(feather_left, feather_right, feather_top, feather_bottom) >= 14 else 0.5
    if blur_radius > 0.0:
        alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return alpha_img

def _overlay_preserved_source_with_adaptive_alpha(
    expanded: Image.Image,
    preserved_fitted: Image.Image,
    canvas_meta: Dict[str, Any],
) -> Image.Image:
    source_rect = canvas_meta.get("source_rect") or {}
    overlap = canvas_meta.get("overlap") or {}

    source_x1 = int(source_rect.get("x1", 0))
    source_y1 = int(source_rect.get("y1", 0))
    source_width = int(source_rect.get("width", preserved_fitted.width))
    source_height = int(source_rect.get("height", preserved_fitted.height))

    if source_width <= 0 or source_height <= 0:
        return expanded

    alpha_mask = _build_exact_expand_preservation_alpha(source_width, source_height, overlap)
    preserved_rgba = preserved_fitted.convert("RGBA")
    preserved_rgba.putalpha(alpha_mask)

    merged = expanded.convert("RGBA")
    merged.alpha_composite(preserved_rgba, (source_x1, source_y1))
    return merged



def _final_space_source_rect_from_canvas_meta(
    final_width: int,
    final_height: int,
    canvas_meta: Dict[str, Any],
) -> Tuple[int, int, int, int]:
    target_rect = canvas_meta.get("target_rect") or {}
    source_rect = canvas_meta.get("source_rect") or {}

    tx1 = float(target_rect.get("x1", 0) or 0)
    ty1 = float(target_rect.get("y1", 0) or 0)
    tx2 = float(target_rect.get("x2", final_width) or final_width)
    ty2 = float(target_rect.get("y2", final_height) or final_height)
    tw = max(1.0, tx2 - tx1)
    th = max(1.0, ty2 - ty1)

    sx1 = float(source_rect.get("x1", tx1) or tx1)
    sy1 = float(source_rect.get("y1", ty1) or ty1)
    sx2 = float(source_rect.get("x2", tx2) or tx2)
    sy2 = float(source_rect.get("y2", ty2) or ty2)

    fx1 = int(round(((sx1 - tx1) / tw) * final_width))
    fy1 = int(round(((sy1 - ty1) / th) * final_height))
    fx2 = int(round(((sx2 - tx1) / tw) * final_width))
    fy2 = int(round(((sy2 - ty1) / th) * final_height))

    fx1 = max(0, min(final_width, fx1))
    fy1 = max(0, min(final_height, fy1))
    fx2 = max(0, min(final_width, fx2))
    fy2 = max(0, min(final_height, fy2))

    if fx2 <= fx1:
        fx1, fx2 = 0, final_width
    if fy2 <= fy1:
        fy1, fy2 = 0, final_height

    return fx1, fy1, fx2, fy2


def _exact_expand_quality_diagnostics(
    final_bytes: bytes,
    preserved_source_bytes: bytes,
    canvas_meta: Dict[str, Any],
) -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {
        "quality_score": 999.0,
        "border_score": 0.0,
        "seam_score": 999.0,
        "seam_max": 999.0,
        "generated_region_penalty": 0.0,
        "seam_details": [],
        "flagged_sides": [],
    }

    overlap = canvas_meta.get("overlap") or {}

    with Image.open(io.BytesIO(final_bytes)) as final_im, Image.open(io.BytesIO(preserved_source_bytes)) as source_im:
        final_rgba = final_im.convert("RGBA")
        final_width, final_height = final_rgba.size
        source_x1, source_y1, source_x2, source_y2 = _final_space_source_rect_from_canvas_meta(
            final_width=final_width,
            final_height=final_height,
            canvas_meta=canvas_meta,
        )

        if source_x2 <= source_x1 or source_y2 <= source_y1:
            return diagnostics

        preserved_fitted, _ = _resize_to_contain(
            source_im.convert("RGBA"),
            max(1, source_x2 - source_x1),
            max(1, source_y2 - source_y1),
        )

        final_arr = np.array(final_rgba, dtype=np.float32)
        source_arr = np.array(preserved_fitted, dtype=np.float32)
        final_rgb = final_arr[..., :3]
        final_alpha = final_arr[..., 3]
        scores: List[float] = []
        border_penalties: List[float] = []
        generated_penalties: List[float] = []
        seam_penalties: List[float] = []
        seam_details: List[Dict[str, Any]] = []
        luma_weights = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

        def _collect(inner_bbox: Tuple[int, int, int, int], outer_bbox: Tuple[int, int, int, int], axis: int) -> None:
            ix1, iy1, ix2, iy2 = inner_bbox
            ox1, oy1, ox2, oy2 = outer_bbox
            ix1 = max(0, min(source_arr.shape[1], ix1))
            ix2 = max(0, min(source_arr.shape[1], ix2))
            iy1 = max(0, min(source_arr.shape[0], iy1))
            iy2 = max(0, min(source_arr.shape[0], iy2))
            ox1 = max(0, min(final_rgb.shape[1], ox1))
            ox2 = max(0, min(final_rgb.shape[1], ox2))
            oy1 = max(0, min(final_rgb.shape[0], oy1))
            oy2 = max(0, min(final_rgb.shape[0], oy2))
            if ix2 <= ix1 or iy2 <= iy1 or ox2 <= ox1 or oy2 <= oy1:
                return
            inner = source_arr[iy1:iy2, ix1:ix2, :3]
            outer = final_rgb[oy1:oy2, ox1:ox2, :3]
            if inner.size == 0 or outer.size == 0:
                return
            if inner.shape[:2] != outer.shape[:2]:
                inner_img = Image.fromarray(np.clip(inner, 0.0, 255.0).astype(np.uint8), mode="RGB")
                inner = np.array(inner_img.resize((outer.shape[1], outer.shape[0]), Image.Resampling.BILINEAR), dtype=np.float32)
            inner_mean = inner.mean(axis=(0, 1))
            outer_mean = outer.mean(axis=(0, 1))
            inner_std = np.maximum(inner.std(axis=(0, 1)), 1.0)
            outer_std = np.maximum(outer.std(axis=(0, 1)), 1.0)
            mean_gap = float(np.mean(np.abs(inner_mean - outer_mean)))
            std_gap = float(np.mean(np.abs(inner_std - outer_std)))
            if axis == 1:
                inner_edge = inner[:, -1, :] if inner.shape[1] > 0 else inner.reshape(-1, 3)
                outer_edge = outer[:, 0, :] if outer.shape[1] > 0 else outer.reshape(-1, 3)
            else:
                inner_edge = inner[-1, :, :] if inner.shape[0] > 0 else inner.reshape(-1, 3)
                outer_edge = outer[0, :, :] if outer.shape[0] > 0 else outer.reshape(-1, 3)
            edge_gap = float(np.mean(np.abs(inner_edge - outer_edge)))
            luma_gap = float(np.mean(np.abs((inner_edge @ luma_weights) - (outer_edge @ luma_weights))))
            penalty = (mean_gap * 0.34) + (std_gap * 0.12) + (edge_gap * 0.34) + (luma_gap * 0.20)
            scores.append(penalty)
            generated_penalties.append(float(penalty))

        left_gap = max(0, source_x1)
        right_gap = max(0, final_width - source_x2)
        top_gap = max(0, source_y1)
        bottom_gap = max(0, final_height - source_y2)

        if left_gap > 0:
            strip = max(8, min(28, left_gap, source_arr.shape[1], int(overlap.get("left", 0) or 0) * 2 or 14))
            _collect((0, 0, strip, source_arr.shape[0]), (source_x1 - strip, source_y1, source_x1, source_y2), axis=1)
        if right_gap > 0:
            strip = max(8, min(28, right_gap, source_arr.shape[1], int(overlap.get("right", 0) or 0) * 2 or 14))
            _collect((source_arr.shape[1] - strip, 0, source_arr.shape[1], source_arr.shape[0]), (source_x2, source_y1, source_x2 + strip, source_y2), axis=1)
        if top_gap > 0:
            strip = max(8, min(24, top_gap, source_arr.shape[0], int(overlap.get("top", 0) or 0) * 2 or 12))
            _collect((0, 0, source_arr.shape[1], strip), (source_x1, source_y1 - strip, source_x2, source_y1), axis=0)
        if bottom_gap > 0:
            strip = max(8, min(24, bottom_gap, source_arr.shape[0], int(overlap.get("bottom", 0) or 0) * 2 or 12))
            _collect((0, source_arr.shape[0] - strip, source_arr.shape[1], source_arr.shape[0]), (source_x1, source_y2, source_x2, source_y2 + strip), axis=0)

        generated_mask = np.ones((final_height, final_width), dtype=bool)
        generated_mask[source_y1:source_y2, source_x1:source_x2] = False
        if np.any(generated_mask):
            region_rgb = final_rgb[generated_mask]
            region_alpha = final_alpha[generated_mask]
            luma = region_rgb @ luma_weights
            black_ratio = float(np.mean(luma < 8.0))
            low_alpha_ratio = float(np.mean(region_alpha < 8.0))
            if black_ratio > 0.0:
                penalty = black_ratio * 150.0
                scores.append(penalty)
                generated_penalties.append(float(penalty))
            if low_alpha_ratio > 0.0:
                penalty = low_alpha_ratio * 180.0
                scores.append(penalty)
                generated_penalties.append(float(penalty))
            if region_rgb.shape[0] > 16:
                flat_penalty = max(0.0, 11.0 - float(np.mean(region_rgb.std(axis=0)))) * 0.35
                if flat_penalty > 0.0:
                    scores.append(flat_penalty)
                    generated_penalties.append(float(flat_penalty))

        border_w = min(6, final_width)
        border_h = min(6, final_height)
        if border_w > 0:
            left_border = final_rgb[:, :border_w, :].reshape(-1, 3)
            right_border = final_rgb[:, final_width - border_w:, :].reshape(-1, 3)
            border_penalties.append(float(np.mean((left_border @ luma_weights) < 6.0)) * 120.0)
            border_penalties.append(float(np.mean((right_border @ luma_weights) < 6.0)) * 120.0)
        if border_h > 0:
            top_border = final_rgb[:border_h, :, :].reshape(-1, 3)
            bottom_border = final_rgb[final_height - border_h:, :, :].reshape(-1, 3)
            border_penalties.append(float(np.mean((top_border @ luma_weights) < 6.0)) * 120.0)
            border_penalties.append(float(np.mean((bottom_border @ luma_weights) < 6.0)) * 120.0)
        scores.extend(border_penalties)

        def _vertical_seam_penalty(side: str, seam_x: int, y1: int, y2: int) -> None:
            if seam_x <= 0 or seam_x >= final_rgb.shape[1] or y2 <= y1:
                return
            y1 = max(0, min(final_rgb.shape[0], y1))
            y2 = max(0, min(final_rgb.shape[0], y2))
            left = final_rgb[y1:y2, max(0, seam_x - 3):seam_x, :]
            right = final_rgb[y1:y2, seam_x:min(final_rgb.shape[1], seam_x + 3), :]
            if left.size == 0 or right.size == 0:
                return
            left_mean = left.mean(axis=1)
            right_mean = right.mean(axis=1)
            color_gap = float(np.mean(np.abs(left_mean - right_mean)))
            luma_gap = float(np.mean(np.abs((left_mean @ luma_weights) - (right_mean @ luma_weights))))
            penalty = (color_gap * 0.55) + (luma_gap * 0.95)
            scores.append(penalty)
            seam_penalties.append(float(penalty))
            seam_details.append({
                "side": side,
                "orientation": "vertical",
                "color_gap": round(color_gap, 4),
                "luma_gap": round(luma_gap, 4),
                "score": round(float(penalty), 4),
            })

        def _horizontal_seam_penalty(side: str, seam_y: int, x1: int, x2: int) -> None:
            if seam_y <= 0 or seam_y >= final_rgb.shape[0] or x2 <= x1:
                return
            x1 = max(0, min(final_rgb.shape[1], x1))
            x2 = max(0, min(final_rgb.shape[1], x2))
            top = final_rgb[max(0, seam_y - 3):seam_y, x1:x2, :]
            bottom = final_rgb[seam_y:min(final_rgb.shape[0], seam_y + 3), x1:x2, :]
            if top.size == 0 or bottom.size == 0:
                return
            top_mean = top.mean(axis=0)
            bottom_mean = bottom.mean(axis=0)
            color_gap = float(np.mean(np.abs(top_mean - bottom_mean)))
            luma_gap = float(np.mean(np.abs((top_mean @ luma_weights) - (bottom_mean @ luma_weights))))
            penalty = (color_gap * 0.55) + (luma_gap * 0.95)
            scores.append(penalty)
            seam_penalties.append(float(penalty))
            seam_details.append({
                "side": side,
                "orientation": "horizontal",
                "color_gap": round(color_gap, 4),
                "luma_gap": round(luma_gap, 4),
                "score": round(float(penalty), 4),
            })

        if left_gap > 0:
            _vertical_seam_penalty("left", source_x1, source_y1, source_y2)
        if right_gap > 0:
            _vertical_seam_penalty("right", source_x2, source_y1, source_y2)
        if top_gap > 0:
            _horizontal_seam_penalty("top", source_y1, source_x1, source_x2)
        if bottom_gap > 0:
            _horizontal_seam_penalty("bottom", source_y2, source_x1, source_x2)

    if not scores:
        return diagnostics

    seam_score = float(np.mean(seam_penalties)) if seam_penalties else 999.0
    seam_max = float(max(seam_penalties)) if seam_penalties else 999.0
    quality_score = float(np.mean(scores))
    flagged_sides = [item["side"] for item in seam_details if float(item.get("score", 0.0)) >= 7.2]
    if not flagged_sides and seam_max >= 6.4:
        flagged_sides = [item["side"] for item in seam_details if float(item.get("score", 0.0)) >= seam_max - 0.35]

    diagnostics.update({
        "quality_score": quality_score,
        "border_score": float(np.mean(border_penalties)) if border_penalties else 0.0,
        "seam_score": seam_score,
        "seam_max": seam_max,
        "generated_region_penalty": float(np.mean(generated_penalties)) if generated_penalties else 0.0,
        "seam_details": seam_details,
        "flagged_sides": flagged_sides,
    })
    return diagnostics

def _exact_expand_quality_score(
    final_bytes: bytes,
    preserved_source_bytes: bytes,
    canvas_meta: Dict[str, Any],
) -> float:
    diagnostics = _exact_expand_quality_diagnostics(
        final_bytes=final_bytes,
        preserved_source_bytes=preserved_source_bytes,
        canvas_meta=canvas_meta,
    )
    return float(diagnostics.get("quality_score", 999.0))

def _should_retry_exact_expand(first_score: float, requested_width: int, requested_height: int, source_width: int, source_height: int) -> bool:
    if first_score <= 11.5:
        return False
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = requested_width / max(1.0, float(requested_height))
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    return bool(first_score >= 14.0 or ratio_delta >= 0.28)


def _harmonize_exact_expand_bands(
    expanded: Image.Image,
    canvas_meta: Dict[str, Any],
) -> Image.Image:
    # v8: evita correção estatística em bandas largas, que podia criar painéis retangulares visíveis.
    # A harmonização fina fica concentrada em _locally_harmonize_exact_expand_seams e _microblend_exact_expand_seams.
    return expanded


def _smooth_matrix_along_axis(values: np.ndarray, radius: int = 6) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    if arr.shape[0] <= 2 or radius <= 0:
        return arr.astype(np.float32, copy=True)

    kernel_size = max(1, radius * 2 + 1)
    kernel = np.ones((kernel_size,), dtype=np.float32) / float(kernel_size)
    padded = np.pad(arr, ((radius, radius), (0, 0)), mode="edge")
    out = np.empty_like(arr, dtype=np.float32)
    for c in range(arr.shape[1]):
        out[:, c] = np.convolve(padded[:, c], kernel, mode="valid")
    return out


def _locally_harmonize_exact_expand_seams(
    expanded: Image.Image,
    preserved_fitted: Image.Image,
    canvas_meta: Dict[str, Any],
) -> Image.Image:
    source_rect = canvas_meta.get("source_rect") or {}
    target_rect = canvas_meta.get("target_rect") or {}
    sx1 = int(source_rect.get("x1", 0)); sy1 = int(source_rect.get("y1", 0))
    sx2 = int(source_rect.get("x2", 0)); sy2 = int(source_rect.get("y2", 0))
    tx1 = int(target_rect.get("x1", 0)); ty1 = int(target_rect.get("y1", 0))
    tx2 = int(target_rect.get("x2", 0)); ty2 = int(target_rect.get("y2", 0))
    if sx2 <= sx1 or sy2 <= sy1 or tx2 <= tx1 or ty2 <= ty1:
        return expanded

    arr = np.array(expanded.convert("RGBA"), dtype=np.float32)
    src = np.array(preserved_fitted.convert("RGBA"), dtype=np.float32)[..., :3]

    def _row_smooth(delta: np.ndarray, height: int) -> np.ndarray:
        return _smooth_matrix_along_axis(delta, radius=max(2, min(10, height // 56)))

    def _col_smooth(delta: np.ndarray, width: int) -> np.ndarray:
        return _smooth_matrix_along_axis(delta, radius=max(2, min(10, width // 72)))

    def _vertical(side: str) -> None:
        if side == "left":
            gap = max(0, sx1 - tx1); zone = min(gap, max(10, min(26, gap // 4 if gap else 10)))
            x0, x1 = max(tx1, sx1 - zone), sx1
            if x1 <= x0: return
            band = arr[sy1:sy2, x0:x1, :3]
            ref = src[:, :min(src.shape[1], max(6, min(16, band.shape[1] + 4))), :]
            if band.size == 0 or ref.size == 0: return
            boundary = band[:, -min(6, band.shape[1]):, :]
            ref_boundary = ref[:, :min(boundary.shape[1], ref.shape[1]), :]
            if ref_boundary.shape[1] != boundary.shape[1]:
                ref_boundary = np.repeat(ref[:, :1, :], boundary.shape[1], axis=1)
            delta = _row_smooth(ref_boundary.mean(axis=1) - boundary.mean(axis=1), band.shape[0])
            w = np.linspace(0.04, 0.34, band.shape[1], dtype=np.float32).reshape(1, band.shape[1], 1)
            arr[sy1:sy2, x0:x1, :3] = np.clip(band + delta[:, None, :] * w, 0.0, 255.0)
        else:
            gap = max(0, tx2 - sx2); zone = min(gap, max(10, min(26, gap // 4 if gap else 10)))
            x0, x1 = sx2, min(tx2, sx2 + zone)
            if x1 <= x0: return
            band = arr[sy1:sy2, x0:x1, :3]
            ref = src[:, max(0, src.shape[1] - max(6, min(16, band.shape[1] + 4))):, :]
            if band.size == 0 or ref.size == 0: return
            boundary = band[:, :min(6, band.shape[1]), :]
            ref_boundary = ref[:, max(0, ref.shape[1] - boundary.shape[1]):, :]
            if ref_boundary.shape[1] != boundary.shape[1]:
                ref_boundary = np.repeat(ref[:, -1:, :], boundary.shape[1], axis=1)
            delta = _row_smooth(ref_boundary.mean(axis=1) - boundary.mean(axis=1), band.shape[0])
            w = np.linspace(0.34, 0.04, band.shape[1], dtype=np.float32).reshape(1, band.shape[1], 1)
            arr[sy1:sy2, x0:x1, :3] = np.clip(band + delta[:, None, :] * w, 0.0, 255.0)

    def _horizontal(side: str) -> None:
        if side == "top":
            gap = max(0, sy1 - ty1); zone = min(gap, max(8, min(22, gap // 4 if gap else 8)))
            y0, y1 = max(ty1, sy1 - zone), sy1
            if y1 <= y0: return
            band = arr[y0:y1, sx1:sx2, :3]
            ref = src[:min(src.shape[0], max(6, min(14, band.shape[0] + 4))), :, :]
            if band.size == 0 or ref.size == 0: return
            boundary = band[-min(6, band.shape[0]):, :, :]
            ref_boundary = ref[:min(boundary.shape[0], ref.shape[0]), :, :]
            if ref_boundary.shape[0] != boundary.shape[0]:
                ref_boundary = np.repeat(ref[:1, :, :], boundary.shape[0], axis=0)
            delta = _col_smooth(ref_boundary.mean(axis=0) - boundary.mean(axis=0), band.shape[1])
            w = np.linspace(0.04, 0.30, band.shape[0], dtype=np.float32).reshape(band.shape[0], 1, 1)
            arr[y0:y1, sx1:sx2, :3] = np.clip(band + delta[None, :, :] * w, 0.0, 255.0)
        else:
            gap = max(0, ty2 - sy2); zone = min(gap, max(8, min(22, gap // 4 if gap else 8)))
            y0, y1 = sy2, min(ty2, sy2 + zone)
            if y1 <= y0: return
            band = arr[y0:y1, sx1:sx2, :3]
            ref = src[max(0, src.shape[0] - max(6, min(14, band.shape[0] + 4))):, :, :]
            if band.size == 0 or ref.size == 0: return
            boundary = band[:min(6, band.shape[0]), :, :]
            ref_boundary = ref[max(0, ref.shape[0] - boundary.shape[0]):, :, :]
            if ref_boundary.shape[0] != boundary.shape[0]:
                ref_boundary = np.repeat(ref[-1:, :, :], boundary.shape[0], axis=0)
            delta = _col_smooth(ref_boundary.mean(axis=0) - boundary.mean(axis=0), band.shape[1])
            w = np.linspace(0.30, 0.04, band.shape[0], dtype=np.float32).reshape(band.shape[0], 1, 1)
            arr[y0:y1, sx1:sx2, :3] = np.clip(band + delta[None, :, :] * w, 0.0, 255.0)

    _vertical("left"); _vertical("right"); _horizontal("top"); _horizontal("bottom")
    return Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8), mode="RGBA")


def _microblend_exact_expand_seams(
    expanded: Image.Image,
    preserved_fitted: Image.Image,
    canvas_meta: Dict[str, Any],
) -> Image.Image:
    source_rect = canvas_meta.get("source_rect") or {}
    target_rect = canvas_meta.get("target_rect") or {}
    overlap = canvas_meta.get("overlap") or {}

    sx1 = int(source_rect.get("x1", 0))
    sy1 = int(source_rect.get("y1", 0))
    sx2 = int(source_rect.get("x2", 0))
    sy2 = int(source_rect.get("y2", 0))
    tx1 = int(target_rect.get("x1", 0))
    ty1 = int(target_rect.get("y1", 0))
    tx2 = int(target_rect.get("x2", 0))
    ty2 = int(target_rect.get("y2", 0))

    if sx2 <= sx1 or sy2 <= sy1 or tx2 <= tx1 or ty2 <= ty1:
        return expanded

    arr = np.array(expanded.convert("RGBA"), dtype=np.float32)
    src = np.array(preserved_fitted.convert("RGBA"), dtype=np.float32)[..., :3]

    def _blend_vertical(side: str) -> None:
        if side == "left":
            gap = max(0, sx1 - tx1)
            if gap <= 0:
                return
            outer = min(gap, max(14, min(34, int((int(overlap.get("left", 0) or 0) * 1.8) or 18))))
            inner = min(src.shape[1], max(10, min(26, int((int(overlap.get("left", 0) or 0) * 1.2) or 14))))
            x0 = max(tx1, sx1 - outer)
            x1 = min(tx2, sx1 + inner)
            seam = sx1 - x0
            strip = arr[sy1:sy2, x0:x1, :3]
            if strip.size == 0 or seam <= 0 or seam >= strip.shape[1]:
                return
            bw_out = min(6, seam)
            bw_in = min(6, inner)
            outside_ref = strip[:, seam - bw_out:seam, :]
            inside_ref = src[:, :bw_in, :]
            if outside_ref.size == 0 or inside_ref.size == 0:
                return
            delta = inside_ref.mean(axis=1) - outside_ref.mean(axis=1)
            delta = _smooth_matrix_along_axis(delta, radius=max(2, min(10, strip.shape[0] // 48)))
            target = strip.copy()
            if seam > 0:
                w_out = np.linspace(0.16, 0.78, seam, dtype=np.float32).reshape(1, seam, 1)
                target[:, :seam, :] = np.clip(target[:, :seam, :] + (delta[:, None, :] * w_out), 0.0, 255.0)
            if inner > 0 and strip.shape[1] > seam:
                use_inner = min(inner, strip.shape[1] - seam)
                src_slice = src[:, :use_inner, :]
                w_in = np.linspace(0.26, 0.06, use_inner, dtype=np.float32).reshape(1, use_inner, 1)
                current_in = target[:, seam:seam + use_inner, :]
                target[:, seam:seam + use_inner, :] = np.clip((current_in * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
            weights = np.concatenate([
                np.linspace(0.10, 0.60, seam, dtype=np.float32),
                np.linspace(0.28, 0.04, max(0, strip.shape[1] - seam), dtype=np.float32),
            ], axis=0).reshape(1, strip.shape[1], 1)
            arr[sy1:sy2, x0:x1, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)
        else:
            gap = max(0, tx2 - sx2)
            if gap <= 0:
                return
            outer = min(gap, max(14, min(34, int((int(overlap.get("right", 0) or 0) * 1.8) or 18))))
            inner = min(src.shape[1], max(10, min(26, int((int(overlap.get("right", 0) or 0) * 1.2) or 14))))
            x0 = max(tx1, sx2 - inner)
            x1 = min(tx2, sx2 + outer)
            seam = sx2 - x0
            strip = arr[sy1:sy2, x0:x1, :3]
            if strip.size == 0 or seam <= 0 or seam >= strip.shape[1]:
                return
            bw_out = min(6, strip.shape[1] - seam)
            bw_in = min(6, inner)
            outside_ref = strip[:, seam:seam + bw_out, :]
            inside_ref = src[:, src.shape[1] - bw_in:src.shape[1], :]
            if outside_ref.size == 0 or inside_ref.size == 0:
                return
            delta = inside_ref.mean(axis=1) - outside_ref.mean(axis=1)
            delta = _smooth_matrix_along_axis(delta, radius=max(2, min(10, strip.shape[0] // 48)))
            target = strip.copy()
            outer_len = strip.shape[1] - seam
            if outer_len > 0:
                w_out = np.linspace(0.78, 0.16, outer_len, dtype=np.float32).reshape(1, outer_len, 1)
                target[:, seam:, :] = np.clip(target[:, seam:, :] + (delta[:, None, :] * w_out), 0.0, 255.0)
            if seam > 0:
                use_inner = min(inner, seam)
                src_slice = src[:, src.shape[1] - use_inner:src.shape[1], :]
                w_in = np.linspace(0.06, 0.26, use_inner, dtype=np.float32).reshape(1, use_inner, 1)
                current_in = target[:, seam - use_inner:seam, :]
                target[:, seam - use_inner:seam, :] = np.clip((current_in * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
            weights = np.concatenate([
                np.linspace(0.04, 0.28, seam, dtype=np.float32),
                np.linspace(0.60, 0.10, max(0, strip.shape[1] - seam), dtype=np.float32),
            ], axis=0).reshape(1, strip.shape[1], 1)
            arr[sy1:sy2, x0:x1, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)

    def _blend_horizontal(side: str) -> None:
        if side == "top":
            gap = max(0, sy1 - ty1)
            if gap <= 0:
                return
            outer = min(gap, max(12, min(30, int((int(overlap.get("top", 0) or 0) * 1.8) or 16))))
            inner = min(src.shape[0], max(10, min(24, int((int(overlap.get("top", 0) or 0) * 1.2) or 14))))
            y0 = max(ty1, sy1 - outer)
            y1 = min(ty2, sy1 + inner)
            seam = sy1 - y0
            strip = arr[y0:y1, sx1:sx2, :3]
            if strip.size == 0 or seam <= 0 or seam >= strip.shape[0]:
                return
            bh_out = min(6, seam)
            bh_in = min(6, inner)
            outside_ref = strip[seam - bh_out:seam, :, :]
            inside_ref = src[:bh_in, :, :]
            if outside_ref.size == 0 or inside_ref.size == 0:
                return
            delta = inside_ref.mean(axis=0) - outside_ref.mean(axis=0)
            delta = _smooth_matrix_along_axis(delta, radius=max(2, min(10, strip.shape[1] // 48)))
            target = strip.copy()
            if seam > 0:
                w_out = np.linspace(0.16, 0.76, seam, dtype=np.float32).reshape(seam, 1, 1)
                target[:seam, :, :] = np.clip(target[:seam, :, :] + (delta[None, :, :] * w_out), 0.0, 255.0)
            if inner > 0 and strip.shape[0] > seam:
                use_inner = min(inner, strip.shape[0] - seam)
                src_slice = src[:use_inner, :, :]
                w_in = np.linspace(0.24, 0.06, use_inner, dtype=np.float32).reshape(use_inner, 1, 1)
                current_in = target[seam:seam + use_inner, :, :]
                target[seam:seam + use_inner, :, :] = np.clip((current_in * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
            weights = np.concatenate([
                np.linspace(0.10, 0.58, seam, dtype=np.float32),
                np.linspace(0.26, 0.04, max(0, strip.shape[0] - seam), dtype=np.float32),
            ], axis=0).reshape(strip.shape[0], 1, 1)
            arr[y0:y1, sx1:sx2, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)
        else:
            gap = max(0, ty2 - sy2)
            if gap <= 0:
                return
            outer = min(gap, max(12, min(30, int((int(overlap.get("bottom", 0) or 0) * 1.8) or 16))))
            inner = min(src.shape[0], max(10, min(24, int((int(overlap.get("bottom", 0) or 0) * 1.2) or 14))))
            y0 = max(ty1, sy2 - inner)
            y1 = min(ty2, sy2 + outer)
            seam = sy2 - y0
            strip = arr[y0:y1, sx1:sx2, :3]
            if strip.size == 0 or seam <= 0 or seam >= strip.shape[0]:
                return
            bh_out = min(6, strip.shape[0] - seam)
            bh_in = min(6, inner)
            outside_ref = strip[seam:seam + bh_out, :, :]
            inside_ref = src[src.shape[0] - bh_in:src.shape[0], :, :]
            if outside_ref.size == 0 or inside_ref.size == 0:
                return
            delta = inside_ref.mean(axis=0) - outside_ref.mean(axis=0)
            delta = _smooth_matrix_along_axis(delta, radius=max(2, min(10, strip.shape[1] // 48)))
            target = strip.copy()
            outer_len = strip.shape[0] - seam
            if outer_len > 0:
                w_out = np.linspace(0.76, 0.16, outer_len, dtype=np.float32).reshape(outer_len, 1, 1)
                target[seam:, :, :] = np.clip(target[seam:, :, :] + (delta[None, :, :] * w_out), 0.0, 255.0)
            if seam > 0:
                use_inner = min(inner, seam)
                src_slice = src[src.shape[0] - use_inner:src.shape[0], :, :]
                w_in = np.linspace(0.06, 0.24, use_inner, dtype=np.float32).reshape(use_inner, 1, 1)
                current_in = target[seam - use_inner:seam, :, :]
                target[seam - use_inner:seam, :, :] = np.clip((current_in * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
            weights = np.concatenate([
                np.linspace(0.04, 0.26, seam, dtype=np.float32),
                np.linspace(0.58, 0.10, max(0, strip.shape[0] - seam), dtype=np.float32),
            ], axis=0).reshape(strip.shape[0], 1, 1)
            arr[y0:y1, sx1:sx2, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)

    _blend_vertical("left")
    _blend_vertical("right")
    _blend_horizontal("top")
    _blend_horizontal("bottom")

    return Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8), mode="RGBA")

def _repair_underfilled_target_region(
    expanded: Image.Image,
    preserved_fitted: Image.Image,
    canvas_meta: Dict[str, Any],
) -> Image.Image:
    target_rect = canvas_meta.get("target_rect") or {}
    source_rect = canvas_meta.get("source_rect") or {}
    tx1 = int(target_rect.get("x1", 0))
    ty1 = int(target_rect.get("y1", 0))
    tx2 = int(target_rect.get("x2", 0))
    ty2 = int(target_rect.get("y2", 0))
    sx1 = int(source_rect.get("x1", 0))
    sy1 = int(source_rect.get("y1", 0))
    sx2 = int(source_rect.get("x2", 0))
    sy2 = int(source_rect.get("y2", 0))

    if tx2 <= tx1 or ty2 <= ty1:
        return expanded

    rgba = expanded.convert("RGBA")
    alpha = np.array(rgba.getchannel("A"), dtype=np.uint8)
    rgb = np.array(rgba, dtype=np.uint8)
    crop_alpha = alpha[ty1:ty2, tx1:tx2]
    crop_rgb = rgb[ty1:ty2, tx1:tx2, :3]
    luma = (crop_rgb[..., 0].astype(np.float32) * 0.2126) + (crop_rgb[..., 1].astype(np.float32) * 0.7152) + (crop_rgb[..., 2].astype(np.float32) * 0.0722)
    underfilled = (crop_alpha < 6) | (luma <= 5.0)

    if sy2 > sy1 and sx2 > sx1:
        local_sx1 = max(0, sx1 - tx1)
        local_sy1 = max(0, sy1 - ty1)
        local_sx2 = max(local_sx1, sx2 - tx1)
        local_sy2 = max(local_sy1, sy2 - ty1)
        underfilled[local_sy1:local_sy2, local_sx1:local_sx2] = False

    if not np.any(underfilled):
        return expanded

    scaffold = _edge_extend_fill(preserved_fitted, max(1, tx2 - tx1), max(1, ty2 - ty1)).convert("RGBA")
    result = rgba.copy()
    patch = result.crop((tx1, ty1, tx2, ty2)).convert("RGBA")
    patch_arr = np.array(patch, dtype=np.uint8)
    scaffold_arr = np.array(scaffold, dtype=np.uint8)
    patch_arr[underfilled] = scaffold_arr[underfilled]
    result.alpha_composite(Image.fromarray(patch_arr, mode="RGBA"), (tx1, ty1))
    return result

def _repair_visible_exact_expand_seams_in_final(
    final_bytes: bytes,
    preserved_source_bytes: bytes,
    canvas_meta: Dict[str, Any],
    diagnostics: Optional[Dict[str, Any]] = None,
) -> bytes:
    diagnostics = diagnostics or {}
    flagged_sides = list(diagnostics.get("flagged_sides") or [])
    if not flagged_sides:
        return final_bytes

    overlap = canvas_meta.get("overlap") or {}

    with Image.open(io.BytesIO(final_bytes)) as final_im, Image.open(io.BytesIO(preserved_source_bytes)) as source_im:
        final_img = final_im.convert("RGBA")
        final_width, final_height = final_img.size
        sx1, sy1, sx2, sy2 = _final_space_source_rect_from_canvas_meta(
            final_width=final_width,
            final_height=final_height,
            canvas_meta=canvas_meta,
        )

        if sx2 <= sx1 or sy2 <= sy1:
            return final_bytes

        source_fitted, _ = _resize_to_contain(source_im.convert("RGBA"), max(1, sx2 - sx1), max(1, sy2 - sy1))
        arr = np.array(final_img, dtype=np.float32)
        ref = np.array(source_fitted, dtype=np.float32)[..., :3]

        def _blend_vertical(side: str) -> None:
            if side == "left":
                seam = sx1
                outer = min(seam, max(18, min(42, int((int(overlap.get("left", 0) or 0) * 2.2) or 22))))
                inner = min(ref.shape[1], max(14, min(34, int((int(overlap.get("left", 0) or 0) * 1.5) or 18))))
                x0 = max(0, seam - outer)
                x1 = min(arr.shape[1], seam + inner)
                split = seam - x0
                if split <= 0 or split >= (x1 - x0):
                    return
                strip = arr[sy1:sy2, x0:x1, :3]
                if strip.size == 0:
                    return
                out_bw = min(8, split)
                in_bw = min(8, inner)
                outside_ref = strip[:, split - out_bw:split, :]
                inside_ref = ref[:, :in_bw, :]
                if outside_ref.size == 0 or inside_ref.size == 0:
                    return
                delta = inside_ref.mean(axis=1) - outside_ref.mean(axis=1)
                delta = _smooth_matrix_along_axis(delta, radius=max(2, min(12, strip.shape[0] // 40)))
                target = strip.copy()
                if split > 0:
                    w_out = np.linspace(0.24, 0.92, split, dtype=np.float32).reshape(1, split, 1)
                    target[:, :split, :] = np.clip(target[:, :split, :] + (delta[:, None, :] * w_out), 0.0, 255.0)
                use_inner = min(inner, strip.shape[1] - split)
                if use_inner > 0:
                    src_slice = ref[:, :use_inner, :]
                    w_in = np.linspace(0.38, 0.10, use_inner, dtype=np.float32).reshape(1, use_inner, 1)
                    target[:, split:split + use_inner, :] = np.clip((target[:, split:split + use_inner, :] * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
                weights = np.concatenate([
                    np.linspace(0.18, 0.82, split, dtype=np.float32),
                    np.linspace(0.34, 0.06, max(0, strip.shape[1] - split), dtype=np.float32),
                ], axis=0).reshape(1, strip.shape[1], 1)
                arr[sy1:sy2, x0:x1, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)
            else:
                seam = sx2
                outer = min(max(0, arr.shape[1] - seam), max(18, min(42, int((int(overlap.get("right", 0) or 0) * 2.2) or 22))))
                inner = min(ref.shape[1], max(14, min(34, int((int(overlap.get("right", 0) or 0) * 1.5) or 18))))
                x0 = max(0, seam - inner)
                x1 = min(arr.shape[1], seam + outer)
                split = seam - x0
                if split <= 0 or split >= (x1 - x0):
                    return
                strip = arr[sy1:sy2, x0:x1, :3]
                if strip.size == 0:
                    return
                out_bw = min(8, strip.shape[1] - split)
                in_bw = min(8, inner)
                outside_ref = strip[:, split:split + out_bw, :]
                inside_ref = ref[:, ref.shape[1] - in_bw:ref.shape[1], :]
                if outside_ref.size == 0 or inside_ref.size == 0:
                    return
                delta = inside_ref.mean(axis=1) - outside_ref.mean(axis=1)
                delta = _smooth_matrix_along_axis(delta, radius=max(2, min(12, strip.shape[0] // 40)))
                target = strip.copy()
                outer_len = strip.shape[1] - split
                if outer_len > 0:
                    w_out = np.linspace(0.92, 0.24, outer_len, dtype=np.float32).reshape(1, outer_len, 1)
                    target[:, split:, :] = np.clip(target[:, split:, :] + (delta[:, None, :] * w_out), 0.0, 255.0)
                use_inner = min(inner, split)
                if use_inner > 0:
                    src_slice = ref[:, ref.shape[1] - use_inner:ref.shape[1], :]
                    w_in = np.linspace(0.10, 0.38, use_inner, dtype=np.float32).reshape(1, use_inner, 1)
                    target[:, split - use_inner:split, :] = np.clip((target[:, split - use_inner:split, :] * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
                weights = np.concatenate([
                    np.linspace(0.06, 0.34, split, dtype=np.float32),
                    np.linspace(0.82, 0.18, max(0, strip.shape[1] - split), dtype=np.float32),
                ], axis=0).reshape(1, strip.shape[1], 1)
                arr[sy1:sy2, x0:x1, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)

        def _blend_horizontal(side: str) -> None:
            if side == "top":
                seam = sy1
                outer = min(seam, max(16, min(38, int((int(overlap.get("top", 0) or 0) * 2.2) or 20))))
                inner = min(ref.shape[0], max(12, min(30, int((int(overlap.get("top", 0) or 0) * 1.5) or 16))))
                y0 = max(0, seam - outer)
                y1 = min(arr.shape[0], seam + inner)
                split = seam - y0
                if split <= 0 or split >= (y1 - y0):
                    return
                strip = arr[y0:y1, sx1:sx2, :3]
                if strip.size == 0:
                    return
                out_bw = min(8, split)
                in_bw = min(8, inner)
                outside_ref = strip[split - out_bw:split, :, :]
                inside_ref = ref[:in_bw, :, :]
                if outside_ref.size == 0 or inside_ref.size == 0:
                    return
                delta = inside_ref.mean(axis=0) - outside_ref.mean(axis=0)
                delta = _smooth_matrix_along_axis(delta, radius=max(2, min(12, strip.shape[1] // 40)))
                target = strip.copy()
                if split > 0:
                    w_out = np.linspace(0.22, 0.88, split, dtype=np.float32).reshape(split, 1, 1)
                    target[:split, :, :] = np.clip(target[:split, :, :] + (delta[None, :, :] * w_out), 0.0, 255.0)
                use_inner = min(inner, strip.shape[0] - split)
                if use_inner > 0:
                    src_slice = ref[:use_inner, :, :]
                    w_in = np.linspace(0.34, 0.10, use_inner, dtype=np.float32).reshape(use_inner, 1, 1)
                    target[split:split + use_inner, :, :] = np.clip((target[split:split + use_inner, :, :] * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
                weights = np.concatenate([
                    np.linspace(0.18, 0.80, split, dtype=np.float32),
                    np.linspace(0.32, 0.06, max(0, strip.shape[0] - split), dtype=np.float32),
                ], axis=0).reshape(strip.shape[0], 1, 1)
                arr[y0:y1, sx1:sx2, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)
            else:
                seam = sy2
                outer = min(max(0, arr.shape[0] - seam), max(16, min(38, int((int(overlap.get("bottom", 0) or 0) * 2.2) or 20))))
                inner = min(ref.shape[0], max(12, min(30, int((int(overlap.get("bottom", 0) or 0) * 1.5) or 16))))
                y0 = max(0, seam - inner)
                y1 = min(arr.shape[0], seam + outer)
                split = seam - y0
                if split <= 0 or split >= (y1 - y0):
                    return
                strip = arr[y0:y1, sx1:sx2, :3]
                if strip.size == 0:
                    return
                out_bw = min(8, strip.shape[0] - split)
                in_bw = min(8, inner)
                outside_ref = strip[split:split + out_bw, :, :]
                inside_ref = ref[ref.shape[0] - in_bw:ref.shape[0], :, :]
                if outside_ref.size == 0 or inside_ref.size == 0:
                    return
                delta = inside_ref.mean(axis=0) - outside_ref.mean(axis=0)
                delta = _smooth_matrix_along_axis(delta, radius=max(2, min(12, strip.shape[1] // 40)))
                target = strip.copy()
                outer_len = strip.shape[0] - split
                if outer_len > 0:
                    w_out = np.linspace(0.88, 0.22, outer_len, dtype=np.float32).reshape(outer_len, 1, 1)
                    target[split:, :, :] = np.clip(target[split:, :, :] + (delta[None, :, :] * w_out), 0.0, 255.0)
                use_inner = min(inner, split)
                if use_inner > 0:
                    src_slice = ref[ref.shape[0] - use_inner:ref.shape[0], :, :]
                    w_in = np.linspace(0.10, 0.34, use_inner, dtype=np.float32).reshape(use_inner, 1, 1)
                    target[split - use_inner:split, :, :] = np.clip((target[split - use_inner:split, :, :] * (1.0 - w_in)) + (src_slice * w_in), 0.0, 255.0)
                weights = np.concatenate([
                    np.linspace(0.06, 0.32, split, dtype=np.float32),
                    np.linspace(0.80, 0.18, max(0, strip.shape[0] - split), dtype=np.float32),
                ], axis=0).reshape(strip.shape[0], 1, 1)
                arr[y0:y1, sx1:sx2, :3] = np.clip((strip * (1.0 - weights)) + (target * weights), 0.0, 255.0)

        for side in flagged_sides:
            if side in {"left", "right"}:
                _blend_vertical(side)
            elif side in {"top", "bottom"}:
                _blend_horizontal(side)

        repaired = Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8), mode="RGBA")
        return _encode_png_bytes(repaired)

def _finalize_exact_size_ai_expand(
    expanded_canvas_bytes: bytes,
    preserved_source_bytes: bytes,
    canvas_meta: Dict[str, Any],
) -> bytes:
    target_rect = canvas_meta["target_rect"]
    source_rect = canvas_meta["source_rect"]
    requested_width = int(canvas_meta["requested_width"])
    requested_height = int(canvas_meta["requested_height"])

    with Image.open(io.BytesIO(expanded_canvas_bytes)) as expanded_im, Image.open(io.BytesIO(preserved_source_bytes)) as source_im:
        expanded = expanded_im.convert("RGBA")
        source = source_im.convert("RGBA")
        preserved_fitted, _ = _resize_to_contain(
            source,
            int(source_rect["width"]),
            int(source_rect["height"]),
        )

        expanded = _repair_underfilled_target_region(expanded, preserved_fitted, canvas_meta)
        expanded = _overlay_preserved_source_with_adaptive_alpha(
            expanded=expanded,
            preserved_fitted=preserved_fitted,
            canvas_meta=canvas_meta,
        )
        expanded = _harmonize_exact_expand_bands(expanded, canvas_meta)
        expanded = _locally_harmonize_exact_expand_seams(expanded, preserved_fitted, canvas_meta)
        expanded = _microblend_exact_expand_seams(expanded, preserved_fitted, canvas_meta)

        cropped = expanded.crop((
            int(target_rect["x1"]),
            int(target_rect["y1"]),
            int(target_rect["x2"]),
            int(target_rect["y2"]),
        ))
        if cropped.size != (requested_width, requested_height):
            cropped = cropped.resize((requested_width, requested_height), Image.Resampling.LANCZOS)
        return _encode_png_bytes(cropped.convert("RGBA"))


async def _expand_image_to_exact_size_with_ai(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
) -> Dict[str, Any]:
    base_width, base_height = _choose_best_supported_base_size(requested_width, requested_height)
    source_width, source_height = _read_image_dimensions(image_bytes)
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = requested_width / max(1.0, float(requested_height))
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    attempt_profiles = ["balanced", "wide", "coverage", "strict"] if ratio_delta >= 0.22 else ["balanced", "wide", "strict"]
    attempt_summaries: List[Dict[str, Any]] = []
    best_result: Optional[Dict[str, Any]] = None
    best_score = float("inf")

    for attempt_index, profile in enumerate(attempt_profiles, start=1):
        canvas_bytes, mask_bytes, canvas_meta = _build_exact_size_ai_canvas(
            image_bytes=image_bytes,
            requested_width=requested_width,
            requested_height=requested_height,
            base_width=base_width,
            base_height=base_height,
            overlap_profile=profile,
        )

        result = await _edit_openai_image(
            client=client,
            image_bytes=canvas_bytes,
            filename="exact-size-expand.png",
            content_type="image/png",
            final_prompt=_build_exact_size_expand_prompt(
                requested_width=requested_width,
                requested_height=requested_height,
                canvas_meta=canvas_meta,
                prompt_mode=profile,
            ),
            aspect_ratio=_base_size_to_aspect_ratio(base_width, base_height),
            quality=openai_quality,
            openai_key=openai_key,
            openai_size=f"{base_width}x{base_height}",
            mask_bytes=mask_bytes,
            input_fidelity="high",
        )

        expanded_bytes, _ = _image_bytes_from_result_url(result["url"])
        final_bytes = _finalize_exact_size_ai_expand(
            expanded_canvas_bytes=expanded_bytes,
            preserved_source_bytes=image_bytes,
            canvas_meta=canvas_meta,
        )
        diagnostics = _exact_expand_quality_diagnostics(
            final_bytes=final_bytes,
            preserved_source_bytes=image_bytes,
            canvas_meta=canvas_meta,
        )
        quality_score = float(diagnostics.get("quality_score", 999.0))
        seam_score = float(diagnostics.get("seam_score", 999.0))
        seam_max = float(diagnostics.get("seam_max", 999.0))
        fallback_applied = False
        fallback_improved = False
        fallback_details: Dict[str, Any] = {}

        should_try_fallback = bool(
            diagnostics.get("flagged_sides")
            and (seam_max >= 6.8 or seam_score >= 5.8 or quality_score >= 10.8)
        )
        if should_try_fallback:
            repaired_bytes = _repair_visible_exact_expand_seams_in_final(
                final_bytes=final_bytes,
                preserved_source_bytes=image_bytes,
                canvas_meta=canvas_meta,
                diagnostics=diagnostics,
            )
            if repaired_bytes != final_bytes:
                fallback_applied = True
                repaired_diagnostics = _exact_expand_quality_diagnostics(
                    final_bytes=repaired_bytes,
                    preserved_source_bytes=image_bytes,
                    canvas_meta=canvas_meta,
                )
                repaired_quality = float(repaired_diagnostics.get("quality_score", 999.0))
                repaired_seam_score = float(repaired_diagnostics.get("seam_score", 999.0))
                repaired_seam_max = float(repaired_diagnostics.get("seam_max", 999.0))
                fallback_details = {
                    "before_quality_score": round(quality_score, 3),
                    "before_seam_score": round(seam_score, 3),
                    "before_seam_max": round(seam_max, 3),
                    "after_quality_score": round(repaired_quality, 3),
                    "after_seam_score": round(repaired_seam_score, 3),
                    "after_seam_max": round(repaired_seam_max, 3),
                    "flagged_sides": list(diagnostics.get("flagged_sides") or []),
                }
                if (repaired_quality <= quality_score - 0.18) or (repaired_seam_max <= seam_max - 0.35) or (repaired_seam_score <= seam_score - 0.25):
                    fallback_improved = True
                    final_bytes = repaired_bytes
                    diagnostics = repaired_diagnostics
                    quality_score = repaired_quality
                    seam_score = repaired_seam_score
                    seam_max = repaired_seam_max

        candidate_result = dict(result)
        candidate_result["engine_id"] = "openai_exact_canvas_expand"
        candidate_result["motor"] = f"{result.get('motor', 'OpenAI GPT Image 1.5 Edit')} + Extensão real por IA"
        candidate_result["url"] = _result_url_from_image_bytes(final_bytes, "image/png")
        candidate_result["exact_canvas_expand"] = {
            "requested_width": requested_width,
            "requested_height": requested_height,
            "base_width": base_width,
            "base_height": base_height,
            "target_rect": dict(canvas_meta.get("target_rect") or {}),
            "source_rect": dict(canvas_meta.get("source_rect") or {}),
            "protected_rect": dict(canvas_meta.get("protected_rect") or {}),
            "overlap": dict(canvas_meta.get("overlap") or {}),
            "gaps": dict(canvas_meta.get("gaps") or {}),
            "profile": profile,
            "quality_score": round(float(quality_score), 3),
            "seam_score": round(float(seam_score), 3),
            "seam_max": round(float(seam_max), 3),
            "border_score": round(float(diagnostics.get("border_score", 0.0)), 3),
            "generated_region_penalty": round(float(diagnostics.get("generated_region_penalty", 0.0)), 3),
            "seam_details": list(diagnostics.get("seam_details") or []),
            "flagged_sides": list(diagnostics.get("flagged_sides") or []),
            "fallback_applied": bool(fallback_applied),
            "fallback_improved": bool(fallback_improved),
            "fallback_details": fallback_details,
            "attempt_index": attempt_index,
            "strategy": "ai_exact_canvas_expand",
            "ratio_delta": round(float(ratio_delta), 4),
            "scaffold_used": bool((canvas_meta.get("scaffold_used") is True)),
        }
        attempt_summaries.append({
            "attempt_index": attempt_index,
            "profile": profile,
            "quality_score": round(float(quality_score), 3),
            "seam_score": round(float(seam_score), 3),
            "seam_max": round(float(seam_max), 3),
            "flagged_sides": list(diagnostics.get("flagged_sides") or []),
            "fallback_applied": bool(fallback_applied),
            "fallback_improved": bool(fallback_improved),
        })

        if quality_score < best_score:
            best_score = quality_score
            best_result = candidate_result

        if profile == "strict" and quality_score <= 8.5:
            break

    if best_result is None:
        raise ValueError("Falha ao concluir a expansão exata por IA.")

    selected_expand = dict(best_result.get("exact_canvas_expand") or {})
    best_result["exact_canvas_expand"] = {
        **selected_expand,
        "attempts": attempt_summaries,
        "selected_quality_score": round(float(best_score), 3),
        "selected_attempt": int(selected_expand.get("attempt_index", 1)),
        "selected_profile": str(selected_expand.get("profile", "balanced")),
        "selected_seam_score": round(float(selected_expand.get("seam_score", 999.0)), 3),
        "selected_seam_max": round(float(selected_expand.get("seam_max", 999.0)), 3),
    }
    return best_result


async def _expand_image_to_supported_canvas_preserve(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
) -> Dict[str, Any]:
    expand_width, expand_height = _choose_best_supported_base_size(requested_width, requested_height)
    canvas_bytes, mask_bytes, placement = _build_preserve_frame_canvas(image_bytes, expand_width, expand_height)

    result = await _edit_openai_image(
        client=client,
        image_bytes=canvas_bytes,
        filename="preserve-frame-expand.png",
        content_type="image/png",
        final_prompt=_build_preserve_frame_expand_prompt(requested_width, requested_height, placement),
        aspect_ratio=_base_size_to_aspect_ratio(expand_width, expand_height),
        quality=openai_quality,
        openai_key=openai_key,
        openai_size=f"{expand_width}x{expand_height}",
        mask_bytes=mask_bytes,
        input_fidelity="high",
    )

    expanded_bytes, _ = _image_bytes_from_result_url(result["url"])
    merged_bytes = _overlay_preserved_region(expanded_bytes, image_bytes, placement)
    next_result = dict(result)
    next_result["url"] = _result_url_from_image_bytes(merged_bytes, "image/png")
    next_result["expanded_canvas"] = {
        "width": expand_width,
        "height": expand_height,
        "placement": placement,
        "sides": _expand_sides_from_placement(placement),
        "strategy": "preserve",
    }
    next_result["motor"] = f"{result.get('motor', 'Imagem')} + Expand preservado"
    return next_result


async def _expand_image_to_supported_canvas_smart(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
    strength: str,
) -> Dict[str, Any]:
    result = await _expand_image_to_supported_canvas_preserve(
        client=client,
        image_bytes=image_bytes,
        openai_key=openai_key,
        openai_quality=openai_quality,
        requested_width=requested_width,
        requested_height=requested_height,
    )
    next_result = dict(result)
    next_result["expanded_canvas"] = {
        **dict(result.get("expanded_canvas") or {}),
        "strategy": "preserve_fallback_after_legacy_cleanup",
        "requested_width": requested_width,
        "requested_height": requested_height,
        "strength": strength,
    }
    next_result["motor"] = f"{result.get('motor', 'Imagem')} + Preserve Fallback"
    return next_result


async def _expand_image_to_exact_size_non_native(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
    instruction_text: str = "",
) -> Dict[str, Any]:
    expanded = await _expand_image_to_supported_canvas_preserve(
        client=client,
        image_bytes=image_bytes,
        openai_key=openai_key,
        openai_quality=openai_quality,
        requested_width=requested_width,
        requested_height=requested_height,
    )
    next_result = await _apply_postprocess_if_needed(
        client=client,
        result=expanded,
        target_dimensions=(requested_width, requested_height),
        preserve_original_frame=True,
        allow_resize_crop=False,
        original_reference_bytes=image_bytes,
    )
    next_result["expanded_canvas"] = {
        **dict(next_result.get("expanded_canvas") or {}),
        "strategy": "exact_size_fallback_after_legacy_cleanup",
        "requested_width": requested_width,
        "requested_height": requested_height,
        "instruction_text": _clamp_text(instruction_text, 280),
    }
    next_result["motor"] = f"{next_result.get('motor', 'Imagem')} + Exact Size"
    return next_result


async def _expand_image_to_supported_canvas(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
    strategy: str = "auto",
) -> Dict[str, Any]:
    source_width, source_height = _read_image_dimensions(image_bytes)
    normalized_strategy = (strategy or "auto").strip().lower()

    if normalized_strategy == "preserve":
        return await _expand_image_to_supported_canvas_preserve(
            client=client,
            image_bytes=image_bytes,
            openai_key=openai_key,
            openai_quality=openai_quality,
            requested_width=requested_width,
            requested_height=requested_height,
        )

    use_smart = normalized_strategy == "smart"
    if normalized_strategy == "auto":
        use_smart = _is_strong_canvas_recompose_case(
            source_width=source_width,
            source_height=source_height,
            target_width=requested_width,
            target_height=requested_height,
        )

    if use_smart:
        return await _expand_image_to_supported_canvas_smart(
            client=client,
            image_bytes=image_bytes,
            openai_key=openai_key,
            openai_quality=openai_quality,
            requested_width=requested_width,
            requested_height=requested_height,
            strength=_smart_expand_strength_from_geometry(
                source_width=source_width,
                source_height=source_height,
                target_width=requested_width,
                target_height=requested_height,
            ),
        )

    return await _expand_image_to_supported_canvas_preserve(
        client=client,
        image_bytes=image_bytes,
        openai_key=openai_key,
        openai_quality=openai_quality,
        requested_width=requested_width,
        requested_height=requested_height,
    )


def _build_change_mask_from_original(
    edited_image: Image.Image,
    original_reference: Image.Image,
) -> Image.Image:
    edited_rgba = edited_image.convert("RGBA")
    original_rgba = original_reference.convert("RGBA")
    diff = ImageChops.difference(edited_rgba, original_rgba).convert("L")
    diff = diff.filter(ImageFilter.GaussianBlur(radius=0.8))
    diff = diff.point(lambda px: 255 if px >= 16 else 0, mode="L")
    diff = diff.filter(ImageFilter.MaxFilter(5))
    diff = diff.filter(ImageFilter.GaussianBlur(radius=1.1))
    return diff



def _mask_coverage(mask: Image.Image) -> float:
    histogram = mask.convert("L").histogram()
    non_zero = sum(count for idx, count in enumerate(histogram) if idx > 8)
    total = max(1, sum(histogram))
    return non_zero / total




def _project_edited_changes_onto_reference(
    edited_image: Image.Image,
    original_reference: Image.Image,
    target_width: int,
    target_height: int,
    preserve_original_frame: bool = False,
    allow_resize_crop: bool = False,
) -> Optional[Image.Image]:
    edited_rgba = edited_image.convert("RGBA")
    original_rgba = original_reference.convert("RGBA")
    if edited_rgba.width <= 0 or edited_rgba.height <= 0 or original_rgba.width <= 0 or original_rgba.height <= 0:
        return None

    original_in_edit_space = original_rgba.resize(edited_rgba.size, Image.Resampling.LANCZOS)
    mask_in_edit_space = _build_change_mask_from_original(edited_rgba, original_in_edit_space)
    coverage = _mask_coverage(mask_in_edit_space)

    normalized_allow_resize_crop = bool(allow_resize_crop and not preserve_original_frame)
    aspect_adaptation_needed = _needs_exact_canvas_expand(
        original_rgba.width,
        original_rgba.height,
        target_width,
        target_height,
        allow_resize_crop=normalized_allow_resize_crop,
    )

    if normalized_allow_resize_crop:
        base_target = _resize_to_cover(original_rgba, target_width, target_height)
        edited_target = _resize_to_cover(edited_rgba, target_width, target_height)
        mask_target = _resize_mask_to_cover(mask_in_edit_space, target_width, target_height)
    elif aspect_adaptation_needed:
        edited_target = _edge_extend_fill(edited_rgba, target_width, target_height)
        return edited_target
    else:
        base_target = original_rgba.resize((target_width, target_height), Image.Resampling.LANCZOS)
        edited_target = edited_rgba.resize((target_width, target_height), Image.Resampling.LANCZOS)
        mask_target = mask_in_edit_space.resize((target_width, target_height), Image.Resampling.LANCZOS)

    if coverage <= 0.0008:
        return base_target

    if coverage >= 0.38:
        softened_mask = mask_target.filter(ImageFilter.GaussianBlur(radius=1.25))
        return Image.composite(edited_target, base_target, softened_mask)

    softened_mask = mask_target.filter(ImageFilter.GaussianBlur(radius=1.4))
    composed = Image.composite(edited_target, base_target, softened_mask)
    return composed


def _resize_image_bytes_exact(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    preserve_original_frame: bool,
    allow_resize_crop: bool,
    original_reference_bytes: Optional[bytes] = None,
) -> bytes:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            prepared = img.convert("RGBA") if img.mode not in {"RGB", "RGBA"} else img.copy()
            prepared = _trim_uniform_borders(prepared)

            normalized_allow_resize_crop = bool(allow_resize_crop and not preserve_original_frame)
            aspect_adaptation_needed = _needs_exact_canvas_expand(
                prepared.width,
                prepared.height,
                target_width,
                target_height,
                allow_resize_crop=normalized_allow_resize_crop,
            )

            result = None
            if original_reference_bytes:
                try:
                    with Image.open(io.BytesIO(original_reference_bytes)) as original_img:
                        result = _project_edited_changes_onto_reference(
                            prepared,
                            original_img,
                            target_width,
                            target_height,
                            preserve_original_frame=preserve_original_frame,
                            allow_resize_crop=normalized_allow_resize_crop,
                        )
                except UnidentifiedImageError:
                    result = None

            if result is None:
                if normalized_allow_resize_crop:
                    result = _resize_to_cover(prepared, target_width, target_height)
                elif aspect_adaptation_needed:
                    result = _edge_extend_fill(prepared, target_width, target_height)
                else:
                    result = prepared.resize((target_width, target_height), Image.Resampling.LANCZOS)

            return _encode_png_bytes(result.convert("RGBA"))
    except UnidentifiedImageError as exc:
        raise ValueError(f"Não foi possível redimensionar a imagem final: {exc}")


async def _read_result_bytes(
    client: httpx.AsyncClient,
    result: Dict[str, Any],
) -> Tuple[bytes, str]:
    result_url = result.get("url")
    if not result_url:
        raise ValueError("Resultado sem URL para validação.")
    if str(result_url).startswith("data:"):
        return _image_bytes_from_result_url(result_url)
    fetched = await client.get(result_url)
    fetched.raise_for_status()
    return fetched.content, _guess_image_content_type("", fetched.headers.get("content-type"))


def _normalize_aspect_ratio(formato: str) -> str:
    mapping = {
        "quadrado_1_1": "1:1",
        "vertical_9_16": "9:16",
        "horizontal_16_9": "16:9",
    }
    return mapping.get((formato or "").strip(), "1:1")


def _asset_type_from_context(where: str, aspect_ratio: str) -> str:
    p = (where or "").lower()

    if "thumbnail" in p or "youtube" in p:
        return "thumbnail"
    if "story" in p or "status" in p or aspect_ratio == "9:16":
        return "story_cta"
    if "landing" in p or "site" in p or "banner" in p or aspect_ratio == "16:9":
        return "landing_banner"
    if "carrossel" in p:
        return "carousel_cover"
    if "linkedin" in p:
        return "social_media_post"

    return "feed_offer"


def _marketing_preset(asset_type: str, where: str) -> Dict[str, str]:
    destination = where or "mídia digital"

    presets = {
        "feed_offer": {
            "mode": "direct_response",
            "goal": f"peça publicitária para feed em {destination}",
            "layout": "foco visual dominante, área limpa para headline no terço superior, apoio visual central, boa distribuição de peso, sem áreas mortas e com composição equilibrada para anúncio real",
            "style": "publicidade premium, acabamento comercial de alta conversão, hierarquia visual limpa, contraste forte e leitura imediata",
            "overlay": "headline no topo, subheadline no centro ou logo abaixo, CTA opcional na base",
            "grid": "grid de anúncio social em 12 colunas, margens seguras entre 6 e 8 por cento, alinhamento limpo e ritmo visual consistente",
        },
        "story_cta": {
            "mode": "lead_generation",
            "goal": f"criativo vertical de conversão para {destination}",
            "layout": "composição vertical mobile-first, foco central ou ligeiramente abaixo do centro, headline no terço superior, subheadline no miolo, zona de CTA inferior, boa respiração visual e sem poluição",
            "style": "anúncio vertical premium, contraste forte, leitura rápida, sensação de peça profissional feita para conversão",
            "overlay": "headline no terço superior, subheadline no meio, CTA na faixa inferior",
            "grid": "grid vertical com grandes áreas seguras no topo e na base, laterais limpas e distribuição pensada para interfaces mobile",
        },
        "landing_banner": {
            "mode": "premium_branding",
            "goal": f"hero banner para {destination}",
            "layout": "layout horizontal premium, bloco de texto reservado em um lado e assunto visual no lado oposto, equilíbrio forte, espaço nobre para copy e sem vazios inúteis",
            "style": "branding comercial premium, presença corporativa forte, acabamento sofisticado e direção visual limpa",
            "overlay": "headline principal, subheadline logo abaixo, CTA opcional",
            "grid": "grid horizontal de hero com painel reservado para texto e forte separação entre copy e imagem",
        },
        "thumbnail": {
            "mode": "social_media_post",
            "goal": f"thumbnail ou capa com alto potencial de clique para {destination}",
            "layout": "foco dominante, hierarquia agressiva, fundo simplificado, headline curta e legível, contraste alto e leitura instantânea",
            "style": "acabamento de thumbnail premium, visual forte, impacto imediato e baixo ruído",
            "overlay": "headline curta com apoio opcional mínimo",
            "grid": "grid de thumbnail com foco muito claro, título forte e fundo subordinado ao elemento principal",
        },
        "carousel_cover": {
            "mode": "carousel_visual",
            "goal": f"capa de carrossel para {destination}",
            "layout": "composição editorial com grande zona de título, ponto focal memorável, boa ancoragem do visual principal e distribuição limpa do espaço",
            "style": "post editorial premium, aparência de marca forte, layout limpo e alta clareza",
            "overlay": "headline forte e apoio curto opcional",
            "grid": "grid editorial de capa com bloco de título dominante e ponto focal muito bem resolvido",
        },
        "social_media_post": {
            "mode": "social_media_post",
            "goal": f"post profissional para {destination}",
            "layout": "equilíbrio entre branding e leitura, assunto visual claro, zonas seguras para texto, boa hierarquia e sem espaço morto",
            "style": "design limpo, premium e corporativo, com acabamento polido e boa legibilidade",
            "overlay": "headline e linha de apoio curta",
            "grid": "grid social balanceado, com margens seguras e organização forte entre imagem e texto",
        },
    }

    return presets.get(asset_type, presets["feed_offer"])


def _openai_size_from_aspect_ratio(ar: str) -> str:
    if ar == "9:16":
        return "1024x1536"
    if ar == "16:9":
        return "1536x1024"
    return "1024x1024"


def _sanitize_copy(text: str, max_len: int) -> str:
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_len]


def _build_user_brief(payload: ImageEngineRequest) -> str:
    parts = [
        f"Formato: {payload.formato}",
        "Objetivo de publicação: livre, sem canal fixo",
        f"Qualidade desejada: {payload.qualidade}",
        f"Paleta de cores: {payload.paleta_cores}",
    ]

    if payload.width and payload.height:
        parts.append(f"Tamanho final customizado: {payload.width}x{payload.height}")

    if payload.headline.strip():
        parts.append(f"Headline exata: {payload.headline.strip()}")

    if payload.subheadline.strip():
        parts.append(f"Sub-headline exata: {payload.subheadline.strip()}")

    if payload.descricao_visual.strip():
        parts.append(f"Descrição visual da arte: {payload.descricao_visual.strip()}")

    return "\n".join(parts)

def _build_user_edit_brief(payload: ImageEditRequest) -> str:
    parts = [
        f"Formato: {payload.formato}",
        f"Qualidade desejada: {payload.qualidade}",
    ]

    if payload.width and payload.height:
        parts.append(f"Tamanho final customizado: {payload.width}x{payload.height}")

    if payload.preserve_original_frame:
        parts.append("Preservar enquadramento original: sim")

    if payload.allow_resize_crop:
        parts.append("Crop permitido para resize exato: sim")
    else:
        parts.append("Crop permitido para resize exato: não")

    if payload.instrucoes_edicao.strip():
        parts.append(f"Instruções de edição: {payload.instrucoes_edicao.strip()}")

    return "\n".join(parts)

def _guess_image_content_type(filename: str, upload_content_type: Optional[str] = None) -> str:
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    if upload_content_type in allowed:
        return "image/jpeg" if upload_content_type == "image/jpg" else upload_content_type

    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


def _validate_reference_image(image_bytes: bytes, content_type: str) -> None:
    allowed = {"image/png", "image/jpeg", "image/webp"}
    if content_type not in allowed:
        raise ValueError("Formato inválido. Use PNG, JPG, JPEG ou WEBP.")

    if not image_bytes:
        raise ValueError("A imagem de referência está vazia.")

    if len(image_bytes) > 20 * 1024 * 1024:
        raise ValueError("A imagem de referência excede 20 MB.")


async def _post_multipart_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    data: Dict[str, Any],
    files: List[tuple],
    retries: int = 3,
    backoff_base: float = 1.2,
) -> httpx.Response:
    last_exc = None

    for attempt in range(1, retries + 1):
        try:
            resp = await client.post(url, headers=headers, data=data, files=files)
            if resp.status_code < 400:
                return resp

            if resp.status_code not in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )

            last_exc = httpx.HTTPStatusError(
                f"HTTP {resp.status_code}: {resp.text}",
                request=resp.request,
                response=resp,
            )

        except Exception as e:
            last_exc = e

        if attempt < retries:
            await asyncio.sleep(backoff_base * attempt)

    raise last_exc if last_exc else RuntimeError("Falha desconhecida em _post_multipart_with_retry")



async def _post_json_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    json_payload: Dict[str, Any],
    retries: int = 3,
    backoff_base: float = 1.2,
) -> httpx.Response:
    last_exc = None

    for attempt in range(1, retries + 1):
        try:
            resp = await client.post(url, headers=headers, json=json_payload)
            if resp.status_code < 400:
                return resp

            if resp.status_code not in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )

            last_exc = httpx.HTTPStatusError(
                f"HTTP {resp.status_code}: {resp.text}",
                request=resp.request,
                response=resp,
            )

        except Exception as e:
            last_exc = e

        if attempt < retries:
            await asyncio.sleep(backoff_base * attempt)

    raise last_exc if last_exc else RuntimeError("Falha desconhecida em _post_json_with_retry")


async def _improve_prompt_with_openai(
    client: httpx.AsyncClient,
    payload: ImageEngineRequest,
    aspect_ratio: str,
    asset_type: str,
    preset: Dict[str, str],
    openai_key: str,
) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    headline = _sanitize_copy(payload.headline, 140)
    subheadline = _sanitize_copy(payload.subheadline, 220)
    descricao_visual = _sanitize_copy(payload.descricao_visual, 2000)

    default_copy_policy = (
        "usar_textos_exatos_do_usuario_sem_traduzir"
        if (headline or subheadline)
        else "reservar_zonas_de_texto_sem_inventar_copy"
    )

    system_text = """
Você é um diretor de arte sênior de marketing e engenheiro de prompts para geração de imagens publicitárias.

Sua função não é escrever um texto bonito.
Sua função é projetar um prompt de geração de imagem extremamente forte para publicidade real.

Retorne SOMENTE JSON válido com esta estrutura exata:
{
  "prompt_final": string,
  "negative_prompt": string,
  "creative_direction": string,
  "layout_notes": string,
  "marketing_mode": string,
  "overlay_recommendation": string,
  "design_system": string,
  "grid_spec": string,
  "text_distribution_rules": string,
  "copy_policy": string
}

Regras obrigatórias:
1. Escreva TUDO em português do Brasil.
2. O foco é marketing, conversão, direção de arte publicitária e usabilidade comercial.
3. O prompt deve dizer COMO a imagem deve ser composta, não apenas O QUE mostrar.
4. Projete uma imagem com aparência de anúncio premium, e não uma arte genérica de IA.
5. Reforce:
   - hierarquia visual forte
   - composição disciplinada
   - separação clara entre foco principal e fundo
   - iluminação comercial
   - contraste publicitário
   - nitidez premium
   - escala correta do elemento principal
   - ausência de espaços mortos
   - ausência de poluição visual
6. Se headline e sub-headline existirem, o sistema deve priorizar EXATAMENTE esses textos e NUNCA traduzi-los.
7. Nunca invente textos promocionais em inglês.
8. Nunca gere frases como Shop now, Learn more, Join now, Special offer ou equivalentes.
9. Se houver risco de tipografia ruim, preserve áreas limpas para texto ao invés de inventar textos errados.
10. O negative_prompt deve bloquear:
   - texto em inglês
   - texto aleatório
   - letras deformadas
   - tipografia ruim
   - espaços mortos
   - layout confuso
   - excesso de elementos
   - anatomia deformada
   - duplicações
   - baixa nitidez
   - visual de mockup amador
   - acabamento fraco
11. marketing_mode deve ser um destes:
   - direct_response
   - premium_branding
   - social_media_post
   - carousel_visual
   - lead_generation
12. copy_policy deve ser um destes:
   - usar_textos_exatos_do_usuario_sem_traduzir
   - reservar_zonas_de_texto_sem_inventar_copy
   - usar_copy_curta_em_portugues
13. text_distribution_rules deve mencionar:
   - máximo de linhas da headline
   - máximo de linhas da sub-headline
   - margens seguras
   - equilíbrio texto versus imagem
   - proibição de blocos longos
14. O resultado precisa ser mais forte, mais técnico e mais publicitário do que um prompt comum.
"""

    user_text = (
        f"Briefing estruturado:\n{_build_user_brief(payload)}\n\n"
        f"Aspect ratio: {aspect_ratio}\n"
        f"Tipo de peça: {asset_type}\n"
        f"Objetivo do preset: {preset['goal']}\n"
        f"Comportamento de layout do preset: {preset['layout']}\n"
        f"Estilo visual do preset: {preset['style']}\n"
        f"Recomendação de overlay do preset: {preset['overlay']}\n"
        f"Grid base do preset: {preset['grid']}\n\n"
        f"Headline exata do usuário: {headline or 'não informada'}\n"
        f"Sub-headline exata do usuário: {subheadline or 'não informada'}\n"
        f"Descrição visual: {descricao_visual or 'não informada'}\n\n"
        "Quero um refinamento com foco em direção de arte publicitária, acabamento premium, composição forte, legibilidade real, linguagem em português do Brasil e proibição total de textos falsos em inglês."
    )

    payload_json = {
        "model": OPENAI_CHAT_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.15,
    }

    resp = await _post_json_with_retry(
        client=client,
        url="https://api.openai.com/v1/chat/completions",
        headers=headers,
        json_payload=payload_json,
        retries=3,
    )

    content = resp.json()["choices"][0]["message"]["content"]
    data = _parse_json_safe(content)

    return {
        "prompt_final": _clamp_text(data.get("prompt_final", "")),
        "negative_prompt": _clamp_text(data.get("negative_prompt", "")),
        "creative_direction": _clamp_text(data.get("creative_direction", "")),
        "layout_notes": _clamp_text(data.get("layout_notes", "")),
        "marketing_mode": _clamp_text(data.get("marketing_mode", preset["mode"])),
        "overlay_recommendation": _clamp_text(data.get("overlay_recommendation", "")),
        "design_system": _clamp_text(data.get("design_system", "")),
        "grid_spec": _clamp_text(data.get("grid_spec", "")),
        "text_distribution_rules": _clamp_text(
            data.get(
                "text_distribution_rules",
                "headline com no máximo 2 linhas, sub-headline com no máximo 3 linhas, margens seguras, sem blocos longos e com proporção equilibrada entre texto e imagem",
            )
        ),
        "copy_policy": _clamp_text(data.get("copy_policy", default_copy_policy)),
    }


def _build_final_generation_prompt(
    payload: ImageEngineRequest,
    aspect_ratio: str,
    asset_type: str,
    preset: Dict[str, str],
    improved: Dict[str, str],
) -> str:
    headline = _sanitize_copy(payload.headline, 140)
    subheadline = _sanitize_copy(payload.subheadline, 220)
    description = _sanitize_copy(payload.descricao_visual, 3000)

    copy_block = []
    if headline:
        copy_block.append(f"- Use exatamente esta headline em português do Brasil, sem traduzir: {headline}")
    if subheadline:
        copy_block.append(f"- Use exatamente esta sub-headline em português do Brasil, sem traduzir: {subheadline}")
    if not headline and not subheadline:
        copy_block.append("- Não há headline ou sub-headline fixas. Preserve áreas nobres para texto, mas não invente parágrafos ou slogans falsos.")

    copy_block.append("- Nunca substituir os textos do usuário por versões em inglês.")
    copy_block.append("- Nunca inserir frases como Shop now, Learn more, Join now, New collection ou qualquer placeholder em inglês.")
    copy_block.append("- Se a engine não conseguir renderizar o texto com qualidade, priorize composição limpa e zonas reservadas, em vez de inventar texto ruim.")

    final_prompt = f"""
{improved['prompt_final']}

Esta imagem deve parecer uma peça publicitária premium, real e profissional.
Não criar uma arte genérica de IA.
Não criar um mockup fraco.
Não criar uma imagem bonita porém inútil para marketing.

Objetivo principal:
- gerar uma imagem com cara de anúncio de alta conversão
- forte impacto visual
- composição disciplinada
- leitura imediata
- acabamento premium
- hierarquia clara
- alto valor percebido

Contexto estruturado da peça:
- formato selecionado: {payload.formato}
- proporção final: {aspect_ratio}
- tipo de peça: {asset_type}
- destino de publicação: livre, sem canal fixo
- nível de qualidade solicitado: {_quality_label(_normalize_quality(payload.qualidade))}
- paleta de cores: {payload.paleta_cores}
- descrição visual solicitada: {description or 'seguir uma direção comercial premium coerente com o briefing'}
- tamanho final desejado: seguir o formato selecionado sem lógica extra de crop, expansão ou recomposição automática

Objetivo do preset:
{preset['goal']}

Comportamento obrigatório de layout:
{preset['layout']}

Estilo visual obrigatório:
{preset['style']}

Direção criativa:
{improved['creative_direction']}

Notas de layout:
{improved['layout_notes']}

Recomendação de overlay:
{improved['overlay_recommendation']}

Sistema visual:
{improved['design_system']}

Especificação de grid:
{improved['grid_spec']}

Regras de distribuição de texto:
{improved['text_distribution_rules']}

Política de copy:
{improved['copy_policy']}

Regras técnicas de composição:
- compor como diretor de arte publicitário, não como artista aleatório
- criar um ponto focal dominante e imediatamente compreensível
- controlar escala do elemento principal para que ele tenha presença forte
- separar bem objeto principal e fundo
- usar iluminação comercial e acabamento premium
- trabalhar profundidade de cena de forma elegante, sem poluir a leitura
- manter contraste suficiente para uma headline clara
- manter a área da sub-headline mais calma do que o centro focal
- evitar fundo excessivamente carregado atrás do texto
- evitar espaços mortos, vazios acidentais ou cantos sem função
- evitar excesso de mini elementos concorrendo com o foco
- criar equilíbrio entre sofisticação visual e clareza de marketing
- preservar margens seguras para recortes da plataforma
- manter sensação de peça pronta para campanha real
- nitidez premium, materiais bem resolvidos, reflexos controlados, contraste publicitário, acabamento comercial de alto padrão

Regras obrigatórias de idioma e texto:
{chr(10).join(copy_block)}

Restrições fortes:
- todo texto visível deve estar em português do Brasil
- não traduzir os textos do usuário
- não resumir o texto do usuário
- não inventar slogans em inglês
- não encher a peça com labels falsos
- não usar parágrafos longos
- não destruir a composição tentando encaixar texto demais
"""
    return _clamp_text(final_prompt, 7000)


async def _generate_openai_image(
    client: httpx.AsyncClient,
    final_prompt: str,
    aspect_ratio: str,
    quality: str,
    openai_key: str,
    openai_size: Optional[str] = None,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": OPENAI_IMAGE_MODEL,
        "prompt": final_prompt,
        "size": openai_size or _openai_size_from_aspect_ratio(aspect_ratio),
        "quality": quality,
        "output_format": "png",
        "background": "opaque",
    }

    resp = await _post_json_with_retry(
        client=client,
        url="https://api.openai.com/v1/images/generations",
        headers=headers,
        json_payload=payload,
        retries=3,
    )

    body = resp.json()
    data = body.get("data", [])
    if not data:
        raise ValueError(f"OpenAI sem data: {body}")

    first = data[0]
    b64_json = first.get("b64_json")
    if not b64_json:
        raise ValueError(f"OpenAI não retornou b64_json: {body}")

    return {
        "engine_id": "openai",
        "motor": "OpenAI GPT Image 1.5",
        "url": _data_uri_from_b64(b64_json, "image/png"),
        "raw": body,
    }


async def _generate_flux_image(
    client: httpx.AsyncClient,
    final_prompt: str,
    negative_prompt: str,
    aspect_ratio: str,
    fal_key: str,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "prompt": final_prompt,
        "negative_prompt": negative_prompt or None,
        "aspect_ratio": aspect_ratio,
        "num_images": 1,
        "output_format": "jpeg",
        "safety_tolerance": 2,
    }

    resp = await _post_json_with_retry(
        client=client,
        url=f"https://fal.run/{FAL_MODEL_PATH}",
        headers=headers,
        json_payload=payload,
        retries=3,
    )

    body = resp.json()
    images = body.get("images", [])
    if not images or not images[0].get("url"):
        raise ValueError(f"FLUX não retornou URL válida: {body}")

    return {
        "engine_id": "flux",
        "motor": "FLUX 1.1 Pro Ultra",
        "url": images[0]["url"],
        "raw": body,
    }


def _extract_gemini_inline_image(response_json: Dict[str, Any]) -> Optional[str]:
    candidates = response_json.get("candidates", [])
    for candidate in candidates:
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        for part in parts:
            inline_data = part.get("inlineData") or part.get("inline_data")
            if inline_data and inline_data.get("data"):
                mime = inline_data.get("mimeType") or inline_data.get("mime_type") or "image/png"
                return _data_uri_from_b64(inline_data["data"], mime)
    return None


async def _generate_google_native_image(
    client: httpx.AsyncClient,
    final_prompt: str,
    aspect_ratio: str,
    gemini_key: str,
    model_name: str,
) -> Dict[str, Any]:
    headers = {
        "x-goog-api-key": gemini_key,
        "Content-Type": "application/json",
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"

    payload = {
        "contents": [{"role": "user", "parts": [{"text": final_prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": "2K",
            },
        },
    }

    resp = await _post_json_with_retry(client, url, headers, payload, retries=3)
    body = resp.json()
    data_uri = _extract_gemini_inline_image(body)
    if not data_uri:
        raise ValueError(f"{model_name} não retornou inline image válida: {body}")

    pretty_name = "Google Nano Banana Pro" if model_name == GEMINI_NATIVE_PRO_MODEL else "Google Nano Banana 2"

    return {
        "engine_id": "google",
        "motor": pretty_name,
        "google_model": model_name,
        "url": data_uri,
        "raw": body,
    }


async def _generate_google_imagen_image(
    client: httpx.AsyncClient,
    final_prompt: str,
    aspect_ratio: str,
    gemini_key: str,
) -> Dict[str, Any]:
    headers = {
        "x-goog-api-key": gemini_key,
        "Content-Type": "application/json",
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GOOGLE_IMAGEN_MODEL}:predict"

    payload = {
        "instances": [{"prompt": final_prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": aspect_ratio,
            "imageSize": "2K",
            "personGeneration": "allow_adult",
        },
    }

    resp = await _post_json_with_retry(client, url, headers, payload, retries=3)
    body = resp.json()

    predictions = body.get("predictions", [])
    if not predictions:
        raise ValueError(f"Google Imagen sem predictions: {body}")

    pred = predictions[0]
    base64_img = pred.get("bytesBase64Encoded")
    if not base64_img:
        raise ValueError(f"Google Imagen sem bytesBase64Encoded: {body}")

    return {
        "engine_id": "google",
        "motor": "Google Imagen 4 Ultra",
        "google_model": GOOGLE_IMAGEN_MODEL,
        "url": _data_uri_from_b64(base64_img, "image/png"),
        "raw": body,
    }


async def _generate_google_best_available(
    client: httpx.AsyncClient,
    final_prompt: str,
    aspect_ratio: str,
    gemini_key: str,
) -> Dict[str, Any]:
    errors = []

    try:
        return await _generate_google_native_image(
            client,
            final_prompt,
            aspect_ratio,
            gemini_key,
            GEMINI_NATIVE_PRO_MODEL,
        )
    except Exception as e:
        errors.append(f"{GEMINI_NATIVE_PRO_MODEL}: {str(e)}")

    try:
        return await _generate_google_native_image(
            client,
            final_prompt,
            aspect_ratio,
            gemini_key,
            GEMINI_NATIVE_FAST_MODEL,
        )
    except Exception as e:
        errors.append(f"{GEMINI_NATIVE_FAST_MODEL}: {str(e)}")

    try:
        return await _generate_google_imagen_image(
            client,
            final_prompt,
            aspect_ratio,
            gemini_key,
        )
    except Exception as e:
        errors.append(f"{GOOGLE_IMAGEN_MODEL}: {str(e)}")

    raise ValueError(" | ".join(errors))



async def _improve_edit_prompt_with_openai(
    client: httpx.AsyncClient,
    payload: ImageEditRequest,
    aspect_ratio: str,
    openai_key: str,
) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    instrucoes_edicao = _sanitize_copy(payload.instrucoes_edicao, 2600)

    system_text = """
Você é um diretor de arte sênior de pós-produção e engenheiro de prompts para edição de imagens com referência.

Sua função é escrever um prompt de edição extremamente preciso para uma imagem já existente.
A prioridade não é reinventar a peça. A prioridade é preservar o original e modificar somente o que foi pedido.

Retorne SOMENTE JSON válido com esta estrutura exata:
{
  "prompt_final": string,
  "negative_prompt": string,
  "creative_direction": string,
  "layout_notes": string,
  "preservation_rules": string,
  "edit_strategy": string,
  "micro_detail_rules": string,
  "consistency_rules": string
}

Regras obrigatórias:
1. Escreva TUDO em português do Brasil.
2. Trate a imagem enviada como base dominante e autoritativa.
3. Preservar tudo o que não foi explicitamente pedido para mudar.
4. A edição deve ser local e precisa, evitando reconstrução total da peça.
5. Se houver logos, selos, ícones, marcas, tipografias pequenas, estampas, embalagens, assinaturas visuais ou detalhes delicados, priorize preservar exatamente o que já existe em vez de redesenhar, reinterpretar ou recriar.
6. Não substituir logos pequenos por versões novas, aproximadas ou genéricas.
7. Não inventar elementos de branding, não redesenhar marcas e não trocar símbolos existentes por versões parecidas.
8. Se algum detalhe pequeno não precisar mudar, ele deve permanecer visualmente consistente com a referência original.
9. O negative_prompt deve bloquear: recriação completa da cena, redesenho de logos, troca de marca, texto aleatório, texto em inglês, duplicações, deformações, mudanças arbitrárias no produto, mudanças desnecessárias no enquadramento, alterações indevidas de cor da marca, remoção de detalhes importantes, blur, baixa nitidez e aparência genérica de IA.
10. preservation_rules deve reforçar a preservação de identidade visual, branding, embalagem, produto, personagem, enquadramento, perspectiva, materiais e microdetalhes sempre que isso não conflitar com o pedido.
11. edit_strategy deve descrever edição pontual, incremental e controlada, nunca recriação ampla sem necessidade.
12. micro_detail_rules deve explicar como proteger logos, textos pequenos, selos, ícones, botões, acabamentos, costuras, rótulos e elementos gráficos finos.
13. consistency_rules deve explicar como manter coerência entre fundo, foco principal, sombras, reflexos, perspectiva e proporções.
14. O resultado precisa ser mais técnico, mais restritivo e mais útil para edição real do que um prompt comum.
"""

    user_text = (
        f"Briefing estruturado para edição:\n{_build_user_edit_brief(payload)}\n\n"
        f"Aspect ratio de saída: {aspect_ratio}\n\n"
        f"Instruções do usuário: {instrucoes_edicao or 'não informadas'}\n\n"
        "Quero um refinamento com foco em edição fiel, intervenção precisa, preservação de branding e proteção máxima de logos pequenos e detalhes sensíveis."
    )

    payload_json = {
        "model": OPENAI_CHAT_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.1,
    }

    resp = await _post_json_with_retry(
        client=client,
        url="https://api.openai.com/v1/chat/completions",
        headers=headers,
        json_payload=payload_json,
        retries=3,
    )

    content = resp.json()["choices"][0]["message"]["content"]
    data = _parse_json_safe(content)

    return {
        "prompt_final": _clamp_text(data.get("prompt_final", "")),
        "negative_prompt": _clamp_text(data.get("negative_prompt", "")),
        "creative_direction": _clamp_text(data.get("creative_direction", "edição precisa com preservação máxima da base original")),
        "layout_notes": _clamp_text(data.get("layout_notes", "preservar enquadramento e composição geral, mudando somente o que foi solicitado")),
        "preservation_rules": _clamp_text(data.get("preservation_rules", "preservar identidade visual, branding, embalagem, detalhes finos, logos e materiais originais sempre que não houver pedido explícito de alteração")),
        "edit_strategy": _clamp_text(data.get("edit_strategy", "aplicar edição localizada, incremental e controlada, sem recriar a peça inteira")),
        "micro_detail_rules": _clamp_text(data.get("micro_detail_rules", "não redesenhar logos pequenos, selos, ícones, rótulos ou detalhes gráficos finos; reaproveitar visualmente o que já existe na referência sempre que possível")),
        "consistency_rules": _clamp_text(data.get("consistency_rules", "manter coerência de perspectiva, escala, luz, sombras, reflexos, nitidez e cor entre os elementos preservados e os editados")),
    }

def _build_final_edit_prompt(
    payload: ImageEditRequest,
    aspect_ratio: str,
    improved: Dict[str, str],
) -> str:
    instructions = _sanitize_copy(payload.instrucoes_edicao, 3400)

    final_prompt = f"""
{improved['prompt_final']}

Esta tarefa é uma EDIÇÃO de imagem baseada em referência.
Use a imagem enviada como base principal e dominante da composição.
Preserve tudo o que não foi explicitamente pedido para mudar.
Não recriar a peça inteira.
Não reinterpretar a marca.
Não redesenhar detalhes pequenos sem necessidade.

Objetivo principal:
- editar a imagem com precisão
- preservar o máximo possível do original
- alterar apenas os pontos necessários para cumprir o briefing
- manter acabamento premium e coerência visual
- evitar qualquer reconstrução desnecessária de logos, marcas, selos, ícones, embalagens e detalhes sensíveis

Contexto estruturado da edição:
- formato selecionado: {payload.formato}
- proporção final: {aspect_ratio}
- nível de qualidade solicitado: {_quality_label(_normalize_quality(payload.qualidade))}
- instruções de edição: {instructions or 'seguir a imagem de referência e editar somente o necessário'}
- tamanho final desejado: seguir o formato selecionado sem lógica extra de crop, expansão ou recomposição automática

Direção criativa:
{improved['creative_direction']}

Notas de layout:
{improved['layout_notes']}

Regras de preservação:
{improved['preservation_rules']}

Estratégia de edição:
{improved['edit_strategy']}

Proteção de microdetalhes:
{improved['micro_detail_rules']}

Regras de consistência:
{improved['consistency_rules']}

Regras técnicas obrigatórias:
- tratar a imagem enviada como referência dominante
- modificar somente o que foi solicitado nas instruções
- manter enquadramento, perspectiva e proporção sempre que possível
- preservar identidade visual, produto, embalagem, materiais e estrutura original
- preservar exatamente logos, marcas, selos, ícones, assinaturas visuais e detalhes pequenos que não precisem ser alterados
- não substituir logos pequenos por versões novas, aproximadas, borradas ou genéricas
- não inventar branding novo
- não simplificar elementos pequenos importantes
- não apagar detalhes finos relevantes
- se houver intervenção próxima a uma logo ou detalhe delicado, manter forma, posição relativa, nitidez e leitura consistentes com a referência
- manter sombras, reflexos, contraste, textura e iluminação coerentes com a base original
- evitar deformações, duplicações, desalinhamentos, artefatos e aparência genérica de IA
- o resultado deve parecer a mesma peça refinada, e não outra peça recriada do zero

Restrições fortes:
- não recriar a cena inteira sem necessidade
- não redesenhar ou trocar logos
- não trocar marca, símbolo, selo ou rótulo existente por algo parecido
- não mudar cores de branding sem pedido explícito
- não adicionar texto aleatório
- não inserir texto em inglês
- não poluir o layout
"""
    return _clamp_text(final_prompt, 7000)


def _build_localized_prompt_appendix(
    localized_analysis: Optional[Dict[str, Any]],
    instruction_info: Optional[Dict[str, Any]] = None,
) -> str:
    if not localized_analysis:
        return ""

    lines = []
    target = localized_analysis.get("target_text") or ""
    replacement = localized_analysis.get("replacement_text") or ""
    operation = (localized_analysis.get("operation") or "text_replace").lower()
    confidence = float(localized_analysis.get("confidence", 0.0) or 0.0)
    bbox = localized_analysis.get("bbox")
    text_bbox = localized_analysis.get("text_bbox")
    container_bbox = localized_analysis.get("container_bbox")

    lines.append("\n\n--- INSTRUÇÃO LOCALIZADA DE EDIÇÃO ---")

    if target:
        if operation == "append_right" and replacement:
            lines.append(f'Mantenha o texto âncora "{target}" intacto e adicione exatamente "{replacement}" imediatamente à direita dele.')
        elif operation == "append_left" and replacement:
            lines.append(f'Mantenha o texto âncora "{target}" intacto e adicione exatamente "{replacement}" imediatamente à esquerda dele.')
        elif operation == "text_remove":
            lines.append(f'Remova apenas o texto "{target}" sem criar texto substituto. Reconstrua somente o fundo imediato da região editada.')
        elif replacement:
            lines.append(f'Substitua o texto "{target}" por "{replacement}".')

    if operation == "button_text_replace":
        lines.append("Este texto está dentro de um botão, badge ou chip. Preserve a forma, cor e bordas do elemento container.")

    region = text_bbox or bbox or container_bbox
    if region:
        x = region.get("x", 0)
        y = region.get("y", 0)
        w = region.get("w", 0)
        h = region.get("h", 0)
        lines.append(
            f"Região alvo (coordenadas normalizadas): x={x:.4f}, y={y:.4f}, largura={w:.4f}, altura={h:.4f}. "
            "Edite somente essa região. Preserve absolutamente tudo o que está fora dela."
        )

    if container_bbox and operation == "button_text_replace":
        cx = container_bbox.get("x", 0)
        cy = container_bbox.get("y", 0)
        cw = container_bbox.get("w", 0)
        ch = container_bbox.get("h", 0)
        lines.append(
            f"Container do botão (coordenadas normalizadas): x={cx:.4f}, y={cy:.4f}, largura={cw:.4f}, altura={ch:.4f}. "
            "Recrie o botão com o novo texto mantendo exatamente a mesma aparência visual."
        )

    style = localized_analysis.get("style") or {}
    style_notes = []
    if style.get("text_color"):
        style_notes.append(f"cor do texto: {style['text_color']}")
    if style.get("background_color"):
        style_notes.append(f"cor de fundo: {style['background_color']}")
    if style.get("font_weight"):
        style_notes.append(f"peso da fonte: {style['font_weight']}")
    if style.get("font_family_hint"):
        style_notes.append(f"família visual aproximada: {style['font_family_hint']}")
    if style.get("preferred_font_size"):
        style_notes.append(f"tamanho aparente aproximado: {style['preferred_font_size']}")
    if style.get("alignment"):
        style_notes.append(f"alinhamento: {style['alignment']}")
    if style.get("shadow"):
        style_notes.append("com sombra")
    if style.get("glow"):
        style_notes.append("com brilho/glow")
    if style_notes:
        lines.append("Estilo visual a manter: " + ", ".join(style_notes) + ".")

    if operation in {"append_right", "append_left"}:
        lines.append("A tipografia deve parecer continuação direta do texto âncora: mesma cor percebida, mesmo peso, mesma altura aparente e mesma baseline.")
        lines.append("Não reescreva o texto âncora. Não altere nenhum outro texto da linha. Não troque acentos, espaços ou capitalização.")

    if confidence >= 0.75:
        lines.append("Nível de confiança na localização: alto. Aplique a edição com precisão cirúrgica.")
    elif confidence >= 0.55:
        lines.append("Nível de confiança na localização: médio. Aplique a edição com cuidado redobrado na preservação do entorno.")
    else:
        lines.append("Nível de confiança na localização: baixo. Seja conservador — edite apenas o mínimo necessário e preserve tudo ao redor.")

    lines.append("--- FIM DA INSTRUÇÃO LOCALIZADA ---")
    return "\n".join(lines)



def _clamp_int(value: int, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def _norm_box_to_px_engine(
    box: Optional[Dict[str, Any]],
    width: int,
    height: int,
) -> Optional[Tuple[int, int, int, int]]:
    if not box:
        return None
    try:
        x = float(box.get("x", 0.0) or 0.0)
        y = float(box.get("y", 0.0) or 0.0)
        w = float(box.get("w", 0.0) or 0.0)
        h = float(box.get("h", 0.0) or 0.0)
    except Exception:
        return None

    x1 = _clamp_int(round(x * width), 0, width)
    y1 = _clamp_int(round(y * height), 0, height)
    x2 = _clamp_int(round((x + w) * width), 0, width)
    y2 = _clamp_int(round((y + h) * height), 0, height)
    if x2 <= x1 or y2 <= y1:
        return None
    return (x1, y1, x2, y2)


def _build_append_sprite_prompt(
    analysis: Dict[str, Any],
    operation: str,
) -> str:
    target = (analysis.get("target_text") or "").strip()
    replacement = (analysis.get("replacement_text") or "").strip()
    style = analysis.get("style") or {}

    side_text = "à direita" if operation == "append_right" else "à esquerda"
    style_notes: List[str] = []
    if style.get("text_color"):
        style_notes.append(f"cor percebida do texto: {style.get('text_color')}")
    if style.get("font_weight"):
        style_notes.append(f"peso percebido: {style.get('font_weight')}")
    if style.get("font_family_hint"):
        style_notes.append(f"família aproximada: {style.get('font_family_hint')}")
    if style.get("glow"):
        style_notes.append("preserve o glow/brilho do lettering")
    if style.get("shadow"):
        style_notes.append("preserve a sombra do lettering")

    style_line = ""
    if style_notes:
        style_line = " Referência de estilo: " + "; ".join(style_notes) + "."

    return (
        "Você recebeu um recorte de uma arte já pronta. "
        "O texto âncora existente neste recorte é autoritativo e deve continuar exatamente como está. "
        f"Adicione APENAS o novo trecho de texto imediatamente {side_text} do texto âncora, sem alterar o restante da linha, sem trocar a cor, sem trocar o peso, sem trocar o brilho, sem trocar a tipografia percebida e sem mover os elementos existentes. "
        f'Texto âncora que deve permanecer intacto: "{target}". '
        f'Texto novo a ser inserido exatamente como escrito, preservando maiúsculas, minúsculas, acentos e espaços: "{replacement}". '
        "Mantenha a mesma baseline, o mesmo tamanho aparente, o mesmo espaçamento visual e o mesmo acabamento do texto âncora. "
        "Não reescreva o texto âncora. Não traduza. Não corrija automaticamente. Não simplifique acentos. "
        "Edite somente a área mascarada. Preserve absolutamente todos os demais pixels do recorte."
        + style_line
    )


def _build_append_crop_plan(
    image_bytes: bytes,
    analysis: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    operation = (analysis.get("operation") or "").lower()
    if operation not in {"append_right", "append_left"}:
        return None

    with Image.open(io.BytesIO(image_bytes)) as im:
        image = im.convert("RGBA")
        width, height = image.size

    anchor = _norm_box_to_px_engine(
        analysis.get("text_bbox") or analysis.get("bbox") or analysis.get("container_bbox"),
        width,
        height,
    )
    if not anchor:
        return None

    target_text = (analysis.get("target_text") or "").strip()
    replacement_text = (analysis.get("replacement_text") or "").strip()
    style = analysis.get("style") or {}

    anchor_w = max(1, anchor[2] - anchor[0])
    anchor_h = max(1, anchor[3] - anchor[1])
    gap = max(4, int(round(float(style.get("append_gap") or max(6.0, anchor_h * 0.16)))))
    overlap = max(2, int(round(anchor_h * 0.06)))
    vertical_pad = max(14, int(round(anchor_h * 0.90)))
    left_context = max(28, int(round(anchor_w * 0.42)))
    right_context = max(28, int(round(anchor_w * 0.42)))
    target_len = max(1, len(target_text))
    replacement_len = max(1, len(replacement_text))
    ratio = replacement_len / float(target_len)
    expected_new_w = max(72, int(round(anchor_w * min(2.8, max(0.85, ratio + 0.28)))))

    if operation == "append_right":
        crop_x1 = max(0, anchor[0] - left_context)
        crop_x2 = min(width, anchor[2] + gap + expected_new_w + right_context)
    else:
        crop_x1 = max(0, anchor[0] - gap - expected_new_w - left_context)
        crop_x2 = min(width, anchor[2] + right_context)

    crop_y1 = max(0, anchor[1] - vertical_pad)
    crop_y2 = min(height, anchor[3] + vertical_pad)

    if crop_x2 - crop_x1 < max(120, anchor_w + expected_new_w // 2):
        return None
    if crop_y2 - crop_y1 < max(28, anchor_h + 12):
        return None

    crop_rect = (crop_x1, crop_y1, crop_x2, crop_y2)
    crop_w = crop_x2 - crop_x1
    crop_h = crop_y2 - crop_y1
    anchor_local = (
        anchor[0] - crop_x1,
        anchor[1] - crop_y1,
        anchor[2] - crop_x1,
        anchor[3] - crop_y1,
    )
    edit_y1 = max(0, anchor_local[1] - max(6, int(round(anchor_h * 0.14))))
    edit_y2 = min(crop_h, anchor_local[3] + max(6, int(round(anchor_h * 0.14))))

    if operation == "append_right":
        edit_x1 = max(0, anchor_local[2] - overlap)
        edit_x2 = min(crop_w, anchor_local[2] + gap + expected_new_w + 16)
    else:
        edit_x1 = max(0, anchor_local[0] - gap - expected_new_w - 16)
        edit_x2 = min(crop_w, anchor_local[0] + overlap)

    if edit_x2 <= edit_x1 + 10:
        return None

    return {
        "crop_rect": crop_rect,
        "crop_size": (crop_w, crop_h),
        "anchor_local_rect": anchor_local,
        "editable_local_rect": (edit_x1, edit_y1, edit_x2, edit_y2),
        "operation": operation,
    }


def _map_rect_to_placement(
    rect: Tuple[int, int, int, int],
    placement: Tuple[int, int, int, int],
    source_width: int,
    source_height: int,
) -> Tuple[int, int, int, int]:
    px1, py1, px2, py2 = placement
    fitted_w = max(1, px2 - px1)
    fitted_h = max(1, py2 - py1)
    scale_x = fitted_w / max(1, source_width)
    scale_y = fitted_h / max(1, source_height)
    return (
        px1 + int(round(rect[0] * scale_x)),
        py1 + int(round(rect[1] * scale_y)),
        px1 + int(round(rect[2] * scale_x)),
        py1 + int(round(rect[3] * scale_y)),
    )


def _build_crop_canvas_for_append_edit(
    crop_bytes: bytes,
    editable_local_rect: Tuple[int, int, int, int],
) -> Tuple[bytes, bytes, Dict[str, Any]]:
    with Image.open(io.BytesIO(crop_bytes)) as im:
        crop = im.convert("RGBA")
        crop_w, crop_h = crop.size
        canvas_w, canvas_h = _choose_best_supported_base_size(crop_w, crop_h)
        fitted, placement = _resize_to_contain(crop, canvas_w, canvas_h)

        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.alpha_composite(fitted, (placement[0], placement[1]))

        mapped_edit_rect = _map_rect_to_placement(editable_local_rect, placement, crop_w, crop_h)
        mask = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
        draw = ImageDraw.Draw(mask)
        radius = max(6, int(round((mapped_edit_rect[3] - mapped_edit_rect[1]) * 0.16)))
        draw.rounded_rectangle(mapped_edit_rect, radius=radius, fill=(0, 0, 0, 0))

        return (
            _encode_png_bytes(canvas),
            _encode_png_bytes(mask),
            {
                "placement": {
                    "x1": placement[0],
                    "y1": placement[1],
                    "x2": placement[2],
                    "y2": placement[3],
                },
                "source_width": crop_w,
                "source_height": crop_h,
                "canvas_width": canvas_w,
                "canvas_height": canvas_h,
                "mapped_edit_rect": {
                    "x1": mapped_edit_rect[0],
                    "y1": mapped_edit_rect[1],
                    "x2": mapped_edit_rect[2],
                    "y2": mapped_edit_rect[3],
                },
            },
        )


def _restore_crop_from_canvas_result(
    edited_canvas_bytes: bytes,
    meta: Dict[str, Any],
) -> bytes:
    with Image.open(io.BytesIO(edited_canvas_bytes)) as im:
        canvas = im.convert("RGBA")
        placement = meta["placement"]
        fitted_region = canvas.crop((placement["x1"], placement["y1"], placement["x2"], placement["y2"]))
        restored = fitted_region.resize((meta["source_width"], meta["source_height"]), Image.Resampling.LANCZOS)
        return _encode_png_bytes(restored)



def _inflate_rect_engine(
    rect: Tuple[int, int, int, int],
    pad_x: int,
    pad_y: int,
    width: int,
    height: int,
) -> Tuple[int, int, int, int]:
    return (
        _clamp_int(rect[0] - pad_x, 0, width),
        _clamp_int(rect[1] - pad_y, 0, height),
        _clamp_int(rect[2] + pad_x, 0, width),
        _clamp_int(rect[3] + pad_y, 0, height),
    )


def _rect_iou(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(1, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / float(area_a + area_b - inter)


def _same_text_row(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> bool:
    ah = max(1, a[3] - a[1])
    bh = max(1, b[3] - b[1])
    vertical_overlap = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    center_dy = abs(((a[1] + a[3]) / 2.0) - ((b[1] + b[3]) / 2.0))
    min_h = min(ah, bh)
    return vertical_overlap >= max(4, min_h * 0.46) and center_dy <= max(10.0, min_h * 0.72)


def _build_feathered_rect_mask(
    size: Tuple[int, int],
    rect: Tuple[int, int, int, int],
    feather: int = 0,
    radius: int = 0,
    fill: int = 255,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    if radius > 0:
        draw.rounded_rectangle(rect, radius=radius, fill=fill)
    else:
        draw.rectangle(rect, fill=fill)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))
    return mask


def _match_overlay_tone_to_original(
    original: Image.Image,
    edited: Image.Image,
    editable_local_rect: Tuple[int, int, int, int],
) -> Image.Image:
    try:
        width, height = original.size
        ring_outer = _inflate_rect_engine(
            editable_local_rect,
            pad_x=max(10, int((editable_local_rect[2] - editable_local_rect[0]) * 0.10)),
            pad_y=max(8, int((editable_local_rect[3] - editable_local_rect[1]) * 0.40)),
            width=width,
            height=height,
        )
        ring_mask = _build_feathered_rect_mask(original.size, ring_outer, feather=0, radius=max(6, int((ring_outer[3] - ring_outer[1]) * 0.12)))
        hole_mask = _build_feathered_rect_mask(original.size, editable_local_rect, feather=0, radius=max(4, int((editable_local_rect[3] - editable_local_rect[1]) * 0.12)))
        ring_mask = ImageChops.subtract(ring_mask, hole_mask)
        ring_arr = np.array(ring_mask, dtype=np.uint8)
        selector = ring_arr > 12
        if int(selector.sum()) < 48:
            return edited

        orig_arr = np.array(original.convert("RGBA"), dtype=np.float32)
        edit_arr = np.array(edited.convert("RGBA"), dtype=np.float32)

        orig_mean = orig_arr[selector, :3].mean(axis=0)
        edit_mean = edit_arr[selector, :3].mean(axis=0)
        delta = np.clip(orig_mean - edit_mean, -22.0, 22.0)

        apply_mask = np.array(_build_feathered_rect_mask(original.size, editable_local_rect, feather=max(3, int((editable_local_rect[3] - editable_local_rect[1]) * 0.10)), radius=max(4, int((editable_local_rect[3] - editable_local_rect[1]) * 0.12))), dtype=np.float32) / 255.0
        for channel in range(3):
            edit_arr[:, :, channel] = np.clip(edit_arr[:, :, channel] + (delta[channel] * apply_mask), 0.0, 255.0)

        matched = Image.fromarray(edit_arr.astype(np.uint8), "RGBA")
        return matched
    except Exception:
        return edited


def _build_allowed_mask(
    size: Tuple[int, int],
    rect: Tuple[int, int, int, int],
) -> Image.Image:
    feather = max(3, int((rect[3] - rect[1]) * 0.08))
    radius = max(4, int((rect[3] - rect[1]) * 0.14))
    return _build_feathered_rect_mask(size, rect, feather=feather, radius=radius)


def _erase_rects_from_mask(mask: Image.Image, rects: List[Tuple[int, int, int, int]]) -> Image.Image:
    trimmed = mask.copy()
    if not rects:
        return trimmed
    erase = Image.new("L", mask.size, 0)
    draw = ImageDraw.Draw(erase)
    for rect in rects:
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue
        radius = max(4, int((rect[3] - rect[1]) * 0.18))
        draw.rounded_rectangle(rect, radius=radius, fill=255)
    erase = erase.filter(ImageFilter.GaussianBlur(radius=2.4))
    return ImageChops.subtract(trimmed, erase)





def _mask_to_uint8(mask: Image.Image) -> np.ndarray:
    return np.array(mask.convert("L"), dtype=np.uint8)


def _mean_abs_rgb_diff_on_mask(
    a: Image.Image,
    b: Image.Image,
    mask: Image.Image,
    threshold: int = 12,
) -> float:
    selector = _mask_to_uint8(mask) > threshold
    if not bool(selector.any()):
        return 0.0
    arr_a = np.array(a.convert("RGB"), dtype=np.int16)
    arr_b = np.array(b.convert("RGB"), dtype=np.int16)
    diff = np.abs(arr_a - arr_b)
    return float(diff[selector].mean()) if diff[selector].size else 0.0


def _mask_bbox(mask: Image.Image, threshold: int = 12) -> Optional[Tuple[int, int, int, int]]:
    arr = _mask_to_uint8(mask)
    ys, xs = np.where(arr > threshold)
    if xs.size == 0 or ys.size == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def _focus_mask_coverage(mask: Image.Image, rect: Tuple[int, int, int, int], threshold: int = 12) -> float:
    x1, y1, x2, y2 = rect
    arr = _mask_to_uint8(mask)
    crop = arr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0
    return float((crop > threshold).sum()) / float(max(1, crop.size))


def _build_remove_text_focus_mask(
    original: Image.Image,
    target_local_rect: Tuple[int, int, int, int],
    editable_local_rect: Tuple[int, int, int, int],
    protected_local_rects: Optional[List[Tuple[int, int, int, int]]] = None,
) -> Optional[Image.Image]:
    width, height = original.size
    tw = max(1, target_local_rect[2] - target_local_rect[0])
    th = max(1, target_local_rect[3] - target_local_rect[1])

    clip_rect = _inflate_rect_engine(
        target_local_rect,
        pad_x=max(3, int(round(tw * 0.08))),
        pad_y=max(2, int(round(th * 0.18))),
        width=width,
        height=height,
    )
    ring_outer = _inflate_rect_engine(
        target_local_rect,
        pad_x=max(12, int(round(tw * 0.20))),
        pad_y=max(8, int(round(th * 0.70))),
        width=width,
        height=height,
    )
    ring_inner = _inflate_rect_engine(
        target_local_rect,
        pad_x=max(1, int(round(tw * 0.02))),
        pad_y=max(1, int(round(th * 0.06))),
        width=width,
        height=height,
    )

    ring_mask = _build_feathered_rect_mask(original.size, ring_outer, feather=0, radius=max(4, int(th * 0.10)))
    ring_hole = _build_feathered_rect_mask(original.size, ring_inner, feather=0, radius=max(2, int(th * 0.06)))
    ring_mask = ImageChops.subtract(ring_mask, ring_hole)

    clip_mask = _build_feathered_rect_mask(original.size, clip_rect, feather=0, radius=max(2, int(th * 0.08)))
    allowed = _build_allowed_mask(original.size, editable_local_rect)
    if protected_local_rects:
        allowed = _erase_rects_from_mask(allowed, protected_local_rects)
        ring_mask = _erase_rects_from_mask(ring_mask, protected_local_rects)
        clip_mask = _erase_rects_from_mask(clip_mask, protected_local_rects)

    ring_selector = _mask_to_uint8(ring_mask) > 10
    clip_selector = _mask_to_uint8(ImageChops.multiply(clip_mask, allowed)) > 10
    if int(ring_selector.sum()) < 48 or int(clip_selector.sum()) < 32:
        return None

    rgb = np.array(original.convert("RGB"), dtype=np.float32)
    gray = np.array(original.convert("L"), dtype=np.float32)

    bg_rgb = rgb[ring_selector].mean(axis=0)
    bg_l = float(gray[ring_selector].mean())

    color_dist = np.linalg.norm(rgb - bg_rgb[None, None, :], axis=2)
    lum_delta = np.abs(gray - bg_l)

    local_color = color_dist[clip_selector]
    local_lum = lum_delta[clip_selector]
    if local_color.size == 0 or local_lum.size == 0:
        return None

    color_threshold = max(12.0, float(np.percentile(local_color, 74)) * 0.72)
    lum_threshold = max(10.0, float(np.percentile(local_lum, 74)) * 0.72)

    bright_selector = gray >= (bg_l + 8.0)
    dark_selector = gray <= (bg_l - 8.0)

    candidate = clip_selector & ((color_dist >= color_threshold) | (lum_delta >= lum_threshold))

    bright_votes = int((candidate & bright_selector).sum())
    dark_votes = int((candidate & dark_selector).sum())
    if bright_votes > max(24, int(dark_votes * 1.12)):
        candidate &= (gray >= (bg_l - 4.0))
    elif dark_votes > max(24, int(bright_votes * 1.12)):
        candidate &= (gray <= (bg_l + 4.0))

    mask_arr = np.zeros((height, width), dtype=np.uint8)
    mask_arr[candidate] = 255

    if cv2 is not None:
        kernel = np.ones((3, 3), dtype=np.uint8)
        mask_arr = cv2.morphologyEx(mask_arr, cv2.MORPH_OPEN, kernel, iterations=1)
        mask_arr = cv2.morphologyEx(mask_arr, cv2.MORPH_CLOSE, kernel, iterations=1)
        mask_arr = cv2.dilate(mask_arr, kernel, iterations=1)
    else:
        pil_mask = Image.fromarray(mask_arr, mode="L")
        pil_mask = pil_mask.filter(ImageFilter.MaxFilter(3))
        pil_mask = pil_mask.filter(ImageFilter.MinFilter(3))
        mask_arr = np.array(pil_mask, dtype=np.uint8)

    focus_mask = Image.fromarray(mask_arr, mode="L")
    focus_mask = ImageChops.multiply(focus_mask, allowed)

    bbox = _mask_bbox(focus_mask)
    if not bbox:
        return None

    coverage = _focus_mask_coverage(focus_mask, editable_local_rect)
    if coverage < 0.006 or coverage > 0.42:
        return None

    bx1, by1, bx2, by2 = bbox
    bw = max(1, bx2 - bx1)
    bh = max(1, by2 - by1)
    if bw > max(12, int(tw * 1.45)) or bh > max(10, int(th * 1.75)):
        return None

    return focus_mask


def _inpaint_remove_focus_mask(
    original: Image.Image,
    focus_mask: Image.Image,
) -> Image.Image:
    if cv2 is None:
        softened = original.filter(ImageFilter.GaussianBlur(radius=2.2))
        result = original.copy()
        result.paste(softened, mask=focus_mask)
        return result

    rgba = np.array(original.convert("RGBA"), dtype=np.uint8)
    rgb = cv2.cvtColor(rgba, cv2.COLOR_RGBA2RGB)
    alpha = rgba[:, :, 3]
    mask = _mask_to_uint8(focus_mask)
    if mask.max() <= 0:
        return original.copy()
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=0.6, sigmaY=0.6)
    _, mask = cv2.threshold(mask, 14, 255, cv2.THRESH_BINARY)
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    inpainted_rgb = cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA)
    merged = np.dstack([inpainted_rgb, alpha])
    return Image.fromarray(merged, mode="RGBA")


def _score_remove_candidate(
    original: Image.Image,
    candidate: Image.Image,
    focus_mask: Image.Image,
    editable_local_rect: Tuple[int, int, int, int],
    protected_local_rects: Optional[List[Tuple[int, int, int, int]]] = None,
) -> Dict[str, float]:
    width, height = original.size
    allowed = _build_allowed_mask(original.size, editable_local_rect)
    if protected_local_rects:
        allowed = _erase_rects_from_mask(allowed, protected_local_rects)

    focus_soft = focus_mask.convert("L").filter(ImageFilter.MaxFilter(3))
    focus_soft = focus_soft.filter(ImageFilter.GaussianBlur(radius=0.8))
    allowed_without_focus = ImageChops.subtract(allowed, focus_soft)

    outer_ring_rect = _inflate_rect_engine(
        editable_local_rect,
        pad_x=max(10, int(round((editable_local_rect[2] - editable_local_rect[0]) * 0.14))),
        pad_y=max(8, int(round((editable_local_rect[3] - editable_local_rect[1]) * 0.62))),
        width=width,
        height=height,
    )
    outer_mask = _build_feathered_rect_mask(original.size, outer_ring_rect, feather=0, radius=max(4, int((outer_ring_rect[3] - outer_ring_rect[1]) * 0.12)))
    ring_mask = ImageChops.subtract(outer_mask, allowed)
    if protected_local_rects:
        ring_mask = _erase_rects_from_mask(ring_mask, protected_local_rects)

    inside_change = _mean_abs_rgb_diff_on_mask(original, candidate, focus_soft)
    outside_change = _mean_abs_rgb_diff_on_mask(original, candidate, allowed_without_focus)
    ring_change = _mean_abs_rgb_diff_on_mask(original, candidate, ring_mask)

    penalty = 0.0
    if inside_change < 8.0:
        penalty += (8.0 - inside_change) * 1.9

    score = (outside_change * 1.85) + (ring_change * 1.15) + penalty
    return {
        "score": round(float(score), 4),
        "inside_change": round(float(inside_change), 4),
        "outside_change": round(float(outside_change), 4),
        "ring_change": round(float(ring_change), 4),
    }


def _compose_remove_overlay_mask(
    original: Image.Image,
    edited: Image.Image,
    editable_local_rect: Tuple[int, int, int, int],
    protected_local_rects: Optional[List[Tuple[int, int, int, int]]] = None,
    focus_mask: Optional[Image.Image] = None,
) -> Image.Image:
    edited = _match_overlay_tone_to_original(original, edited, editable_local_rect)

    diff = ImageChops.difference(original, edited).convert("L")
    diff = diff.point(lambda p: 255 if p >= 11 else 0)

    allowed = _build_allowed_mask(original.size, editable_local_rect)
    if protected_local_rects:
        allowed = _erase_rects_from_mask(allowed, protected_local_rects)

    diff = ImageChops.multiply(diff, allowed)
    diff = diff.filter(ImageFilter.MaxFilter(3))
    diff = diff.filter(ImageFilter.GaussianBlur(radius=0.9))

    if focus_mask is not None:
        focus = focus_mask.convert("L")
        focus = ImageChops.multiply(focus, allowed)
        focus = focus.filter(ImageFilter.MaxFilter(5))
        focus = focus.filter(ImageFilter.GaussianBlur(radius=1.0))
        alpha = ImageChops.lighter(focus, ImageChops.multiply(diff, focus))
    else:
        alpha = diff

    clip_rect = _inflate_rect_engine(editable_local_rect, 3, 3, original.size[0], original.size[1])
    clip_mask = _build_feathered_rect_mask(
        original.size,
        clip_rect,
        feather=1,
        radius=max(4, int((clip_rect[3] - clip_rect[1]) * 0.10)),
    )
    alpha = ImageChops.multiply(alpha, clip_mask)
    alpha = alpha.point(lambda p: 0 if p < 9 else min(255, int(round(p * 1.08))))
    return alpha



def _extract_localized_overlay_from_crop(
    original_crop_bytes: bytes,
    edited_crop_bytes: bytes,
    editable_local_rect: Tuple[int, int, int, int],
    protected_local_rects: Optional[List[Tuple[int, int, int, int]]] = None,
    focus_mask: Optional[Image.Image] = None,
) -> Tuple[Optional[bytes], Optional[Dict[str, int]]]:
    with Image.open(io.BytesIO(original_crop_bytes)) as orig_im, Image.open(io.BytesIO(edited_crop_bytes)) as edited_im:
        original = orig_im.convert("RGBA")
        edited = edited_im.convert("RGBA")
        if original.size != edited.size:
            edited = edited.resize(original.size, Image.Resampling.LANCZOS)

        alpha = _compose_remove_overlay_mask(
            original=original,
            edited=edited,
            editable_local_rect=editable_local_rect,
            protected_local_rects=protected_local_rects,
            focus_mask=focus_mask,
        )
        bbox = _mask_bbox(alpha, threshold=9)
        if not bbox:
            return None, None

        edited = _match_overlay_tone_to_original(original, edited, editable_local_rect)
        patch = edited.copy()
        patch.putalpha(alpha)
        return _encode_png_bytes(patch), {
            "x1": int(bbox[0]),
            "y1": int(bbox[1]),
            "x2": int(bbox[2]),
            "y2": int(bbox[3]),
        }






def _extract_append_overlay_from_crop(
    original_crop_bytes: bytes,
    edited_crop_bytes: bytes,
    editable_local_rect: Tuple[int, int, int, int],
) -> Tuple[Optional[bytes], Optional[Dict[str, int]]]:
    """
    Extrai somente o overlay útil de uma edição de append por crop.
    Mantém o raciocínio do fluxo localizado: calcular diferença entre crop original
    e crop editado, limitar a composição à área editável e devolver um patch RGBA
    pronto para alpha_composite sobre o recorte original.
    """
    return _extract_localized_overlay_from_crop(
        original_crop_bytes=original_crop_bytes,
        edited_crop_bytes=edited_crop_bytes,
        editable_local_rect=editable_local_rect,
        protected_local_rects=None,
        focus_mask=None,
    )


def _composite_append_overlay_into_image(
    image_bytes: bytes,
    overlay_bytes: bytes,
    crop_rect: Tuple[int, int, int, int],
) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as base_im, Image.open(io.BytesIO(overlay_bytes)) as overlay_im:
        base = base_im.convert("RGBA")
        overlay = overlay_im.convert("RGBA")
        composite = base.copy()
        composite.alpha_composite(overlay, (crop_rect[0], crop_rect[1]))
        return _encode_png_bytes(composite)


async def _synthesize_append_text_with_ai_crop(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    analysis: Dict[str, Any],
    openai_key: str,
    openai_quality: str,
) -> Optional[Dict[str, Any]]:
    plan = _build_append_crop_plan(image_bytes, analysis)
    if not plan:
        return None

    with Image.open(io.BytesIO(image_bytes)) as im:
        full = im.convert("RGBA")
        crop = full.crop(plan["crop_rect"])
        crop_bytes = _encode_png_bytes(crop)

    canvas_bytes, mask_bytes, canvas_meta = _build_crop_canvas_for_append_edit(
        crop_bytes,
        plan["editable_local_rect"],
    )

    canvas_w = canvas_meta["canvas_width"]
    canvas_h = canvas_meta["canvas_height"]
    prompt = _build_append_sprite_prompt(analysis, plan["operation"])

    result = await _edit_openai_image(
        client=client,
        image_bytes=canvas_bytes,
        filename="localized-append-crop.png",
        content_type="image/png",
        final_prompt=prompt,
        aspect_ratio=_base_size_to_aspect_ratio(canvas_w, canvas_h),
        quality=openai_quality,
        openai_key=openai_key,
        openai_size=f"{canvas_w}x{canvas_h}",
        mask_bytes=mask_bytes,
        input_fidelity="high",
    )

    edited_canvas_bytes, _ = _image_bytes_from_result_url(result["url"])
    edited_crop_bytes = _restore_crop_from_canvas_result(edited_canvas_bytes, canvas_meta)
    overlay_bytes, overlay_bbox = _extract_append_overlay_from_crop(
        crop_bytes,
        edited_crop_bytes,
        plan["editable_local_rect"],
    )
    if not overlay_bytes or not overlay_bbox:
        return None

    composed_bytes = _composite_append_overlay_into_image(
        image_bytes,
        overlay_bytes,
        plan["crop_rect"],
    )

    next_result = dict(result)
    next_result["engine_id"] = "openai_append_crop_composite"
    next_result["motor"] = "OpenAI GPT Image 1.5 + Composição Local por Crop"
    next_result["url"] = _result_url_from_image_bytes(composed_bytes, "image/png")
    next_result["append_crop_plan"] = {
        "crop_rect": {
            "x1": plan["crop_rect"][0],
            "y1": plan["crop_rect"][1],
            "x2": plan["crop_rect"][2],
            "y2": plan["crop_rect"][3],
        },
        "editable_local_rect": {
            "x1": plan["editable_local_rect"][0],
            "y1": plan["editable_local_rect"][1],
            "x2": plan["editable_local_rect"][2],
            "y2": plan["editable_local_rect"][3],
        },
        "overlay_bbox": overlay_bbox,
    }
    return next_result



def _build_edit_attempt_plan(
    instruction_info: Dict[str, Any],
    localized_analysis: Optional[Dict[str, Any]],
    localized_mode: bool,
    edit_scope: str = "auto",
) -> Dict[str, Any]:
    operation = ((localized_analysis or {}).get("operation") or "").lower()
    confidence = float((localized_analysis or {}).get("confidence", 0.0) or 0.0)
    normalized_scope = _normalize_edit_scope(edit_scope)
    strict_local_text = _requires_strict_local_text_preservation(normalized_scope, instruction_info)
    candidate_recovered = bool((localized_analysis or {}).get("candidate_recovered"))

    append_crop_threshold = 0.74
    remove_crop_threshold = 0.76
    if candidate_recovered:
        append_crop_threshold = 0.66
        remove_crop_threshold = 0.64

    use_ai_append_crop = bool(
        instruction_info.get("is_pure_text_edit")
        and operation in {"append_right", "append_left"}
        and confidence >= append_crop_threshold
    )
    use_ai_remove_crop = bool(
        instruction_info.get("is_pure_text_edit")
        and operation == "text_remove"
        and confidence >= remove_crop_threshold
    )
    use_local_remove_first = should_use_local_text_erase(localized_analysis, instruction_info) and not use_ai_append_crop and not use_ai_remove_crop
    use_local_render_first = (
        should_use_local_text_render(localized_analysis, instruction_info)
        and not use_ai_append_crop
        and not use_ai_remove_crop
        and not use_local_remove_first
    )

    call_openai_edit = not use_local_render_first and not use_local_remove_first and not use_ai_append_crop and not use_ai_remove_crop
    if strict_local_text and not localized_mode:
        call_openai_edit = False

    if normalized_scope == "local_patch" and not localized_mode and not use_local_render_first and not use_local_remove_first and not use_ai_append_crop and not use_ai_remove_crop:
        call_openai_edit = False

    reason = (
        "append_text_ai_crop_composite"
        if use_ai_append_crop
        else (
            "text_remove_ai_crop_composite"
            if use_ai_remove_crop
            else (
                "text_remove_deterministic"
                if use_local_remove_first
                else (
                    "text_replace_deterministic"
                    if use_local_render_first
                    else ("masked_openai_edit" if localized_mode else ("blocked_strict_local" if strict_local_text else "full_openai_edit"))
                )
            )
        )
    )
    return {
        "use_ai_append_crop": use_ai_append_crop,
        "use_ai_remove_crop": use_ai_remove_crop,
        "use_local_remove_first": use_local_remove_first,
        "use_local_render_first": use_local_render_first,
        "call_openai_edit": call_openai_edit,
        "reason": reason,
        "strict_local_text": strict_local_text,
        "edit_scope": normalized_scope,
    }


def _build_resolution_adaptation_warning(
    requested_dimensions: Optional[Tuple[int, int]],
    openai_size: Optional[str],
    attempt_plan: Dict[str, Any],
) -> Optional[str]:
    if not requested_dimensions or not openai_size:
        return None

    requested_label = _size_label(requested_dimensions[0], requested_dimensions[1])
    if requested_label == openai_size:
        return None

    if not attempt_plan.get("call_openai_edit"):
        return None

    return (
        f"O modelo de edição não gera nativamente {requested_label}. "
        f"Nesta tentativa ele vai editar em {openai_size} e adaptar para o tamanho final depois. "
        "Para pedidos de texto localizado, o fluxo determinístico local continua sendo priorizado primeiro para evitar deformação e perda de nitidez."
    )


async def _edit_openai_image(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    filename: str,
    content_type: str,
    final_prompt: str,
    aspect_ratio: str,
    quality: str,
    openai_key: str,
    openai_size: Optional[str] = None,
    mask_bytes: Optional[bytes] = None,
    input_fidelity: str = "high",
    reference_images: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {openai_key}",
    }

    data = {
        "model": OPENAI_IMAGE_MODEL,
        "prompt": final_prompt,
        "size": openai_size or _openai_size_from_aspect_ratio(aspect_ratio),
        "quality": quality,
        "output_format": "png",
        "input_fidelity": input_fidelity,
        "background": "opaque",
    }

    files = [
        ("image[]", (filename or "reference.png", image_bytes, content_type)),
    ]
    for index, ref in enumerate(list(reference_images or [])):
        ref_bytes = ref.get("bytes")
        if not ref_bytes:
            continue
        ref_filename = str(ref.get("filename") or f"reference-{index + 1}.png")
        ref_content_type = str(ref.get("content_type") or "image/png")
        files.append(("image[]", (ref_filename, ref_bytes, ref_content_type)))
    if mask_bytes:
        files.append(("mask", ("localized-mask.png", mask_bytes, "image/png")))

    resp = await _post_multipart_with_retry(
        client=client,
        url="https://api.openai.com/v1/images/edits",
        headers=headers,
        data=data,
        files=files,
        retries=3,
    )

    body = resp.json()
    data_items = body.get("data", [])
    if not data_items:
        raise ValueError(f"OpenAI edit sem data: {body}")

    first = data_items[0]
    b64_json = first.get("b64_json")
    if not b64_json:
        raise ValueError(f"OpenAI edit não retornou b64_json: {body}")

    return {
        "engine_id": "openai_edit",
        "motor": "OpenAI GPT Image 1.5 Edit",
        "url": _data_uri_from_b64(b64_json, "image/png"),
        "raw": body,
    }
@router.post("/api/image-engine/stream")
async def image_engine_stream(
    body: ImageEngineRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    openai_key = os.getenv("OPENAI_API_KEY")
    fal_key = os.getenv("FAL_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not openai_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY não configurada.")
    if not fal_key:
        raise HTTPException(status_code=500, detail="FAL_KEY não configurada.")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    try:
        requested_dimensions = _resolve_target_dimensions(body.width, body.height)
        aspect_ratio = _normalize_aspect_ratio(body.formato)
        openai_quality = _normalize_quality(body.qualidade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if requested_dimensions:
        base_width, base_height = _choose_best_supported_base_size(*requested_dimensions)
        engine_aspect_ratio = _base_size_to_aspect_ratio(base_width, base_height)
        openai_size = f"{base_width}x{base_height}"
    else:
        engine_aspect_ratio = aspect_ratio
        openai_size = _openai_size_from_aspect_ratio(engine_aspect_ratio)

    asset_type = _asset_type_from_context(None, engine_aspect_ratio)
    preset = _marketing_preset(asset_type, None)

    ensure_credits(current_user, "image_generate_from_scratch")
    action = charge_credits(session, current_user, "image_generate_from_scratch")

    async def event_generator():
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
                yield _sse({
                    "status": "Analisando briefing e refinando o prompt com foco em direção de arte publicitária...",
                    "progress": 12,
                    "meta": {
                        "aspect_ratio": engine_aspect_ratio,
                        "quality": openai_quality,
                        "asset_type": asset_type,
                        "preset_mode": preset.get("mode"),
                        "openai_size": openai_size,
                        "target_dimensions": {"width": requested_dimensions[0], "height": requested_dimensions[1]} if requested_dimensions else None,
                    },
                })

                improved = await _improve_prompt_with_openai(
                    client=client,
                    payload=body,
                    aspect_ratio=engine_aspect_ratio,
                    asset_type=asset_type,
                    preset=preset,
                    openai_key=openai_key,
                )

                final_prompt = _build_final_generation_prompt(
                    payload=body,
                    aspect_ratio=engine_aspect_ratio,
                    asset_type=asset_type,
                    preset=preset,
                    improved=improved,
                )

                yield _sse({
                    "status": "Prompt refinado. Gerando nas 3 engines, sem ranking extra, com foco em qualidade visual e texto em português.",
                    "progress": 28,
                    "improved_prompt": improved["prompt_final"],
                    "negative_prompt": improved["negative_prompt"],
                    "creative_direction": improved["creative_direction"],
                    "layout_notes": improved["layout_notes"],
                    "overlay_recommendation": improved["overlay_recommendation"],
                    "grid_spec": improved["grid_spec"],
                    "final_prompt": final_prompt,
                    "aspect_ratio": engine_aspect_ratio,
                    "quality": openai_quality,
                    "asset_type": asset_type,
                    "preset_mode": preset.get("mode"),
                    "openai_size": openai_size,
                    "target_dimensions": {"width": requested_dimensions[0], "height": requested_dimensions[1]} if requested_dimensions else None,
                })

                tasks = [
                    asyncio.create_task(
                        _generate_openai_image(
                            client,
                            final_prompt,
                            engine_aspect_ratio,
                            openai_quality,
                            openai_key,
                            openai_size,
                        )
                    ),
                    asyncio.create_task(
                        _generate_flux_image(
                            client,
                            final_prompt,
                            improved["negative_prompt"],
                            engine_aspect_ratio,
                            fal_key,
                        )
                    ),
                    asyncio.create_task(
                        _generate_google_best_available(
                            client,
                            final_prompt,
                            engine_aspect_ratio,
                            gemini_key,
                        )
                    ),
                ]

                completed_results: List[Dict[str, Any]] = []
                engine_errors: List[Dict[str, Any]] = []
                total = len(tasks)
                done_count = 0

                for coro in asyncio.as_completed(tasks):
                    try:
                        result = await coro
                        result = await _apply_postprocess_if_needed(
                            client,
                            result,
                            requested_dimensions,
                            preserve_original_frame=False,
                            allow_resize_crop=False,
                        )
                        completed_results.append(result)
                        done_count += 1

                        yield _sse({
                            "status": f"Imagem gerada com sucesso em {result['motor']}.",
                            "progress": 28 + int((done_count / total) * 62),
                            "partial_result": {
                                "engine_id": result["engine_id"],
                                "motor": result["motor"],
                                "url": result["url"],
                            },
                            "completed": done_count,
                            "total": total,
                        })

                    except Exception as e:
                        done_count += 1
                        engine_errors.append({"erro": str(e)})

                        yield _sse({
                            "status": "Uma das engines falhou, mas o processo continua.",
                            "progress": 28 + int((done_count / total) * 62),
                            "warning": str(e),
                            "completed": done_count,
                            "total": total,
                        })

                valid_images = [r for r in completed_results if r.get("url")]
                if not valid_images:
                    raise RuntimeError("Nenhuma engine conseguiu gerar imagem válida.")

                yield _sse({
                    "status": "Concluído. Entregando as imagens geradas.",
                    "progress": 100,
                    "improved_prompt": improved["prompt_final"],
                    "negative_prompt": improved["negative_prompt"],
                    "creative_direction": improved["creative_direction"],
                    "layout_notes": improved["layout_notes"],
                    "overlay_recommendation": improved["overlay_recommendation"],
                    "grid_spec": improved["grid_spec"],
                    "final_prompt": final_prompt,
                    "final_results": [
                        {
                            "engine_id": item["engine_id"],
                            "motor": item["motor"],
                            "url": item["url"],
                        }
                        for item in valid_images
                    ],
                    "engine_errors": engine_errors,
                })

        except Exception as e:
            logger.exception("Erro interno no motor de geração de imagem.")
            yield _sse({"error": f"Erro interno no motor: {str(e)}"})

    stream_response = StreamingResponse(
        _stream_sse_with_heartbeat(event_generator()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    attach_credit_headers(
        stream_response,
        current_user,
        charged_credits=action.credits,
        action_key=action.key,
    )
    return stream_response



@router.post("/api/image-engine/edit/stream")
async def image_engine_edit_stream(
    reference_image: UploadFile = File(...),
    formato: str = Form(...),
    qualidade: str = Form(...),
    instrucoes_edicao: str = Form(...),
    width: Optional[str] = Form(default=None),
    height: Optional[str] = Form(default=None),
    preserve_original_frame: Optional[str] = Form(default=None),
    allow_resize_crop: Optional[str] = Form(default=None),
    edit_scope: Optional[str] = Form(default=None),
    resolution_source: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY não configurada.")

    request_id = f"img-edit-{os.urandom(16).hex()}"

    image_bytes = await reference_image.read()
    image_filename = reference_image.filename or "reference.png"
    image_content_type = _guess_image_content_type(image_filename, reference_image.content_type)

    try:
        parsed_width = _coerce_optional_form_int(width)
        parsed_height = _coerce_optional_form_int(height)
    except ValueError:
        raise HTTPException(status_code=400, detail="Width e height precisam ser números inteiros.")

    body = ImageEditRequest(
        formato=formato,
        qualidade=qualidade,
        instrucoes_edicao=instrucoes_edicao,
        width=parsed_width,
        height=parsed_height,
        preserve_original_frame=_coerce_form_bool(preserve_original_frame, default=False),
        allow_resize_crop=_coerce_form_bool(allow_resize_crop, default=False),
        edit_scope=_normalize_edit_scope(edit_scope),
    )
    if body.preserve_original_frame:
        body.allow_resize_crop = False

    try:
        _validate_reference_image(image_bytes, image_content_type)
        if not body.instrucoes_edicao.strip():
            raise ValueError("As instruções de edição são obrigatórias.")

        target_dimensions = _resolve_target_dimensions(body.width, body.height)
        if target_dimensions:
            aspect_ratio = _base_size_to_aspect_ratio(target_dimensions[0], target_dimensions[1])
        else:
            aspect_ratio = _normalize_aspect_ratio(body.formato)

        openai_quality = _normalize_quality(body.qualidade)
        source_width, source_height = _read_image_dimensions(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    openai_size = _openai_size_from_aspect_ratio(aspect_ratio)
    resolution_source_label = (resolution_source or "").strip() or ("manual" if target_dimensions else "default")

    ensure_credits(current_user, "image_edit")
    action = charge_credits(session, current_user, "image_edit")

    async def event_generator():
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
                initial_meta = {
                    "aspect_ratio": aspect_ratio,
                    "quality": openai_quality,
                    "reference_filename": image_filename,
                    "openai_size": openai_size,
                    "source_dimensions": {"width": source_width, "height": source_height},
                    "target_dimensions": (
                        {"width": target_dimensions[0], "height": target_dimensions[1]}
                        if target_dimensions
                        else None
                    ),
                    "mode": "simple_reference_edit",
                    "request_id": request_id,
                    "resolution_source": resolution_source_label,
                    "preserve_original_frame": body.preserve_original_frame,
                    "allow_resize_crop": body.allow_resize_crop,
                }
                _append_runtime_image_edit_log(
                    request_id=request_id,
                    stage="request_start",
                    message="Nova execução iniciada no editor simplificado por referência.",
                    details={
                        "instruction": body.instrucoes_edicao,
                        "formato": body.formato,
                        "qualidade": body.qualidade,
                        "mode": "simple_reference_edit",
                        "requestedResolutionFromChat": (
                            {
                                "width": target_dimensions[0],
                                "height": target_dimensions[1],
                                "source": resolution_source_label,
                                "label": _size_label(target_dimensions[0], target_dimensions[1]),
                            }
                            if target_dimensions
                            else None
                        ),
                        "effectiveWidth": target_dimensions[0] if target_dimensions else None,
                        "effectiveHeight": target_dimensions[1] if target_dimensions else None,
                        "preserveOriginalFrame": body.preserve_original_frame,
                        "allowResizeCrop": body.allow_resize_crop,
                        "editScope": body.edit_scope,
                    },
                )
                yield _sse({
                    "status": "Editor simplificado ativo. Preparando a base e refinando o prompt de edição.",
                    "progress": 12,
                    "meta": initial_meta,
                    "debug": _runtime_debug_payload(
                        request_id=request_id,
                        stage="request_received",
                        message="Requisição recebida no fluxo simplificado de edição por referência.",
                        details=initial_meta,
                    ),
                })

                improved = {
                    "prompt_final": body.instrucoes_edicao or "Edição com preservação máxima da arte original.",
                    "negative_prompt": "não borrar, não espelhar, não distorcer, não criar colagem, não cortar elementos importantes",
                    "creative_direction": "Preservar a identidade visual da peça e adaptar a composição com segurança.",
                    "layout_notes": "Manter a leitura da arte clara e estável no formato solicitado.",
                    "preservation_rules": "Preservar texto, logos, CTA, preço, selo e elementos principais.",
                    "edit_strategy": "safe_default",
                    "micro_detail_rules": "Proteger pequenos detalhes e evitar artefatos.",
                    "consistency_rules": "Entregar uma peça única e coerente.",
                }
                final_prompt = body.instrucoes_edicao or ""
                normalized_allow_resize_crop = bool(body.allow_resize_crop and not body.preserve_original_frame)
                smart_layout_recomposition_request = bool(
                    target_dimensions
                    and not normalized_allow_resize_crop
                    and _is_custom_resolution_layout_adaptation(
                        body,
                        source_width,
                        source_height,
                        target_dimensions,
                        resolution_source_label,
                    )
                )
                canvas_only_request = bool(
                    target_dimensions
                    and not normalized_allow_resize_crop
                    and not smart_layout_recomposition_request
                    and _is_canvas_only_edit_request(body)
                )
                # Para resolução customizada, a prioridade é recompor a peça.
                # Não forçamos preservação do frame antigo, porque isso era a origem do blur/smear lateral.
                if smart_layout_recomposition_request:
                    body.preserve_original_frame = False
                    body.allow_resize_crop = False
                    _append_runtime_image_edit_log(
                        request_id=request_id,
                        stage="layout_recomposition_selected",
                        message="Rota de recomposição inteligente selecionada para resolução customizada.",
                        details={
                            "source_dimensions": {"width": source_width, "height": source_height},
                            "target_dimensions": {"width": target_dimensions[0], "height": target_dimensions[1]},
                            "resolution_source": resolution_source_label,
                            "instruction": body.instrucoes_edicao,
                        },
                    )
                elif canvas_only_request:
                    body.preserve_original_frame = True

                if smart_layout_recomposition_request:
                    # Observação importante: esta rota não passa pelo refinador padrão de prompt.
                    # Portanto, o dicionário `improved` precisa ser totalmente autossuficiente.
                    # Na versão anterior havia autorreferências como improved["creative_direction"]
                    # durante a própria inicialização, o que disparava UnboundLocalError.
                    improved = {
                        "prompt_final": "Recomposição real por IA em layout unificado, sem colagem de recortes.",
                        "negative_prompt": "não criar colagem, não criar miniaturas, não criar picture-in-picture, não duplicar pedaços da imagem, não usar blur, não usar mirror, não usar smear, não usar stretch, não deixar blocos retangulares soltos",
                        "creative_direction": "Recompor a peça inteira como uma arte publicitária única, coerente e nativa para a nova resolução, seja horizontal ou vertical.",
                        "layout_notes": "Detectar e reorganizar visual principal, bloco textual, preço, CTA, logos e elementos de apoio em um layout único adaptado ao novo formato.",
                        "preservation_rules": "Usar a imagem original como referência obrigatória, preservar campanha, hierarquia, textos, logos, selo, CTA, cores e identidade visual sempre que possível.",
                        "edit_strategy": "openai_unified_layout_recomposition_v6",
                        "micro_detail_rules": "Proteger textos pequenos, logos, CTA, selos e detalhes visuais. Não transformar a peça em mosaico ou composição de prints.",
                        "consistency_rules": "Chamada real de IA para recompor a arte como peça única, seguida de fechamento técnico no tamanho exato.",
                    }
                    final_prompt = (
                        "Fluxo V6: recompor por IA com contrato de layout sensível à orientação, checker universal de elementos críticos e fechamento estável no tamanho exato solicitado."
                    )

                    yield _sse({
                        "status": f"Recompondo por IA real para {target_dimensions[0]}x{target_dimensions[1]}: criando uma arte única, sem blur, mirror ou colagem de recortes.",
                        "progress": 42,
                        "improved_prompt": improved["prompt_final"],
                        "negative_prompt": improved["negative_prompt"],
                        "creative_direction": "Recomposição real por IA com layout unificado e acabamento de peça publicitária.",
                        "layout_notes": "Reposicionar a composição no novo formato sem montar pedaços soltos da imagem original.",
                        "preservation_rules": improved["preservation_rules"],
                        "edit_strategy": "openai_unified_layout_recomposition_v6",
                        "micro_detail_rules": improved["micro_detail_rules"],
                        "consistency_rules": improved["consistency_rules"],
                        "final_prompt": final_prompt,
                        "aspect_ratio": aspect_ratio,
                        "quality": openai_quality,
                        "openai_size": openai_size,
                        "debug": _runtime_debug_payload(
                            request_id=request_id,
                            stage="layout_recomposition_started",
                            message="Pipeline V6 iniciado: recomposição real por IA com contrato horizontal/vertical, checker universal e auditoria automática.",
                            details={
                                "source_dimensions": {"width": source_width, "height": source_height},
                                "target_dimensions": {"width": target_dimensions[0], "height": target_dimensions[1]},
                                "strategy": "openai_unified_full_design_recomposition_no_local_collage",
                            },
                        ),
                    })

                    result = await adapt_image_to_custom_layout(
                        client=client,
                        image_bytes=image_bytes,
                        target_width=target_dimensions[0],
                        target_height=target_dimensions[1],
                        openai_key=openai_key,
                        openai_quality=openai_quality,
                        instruction_text=body.instrucoes_edicao,
                        request_id=request_id,
                    )
                elif canvas_only_request:
                    expand_without_crop_needed = _needs_exact_canvas_expand(
                        source_width,
                        source_height,
                        target_dimensions[0],
                        target_dimensions[1],
                        allow_resize_crop=normalized_allow_resize_crop,
                    )
                    improved = _build_fast_canvas_only_improvement(
                        target_dimensions=target_dimensions,
                        expand_without_crop_needed=expand_without_crop_needed,
                    )
                    final_prompt = (
                        "Fluxo direto de adaptação de canvas com preservação integral da base original."
                        if expand_without_crop_needed
                        else "Fluxo direto de resize exato sem crop e sem edição criativa."
                    )

                    yield _sse({
                        "status": (
                            "Solicitação identificada como adaptação pura de canvas. Preparando canvas local com camada original preservada."
                            if expand_without_crop_needed
                            else "Solicitação identificada como resize puro. Preparando ajuste exato sem crop."
                        ),
                        "progress": 42,
                        "improved_prompt": improved["prompt_final"],
                        "negative_prompt": improved["negative_prompt"],
                        "creative_direction": improved["creative_direction"],
                        "layout_notes": improved["layout_notes"],
                        "preservation_rules": improved["preservation_rules"],
                        "edit_strategy": improved["edit_strategy"],
                        "micro_detail_rules": improved["micro_detail_rules"],
                        "consistency_rules": improved["consistency_rules"],
                        "final_prompt": final_prompt,
                        "aspect_ratio": aspect_ratio,
                        "quality": openai_quality,
                        "openai_size": openai_size,
                    })

                    if expand_without_crop_needed:
                        yield _sse({
                            "status": f"Construindo canvas final {target_dimensions[0]}x{target_dimensions[1]} com camada original preservada.",
                            "progress": 82,
                            "meta": {
                                "working_dimensions": {
                                    "width": source_width,
                                    "height": source_height,
                                },
                                "target_dimensions": {
                                    "width": target_dimensions[0],
                                    "height": target_dimensions[1],
                                },
                                "strategy": "exact_size_layer_preserve_local",
                            },
                            "debug": _runtime_debug_payload(
                                request_id=request_id,
                                stage="exact_size_layer_preserve_started",
                                message="Adaptação local de canvas iniciada com camada original preservada.",
                                details={
                                    "working_dimensions": {
                                        "width": source_width,
                                        "height": source_height,
                                    },
                                    "target_dimensions": {
                                        "width": target_dimensions[0],
                                        "height": target_dimensions[1],
                                    },
                                    "strategy": "exact_size_layer_preserve_local",
                                    "canvas_only_request": True,
                                },
                            ),
                        })

                        result = await _expand_image_to_exact_size_with_ai(
                            client=client,
                            image_bytes=image_bytes,
                            openai_key=openai_key,
                            openai_quality=openai_quality,
                            requested_width=target_dimensions[0],
                            requested_height=target_dimensions[1],
                        )
                    else:
                        result = _build_canvas_only_resize_result(
                            image_bytes=image_bytes,
                            payload=body,
                            target_dimensions=target_dimensions,
                        )
                else:
                    improved = await _improve_edit_prompt_with_openai(
                        client=client,
                        payload=body,
                        aspect_ratio=aspect_ratio,
                        openai_key=openai_key,
                    )

                    final_prompt = _build_final_edit_prompt(
                        payload=body,
                        aspect_ratio=aspect_ratio,
                        improved=improved,
                    )

                    yield _sse({
                        "status": "Prompt refinado. Enviando a imagem-base para edição direta.",
                        "progress": 42,
                        "improved_prompt": improved["prompt_final"],
                        "negative_prompt": improved["negative_prompt"],
                        "creative_direction": improved["creative_direction"],
                        "layout_notes": improved["layout_notes"],
                        "preservation_rules": improved["preservation_rules"],
                        "edit_strategy": improved["edit_strategy"],
                        "micro_detail_rules": improved["micro_detail_rules"],
                        "consistency_rules": improved["consistency_rules"],
                        "final_prompt": final_prompt,
                        "aspect_ratio": aspect_ratio,
                        "quality": openai_quality,
                        "openai_size": openai_size,
                    })

                    result = await _edit_openai_image(
                        client=client,
                        image_bytes=image_bytes,
                        filename=image_filename,
                        content_type=image_content_type,
                        final_prompt=final_prompt,
                        aspect_ratio=aspect_ratio,
                        quality=openai_quality,
                        openai_key=openai_key,
                        input_fidelity="high",
                        openai_size=openai_size,
                    )

                    if target_dimensions:
                        base_result_bytes, _ = await _read_result_bytes(client, result)
                        base_result_width, base_result_height = _read_image_dimensions(base_result_bytes)
                        exact_expand_needed = _needs_exact_canvas_expand(
                            base_result_width,
                            base_result_height,
                            target_dimensions[0],
                            target_dimensions[1],
                            allow_resize_crop=normalized_allow_resize_crop,
                        )
                        resize_strategy = (
                            "exact_size_ai_canvas_extension"
                            if exact_expand_needed
                            else "exact_size_deterministic_resize"
                        )

                        yield _sse({
                            "status": (
                                f"Edição concluída. Fazendo extensão real por IA para o tamanho final exato {target_dimensions[0]}x{target_dimensions[1]}."
                                if exact_expand_needed
                                else f"Edição concluída. Ajustando para o tamanho final exato {target_dimensions[0]}x{target_dimensions[1]} sem crop."
                            ),
                            "progress": 82,
                            "meta": {
                                "working_dimensions": {
                                    "width": base_result_width,
                                    "height": base_result_height,
                                },
                                "target_dimensions": {
                                    "width": target_dimensions[0],
                                    "height": target_dimensions[1],
                                },
                                "strategy": resize_strategy,
                            },
                            "debug": _runtime_debug_payload(
                                request_id=request_id,
                                stage="exact_size_layer_preserve_started",
                                message=(
                                    "Extensão real por IA iniciada para o tamanho final exato."
                                    if exact_expand_needed
                                    else "Adaptação determinística iniciada para o tamanho final exato."
                                ),
                                details={
                                    "working_dimensions": {
                                        "width": base_result_width,
                                        "height": base_result_height,
                                    },
                                    "target_dimensions": {
                                        "width": target_dimensions[0],
                                        "height": target_dimensions[1],
                                    },
                                    "strategy": resize_strategy,
                                    "canvas_only_request": False,
                                },
                            ),
                        })

                        if exact_expand_needed:
                            result = await _expand_image_to_exact_size_with_ai(
                                client=client,
                                image_bytes=base_result_bytes,
                                openai_key=openai_key,
                                openai_quality=openai_quality,
                                requested_width=target_dimensions[0],
                                requested_height=target_dimensions[1],
                            )
                        else:
                            result = await _apply_postprocess_if_needed(
                                client=client,
                                result=result,
                                target_dimensions=target_dimensions,
                                preserve_original_frame=body.preserve_original_frame,
                                allow_resize_crop=body.allow_resize_crop,
                                original_reference_bytes=image_bytes,
                            )

                layout_recomposition_meta = result.get("layout_recomposition") if isinstance(result, dict) else None
                if layout_recomposition_meta:
                    _append_runtime_image_edit_log(
                        request_id=request_id,
                        stage="layout_recomposition_finished",
                        message="Pipeline de recomposição inteligente finalizado com guard rails de layout e orientação.",
                        details=layout_recomposition_meta,
                    )
                    yield _sse({
                        "status": "Recomposição inteligente concluída. Elementos principais foram reposicionados no novo layout.",
                        "progress": 88,
                        "meta": {"layout_recomposition": layout_recomposition_meta},
                        "layout_recomposition": layout_recomposition_meta,
                        "debug": _runtime_debug_payload(
                            request_id=request_id,
                            stage="layout_recomposition_finished",
                            message="Resultado gerado pela rota de recomposição, sem expansão manual lateral.",
                            details=layout_recomposition_meta,
                        ),
                    })

                exact_canvas_meta = result.get("exact_canvas_expand") if isinstance(result, dict) else None
                if exact_canvas_meta:
                    for attempt in list(exact_canvas_meta.get("attempts") or []):
                        _append_runtime_image_edit_log(
                            request_id=request_id,
                            stage="exact_expand_attempt_evaluated",
                            message="Tentativa de expansão exata avaliada.",
                            details=attempt,
                        )
                    selected_summary = {
                        "selected_attempt": exact_canvas_meta.get("selected_attempt"),
                        "selected_profile": exact_canvas_meta.get("selected_profile"),
                        "selected_quality_score": exact_canvas_meta.get("selected_quality_score"),
                        "selected_seam_score": exact_canvas_meta.get("selected_seam_score"),
                        "selected_seam_max": exact_canvas_meta.get("selected_seam_max"),
                        "flagged_sides": exact_canvas_meta.get("flagged_sides"),
                        "fallback_applied": exact_canvas_meta.get("fallback_applied"),
                        "fallback_improved": exact_canvas_meta.get("fallback_improved"),
                        "fallback_details": exact_canvas_meta.get("fallback_details"),
                    }
                    yield _sse({
                        "status": (
                            f"Expansão exata analisada. Score {exact_canvas_meta.get('selected_quality_score', exact_canvas_meta.get('quality_score'))} | "
                            f"seam médio {exact_canvas_meta.get('selected_seam_score', exact_canvas_meta.get('seam_score'))} | "
                            f"pior seam {exact_canvas_meta.get('selected_seam_max', exact_canvas_meta.get('seam_max'))}."
                        ),
                        "progress": 88,
                        "meta": {
                            "exact_canvas_expand": exact_canvas_meta,
                        },
                        "exact_canvas_expand": exact_canvas_meta,
                        "debug": _runtime_debug_payload(
                            request_id=request_id,
                            stage="exact_expand_diagnostics",
                            message="Diagnóstico detalhado da expansão exata consolidado.",
                            details=selected_summary,
                        ),
                    })

                if target_dimensions:
                    final_result_bytes, _ = await _read_result_bytes(client, result)
                    final_result_width, final_result_height = _read_image_dimensions(final_result_bytes)
                    _append_runtime_image_edit_log(
                        request_id=request_id,
                        stage="final_result_resized",
                        message="Resultado final ajustado para o tamanho exato solicitado.",
                        details={
                            "final_dimensions": {
                                "width": final_result_width,
                                "height": final_result_height,
                            },
                            "target_dimensions": {
                                "width": target_dimensions[0],
                                "height": target_dimensions[1],
                            },
                            "preserve_original_frame": body.preserve_original_frame,
                            "allow_resize_crop": body.allow_resize_crop,
                            "canvas_only_request": canvas_only_request,
                            "engine_id": result.get("engine_id"),
                            "motor": result.get("motor"),
                        },
                    )

                yield _sse({
                    "status": f"Edição concluída com sucesso em {result['motor']}.",
                    "progress": 92,
                    "partial_result": {
                        "engine_id": result["engine_id"],
                        "motor": result["motor"],
                        "url": result["url"],
                        "exact_canvas_expand": result.get("exact_canvas_expand"),
                    },
                    "exact_canvas_expand": result.get("exact_canvas_expand"),
                    "warning": None,
                    "debug": _runtime_debug_payload(
                        request_id=request_id,
                        stage="openai_edit_completed",
                        message="Resultado principal finalizado e pronto para entrega.",
                        details={
                            "engine_id": result.get("engine_id"),
                            "motor": result.get("motor"),
                            "target_dimensions": (
                                {"width": target_dimensions[0], "height": target_dimensions[1]}
                                if target_dimensions
                                else None
                            ),
                            "exact_canvas_expand": result.get("exact_canvas_expand"),
                        },
                        image=result.get("url"),
                        level="success",
                    ),
                })

                yield _sse({
                    "status": "Concluído. Entregando a imagem editada.",
                    "progress": 100,
                    "improved_prompt": improved["prompt_final"],
                    "negative_prompt": improved["negative_prompt"],
                    "creative_direction": improved["creative_direction"],
                    "layout_notes": improved["layout_notes"],
                    "preservation_rules": improved["preservation_rules"],
                    "edit_strategy": improved["edit_strategy"],
                    "micro_detail_rules": improved["micro_detail_rules"],
                    "consistency_rules": improved["consistency_rules"],
                    "final_prompt": final_prompt,
                    "final_results": [
                        {
                            "engine_id": result["engine_id"],
                            "motor": result["motor"],
                            "url": result["url"],
                            "exact_canvas_expand": result.get("exact_canvas_expand"),
                        }
                    ],
                    "exact_canvas_expand": result.get("exact_canvas_expand"),
                    "warning": None,
                    "debug": _runtime_debug_payload(
                        request_id=request_id,
                        stage="request_finished",
                        message="Requisição concluída com entrega final emitida para o frontend.",
                        details={
                            "engine_id": result.get("engine_id"),
                            "motor": result.get("motor"),
                            "target_dimensions": (
                                {"width": target_dimensions[0], "height": target_dimensions[1]}
                                if target_dimensions
                                else None
                            ),
                        },
                        image=result.get("url"),
                        level="success",
                    ),
                })
        except Exception as e:
            logger.exception("Erro interno no fluxo simplificado de edição de imagem.")
            _append_runtime_image_edit_log(
                request_id=request_id,
                stage="request_failed",
                message="Erro interno no editor simplificado por referência.",
                level="error",
                details={"error": str(e)},
            )
            yield _sse({"error": f"Erro interno no editor: {str(e)}"})

    stream_response = StreamingResponse(
        _stream_sse_with_heartbeat(event_generator()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    attach_credit_headers(
        stream_response,
        current_user,
        charged_credits=action.credits,
        action_key=action.key,
    )
    return stream_response

def _build_text_remove_crop_plan(
    image_bytes: bytes,
    analysis: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    operation = (analysis.get("operation") or "").lower()
    if operation != "text_remove":
        return None

    with Image.open(io.BytesIO(image_bytes)) as im:
        image = im.convert("RGBA")
        width, height = image.size

    target = _norm_box_to_px_engine(
        analysis.get("text_bbox") or analysis.get("bbox") or analysis.get("container_bbox"),
        width,
        height,
    )
    if not target:
        return None

    tw = max(1, target[2] - target[0])
    th = max(1, target[3] - target[1])

    pad_x = max(26, int(round(tw * 0.28)))
    pad_y_top = max(18, int(round(th * 0.72)))
    pad_y_bottom = max(12, int(round(th * 0.34)))

    crop_x1 = max(0, target[0] - pad_x)
    crop_x2 = min(width, target[2] + pad_x)
    crop_y1 = max(0, target[1] - pad_y_top)
    crop_y2 = min(height, target[3] + pad_y_bottom)

    crop_rect = (crop_x1, crop_y1, crop_x2, crop_y2)
    crop_w = crop_x2 - crop_x1
    crop_h = crop_y2 - crop_y1
    if crop_w < max(96, tw + 20) or crop_h < max(42, th + 14):
        return None

    target_local = (
        target[0] - crop_x1,
        target[1] - crop_y1,
        target[2] - crop_x1,
        target[3] - crop_y1,
    )

    editable_local_rect = (
        max(0, target_local[0] - max(4, int(round(tw * 0.035)))),
        max(0, target_local[1] - max(2, int(round(th * 0.08)))),
        min(crop_w, target_local[2] + max(4, int(round(tw * 0.035)))),
        min(crop_h, target_local[3] + max(2, int(round(th * 0.08)))),
    )

    protected_local_rects: List[Tuple[int, int, int, int]] = []

    guard_gap = max(6, int(round(th * 0.18)))
    top_guard_h = max(8, int(round(th * 0.42)))
    bottom_guard_h = max(10, int(round(th * 0.60)))

    top_guard = (
        0,
        max(0, editable_local_rect[1] - guard_gap - top_guard_h),
        crop_w,
        max(0, editable_local_rect[1] - guard_gap),
    )
    bottom_guard = (
        0,
        min(crop_h, editable_local_rect[3] + guard_gap),
        crop_w,
        min(crop_h, editable_local_rect[3] + guard_gap + bottom_guard_h),
    )

    if top_guard[3] > top_guard[1]:
        protected_local_rects.append(top_guard)
    if bottom_guard[3] > bottom_guard[1]:
        protected_local_rects.append(bottom_guard)

    for rect in list_local_text_candidate_rects(image_bytes):
        if rect[2] <= crop_x1 or rect[0] >= crop_x2 or rect[3] <= crop_y1 or rect[1] >= crop_y2:
            continue

        iou = _rect_iou(target, rect)
        if iou >= 0.24:
            continue

        local_rect = (
            max(0, rect[0] - crop_x1),
            max(0, rect[1] - crop_y1),
            min(crop_w, rect[2] - crop_x1),
            min(crop_h, rect[3] - crop_y1),
        )
        if local_rect[2] <= local_rect[0] or local_rect[3] <= local_rect[1]:
            continue

        same_row = _same_text_row(target, rect)
        overlap_with_editable = _rect_iou(editable_local_rect, local_rect)

        if same_row and overlap_with_editable >= 0.04:
            continue

        inflated = (
            max(0, local_rect[0] - 5),
            max(0, local_rect[1] - 4),
            min(crop_w, local_rect[2] + 5),
            min(crop_h, local_rect[3] + 4),
        )
        protected_local_rects.append(inflated)

    deduped: List[Tuple[int, int, int, int]] = []
    for rect in protected_local_rects:
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue
        if rect not in deduped:
            deduped.append(rect)

    return {
        "crop_rect": crop_rect,
        "crop_size": (crop_w, crop_h),
        "editable_local_rect": editable_local_rect,
        "target_local_rect": target_local,
        "protected_local_rects": deduped[:24],
    }


async def _synthesize_remove_text_with_ai_crop(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    analysis: Dict[str, Any],
    openai_key: str,
    openai_quality: str,
) -> Optional[Dict[str, Any]]:
    plan = _build_text_remove_crop_plan(image_bytes, analysis)
    if not plan:
        return None

    with Image.open(io.BytesIO(image_bytes)) as im:
        full = im.convert("RGBA")
        crop = full.crop(plan["crop_rect"])
        crop_bytes = _encode_png_bytes(crop)

    focus_mask = _build_remove_text_focus_mask(
        crop,
        plan["target_local_rect"],
        plan["editable_local_rect"],
        protected_local_rects=plan["protected_local_rects"],
    )

    deterministic_bytes: Optional[bytes] = None
    deterministic_metrics: Optional[Dict[str, float]] = None
    if focus_mask is not None:
        deterministic_crop = _inpaint_remove_focus_mask(crop, focus_mask)
        deterministic_bytes = _encode_png_bytes(deterministic_crop)
        deterministic_metrics = _score_remove_candidate(
            crop,
            deterministic_crop,
            focus_mask,
            plan["editable_local_rect"],
            protected_local_rects=plan["protected_local_rects"],
        )

        fast_path_ok = (
            deterministic_metrics["inside_change"] >= 9.0
            and deterministic_metrics["outside_change"] <= 1.35
            and deterministic_metrics["ring_change"] <= 1.45
            and deterministic_metrics["score"] <= 3.8
        )
        if fast_path_ok:
            overlay_bytes, overlay_bbox = _extract_localized_overlay_from_crop(
                crop_bytes,
                deterministic_bytes,
                plan["editable_local_rect"],
                protected_local_rects=plan["protected_local_rects"],
                focus_mask=focus_mask,
            )
            if overlay_bytes and overlay_bbox:
                composed_bytes = _composite_append_overlay_into_image(
                    image_bytes,
                    overlay_bytes,
                    plan["crop_rect"],
                )
                return {
                    "engine_id": "local_remove_focus_inpaint",
                    "motor": "Remoção Local por Patch (inpaint preciso)",
                    "url": _result_url_from_image_bytes(composed_bytes, "image/png"),
                    "raw": {
                        "strategy": "deterministic_focus_inpaint",
                        "metrics": deterministic_metrics,
                    },
                    "remove_crop_plan": {
                        "crop_rect": {
                            "x1": plan["crop_rect"][0],
                            "y1": plan["crop_rect"][1],
                            "x2": plan["crop_rect"][2],
                            "y2": plan["crop_rect"][3],
                        },
                        "editable_local_rect": {
                            "x1": plan["editable_local_rect"][0],
                            "y1": plan["editable_local_rect"][1],
                            "x2": plan["editable_local_rect"][2],
                            "y2": plan["editable_local_rect"][3],
                        },
                        "overlay_bbox": overlay_bbox,
                        "protected_rects": len(plan["protected_local_rects"]),
                        "fast_path": True,
                    },
                }

    canvas_bytes, mask_bytes, canvas_meta = _build_crop_canvas_for_append_edit(
        crop_bytes,
        plan["editable_local_rect"],
    )

    canvas_w = canvas_meta["canvas_width"]
    canvas_h = canvas_meta["canvas_height"]
    target = (analysis.get("target_text") or "").strip()
    prompt = (
        f'Remova apenas o texto "{target}" dentro da área mascarada. '
        'Reconstrua somente o fundo imediato onde esse texto estava. '
        'Não altere nenhum outro texto, número, data, local, logo, ícone ou elemento gráfico do recorte. '
        'Preserve rigorosamente a tipografia, datas e o conteúdo dos demais blocos. '
        'A saída deve parecer uma restauração local limpa do recorte original, sem glow extra, sem blur em bloco e sem reescrever a arte.'
    )

    result = await _edit_openai_image(
        client=client,
        image_bytes=canvas_bytes,
        filename="localized-remove-crop.png",
        content_type="image/png",
        final_prompt=prompt,
        aspect_ratio=_base_size_to_aspect_ratio(canvas_w, canvas_h),
        quality=openai_quality,
        openai_key=openai_key,
        openai_size=f"{canvas_w}x{canvas_h}",
        mask_bytes=mask_bytes,
        input_fidelity="high",
    )

    edited_canvas_bytes, _ = _image_bytes_from_result_url(result["url"])
    edited_crop_bytes = _restore_crop_from_canvas_result(edited_canvas_bytes, canvas_meta)

    selected_crop_bytes = edited_crop_bytes
    selection_meta: Dict[str, Any] = {"source": "ai_crop"}

    if focus_mask is not None:
        with Image.open(io.BytesIO(edited_crop_bytes)) as ai_im:
            ai_crop = ai_im.convert("RGBA")
        ai_metrics = _score_remove_candidate(
            crop,
            ai_crop,
            focus_mask,
            plan["editable_local_rect"],
            protected_local_rects=plan["protected_local_rects"],
        )
        selection_meta["ai_metrics"] = ai_metrics

        if deterministic_bytes is not None and deterministic_metrics is not None:
            selection_meta["deterministic_metrics"] = deterministic_metrics
            if deterministic_metrics["score"] <= ai_metrics["score"] + 0.9:
                selected_crop_bytes = deterministic_bytes
                selection_meta["source"] = "deterministic_fallback"

    overlay_bytes, overlay_bbox = _extract_localized_overlay_from_crop(
        crop_bytes,
        selected_crop_bytes,
        plan["editable_local_rect"],
        protected_local_rects=plan["protected_local_rects"],
        focus_mask=focus_mask,
    )
    if not overlay_bytes or not overlay_bbox:
        return None

    composed_bytes = _composite_append_overlay_into_image(
        image_bytes,
        overlay_bytes,
        plan["crop_rect"],
    )

    next_result = dict(result)
    next_result["engine_id"] = "openai_remove_crop_composite"
    next_result["motor"] = "Remoção Local por Patch (crop híbrido)"
    next_result["url"] = _result_url_from_image_bytes(composed_bytes, "image/png")
    next_result["raw"] = {
        **(next_result.get("raw") or {}),
        "selection": selection_meta,
    }
    next_result["remove_crop_plan"] = {
        "crop_rect": {
            "x1": plan["crop_rect"][0],
            "y1": plan["crop_rect"][1],
            "x2": plan["crop_rect"][2],
            "y2": plan["crop_rect"][3],
        },
        "editable_local_rect": {
            "x1": plan["editable_local_rect"][0],
            "y1": plan["editable_local_rect"][1],
            "x2": plan["editable_local_rect"][2],
            "y2": plan["editable_local_rect"][3],
        },
        "overlay_bbox": overlay_bbox,
        "protected_rects": len(plan["protected_local_rects"]),
        "focus_mask": bool(focus_mask),
    }
    return next_result

# >>> IMAGE_ENGINE_EXACT_CANVAS_V12_MANUAL_EXPAND_THEN_AI_ENHANCE
# V12 troca a lógica do V11:
# - primeiro constrói a expansão no dedo, de forma determinística e sem blur grosseiro;
# - depois usa IA apenas como enhance/refino das faixas externas;
# - se a IA inventar objetos, estrelas, textos ou piorar o score, volta para o resultado manual.



def _v12_env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "t", "yes", "y", "on", "sim"}


def _v12_env_int(name: str, default: int) -> int:
    try:
        raw = os.getenv(name)
        if raw is None or str(raw).strip() == "":
            return int(default)
        return int(str(raw).strip())
    except Exception:
        return int(default)


def _v12_env_float(name: str, default: float) -> float:
    try:
        raw = os.getenv(name)
        if raw is None or str(raw).strip() == "":
            return float(default)
        return float(str(raw).strip())
    except Exception:
        return float(default)


def _v131_exact_expand_score(diagnostics: Dict[str, Any]) -> float:
    seam_score = float(diagnostics.get("seam_score", 999.0) or 999.0)
    seam_max = float(diagnostics.get("seam_max", 999.0) or 999.0)
    quality_score = float(diagnostics.get("quality_score", 999.0) or 999.0)
    generated_penalty = float(diagnostics.get("generated_region_penalty", 0.0) or 0.0)
    border_score = float(diagnostics.get("border_score", 0.0) or 0.0)
    return float(
        (seam_max * 1.50)
        + (seam_score * 1.08)
        + (quality_score * 0.46)
        + (generated_penalty * 2.35)
        + (border_score * 0.31)
    )


def _v12_exact_expand_score(diagnostics: Dict[str, Any]) -> float:
    return _v131_exact_expand_score(diagnostics)


def _v131_safe_overlap_px(source_width: int, source_height: int, gap: int, *, dominant: bool = False) -> int:
    if gap <= 0:
        return 0
    configured = _v12_env_int("IMAGE_ENGINE_EXACT_EXPAND_OVERLAP_PX", 18)
    min_side = max(1, min(int(source_width), int(source_height)))
    max_safe = max(8, min(34, int(round(min_side * 0.036))))
    overlap = max(6, min(int(configured), max_safe, max(6, gap // 10 if gap >= 80 else gap)))
    if dominant:
        overlap = int(round(overlap * _v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_DOMINANT_OVERLAP_BOOST", 1.25)))
    return max(0, min(max_safe, overlap))


def _v12_safe_overlap_px(source_width: int, source_height: int, gap: int) -> int:
    return _v131_safe_overlap_px(source_width, source_height, gap)


def _v131_edge_color(source: Image.Image) -> Tuple[int, int, int, int]:
    rgb = source.convert("RGB")
    arr = np.asarray(rgb, dtype=np.float32)
    if arr.size == 0:
        return (0, 0, 0, 255)
    h, w = arr.shape[:2]
    band = max(4, min(34, min(w, h) // 22))
    samples = [
        arr[:, :band, :].reshape(-1, 3),
        arr[:, max(0, w - band):w, :].reshape(-1, 3),
        arr[:band, :, :].reshape(-1, 3),
        arr[max(0, h - band):h, :, :].reshape(-1, 3),
    ]
    merged = np.concatenate(samples, axis=0)
    color = np.percentile(merged, 38, axis=0)
    return (
        int(np.clip(color[0], 0, 255)),
        int(np.clip(color[1], 0, 255)),
        int(np.clip(color[2], 0, 255)),
        255,
    )


def _v12_edge_color(source: Image.Image) -> Tuple[int, int, int, int]:
    return _v131_edge_color(source)


def _v131_visual_metrics(image: Image.Image) -> Dict[str, Any]:
    rgba = image.convert("RGBA")
    arr = np.asarray(rgba, dtype=np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3] / 255.0
    h, w = rgb.shape[:2]
    if h <= 0 or w <= 0:
        return {
            "center_x": 0.5,
            "center_y": 0.5,
            "left_edge_energy": 0.0,
            "right_edge_energy": 0.0,
            "top_edge_energy": 0.0,
            "bottom_edge_energy": 0.0,
        }

    luma = (rgb[..., 0] * 0.2126) + (rgb[..., 1] * 0.7152) + (rgb[..., 2] * 0.0722)
    gx = np.abs(np.diff(luma, axis=1, append=luma[:, -1:]))
    gy = np.abs(np.diff(luma, axis=0, append=luma[-1:, :]))
    chroma = np.std(rgb, axis=2)
    energy = ((gx * 0.78) + (gy * 0.78) + (chroma * 0.18) + 1.0) * np.maximum(alpha, 0.08)

    total = float(np.sum(energy))
    if total <= 1e-6:
        center_x = center_y = 0.5
    else:
        xs = np.arange(w, dtype=np.float32)[None, :]
        ys = np.arange(h, dtype=np.float32)[:, None]
        center_x = float(np.sum(energy * xs) / total) / max(1.0, float(w - 1))
        center_y = float(np.sum(energy * ys) / total) / max(1.0, float(h - 1))

    band_x = max(1, min(w, max(6, w // 6)))
    band_y = max(1, min(h, max(6, h // 6)))
    return {
        "center_x": float(np.clip(center_x, 0.0, 1.0)),
        "center_y": float(np.clip(center_y, 0.0, 1.0)),
        "left_edge_energy": float(np.mean(energy[:, :band_x])),
        "right_edge_energy": float(np.mean(energy[:, w - band_x:w])),
        "top_edge_energy": float(np.mean(energy[:band_y, :])),
        "bottom_edge_energy": float(np.mean(energy[h - band_y:h, :])),
    }


def _v131_pick_placement(fitted: Image.Image, target_width: int, target_height: int) -> Dict[str, Any]:
    extra_x = max(0, int(target_width) - int(fitted.width))
    extra_y = max(0, int(target_height) - int(fitted.height))
    metrics = _v131_visual_metrics(fitted)
    strength = float(np.clip(_v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_ONE_SIDE_STRENGTH", 0.90), 0.55, 0.985))
    threshold = float(np.clip(_v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_ONE_SIDE_CENTER_THRESHOLD", 0.065), 0.015, 0.20))
    flush_threshold = max(0, int(_v12_env_int("IMAGE_ENGINE_EXACT_EXPAND_ONE_SIDE_FLUSH_THRESHOLD_PX", 32)))
    dominant_side: Optional[str] = None
    axis = "none"
    x1 = extra_x // 2
    y1 = extra_y // 2

    if extra_x > 0 or extra_y > 0:
        if extra_x >= extra_y:
            axis = "horizontal"
            center_delta = float(metrics.get("center_x", 0.5)) - 0.5
            if abs(center_delta) >= threshold:
                dominant_side = "left" if center_delta > 0 else "right"
            else:
                dominant_side = "left" if float(metrics.get("left_edge_energy", 0.0)) <= float(metrics.get("right_edge_energy", 0.0)) else "right"
            dominant_gap = max(0, min(extra_x, int(round(extra_x * strength))))
            secondary_gap = max(0, extra_x - dominant_gap)
            if secondary_gap <= flush_threshold:
                dominant_gap = extra_x
                secondary_gap = 0
            x1 = dominant_gap if dominant_side == "left" else secondary_gap
            y1 = extra_y // 2
        else:
            axis = "vertical"
            center_delta = float(metrics.get("center_y", 0.5)) - 0.5
            if abs(center_delta) >= threshold:
                dominant_side = "top" if center_delta > 0 else "bottom"
            else:
                dominant_side = "top" if float(metrics.get("top_edge_energy", 0.0)) <= float(metrics.get("bottom_edge_energy", 0.0)) else "bottom"
            dominant_gap = max(0, min(extra_y, int(round(extra_y * strength))))
            secondary_gap = max(0, extra_y - dominant_gap)
            if secondary_gap <= flush_threshold:
                dominant_gap = extra_y
                secondary_gap = 0
            y1 = dominant_gap if dominant_side == "top" else secondary_gap
            x1 = extra_x // 2

    x1 = max(0, min(extra_x, int(x1)))
    y1 = max(0, min(extra_y, int(y1)))
    return {
        "axis": axis,
        "dominant_side": dominant_side,
        "strength": strength,
        "flush_threshold": flush_threshold,
        "metrics": metrics,
        "placement": (x1, y1, x1 + int(fitted.width), y1 + int(fitted.height)),
    }


def _v131_with_alpha(image: Image.Image, alpha_factor: float) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha_factor = float(np.clip(alpha_factor, 0.0, 1.0))
    if alpha_factor >= 0.999:
        return rgba
    alpha = rgba.getchannel("A")
    alpha = alpha.point(lambda p: int(round(p * alpha_factor)))
    rgba.putalpha(alpha)
    return rgba


def _v131_edge_strip_complexity(strip: Image.Image, orientation: str) -> float:
    rgba = strip.convert("RGBA")
    arr = np.asarray(rgba, dtype=np.float32)
    if arr.size == 0:
        return 0.0
    rgb = arr[..., :3]
    if orientation in {"left", "right"}:
        if rgb.shape[1] <= 1:
            return 0.0
        diff = np.abs(np.diff(rgb, axis=1))
    else:
        if rgb.shape[0] <= 1:
            return 0.0
        diff = np.abs(np.diff(rgb, axis=0))
    return float(np.mean(diff))


def _v131_profile_gradient_fill(strip: Image.Image, target_width: int, target_height: int, orientation: str) -> Image.Image:
    rgba = strip.convert("RGBA")
    arr = np.asarray(rgba, dtype=np.float32)
    if arr.size == 0 or target_width <= 0 or target_height <= 0:
        return Image.new("RGBA", (max(1, target_width), max(1, target_height)), (0, 0, 0, 0))

    h, w = arr.shape[:2]
    base_color = np.array(_v131_edge_color(rgba), dtype=np.float32)

    if orientation in {"left", "right"}:
        if w <= 0:
            return Image.new("RGBA", (target_width, target_height), tuple(int(x) for x in base_color))
        near_n = max(1, min(w, 2))
        mid_n = max(near_n, min(w, 6))
        far_n = max(mid_n, min(w, 14))
        if orientation == "left":
            near = np.mean(arr[:, :near_n, :], axis=1)
            mid = np.mean(arr[:, :mid_n, :], axis=1)
            far = np.mean(arr[:, :far_n, :], axis=1)
            detail_strip = arr[:, :far_n, :]
        else:
            near = np.mean(arr[:, w - near_n:w, :], axis=1)
            mid = np.mean(arr[:, w - mid_n:w, :], axis=1)
            far = np.mean(arr[:, w - far_n:w, :], axis=1)
            detail_strip = arr[:, w - far_n:w, :]

        if target_height != h:
            near = np.asarray(Image.fromarray(np.clip(near, 0, 255).astype(np.uint8), mode="RGBA").resize((1, target_height), Image.Resampling.BILINEAR), dtype=np.float32)[:, 0, :]
            mid = np.asarray(Image.fromarray(np.clip(mid, 0, 255).astype(np.uint8), mode="RGBA").resize((1, target_height), Image.Resampling.BILINEAR), dtype=np.float32)[:, 0, :]
            far = np.asarray(Image.fromarray(np.clip(far, 0, 255).astype(np.uint8), mode="RGBA").resize((1, target_height), Image.Resampling.BILINEAR), dtype=np.float32)[:, 0, :]
            detail_strip = np.asarray(Image.fromarray(np.clip(detail_strip, 0, 255).astype(np.uint8), mode="RGBA").resize((detail_strip.shape[1], target_height), Image.Resampling.BILINEAR), dtype=np.float32)

        texture = np.asarray(Image.fromarray(np.clip(detail_strip, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, target_height), Image.Resampling.BILINEAR), dtype=np.float32)
        texture_mean = np.mean(texture, axis=1, keepdims=True)
        texture_detail = texture - texture_mean
        complexity = _v131_edge_strip_complexity(rgba, orientation)
        detail_strength = float(np.clip((complexity / 18.0), 0.05, 0.18))

        out = np.zeros((target_height, target_width, 4), dtype=np.float32)
        outer_mix = np.clip(0.62 + (complexity / 90.0), 0.58, 0.82)
        outer = (far * (1.0 - outer_mix)) + (base_color * outer_mix)
        for x in range(target_width):
            seam_dist = (target_width - 1 - x) if orientation == "left" else x
            t = seam_dist / max(1.0, float(target_width - 1))
            if t <= 0.45:
                a = t / 0.45
                profile = (near * (1.0 - a)) + (mid * a)
            else:
                a = (t - 0.45) / 0.55
                profile = (mid * (1.0 - a)) + (outer * a)
            local_detail = texture_detail[:, x, :] * (detail_strength * ((1.0 - t) ** 1.55))
            out[:, x, :] = profile + local_detail
        out = np.clip(out, 0, 255).astype(np.uint8)
        return Image.fromarray(out, mode="RGBA")

    if h <= 0:
        return Image.new("RGBA", (target_width, target_height), tuple(int(x) for x in base_color))
    near_n = max(1, min(h, 2))
    mid_n = max(near_n, min(h, 6))
    far_n = max(mid_n, min(h, 14))
    if orientation == "top":
        near = np.mean(arr[:near_n, :, :], axis=0)
        mid = np.mean(arr[:mid_n, :, :], axis=0)
        far = np.mean(arr[:far_n, :, :], axis=0)
        detail_strip = arr[:far_n, :, :]
    else:
        near = np.mean(arr[h - near_n:h, :, :], axis=0)
        mid = np.mean(arr[h - mid_n:h, :, :], axis=0)
        far = np.mean(arr[h - far_n:h, :, :], axis=0)
        detail_strip = arr[h - far_n:h, :, :]

    if target_width != w:
        near = np.asarray(Image.fromarray(np.clip(near, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, 1), Image.Resampling.BILINEAR), dtype=np.float32)[0, :, :]
        mid = np.asarray(Image.fromarray(np.clip(mid, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, 1), Image.Resampling.BILINEAR), dtype=np.float32)[0, :, :]
        far = np.asarray(Image.fromarray(np.clip(far, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, 1), Image.Resampling.BILINEAR), dtype=np.float32)[0, :, :]
        detail_strip = np.asarray(Image.fromarray(np.clip(detail_strip, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, detail_strip.shape[0]), Image.Resampling.BILINEAR), dtype=np.float32)

    texture = np.asarray(Image.fromarray(np.clip(detail_strip, 0, 255).astype(np.uint8), mode="RGBA").resize((target_width, target_height), Image.Resampling.BILINEAR), dtype=np.float32)
    texture_mean = np.mean(texture, axis=0, keepdims=True)
    texture_detail = texture - texture_mean
    complexity = _v131_edge_strip_complexity(rgba, orientation)
    detail_strength = float(np.clip((complexity / 18.0), 0.05, 0.18))
    out = np.zeros((target_height, target_width, 4), dtype=np.float32)
    outer_mix = np.clip(0.62 + (complexity / 90.0), 0.58, 0.82)
    outer = (far * (1.0 - outer_mix)) + (base_color * outer_mix)
    for y in range(target_height):
        seam_dist = (target_height - 1 - y) if orientation == "top" else y
        t = seam_dist / max(1.0, float(target_height - 1))
        if t <= 0.45:
            a = t / 0.45
            profile = (near * (1.0 - a)) + (mid * a)
        else:
            a = (t - 0.45) / 0.55
            profile = (mid * (1.0 - a)) + (outer * a)
        local_detail = texture_detail[y, :, :] * (detail_strength * ((1.0 - t) ** 1.55))
        out[y, :, :] = profile + local_detail
    out = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def _v131_progressive_edge_fill(fitted: Image.Image, gap: int, orientation: str) -> Image.Image:
    prepared = fitted.convert("RGBA")
    if gap <= 0:
        if orientation in {"left", "right"}:
            return Image.new("RGBA", (1, prepared.height), (0, 0, 0, 0))
        return Image.new("RGBA", (prepared.width, 1), (0, 0, 0, 0))

    if orientation in {"left", "right"}:
        dominant = prepared.width
        depth = max(8, min(dominant, max(24, dominant // 10), max(18, gap // 2)))
        if orientation == "left":
            strip = prepared.crop((0, 0, depth, prepared.height))
            return _v131_profile_gradient_fill(strip, gap, prepared.height, orientation)
        strip = prepared.crop((max(0, prepared.width - depth), 0, prepared.width, prepared.height))
        return _v131_profile_gradient_fill(strip, gap, prepared.height, orientation)

    dominant = prepared.height
    depth = max(8, min(dominant, max(24, dominant // 10), max(18, gap // 2)))
    if orientation == "top":
        strip = prepared.crop((0, 0, prepared.width, depth))
        return _v131_profile_gradient_fill(strip, prepared.width, gap, orientation)
    strip = prepared.crop((0, max(0, prepared.height - depth), prepared.width, prepared.height))
    return _v131_profile_gradient_fill(strip, prepared.width, gap, orientation)


def _v12_small_edge_fill(fitted: Image.Image, gap: int, orientation: str) -> Image.Image:
    return _v131_progressive_edge_fill(fitted, gap, orientation)


def _v131_sanitize_overlap_map(source_rect_width: int, source_rect_height: int, overlap: Dict[str, int]) -> Dict[str, int]:
    vals = {
        "left": max(0, int(overlap.get("left", 0) or 0)),
        "right": max(0, int(overlap.get("right", 0) or 0)),
        "top": max(0, int(overlap.get("top", 0) or 0)),
        "bottom": max(0, int(overlap.get("bottom", 0) or 0)),
    }
    max_x = max(0, int(source_rect_width) - 4)
    max_y = max(0, int(source_rect_height) - 4)

    if vals["left"] + vals["right"] > max_x:
        scale = max_x / max(1.0, float(vals["left"] + vals["right"]))
        vals["left"] = int(math.floor(vals["left"] * scale))
        vals["right"] = int(math.floor(vals["right"] * scale))
    if vals["top"] + vals["bottom"] > max_y:
        scale = max_y / max(1.0, float(vals["top"] + vals["bottom"]))
        vals["top"] = int(math.floor(vals["top"] * scale))
        vals["bottom"] = int(math.floor(vals["bottom"] * scale))
    return vals


def _v131_manual_expand_patch(source: Image.Image, target_width: int, target_height: int) -> Tuple[Image.Image, Tuple[int, int, int, int], Dict[str, Any]]:
    source_rgba = source.convert("RGBA")
    fitted, _ = _resize_to_contain(source_rgba, target_width, target_height)
    placement_plan = _v131_pick_placement(fitted, target_width, target_height)
    x1, y1, x2, y2 = placement_plan["placement"]

    canvas = Image.new("RGBA", (target_width, target_height), _v131_edge_color(fitted))
    left_gap = max(0, x1)
    right_gap = max(0, target_width - x2)
    top_gap = max(0, y1)
    bottom_gap = max(0, target_height - y2)

    if left_gap > 0:
        canvas.alpha_composite(_v131_progressive_edge_fill(fitted, left_gap, "left"), (0, y1))
    if right_gap > 0:
        canvas.alpha_composite(_v131_progressive_edge_fill(fitted, right_gap, "right"), (x2, y1))
    if top_gap > 0:
        canvas.alpha_composite(_v131_progressive_edge_fill(fitted, top_gap, "top"), (x1, 0))
    if bottom_gap > 0:
        canvas.alpha_composite(_v131_progressive_edge_fill(fitted, bottom_gap, "bottom"), (x1, y2))

    canvas.alpha_composite(fitted, (x1, y1))

    inpaint_applied = False
    if cv2 is not None and _v12_env_bool("IMAGE_ENGINE_EXACT_EXPAND_USE_CV2_INPAINT", True):
        try:
            mask = np.zeros((target_height, target_width), dtype=np.uint8)
            if left_gap > 0:
                mask[y1:y2, 0:x1] = 255
            if right_gap > 0:
                mask[y1:y2, x2:target_width] = 255
            if top_gap > 0:
                mask[0:y1, x1:x2] = 255
            if bottom_gap > 0:
                mask[y2:target_height, x1:x2] = 255
            if mask.any():
                seed = np.asarray(canvas.convert("RGB"), dtype=np.uint8)
                max_gap = max(left_gap, right_gap, top_gap, bottom_gap)
                radius = max(3, min(10, int(round(max_gap / 68.0))))
                inpainted = cv2.inpaint(seed, mask, radius, cv2.INPAINT_TELEA)  # type: ignore[union-attr]
                canvas = Image.fromarray(inpainted, mode="RGB").convert("RGBA")
                canvas.alpha_composite(fitted, (x1, y1))
                inpaint_applied = True
        except Exception:
            logger.exception("Falha no inpaint local V13.1. Mantendo scaffold manual.")

    return canvas, (x1, y1, x2, y2), {
        "manual_strategy": "v13_2_single_side_flush_gradient_fill_then_optional_cv2_inpaint_then_original_overlay",
        "cv2_inpaint_applied": bool(inpaint_applied),
        "local_gaps": {"left": left_gap, "right": right_gap, "top": top_gap, "bottom": bottom_gap},
        "placement_plan": placement_plan,
    }


def _v12_manual_expand_patch(source: Image.Image, target_width: int, target_height: int) -> Tuple[Image.Image, Tuple[int, int, int, int], Dict[str, Any]]:
    return _v131_manual_expand_patch(source, target_width, target_height)


def _v131_build_manual_expand_then_enhance_canvas(
    image_bytes: bytes,
    requested_width: int,
    requested_height: int,
    base_width: int,
    base_height: int,
) -> Tuple[bytes, bytes, Dict[str, Any]]:
    with Image.open(io.BytesIO(image_bytes)) as im:
        source = im.convert("RGBA")
        tx1, ty1, tx2, ty2 = _largest_centered_exact_aspect_rect(
            base_width,
            base_height,
            requested_width,
            requested_height,
        )
        target_rect_width = max(1, tx2 - tx1)
        target_rect_height = max(1, ty2 - ty1)

        patch, local_placement, manual_meta = _v131_manual_expand_patch(source, target_rect_width, target_rect_height)
        lx1, ly1, lx2, ly2 = local_placement
        sx1, sy1, sx2, sy2 = tx1 + lx1, ty1 + ly1, tx1 + lx2, ty1 + ly2
        source_rect_width = max(1, sx2 - sx1)
        source_rect_height = max(1, sy2 - sy1)

        left_gap = max(0, sx1 - tx1)
        right_gap = max(0, tx2 - sx2)
        top_gap = max(0, sy1 - ty1)
        bottom_gap = max(0, ty2 - sy2)
        placement_plan = dict(manual_meta.get("placement_plan") or {})
        dominant_side = str(placement_plan.get("dominant_side") or "")

        overlap = {
            "left": _v131_safe_overlap_px(source_rect_width, source_rect_height, left_gap, dominant=dominant_side == "left"),
            "right": _v131_safe_overlap_px(source_rect_width, source_rect_height, right_gap, dominant=dominant_side == "right"),
            "top": _v131_safe_overlap_px(source_rect_width, source_rect_height, top_gap, dominant=dominant_side == "top"),
            "bottom": _v131_safe_overlap_px(source_rect_width, source_rect_height, bottom_gap, dominant=dominant_side == "bottom"),
        }
        axis = str(placement_plan.get("axis") or "")
        minor_shrink = float(np.clip(_v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_MINOR_OVERLAP_SHRINK", 0.88), 0.55, 1.0))
        for side in ("left", "right", "top", "bottom"):
            if overlap[side] <= 0:
                continue
            if side != dominant_side and ((axis == "horizontal" and side in {"left", "right"}) or (axis == "vertical" and side in {"top", "bottom"})):
                overlap[side] = int(round(overlap[side] * minor_shrink))
        overlap = _v131_sanitize_overlap_map(source_rect_width, source_rect_height, overlap)

        canvas = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 255))
        canvas.alpha_composite(patch, (tx1, ty1))

        mask_l = Image.new("L", (base_width, base_height), 255)
        draw = ImageDraw.Draw(mask_l)
        editable_regions: Dict[str, Dict[str, int]] = {}

        if left_gap > 0:
            rect = (tx1, sy1, min(sx2, sx1 + overlap["left"]), sy2)
            draw.rectangle(rect, fill=0)
            editable_regions["left"] = {"x1": int(rect[0]), "y1": int(rect[1]), "x2": int(rect[2]), "y2": int(rect[3])}
        if right_gap > 0:
            rect = (max(sx1, sx2 - overlap["right"]), sy1, tx2, sy2)
            draw.rectangle(rect, fill=0)
            editable_regions["right"] = {"x1": int(rect[0]), "y1": int(rect[1]), "x2": int(rect[2]), "y2": int(rect[3])}
        if top_gap > 0:
            rect = (sx1, ty1, sx2, min(sy2, sy1 + overlap["top"]))
            draw.rectangle(rect, fill=0)
            editable_regions["top"] = {"x1": int(rect[0]), "y1": int(rect[1]), "x2": int(rect[2]), "y2": int(rect[3])}
        if bottom_gap > 0:
            rect = (sx1, max(sy1, sy2 - overlap["bottom"]), sx2, ty2)
            draw.rectangle(rect, fill=0)
            editable_regions["bottom"] = {"x1": int(rect[0]), "y1": int(rect[1]), "x2": int(rect[2]), "y2": int(rect[3])}

        mask = Image.merge("RGBA", (mask_l, mask_l, mask_l, mask_l))

        source_ratio = source.width / max(1.0, float(source.height))
        target_ratio = requested_width / max(1.0, float(requested_height))
        ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))

        meta: Dict[str, Any] = {
            "requested_width": requested_width,
            "requested_height": requested_height,
            "base_width": base_width,
            "base_height": base_height,
            "target_rect": {"x1": tx1, "y1": ty1, "x2": tx2, "y2": ty2, "width": target_rect_width, "height": target_rect_height},
            "source_rect": {"x1": sx1, "y1": sy1, "x2": sx2, "y2": sy2, "width": source_rect_width, "height": source_rect_height},
            "protected_rect": {
                "x1": sx1 + overlap["left"],
                "y1": sy1 + overlap["top"],
                "x2": sx2 - overlap["right"],
                "y2": sy2 - overlap["bottom"],
                "width": max(1, source_rect_width - overlap["left"] - overlap["right"]),
                "height": max(1, source_rect_height - overlap["top"] - overlap["bottom"]),
            },
            "overlap": overlap,
            "gaps": {"left": left_gap, "right": right_gap, "top": top_gap, "bottom": bottom_gap},
            "ratio_delta": float(ratio_delta),
            "scaffold_used": True,
            "manual_scaffold": manual_meta,
            "mask_strategy": "v13_2_single_side_flush_bias_then_masked_ai_enhance_external_bands_only",
            "editable_regions": editable_regions,
        }
        return _encode_png_bytes(canvas), _encode_png_bytes(mask), meta


def _v12_build_manual_expand_then_enhance_canvas(
    image_bytes: bytes,
    requested_width: int,
    requested_height: int,
    base_width: int,
    base_height: int,
) -> Tuple[bytes, bytes, Dict[str, Any]]:
    return _v131_build_manual_expand_then_enhance_canvas(
        image_bytes=image_bytes,
        requested_width=requested_width,
        requested_height=requested_height,
        base_width=base_width,
        base_height=base_height,
    )


def _v131_build_manual_enhance_prompt(requested_width: int, requested_height: int, canvas_meta: Dict[str, Any]) -> str:
    gaps = canvas_meta.get("gaps") or {}
    overlap = canvas_meta.get("overlap") or {}
    placement_plan = (canvas_meta.get("manual_scaffold") or {}).get("placement_plan") or {}
    dominant_side = placement_plan.get("dominant_side") or "none"
    axis = placement_plan.get("axis") or "none"
    return (
        "Você recebeu uma peça publicitária que já foi expandida manualmente para um canvas maior. "
        "A tarefa é apenas refinar tecnicamente as faixas externas marcadas pela máscara. "
        "Não recrie a peça. Não altere a composição principal. Não mexa em textos, logos, CTA, datas, local, ícones, rostos, produto, oferta, boxes ou hierarquia visual. "
        "Use como autoridade máxima o preenchimento manual já existente. Corrija só sinais de esticamento, emendas, smears, texturas artificiais e pequenas descontinuidades. "
        "É proibido inventar elementos novos. Não adicione estrelas, brilhos, partículas, objetos, ornamentos, letras, símbolos, gradientes chamativos ou fundos criativos. "
        "Se uma área nova estiver simples, mantenha simples. O objetivo é parecer a mesma arte original adaptada de resolução, de forma quase imperceptível. "
        "Não use blur genérico. Não duplique blocos. Não espelhe. Não crie textos fantasmas. "
        f"Resolução final desejada: {requested_width}x{requested_height}. "
        f"Eixo dominante da expansão: {axis}. Lado dominante: {dominant_side}. "
        f"Áreas externas aproximadas: esquerda={gaps.get('left', 0)}px, direita={gaps.get('right', 0)}px, topo={gaps.get('top', 0)}px, base={gaps.get('bottom', 0)}px. "
        f"Faixas mínimas de transição editáveis: esquerda={overlap.get('left', 0)}px, direita={overlap.get('right', 0)}px, topo={overlap.get('top', 0)}px, base={overlap.get('bottom', 0)}px."
    )


def _v12_build_manual_enhance_prompt(requested_width: int, requested_height: int, canvas_meta: Dict[str, Any]) -> str:
    return _v131_build_manual_enhance_prompt(requested_width, requested_height, canvas_meta)


def _v131_extract_side_scores(diagnostics: Dict[str, Any]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for item in diagnostics.get("seam_details") or []:
        side = str(item.get("side") or "").strip().lower()
        if not side:
            continue
        try:
            score = float(item.get("score", 999.0) or 999.0)
        except Exception:
            score = 999.0
        current = scores.get(side)
        if current is None or score < current:
            scores[side] = score
    return scores


def _v131_choose_ai_sides(manual_diagnostics: Dict[str, Any], ai_diagnostics: Dict[str, Any], canvas_meta: Dict[str, Any]) -> Tuple[List[str], Dict[str, Any]]:
    gaps = canvas_meta.get("gaps") or {}
    placement_plan = (canvas_meta.get("manual_scaffold") or {}).get("placement_plan") or {}
    dominant_side = str(placement_plan.get("dominant_side") or "")
    manual_scores = _v131_extract_side_scores(manual_diagnostics)
    ai_scores = _v131_extract_side_scores(ai_diagnostics)
    flagged = {str(s).lower() for s in (ai_diagnostics.get("flagged_sides") or [])}
    selected: List[str] = []
    side_debug: Dict[str, Any] = {}

    ai_generated_penalty = float(ai_diagnostics.get("generated_region_penalty", 0.0) or 0.0)
    manual_generated_penalty = float(manual_diagnostics.get("generated_region_penalty", 0.0) or 0.0)
    if ai_generated_penalty > max(manual_generated_penalty + 5.0, 13.5):
        return [], {
            "reason": "ai_generated_penalty_too_high",
            "manual_generated_region_penalty": round(manual_generated_penalty, 3),
            "ai_generated_region_penalty": round(ai_generated_penalty, 3),
        }

    for side in ("left", "right", "top", "bottom"):
        if int(gaps.get(side, 0) or 0) <= 0:
            continue
        manual_score = float(manual_scores.get(side, manual_diagnostics.get("seam_max", 999.0) or 999.0))
        ai_score = float(ai_scores.get(side, ai_diagnostics.get("seam_max", 999.0) or 999.0))
        is_dominant = side == dominant_side
        margin = 1.35 if is_dominant else 0.70
        improved = ai_score <= (manual_score + margin)
        blocked = side in flagged and ai_score > (manual_score - 0.35)
        if improved and not blocked:
            selected.append(side)
        side_debug[side] = {
            "manual_score": round(manual_score, 3),
            "ai_score": round(ai_score, 3),
            "margin": round(margin, 3),
            "dominant": bool(is_dominant),
            "flagged": bool(side in flagged),
            "selected": bool(improved and not blocked),
        }
    return selected, {"dominant_side": dominant_side, "side_debug": side_debug}


def _v131_blend_selected_ai_bands(manual_final_bytes: bytes, ai_final_bytes: bytes, canvas_meta: Dict[str, Any], sides: List[str]) -> bytes:
    if not sides:
        return manual_final_bytes
    with Image.open(io.BytesIO(manual_final_bytes)) as manual_im, Image.open(io.BytesIO(ai_final_bytes)) as ai_im:
        manual_rgba = manual_im.convert("RGBA")
        ai_rgba = ai_im.convert("RGBA")
        width, height = manual_rgba.size
        if ai_rgba.size != (width, height):
            ai_rgba = ai_rgba.resize((width, height), Image.Resampling.LANCZOS)

        source_x1, source_y1, source_x2, source_y2 = _final_space_source_rect_from_canvas_meta(width, height, canvas_meta)
        feather = max(4, min(24, _v12_env_int("IMAGE_ENGINE_EXACT_EXPAND_HYBRID_FEATHER_PX", 14)))
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)

        if "left" in sides and source_x1 > 0:
            draw.rectangle((0, 0, min(width, source_x1 + feather), height), fill=255)
        if "right" in sides and source_x2 < width:
            draw.rectangle((max(0, source_x2 - feather), 0, width, height), fill=255)
        if "top" in sides and source_y1 > 0:
            draw.rectangle((0, 0, width, min(height, source_y1 + feather)), fill=255)
        if "bottom" in sides and source_y2 < height:
            draw.rectangle((0, max(0, source_y2 - feather), width, height), fill=255)

        mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, feather // 2)))
        blended = Image.composite(ai_rgba, manual_rgba, mask)
        return _encode_png_bytes(blended)


def _v131_build_result(
    *,
    final_bytes: bytes,
    image_bytes: bytes,
    canvas_meta: Dict[str, Any],
    diagnostics: Dict[str, Any],
    selected_profile: str,
    attempts: List[Dict[str, Any]],
    api_calls_used: int,
    effective_quality: str,
    motor: str,
    engine_id: str,
) -> Dict[str, Any]:
    score = _v131_exact_expand_score(diagnostics)
    meta = dict(canvas_meta)
    fallback_profiles = {"v13_2_manual_only", "v13_2_manual_after_ai_error", "v13_2_manual_selected_after_ai_guard"}
    meta.update({
        "profile": selected_profile,
        "quality_score": round(float(diagnostics.get("quality_score", 999.0)), 3),
        "selection_score": round(float(score), 3),
        "seam_score": round(float(diagnostics.get("seam_score", 999.0)), 3),
        "seam_max": round(float(diagnostics.get("seam_max", 999.0)), 3),
        "border_score": round(float(diagnostics.get("border_score", 0.0)), 3),
        "generated_region_penalty": round(float(diagnostics.get("generated_region_penalty", 0.0)), 3),
        "seam_details": list(diagnostics.get("seam_details") or []),
        "flagged_sides": list(diagnostics.get("flagged_sides") or []),
        "fallback_applied": selected_profile in fallback_profiles,
        "fallback_improved": selected_profile == "v13_2_hybrid_ai_manual_accepted",
        "fallback_details": {},
        "attempt_index": 2 if selected_profile == "v13_2_hybrid_ai_manual_accepted" else (1 if api_calls_used else 0),
        "strategy": "v13_2_single_side_flush_bias_manual_expand_then_masked_ai_enhance_guarded",
        "api_calls_used": int(api_calls_used),
        "max_ai_attempts": 1,
        "effective_quality": effective_quality,
        "cost_control": "single_ai_enhance_call_with_manual_guard_and_optional_hybrid_blend",
        "algorithm_version": "v13_2_single_side_flush_bias_manual_expand_then_ai_enhance",
        "attempts": attempts,
        "selected_quality_score": round(float(diagnostics.get("quality_score", 999.0)), 3),
        "selected_selection_score": round(float(score), 3),
        "selected_attempt": 2 if selected_profile == "v13_2_hybrid_ai_manual_accepted" else (1 if api_calls_used and selected_profile == "v13_2_ai_enhance_accepted" else 0),
        "selected_profile": selected_profile,
        "selected_seam_score": round(float(diagnostics.get("seam_score", 999.0)), 3),
        "selected_seam_max": round(float(diagnostics.get("seam_max", 999.0)), 3),
    })
    return {
        "engine_id": engine_id,
        "motor": motor,
        "url": _result_url_from_image_bytes(final_bytes, "image/png"),
        "exact_canvas_expand": meta,
    }


def _v12_build_result(
    *,
    final_bytes: bytes,
    image_bytes: bytes,
    canvas_meta: Dict[str, Any],
    diagnostics: Dict[str, Any],
    selected_profile: str,
    attempts: List[Dict[str, Any]],
    api_calls_used: int,
    effective_quality: str,
    motor: str,
    engine_id: str,
) -> Dict[str, Any]:
    return _v131_build_result(
        final_bytes=final_bytes,
        image_bytes=image_bytes,
        canvas_meta=canvas_meta,
        diagnostics=diagnostics,
        selected_profile=selected_profile,
        attempts=attempts,
        api_calls_used=api_calls_used,
        effective_quality=effective_quality,
        motor=motor,
        engine_id=engine_id,
    )


async def _expand_image_to_exact_size_with_ai(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    openai_quality: str,
    requested_width: int,
    requested_height: int,
) -> Dict[str, Any]:
    """
    Override V13.1.
    Fluxo:
    1. scaffold manual com viés para um lado;
    2. IA só para refinar faixas externas;
    3. se IA não for segura no quadro inteiro, blend híbrido só nos lados melhores;
    4. se piorar/inventar, volta para manual protegido.
    """
    base_width, base_height = _choose_best_supported_base_size(requested_width, requested_height)
    manual_canvas_bytes, mask_bytes, canvas_meta = _v131_build_manual_expand_then_enhance_canvas(
        image_bytes=image_bytes,
        requested_width=requested_width,
        requested_height=requested_height,
        base_width=base_width,
        base_height=base_height,
    )

    manual_final_bytes = _finalize_exact_size_ai_expand(
        expanded_canvas_bytes=manual_canvas_bytes,
        preserved_source_bytes=image_bytes,
        canvas_meta=canvas_meta,
    )
    manual_diagnostics = _exact_expand_quality_diagnostics(
        final_bytes=manual_final_bytes,
        preserved_source_bytes=image_bytes,
        canvas_meta=canvas_meta,
    )
    manual_score = _v131_exact_expand_score(manual_diagnostics)
    attempts: List[Dict[str, Any]] = [{
        "attempt_index": 0,
        "profile": "v13_2_manual_expand_scaffold",
        "api_calls": 0,
        "selection_score": round(float(manual_score), 3),
        "quality_score": round(float(manual_diagnostics.get("quality_score", 999.0)), 3),
        "seam_score": round(float(manual_diagnostics.get("seam_score", 999.0)), 3),
        "seam_max": round(float(manual_diagnostics.get("seam_max", 999.0)), 3),
        "generated_region_penalty": round(float(manual_diagnostics.get("generated_region_penalty", 0.0)), 3),
        "accepted_floor": True,
    }]

    effective_quality = (os.getenv("IMAGE_ENGINE_EXACT_EXPAND_QUALITY") or openai_quality or "high").strip().lower()
    if effective_quality not in {"low", "medium", "high"}:
        effective_quality = "high"

    if _v12_env_bool("IMAGE_ENGINE_EXACT_EXPAND_LOCAL_ONLY", False) or not openai_key:
        return _v131_build_result(
            final_bytes=manual_final_bytes,
            image_bytes=image_bytes,
            canvas_meta=canvas_meta,
            diagnostics=manual_diagnostics,
            selected_profile="v13_2_manual_only",
            attempts=attempts,
            api_calls_used=0,
            effective_quality=effective_quality,
            motor="Expansão manual V13.2 com camada original preservada",
            engine_id="local_exact_canvas_expand_v13_2_manual",
        )

    ai_error: Optional[str] = None
    ai_final_bytes: Optional[bytes] = None
    ai_diagnostics: Optional[Dict[str, Any]] = None
    ai_score = float("inf")

    try:
        ai_result = await _edit_openai_image(
            client=client,
            image_bytes=manual_canvas_bytes,
            filename="manual-expanded-enhance-bands-v13-1.png",
            content_type="image/png",
            final_prompt=_v131_build_manual_enhance_prompt(
                requested_width=requested_width,
                requested_height=requested_height,
                canvas_meta=canvas_meta,
            ),
            aspect_ratio=_base_size_to_aspect_ratio(base_width, base_height),
            quality=effective_quality,
            openai_key=openai_key,
            openai_size=f"{base_width}x{base_height}",
            mask_bytes=mask_bytes,
            input_fidelity="high",
        )
        ai_canvas_bytes, _ = _image_bytes_from_result_url(ai_result["url"])
        ai_final_bytes = _finalize_exact_size_ai_expand(
            expanded_canvas_bytes=ai_canvas_bytes,
            preserved_source_bytes=image_bytes,
            canvas_meta=canvas_meta,
        )
        ai_diagnostics = _exact_expand_quality_diagnostics(
            final_bytes=ai_final_bytes,
            preserved_source_bytes=image_bytes,
            canvas_meta=canvas_meta,
        )
        ai_score = _v131_exact_expand_score(ai_diagnostics)
        attempts.append({
            "attempt_index": 1,
            "profile": "v13_2_ai_enhance_candidate",
            "api_calls": 1,
            "selection_score": round(float(ai_score), 3),
            "quality_score": round(float(ai_diagnostics.get("quality_score", 999.0)), 3),
            "seam_score": round(float(ai_diagnostics.get("seam_score", 999.0)), 3),
            "seam_max": round(float(ai_diagnostics.get("seam_max", 999.0)), 3),
            "generated_region_penalty": round(float(ai_diagnostics.get("generated_region_penalty", 0.0)), 3),
            "flagged_sides": list(ai_diagnostics.get("flagged_sides") or []),
        })
    except Exception as exc:
        logger.exception("Falha no enhance IA V13.2. Entregando expansão manual protegida.")
        ai_error = f"{type(exc).__name__}: {str(exc)[:420]}"
        attempts.append({
            "attempt_index": 1,
            "profile": "v13_2_ai_enhance_failed",
            "api_calls": 1,
            "error": ai_error,
        })

    if ai_final_bytes is not None and ai_diagnostics is not None:
        force_ai = _v12_env_bool("IMAGE_ENGINE_EXACT_EXPAND_FORCE_AI_RESULT", False)
        local_gen = float(manual_diagnostics.get("generated_region_penalty", 0.0) or 0.0)
        ai_gen = float(ai_diagnostics.get("generated_region_penalty", 0.0) or 0.0)
        local_seam_max = float(manual_diagnostics.get("seam_max", 999.0) or 999.0)
        ai_seam_max = float(ai_diagnostics.get("seam_max", 999.0) or 999.0)
        ai_not_too_creative = ai_gen <= max(local_gen + 4.2, 12.5)
        ai_not_too_seamy = ai_seam_max <= max(local_seam_max + 4.0, 13.5)
        ai_score_ok = ai_score <= (manual_score + _v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_AI_ACCEPT_MARGIN", 0.95))

        if force_ai or (ai_score_ok and ai_not_too_creative and ai_not_too_seamy):
            attempts[-1]["accepted"] = True
            return _v131_build_result(
                final_bytes=ai_final_bytes,
                image_bytes=image_bytes,
                canvas_meta=canvas_meta,
                diagnostics=ai_diagnostics,
                selected_profile="v13_2_ai_enhance_accepted",
                attempts=attempts,
                api_calls_used=1,
                effective_quality=effective_quality,
                motor="OpenAI GPT Image 1.5 Edit + Enhance V13.2 sobre expansão manual com viés para um lado e flush lateral",
                engine_id="openai_exact_canvas_expand_v13_2_single_side_enhance",
            )

        selected_sides, side_selection_debug = _v131_choose_ai_sides(manual_diagnostics, ai_diagnostics, canvas_meta)
        if selected_sides:
            hybrid_final_bytes = _v131_blend_selected_ai_bands(manual_final_bytes, ai_final_bytes, canvas_meta, selected_sides)
            hybrid_diagnostics = _exact_expand_quality_diagnostics(
                final_bytes=hybrid_final_bytes,
                preserved_source_bytes=image_bytes,
                canvas_meta=canvas_meta,
            )
            hybrid_score = _v131_exact_expand_score(hybrid_diagnostics)
            hybrid_gen = float(hybrid_diagnostics.get("generated_region_penalty", 0.0) or 0.0)
            hybrid_seam_max = float(hybrid_diagnostics.get("seam_max", 999.0) or 999.0)
            attempts.append({
                "attempt_index": 2,
                "profile": "v13_2_hybrid_candidate",
                "api_calls": 1,
                "selected_sides": selected_sides,
                "selection_score": round(float(hybrid_score), 3),
                "quality_score": round(float(hybrid_diagnostics.get("quality_score", 999.0)), 3),
                "seam_score": round(float(hybrid_diagnostics.get("seam_score", 999.0)), 3),
                "seam_max": round(float(hybrid_seam_max), 3),
                "generated_region_penalty": round(float(hybrid_gen), 3),
                "hybrid_debug": side_selection_debug,
            })
            hybrid_ok = (
                hybrid_score <= (manual_score + _v12_env_float("IMAGE_ENGINE_EXACT_EXPAND_HYBRID_ACCEPT_MARGIN", 0.55))
                and hybrid_gen <= max(local_gen + 3.5, 12.0)
                and hybrid_seam_max <= max(local_seam_max + 3.2, 12.8)
                and hybrid_score <= (ai_score + 0.65)
            )
            if hybrid_ok:
                attempts[-1]["accepted"] = True
                return _v131_build_result(
                    final_bytes=hybrid_final_bytes,
                    image_bytes=image_bytes,
                    canvas_meta=canvas_meta,
                    diagnostics=hybrid_diagnostics,
                    selected_profile="v13_2_hybrid_ai_manual_accepted",
                    attempts=attempts,
                    api_calls_used=1,
                    effective_quality=effective_quality,
                    motor="Expansão híbrida V13.2 com scaffold manual + blend seletivo das bandas melhoradas pela IA",
                    engine_id="hybrid_exact_canvas_expand_v13_2_single_side",
                )
            attempts[-1]["accepted"] = False
            attempts[-1]["rejection_reason"] = {
                "manual_score": round(float(manual_score), 3),
                "ai_score": round(float(ai_score), 3),
                "hybrid_score": round(float(hybrid_score), 3),
                "selected_sides": selected_sides,
                "hybrid_debug": side_selection_debug,
            }

        attempts[-1]["accepted"] = False
        attempts[-1]["rejection_reason"] = {
            "ai_score_ok": bool(ai_score_ok),
            "ai_not_too_creative": bool(ai_not_too_creative),
            "ai_not_too_seamy": bool(ai_not_too_seamy),
            "manual_score": round(float(manual_score), 3),
            "ai_score": round(float(ai_score), 3),
            "manual_generated_region_penalty": round(float(local_gen), 3),
            "ai_generated_region_penalty": round(float(ai_gen), 3),
            "manual_seam_max": round(float(local_seam_max), 3),
            "ai_seam_max": round(float(ai_seam_max), 3),
        }

    result = _v131_build_result(
        final_bytes=manual_final_bytes,
        image_bytes=image_bytes,
        canvas_meta=canvas_meta,
        diagnostics=manual_diagnostics,
        selected_profile="v13_2_manual_selected_after_ai_guard" if ai_final_bytes is not None else "v13_2_manual_after_ai_error",
        attempts=attempts,
        api_calls_used=1 if ai_final_bytes is not None or ai_error else 0,
        effective_quality=effective_quality,
        motor="Expansão manual V13.2 preservada após guard contra invenção da IA",
        engine_id="local_exact_canvas_expand_v13_2_guarded",
    )
    meta = dict(result.get("exact_canvas_expand") or {})
    if ai_error:
        meta["ai_error"] = ai_error
    result["exact_canvas_expand"] = meta
    return result

# <<< IMAGE_ENGINE_EXACT_CANVAS_V12_MANUAL_EXPAND_THEN_AI_ENHANCE
