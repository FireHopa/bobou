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
from PIL import Image, ImageOps, ImageChops, ImageDraw, ImageFilter, UnidentifiedImageError

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

from .image_local_edit import (
    analyze_all_regions_with_openai,
    analyze_region_with_openai,
    build_mask_from_analysis,
    extract_edit_instruction_info,
    recover_localized_analysis_from_candidates,
    render_all_local_text_replacements,
    render_local_text_fallback,
    should_use_local_text_erase,
    list_local_text_candidate_rects,
    should_use_local_text_render,
    should_use_localized_edit,
)
from .image_canvas_smart_expand import (
    build_smart_expand_assets,
    build_smart_expand_prompt,
    overlay_hard_preserve_regions,
)
from .image_canvas_exact_size import (
    build_exact_size_expand_assets,
    choose_exact_size_canvas_plan,
    build_exact_size_expand_prompt,
    finalize_exact_size_expand,
    is_native_supported_exact_size,
    resolve_exact_dimensions_request,
)
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
        "transformar essa imagem em",
        "converter para",
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
    canvas.paste(fitted, (x1, y1))

    if x1 > 0:
        strip_width = min(fitted.width, max(18, fitted.width // 12))
        left_source = fitted.crop((0, 0, strip_width, fitted.height))
        right_source = fitted.crop((fitted.width - strip_width, 0, fitted.width, fitted.height))
        left_fill = ImageOps.mirror(left_source).resize((x1, fitted.height), Image.Resampling.LANCZOS)
        right_fill = ImageOps.mirror(right_source).resize((target_width - x2, fitted.height), Image.Resampling.LANCZOS)
        blur_radius = max(2, min(10, x1 // 18))
        left_fill = left_fill.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        right_fill = right_fill.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        canvas.paste(left_fill, (0, y1))
        canvas.paste(right_fill, (x2, y1))

    if y1 > 0:
        strip_height = min(fitted.height, max(18, fitted.height // 12))
        top_source = fitted.crop((0, 0, fitted.width, strip_height))
        bottom_source = fitted.crop((0, fitted.height - strip_height, fitted.width, fitted.height))
        top_fill = ImageOps.flip(top_source).resize((fitted.width, y1), Image.Resampling.LANCZOS)
        bottom_fill = ImageOps.flip(bottom_source).resize((fitted.width, target_height - y2), Image.Resampling.LANCZOS)
        blur_radius = max(2, min(10, y1 // 18))
        top_fill = top_fill.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        bottom_fill = bottom_fill.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        canvas.paste(top_fill, (x1, 0))
        canvas.paste(bottom_fill, (x1, y2))

    # resolve corners when both axes expand
    if x1 > 0 and y1 > 0:
        corners = [
            ((0, 0, x1, y1), fitted.getpixel((0, 0))),
            ((x2, 0, target_width, y1), fitted.getpixel((fitted.width - 1, 0))),
            ((0, y2, x1, target_height), fitted.getpixel((0, fitted.height - 1))),
            ((x2, y2, target_width, target_height), fitted.getpixel((fitted.width - 1, fitted.height - 1))),
        ]
        draw = ImageDraw.Draw(canvas)
        for rect, color in corners:
            draw.rectangle(rect, fill=color)

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
        "expand_canvas_with_ai"
        if expand_without_crop_needed
        else "deterministic_resize"
    )
    return {
        "prompt_final": "",
        "negative_prompt": "",
        "creative_direction": (
            "Fluxo rápido de adaptação de canvas sem refinamento textual."
            if expand_without_crop_needed
            else "Fluxo rápido de resize determinístico sem chamadas extras de linguagem."
        ),
        "layout_notes": f"Saída final orientada para {target_label}.",
        "preservation_rules": (
            "Preservar a peça original e expandir apenas as áreas externas necessárias."
            if expand_without_crop_needed
            else "Preservar a composição e apenas ajustar o resize final."
        ),
        "edit_strategy": flow_label,
        "micro_detail_rules": "",
        "consistency_rules": (
            "Sem blur, sem espelhamento, sem duplicação artificial."
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
    expand_width, expand_height = _choose_best_supported_base_size(requested_width, requested_height)

    text_rects = list_local_text_candidate_rects(image_bytes)
    assets = build_smart_expand_assets(
        image_bytes=image_bytes,
        target_width=expand_width,
        target_height=expand_height,
        text_rects=text_rects,
        strength=strength,
    )

    result = await _edit_openai_image(
        client=client,
        image_bytes=assets["canvas_bytes"],
        filename="smart-canvas-expand.png",
        content_type="image/png",
        final_prompt=build_smart_expand_prompt(
            requested_width=requested_width,
            requested_height=requested_height,
            placement=assets["placement"],
            preserve_union=assets["preserve_union"],
            strength=strength,
        ),
        aspect_ratio=_base_size_to_aspect_ratio(expand_width, expand_height),
        quality=openai_quality,
        openai_key=openai_key,
        openai_size=f"{expand_width}x{expand_height}",
        mask_bytes=assets["mask_bytes"],
        input_fidelity="high",
    )

    expanded_bytes, _ = _image_bytes_from_result_url(result["url"])
    finalized_bytes = overlay_hard_preserve_regions(
        expanded_bytes=expanded_bytes,
        source_canvas_bytes=assets["canvas_bytes"],
        hard_boxes=assets["hard_preserve_boxes"],
        feather_px=assets["hard_feather"],
    )

    next_result = dict(result)
    next_result["url"] = _result_url_from_image_bytes(finalized_bytes, "image/png")
    next_result["expanded_canvas"] = {
        "width": expand_width,
        "height": expand_height,
        "placement": assets["placement"],
        "preserve_union": assets["preserve_union"],
        "hard_preserve_boxes": assets["hard_preserve_boxes"],
        "strategy": "smart_recompose",
        "strength": strength,
    }
    next_result["motor"] = f"{result.get('motor', 'Imagem')} + Recompose sem crop"
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
    text_rects = list_local_text_candidate_rects(image_bytes)
    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=requested_width,
        target_height=requested_height,
        supported_sizes=SUPPORTED_BASE_SIZES,
        text_rects=text_rects,
        strength="medium",
        instruction_text=instruction_text,
    )
    plan = assets["plan"]

    if assets.get("strategy") == "commercial_layout_deterministic" and not bool(assets.get("composition_ok", True)):
        reason = assets.get("composition_reason") or "stage=layout_base reason=deterministic_composition_incomplete"
        raise RuntimeError(
            "A recomposição determinística do layout não atingiu confiança suficiente para entrega final. "
            "Nenhum preview intermediário foi devolvido e o fluxo não pode cair em generativa ampla nesse modo. "
            f"Motivo: {reason}"
        )

    if assets.get("direct_result_bytes"):
        direct_bytes = bytes(assets["direct_result_bytes"])
        next_result = {
            "url": _result_url_from_image_bytes(direct_bytes, "image/png"),
            "motor": "Layout comercial determinístico",
            "engine_id": "layout_first_exact_deterministic",
            "expanded_canvas": {
                "width": int(plan["base_width"]),
                "height": int(plan["base_height"]),
                "working_width": int(plan["working_width"]),
                "working_height": int(plan["working_height"]),
                "crop_rect": plan["crop_rect"],
                "placement": assets["placement"],
                "preserve_union": assets.get("preserve_union"),
                "hard_preserve_boxes": assets.get("hard_preserve_boxes"),
                "strategy": "commercial_layout_deterministic",
                "exact_strategy": assets.get("strategy") or plan.get("exact_strategy"),
                "layout_first_non_native": True,
                "needs_upscale_after_crop": False,
                "composition_ok": bool(assets.get("composition_ok", True)),
                "composition_reason": assets.get("composition_reason") or "ok",
                "debug_steps": list(assets.get("debug_steps") or []),
            },
        }
        return next_result

    result = await _edit_openai_image(
        client=client,
        image_bytes=assets["canvas_bytes"],
        filename="exact-size-expand.png",
        content_type="image/png",
        final_prompt=build_exact_size_expand_prompt(
            target_width=requested_width,
            target_height=requested_height,
            plan=plan,
            placement=assets["placement"],
            preserve_union=assets.get("preserve_union"),
            strength=assets.get("strength", "medium"),
            profile_info=assets.get("profile"),
            instruction_text=instruction_text,
        ),
        aspect_ratio=_base_size_to_aspect_ratio(plan["base_width"], plan["base_height"]),
        quality=openai_quality,
        openai_key=openai_key,
        openai_size=f"{plan['base_width']}x{plan['base_height']}",
        mask_bytes=assets["mask_bytes"],
        input_fidelity="high",
    )

    expanded_bytes, _ = _image_bytes_from_result_url(result["url"])
    finalized_bytes = finalize_exact_size_expand(
        expanded_bytes=expanded_bytes,
        source_canvas_bytes=assets["canvas_bytes"],
        plan=plan,
        hard_preserve_boxes=assets.get("hard_preserve_boxes"),
        hard_feather=int(assets.get("hard_feather") or 8),
        hard_preserve_limits=assets.get("hard_preserve_limits"),
    )

    next_result = dict(result)
    next_result["url"] = _result_url_from_image_bytes(finalized_bytes, "image/png")
    next_result["expanded_canvas"] = {
        "width": int(plan["base_width"]),
        "height": int(plan["base_height"]),
        "working_width": int(plan["working_width"]),
        "working_height": int(plan["working_height"]),
        "crop_rect": plan["crop_rect"],
        "placement": assets["placement"],
        "preserve_union": assets.get("preserve_union"),
        "hard_preserve_boxes": assets.get("hard_preserve_boxes"),
        "strategy": "exact_size_non_native_smart_crop",
        "exact_strategy": assets.get("strategy") or plan.get("exact_strategy"),
        "layout_first_non_native": bool((assets.get("profile") or {}).get("layout_first_non_native")),
        "needs_upscale_after_crop": bool(plan.get("needs_upscale_after_crop")),
        "composition_ok": bool(assets.get("composition_ok", True)),
        "composition_reason": assets.get("composition_reason") or "ok",
        "debug_steps": list(assets.get("debug_steps") or []),
    }
    next_result["motor"] = f"{result.get('motor', 'Imagem')} + Exact Size"
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

    if aspect_adaptation_needed:
        return None

    if normalized_allow_resize_crop:
        base_target = _resize_to_cover(original_rgba, target_width, target_height)
        edited_target = _resize_to_cover(edited_rgba, target_width, target_height)
        mask_target = _resize_mask_to_cover(mask_in_edit_space, target_width, target_height)
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
                if aspect_adaptation_needed:
                    raise ValueError(
                        "O resize exato sem crop exige expansão real de canvas por IA. "
                        "O fallback com blur, espelhamento ou duplicação foi desativado."
                    )
                if normalized_allow_resize_crop:
                    result = _resize_to_cover(prepared, target_width, target_height)
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
        f"Preservar enquadramento original: {'sim' if payload.preserve_original_frame else 'não'}",
        f"Aplicar resize exato: {'sim' if payload.allow_resize_crop else 'não'}",
    ]

    if payload.allow_resize_crop and payload.width and payload.height:
        parts.append(f"Tamanho final customizado: {payload.width}x{payload.height}")

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
- tamanho final desejado: {_size_label(payload.width, payload.height) if payload.allow_resize_crop and payload.width and payload.height else 'manter o tamanho original da base'}
- preservar enquadramento original: {'sim' if payload.preserve_original_frame else 'não'}

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
- tamanho final desejado: {_size_label(payload.width, payload.height) if payload.allow_resize_crop and payload.width and payload.height else 'manter o tamanho original da base'}
- preservar enquadramento original: {'sim' if payload.preserve_original_frame else 'não'}

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
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    preserve_original_frame: bool = Form(False),
    allow_resize_crop: bool = Form(False),
    edit_scope: str = Form("auto"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY não configurada.")

    image_bytes = await reference_image.read()
    image_filename = reference_image.filename or "reference.png"
    image_content_type = _guess_image_content_type(image_filename, reference_image.content_type)

    body = ImageEditRequest(
        formato=formato,
        qualidade=qualidade,
        instrucoes_edicao=instrucoes_edicao,
        width=width,
        height=height,
        preserve_original_frame=preserve_original_frame,
        allow_resize_crop=allow_resize_crop,
        edit_scope=edit_scope,
    )

    body.edit_scope = _normalize_edit_scope(body.edit_scope)
    body.allow_resize_crop = bool(body.allow_resize_crop and not body.preserve_original_frame)

    try:
        _validate_reference_image(image_bytes, image_content_type)
        if not body.instrucoes_edicao.strip():
            raise ValueError("As instruções de edição são obrigatórias.")
        source_width, source_height = _read_image_dimensions(image_bytes)
        requested_dimensions = _resolve_target_dimensions(body.width, body.height)
        exact_request_dimensions = resolve_exact_dimensions_request(
            body.width,
            body.height,
            body.instrucoes_edicao,
        )
        final_target_dimensions = exact_request_dimensions or _resolve_edit_target_dimensions(body)
        aspect_ratio = _normalize_aspect_ratio(body.formato)
        openai_quality = _normalize_quality(body.qualidade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    instruction_info = extract_edit_instruction_info(body.instrucoes_edicao)
    exact_size_non_native = bool(
        exact_request_dimensions
        and not is_native_supported_exact_size(
            exact_request_dimensions[0],
            exact_request_dimensions[1],
            supported_sizes=SUPPORTED_BASE_SIZES,
        )
    )
    canvas_only_edit = bool(
        final_target_dimensions and _is_canvas_only_edit_request(body, instruction_info)
    )

    preserve_expand_needed = bool(
        final_target_dimensions
        and _needs_exact_canvas_expand(
            source_width,
            source_height,
            final_target_dimensions[0],
            final_target_dimensions[1],
            allow_resize_crop=body.allow_resize_crop,
        )
    )

    if final_target_dimensions and preserve_expand_needed and canvas_only_edit:
        if exact_size_non_native:
            exact_plan = choose_exact_size_canvas_plan(
                target_width=final_target_dimensions[0],
                target_height=final_target_dimensions[1],
                supported_sizes=SUPPORTED_BASE_SIZES,
            )
            base_width, base_height = exact_plan["base_width"], exact_plan["base_height"]
        else:
            base_width, base_height = _choose_best_supported_base_size(*final_target_dimensions)
        engine_aspect_ratio = _base_size_to_aspect_ratio(base_width, base_height)
        openai_size = f"{base_width}x{base_height}"
    elif final_target_dimensions and preserve_expand_needed:
        base_width, base_height = _choose_best_supported_base_size(source_width, source_height)
        engine_aspect_ratio = _base_size_to_aspect_ratio(base_width, base_height)
        openai_size = f"{base_width}x{base_height}"
    elif requested_dimensions:
        base_width, base_height = _choose_best_supported_base_size(*requested_dimensions)
        engine_aspect_ratio = _base_size_to_aspect_ratio(base_width, base_height)
        openai_size = f"{base_width}x{base_height}"
    else:
        engine_aspect_ratio = aspect_ratio
        openai_size = _openai_size_from_aspect_ratio(engine_aspect_ratio)

    ensure_credits(current_user, "image_edit")
    action = charge_credits(session, current_user, "image_edit")

    async def _yield_debug_steps(steps: Optional[List[Dict[str, Any]]], progress: Optional[int] = None):
        for step in list(steps or []):
            payload: Dict[str, Any] = {"debug": step}
            if isinstance(progress, int):
                payload["progress"] = progress
            yield _sse(payload)

    async def event_generator():
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
                initial_status = (
                    "Pedido identificado como adaptação de formato/canvas. Ativando fluxo rápido com menos chamadas de IA."
                    if canvas_only_edit
                    else "Analisando a imagem de referência e refinando o prompt de edição..."
                )
                initial_meta = {
                        "aspect_ratio": engine_aspect_ratio,
                        "quality": openai_quality,
                        "reference_filename": image_filename,
                        "openai_size": openai_size,
                        "preserve_original_frame": body.preserve_original_frame,
                        "allow_resize_crop": body.allow_resize_crop,
                        "edit_scope": body.edit_scope,
                        "preserve_expand_needed": preserve_expand_needed,
                        "target_dimensions": {"width": final_target_dimensions[0], "height": final_target_dimensions[1]} if final_target_dimensions else None,
                        "exact_request_dimensions": {"width": exact_request_dimensions[0], "height": exact_request_dimensions[1]} if exact_request_dimensions else None,
                        "exact_size_non_native": exact_size_non_native,
                        "canvas_only_edit": canvas_only_edit,
                        "source_dimensions": {"width": source_width, "height": source_height},
                    }
                yield _sse({
                    "status": initial_status,
                    "progress": 14,
                    "meta": initial_meta,
                    "debug": _build_debug_payload(
                        stage="request_received",
                        message="Requisição de edição por referência recebida e normalizada.",
                        details=initial_meta,
                    ),
                })

                if canvas_only_edit and final_target_dimensions:
                    improved = _build_fast_canvas_only_improvement(
                        target_dimensions=final_target_dimensions,
                        expand_without_crop_needed=preserve_expand_needed,
                    )
                    final_prompt = ""
                    expand_strategy = (
                        "smart_recompose"
                        if preserve_expand_needed and _is_strong_canvas_recompose_case(
                            source_width=source_width,
                            source_height=source_height,
                            target_width=final_target_dimensions[0],
                            target_height=final_target_dimensions[1],
                        )
                        else "preserve"
                    )

                    if preserve_expand_needed:
                        expand_reason = (
                            "canvas_only_exact_size_non_native"
                            if exact_size_non_native
                            else ("canvas_only_smart_recompose" if expand_strategy == "smart_recompose" else "canvas_only_expand_exact")
                        )
                        yield _sse({
                            "status": (
                                "Pedido identificado como resolução exata não nativa do endpoint. Preparando um fluxo layout-first. Em peças comerciais com preservação estrita, a recomposição pode ser concluída de forma determinística antes de qualquer chamada de IA."
                                if exact_size_non_native
                                else (
                                    "Pedido identificado como adaptação de formato/canvas. Aplicando recomposição inteligente em uma única chamada de IA para ocupar melhor a largura e reduzir seams."
                                    if expand_strategy == "smart_recompose"
                                    else "Pedido identificado como adaptação de formato/canvas sem crop. Expandindo a peça com IA em uma única chamada."
                                )
                            ),
                            "progress": 58,
                            "localized_mode": False,
                            "localized_analysis": None,
                            "warning": None,
                            "attempt_plan": {
                                "use_ai_append_crop": False,
                                "use_local_remove_first": False,
                                "use_local_render_first": False,
                                "call_openai_edit": True,
                                "reason": expand_reason,
                            },
                        })

                        try:
                            if exact_size_non_native:
                                result = await _expand_image_to_exact_size_non_native(
                                    client=client,
                                    image_bytes=image_bytes,
                                    openai_key=openai_key,
                                    openai_quality=openai_quality,
                                    requested_width=final_target_dimensions[0],
                                    requested_height=final_target_dimensions[1],
                                    instruction_text=body.instrucoes_edicao,
                                )
                                async for debug_chunk in _yield_debug_steps((result.get("expanded_canvas") or {}).get("debug_steps"), progress=66):
                                    yield debug_chunk
                            else:
                                result = await _expand_image_to_supported_canvas(
                                    client=client,
                                    image_bytes=image_bytes,
                                    openai_key=openai_key,
                                    openai_quality=openai_quality,
                                    requested_width=final_target_dimensions[0],
                                    requested_height=final_target_dimensions[1],
                                    strategy="smart" if expand_strategy == "smart_recompose" else "preserve",
                                )
                        except Exception as expand_exc:
                            raise RuntimeError(
                                "Falha ao adaptar o canvas para o tamanho exato solicitado sem crop. "
                                "O sistema não aplicou blur, espelhamento ou duplicação como fallback. "
                                f"Detalhe: {str(expand_exc)}"
                            )
                    else:
                        yield _sse({
                            "status": "Pedido identificado como adaptação de formato/canvas sem alteração estrutural. Aplicando resize determinístico exato, sem blur, espelhamento ou duplicação.",
                            "progress": 58,
                            "localized_mode": False,
                            "localized_analysis": None,
                            "warning": None,
                            "attempt_plan": {
                                "use_ai_append_crop": False,
                                "use_local_remove_first": False,
                                "use_local_render_first": False,
                                "call_openai_edit": False,
                                "reason": "canvas_only_resize",
                            },
                        })

                        result = _build_canvas_only_resize_result(
                            image_bytes=image_bytes,
                            payload=body,
                            target_dimensions=final_target_dimensions,
                        )

                    result = await _apply_postprocess_if_needed(
                        client,
                        result,
                        final_target_dimensions,
                        preserve_original_frame=body.preserve_original_frame,
                        allow_resize_crop=body.allow_resize_crop,
                        original_reference_bytes=image_bytes,
                    )

                    yield _sse({
                        "status": f"Edição concluída com sucesso em {result['motor']}.",
                        "progress": 82,
                        "partial_result": {
                            "engine_id": result["engine_id"],
                            "motor": result["motor"],
                            "url": result["url"],
                        },
                        "localized_mode": False,
                        "localized_analysis": None,
                        "attempt_plan": {
                            "use_ai_append_crop": False,
                            "use_local_remove_first": False,
                            "use_local_render_first": False,
                            "call_openai_edit": False,
                            "reason": "canvas_only_resize",
                        },
                        "warning": None,
                        "preserve_expand_needed": preserve_expand_needed,
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
                            }
                        ],
                        "warning": None,
                        "preserve_expand_needed": preserve_expand_needed,
                    })
                    return

                improved = await _improve_edit_prompt_with_openai(
                    client=client,
                    payload=body,
                    aspect_ratio=engine_aspect_ratio,
                    openai_key=openai_key,
                )

                final_prompt = _build_final_edit_prompt(
                    payload=body,
                    aspect_ratio=engine_aspect_ratio,
                    improved=improved,
                )

                yield _sse({
                    "status": "Prompt refinado. Tentando localizar a área exata da edição antes de enviar para a engine final.",
                    "progress": 46,
                    "improved_prompt": improved["prompt_final"],
                    "negative_prompt": improved["negative_prompt"],
                    "creative_direction": improved["creative_direction"],
                    "layout_notes": improved["layout_notes"],
                    "preservation_rules": improved["preservation_rules"],
                    "edit_strategy": improved["edit_strategy"],
                    "micro_detail_rules": improved["micro_detail_rules"],
                    "consistency_rules": improved["consistency_rules"],
                    "final_prompt": final_prompt,
                    "aspect_ratio": engine_aspect_ratio,
                    "quality": openai_quality,
                    "openai_size": openai_size,
                    "preserve_original_frame": body.preserve_original_frame,
                    "allow_resize_crop": body.allow_resize_crop,
                    "edit_scope": body.edit_scope,
                    "target_dimensions": {"width": final_target_dimensions[0], "height": final_target_dimensions[1]} if final_target_dimensions else None,
                })

                is_multi_replace = instruction_info.get("is_multi_replace", False)
                is_pure_text_edit = instruction_info.get("is_pure_text_edit", False)
                strict_local_text = _requires_strict_local_text_preservation(
                    body.edit_scope,
                    instruction_info,
                )

                localized_analysis = None
                all_localized_analyses: List[Dict[str, Any]] = []
                localized_mask = None
                localized_mode = False
                localized_warning = None

                try:
                    if is_multi_replace and is_pure_text_edit:
                        all_localized_analyses = await analyze_all_regions_with_openai(
                            client=client,
                            image_bytes=image_bytes,
                            content_type=image_content_type,
                            instruction_info=instruction_info,
                            model=OPENAI_CHAT_MODEL,
                            api_key=openai_key,
                        )
                        localized_analysis = all_localized_analyses[0] if all_localized_analyses else None
                        localized_mode = False
                    else:
                        localized_analysis = await analyze_region_with_openai(
                            client=client,
                            image_bytes=image_bytes,
                            content_type=image_content_type,
                            instruction=body.instrucoes_edicao,
                            model=OPENAI_CHAT_MODEL,
                            api_key=openai_key,
                        )

                        if strict_local_text and not should_use_localized_edit(localized_analysis):
                            recovered_analysis = await recover_localized_analysis_from_candidates(
                                client=client,
                                image_bytes=image_bytes,
                                content_type=image_content_type,
                                instruction=body.instrucoes_edicao,
                                model=OPENAI_CHAT_MODEL,
                                api_key=openai_key,
                                base_analysis=localized_analysis,
                            )
                            if recovered_analysis:
                                localized_analysis = recovered_analysis
                                localized_warning = (
                                    f"{localized_warning} | " if localized_warning else ""
                                ) + "Localização principal insuficiente; recuperação por candidatos locais ativada."

                        all_localized_analyses = [localized_analysis] if localized_analysis else []
                        if should_use_localized_edit(localized_analysis):
                            localized_mode = True
                except Exception as region_exc:
                    localized_warning = f"Falha na detecção localizada. Seguindo com edição conservadora. Detalhe: {str(region_exc)}"

                if strict_local_text and not localized_mode and localized_analysis and localized_analysis.get("candidate_recovered"):
                    localized_mode = True

                all_localizable = (
                    is_multi_replace
                    and is_pure_text_edit
                    and len(all_localized_analyses) == len(instruction_info.get("all_replacements", []))
                    and all(should_use_local_text_render(a, {"is_pure_text_edit": True}) for a in all_localized_analyses)
                )

                attempt_plan = _build_edit_attempt_plan(
                    instruction_info=instruction_info,
                    localized_analysis=localized_analysis,
                    localized_mode=localized_mode,
                    edit_scope=body.edit_scope,
                ) if not all_localizable else {
                    "use_ai_append_crop": False,
                    "use_local_remove_first": False,
                    "use_local_render_first": True,
                    "call_openai_edit": False,
                    "reason": "multi_text_replace_deterministic",
                }

                resolution_warning = _build_resolution_adaptation_warning(
                    requested_dimensions=final_target_dimensions,
                    openai_size=openai_size,
                    attempt_plan=attempt_plan,
                )
                if resolution_warning:
                    localized_warning = (
                        f"{localized_warning} | " if localized_warning else ""
                    ) + resolution_warning

                if attempt_plan["use_ai_append_crop"]:
                    yield _sse({
                        "status": "Texto direcional localizado com boa confiança. Gerando o novo trecho via crop com IA e recompondo localmente no original para preservar tipografia percebida, baseline e diagramação.",
                        "progress": 62,
                        "localized_analysis": localized_analysis,
                        "localized_mode": localized_mode,
                        "warning": localized_warning,
                        "attempt_plan": attempt_plan,
                    })
                elif attempt_plan["use_local_remove_first"]:
                    yield _sse({
                        "status": "Texto localizado com boa confiança. Aplicando remoção local determinística na resolução original, sem repintura global da peça.",
                        "progress": 62,
                        "localized_analysis": localized_analysis,
                        "localized_mode": localized_mode,
                        "warning": localized_warning,
                        "attempt_plan": attempt_plan,
                    })
                elif attempt_plan["use_local_render_first"]:
                    n = len(all_localized_analyses)
                    yield _sse({
                        "status": f"{'Múltiplas substituições' if is_multi_replace else 'Texto'} identificado{'s' if is_multi_replace else ''} com boa confiança. Aplicando {n} edição{'ões' if n > 1 else ''} local{'is' if n > 1 else ''} determinística{'s' if n > 1 else ''} preservando 100% do layout.",
                        "progress": 62,
                        "localized_analysis": localized_analysis,
                        "localized_mode": localized_mode,
                        "warning": localized_warning,
                        "attempt_plan": attempt_plan,
                    })
                elif localized_mode:
                    yield _sse({
                        "status": "Área localizada com sucesso. Aplicando patch local para preservar o restante da imagem." if attempt_plan.get("use_ai_remove_crop") or attempt_plan.get("use_ai_append_crop") else "Área localizada com sucesso. Aplicando edição mascarada para preservar o restante da imagem.",
                        "progress": 62,
                        "localized_analysis": localized_analysis,
                        "localized_mode": True,
                        "warning": localized_warning,
                        "attempt_plan": attempt_plan,
                    })
                else:
                    status_message = "Não foi possível garantir uma área segura com máscara. Aplicando edição global mais conservadora, mantendo a peça original como referência dominante."
                    if attempt_plan.get("strict_local_text"):
                        status_message = "Localização insuficiente para manter preservação estrita. A edição ampla foi bloqueada para evitar mover ou reescrever outros textos."
                    yield _sse({
                        "status": status_message,
                        "progress": 62,
                        "localized_analysis": localized_analysis,
                        "localized_mode": False,
                        "warning": localized_warning,
                        "attempt_plan": attempt_plan,
                    })

                result = None

                if all_localizable:
                    local_bytes = render_all_local_text_replacements(
                        image_bytes=image_bytes,
                        analyses=all_localized_analyses,
                    )
                    if local_bytes:
                        result = {
                            "engine_id": "local_structured_edit",
                            "motor": "Edição Local Estruturada (múltipla)",
                            "url": _data_uri_from_b64(base64.b64encode(local_bytes).decode("utf-8"), "image/png"),
                            "raw": {"strategy": attempt_plan["reason"], "replacements_count": len(all_localized_analyses)},
                        }

                if result is None and attempt_plan["use_ai_append_crop"] and localized_analysis:
                    try:
                        result = await _synthesize_append_text_with_ai_crop(
                            client=client,
                            image_bytes=image_bytes,
                            analysis=localized_analysis,
                            openai_key=openai_key,
                            openai_quality=openai_quality,
                        )
                    except Exception as append_exc:
                        localized_warning = (
                            f"{localized_warning} | " if localized_warning else ""
                        ) + f"Falha na composição local por crop: {str(append_exc)}"

                if result is None and attempt_plan.get("use_ai_remove_crop") and localized_analysis:
                    try:
                        result = await _synthesize_remove_text_with_ai_crop(
                            client=client,
                            image_bytes=image_bytes,
                            analysis=localized_analysis,
                            openai_key=openai_key,
                            openai_quality=openai_quality,
                        )
                    except Exception as remove_exc:
                        localized_warning = (
                            f"{localized_warning} | " if localized_warning else ""
                        ) + f"Falha no patch local por crop (remoção): {str(remove_exc)}"

                if result is None and attempt_plan["use_local_remove_first"] and localized_analysis:
                    local_bytes = render_local_text_fallback(image_bytes=image_bytes, analysis=localized_analysis)
                    if local_bytes:
                        result = {
                            "engine_id": "local_structured_edit",
                            "motor": "Remoção Local Estruturada",
                            "url": _data_uri_from_b64(base64.b64encode(local_bytes).decode("utf-8"), "image/png"),
                            "raw": {"strategy": attempt_plan["reason"]},
                        }

                if result is None and attempt_plan["use_local_render_first"] and localized_analysis:
                    local_bytes = render_local_text_fallback(image_bytes=image_bytes, analysis=localized_analysis)
                    if local_bytes:
                        result = {
                            "engine_id": "local_structured_edit",
                            "motor": "Edição Local Estruturada",
                            "url": _data_uri_from_b64(base64.b64encode(local_bytes).decode("utf-8"), "image/png"),
                            "raw": {"strategy": attempt_plan["reason"]},
                        }

                if result is None:
                    if attempt_plan.get("strict_local_text") and not attempt_plan.get("call_openai_edit"):
                        raise ValueError(
                            "Não foi possível localizar uma área segura para edição local sem risco de alterar outros textos. "
                            "A edição ampla foi bloqueada para preservar a peça."
                        )

                    final_prompt_for_edit = final_prompt + _build_localized_prompt_appendix(localized_analysis, instruction_info)
                    if localized_mode and localized_mask is None:
                        try:
                            localized_mask = build_mask_from_analysis(image_bytes, localized_analysis or {})
                        except Exception as mask_exc:
                            localized_warning = (
                                f"{localized_warning} | " if localized_warning else ""
                            ) + f"Falha ao montar máscara localizada. Detalhe: {str(mask_exc)}"
                            localized_mask = None
                            localized_mode = False

                    if attempt_plan.get("strict_local_text") and localized_mode and localized_mask is None:
                        raise ValueError(
                            "Não foi possível gerar uma máscara localizada segura para preservar o restante da arte."
                        )

                    if attempt_plan.get("strict_local_text") and not localized_mode and attempt_plan.get("call_openai_edit"):
                        raise ValueError(
                            "A edição ampla foi bloqueada porque o pedido é um texto localizado e a região exata não foi localizada com segurança."
                        )

                    try:
                        result = await _edit_openai_image(
                            client=client,
                            image_bytes=image_bytes,
                            filename=image_filename,
                            content_type=image_content_type,
                            final_prompt=final_prompt_for_edit,
                            aspect_ratio=engine_aspect_ratio,
                            quality=openai_quality,
                            openai_key=openai_key,
                            openai_size=openai_size,
                            mask_bytes=localized_mask,
                            input_fidelity="high",
                        )
                    except Exception as edit_exc:
                        if all_localized_analyses:
                            fallback_bytes = render_all_local_text_replacements(image_bytes=image_bytes, analyses=all_localized_analyses)
                            if not fallback_bytes and localized_analysis:
                                fallback_bytes = render_local_text_fallback(image_bytes=image_bytes, analysis=localized_analysis)
                            if fallback_bytes:
                                result = {
                                    "engine_id": "local_structured_edit",
                                    "motor": "Edição Local Estruturada",
                                    "url": _data_uri_from_b64(base64.b64encode(fallback_bytes).decode("utf-8"), "image/png"),
                                    "raw": {"fallback_reason": str(edit_exc), "strategy": "openai_failed_then_local"},
                                }
                            else:
                                raise
                        else:
                            raise

                if preserve_expand_needed and final_target_dimensions:
                    expand_strategy = (
                        "smart"
                        if _is_strong_canvas_recompose_case(
                            source_width=source_width,
                            source_height=source_height,
                            target_width=final_target_dimensions[0],
                            target_height=final_target_dimensions[1],
                        )
                        else "auto"
                    )
                    yield _sse({
                        "status": (
                            "Edição aplicada. Expandindo em canvas suportado com uma única chamada de IA e aplicando crop técnico final para entregar a resolução exata solicitada."
                            if exact_size_non_native
                            else (
                                "Edição aplicada. Recomponto o canvas final com recomposição inteligente para preencher o formato solicitado sem seams aparentes."
                                if expand_strategy == "smart"
                                else "Edição aplicada. Expandindo o canvas final sem crop para preencher o formato solicitado."
                            )
                        ),
                        "progress": 76,
                        "localized_mode": localized_mode,
                        "localized_analysis": localized_analysis,
                        "attempt_plan": attempt_plan,
                    })

                    result_url = result.get("url")
                    if not result_url:
                        raise ValueError("A edição não retornou URL válida para expandir o canvas.")

                    if result_url.startswith("data:"):
                        edited_bytes, _ = _image_bytes_from_result_url(result_url)
                    else:
                        fetched = await client.get(result_url)
                        fetched.raise_for_status()
                        edited_bytes = fetched.content

                    yield _sse({
                        "debug": _build_debug_payload(
                            stage="expand_prepare",
                            message="Resultado intermediário convertido em bytes para expansão final do canvas.",
                            details={
                                "final_target_dimensions": {"width": final_target_dimensions[0], "height": final_target_dimensions[1]},
                                "exact_size_non_native": exact_size_non_native,
                                "expand_strategy": expand_strategy,
                                "edited_bytes": len(edited_bytes),
                            },
                        )
                    })

                    try:
                        if exact_size_non_native:
                            result = await _expand_image_to_exact_size_non_native(
                                client=client,
                                image_bytes=edited_bytes,
                                openai_key=openai_key,
                                openai_quality=openai_quality,
                                requested_width=final_target_dimensions[0],
                                requested_height=final_target_dimensions[1],
                                instruction_text=body.instrucoes_edicao,
                            )
                            async for debug_chunk in _yield_debug_steps((result.get("expanded_canvas") or {}).get("debug_steps"), progress=84):
                                yield debug_chunk
                        else:
                            result = await _expand_image_to_supported_canvas(
                                client=client,
                                image_bytes=edited_bytes,
                                openai_key=openai_key,
                                openai_quality=openai_quality,
                                requested_width=final_target_dimensions[0],
                                requested_height=final_target_dimensions[1],
                                strategy=expand_strategy,
                            )
                    except Exception as expand_exc:
                        raise RuntimeError(
                            "Falha ao expandir o canvas final para o tamanho exato solicitado sem crop. "
                            "O sistema não aplicou blur, espelhamento ou duplicação como fallback. "
                            f"Detalhe: {str(expand_exc)}"
                        )

                    result = await _apply_postprocess_if_needed(
                        client,
                        result,
                        final_target_dimensions,
                        preserve_original_frame=True,
                        allow_resize_crop=False,
                        original_reference_bytes=image_bytes,
                    )
                else:
                    result = await _apply_postprocess_if_needed(
                        client,
                        result,
                        final_target_dimensions,
                        preserve_original_frame=body.preserve_original_frame,
                        allow_resize_crop=body.allow_resize_crop,
                        original_reference_bytes=image_bytes,
                    )

                if (
                    attempt_plan.get("strict_local_text")
                    and localized_analysis
                    and _is_result_from_ai(result)
                ):
                    guarded_bytes, _ = await _read_result_bytes(client, result)
                    guard_metrics = _compute_outside_edit_metrics(
                        original_bytes=image_bytes,
                        edited_bytes=guarded_bytes,
                        analysis=localized_analysis,
                    )

                    if _preservation_guard_failed(guard_metrics):
                        fallback_bytes = None
                        if all_localized_analyses:
                            fallback_bytes = render_all_local_text_replacements(
                                image_bytes=image_bytes,
                                analyses=all_localized_analyses,
                            )
                        if not fallback_bytes and localized_analysis:
                            fallback_bytes = render_local_text_fallback(
                                image_bytes=image_bytes,
                                analysis=localized_analysis,
                            )

                        if fallback_bytes:
                            result = {
                                "engine_id": "local_structured_edit",
                                "motor": "Edição Local Estruturada + Guarda de Preservação",
                                "url": _result_url_from_image_bytes(fallback_bytes, "image/png"),
                                "raw": {
                                    "strategy": "strict_preservation_guard_fallback",
                                    "guard_metrics": guard_metrics,
                                },
                            }
                            localized_warning = (
                                f"{localized_warning} | " if localized_warning else ""
                            ) + "Resultado da IA alterou áreas fora do patch permitido; fallback local aplicado automaticamente."
                        else:
                            raise ValueError(
                                "A edição alterou áreas fora do patch seguro e foi rejeitada pela guarda de preservação."
                            )
                    elif guard_metrics:
                        result = dict(result)
                        result["raw"] = {
                            **(result.get("raw") or {}),
                            "guard_metrics": guard_metrics,
                        }

                yield _sse({
                    "status": f"Edição concluída com sucesso em {result['motor']}.",
                    "progress": 82,
                    "partial_result": {
                        "engine_id": result["engine_id"],
                        "motor": result["motor"],
                        "url": result["url"],
                    },
                    "localized_mode": localized_mode,
                    "localized_analysis": localized_analysis,
                    "attempt_plan": attempt_plan,
                    "warning": localized_warning,
                    "preserve_expand_needed": preserve_expand_needed,
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
                    "localized_mode": localized_mode,
                    "localized_analysis": localized_analysis,
                    "attempt_plan": attempt_plan,
                    "final_results": [
                        {
                            "engine_id": result["engine_id"],
                            "motor": result["motor"],
                            "url": result["url"],
                        }
                    ],
                })

        except Exception as e:
            logger.exception("Erro interno no fluxo de edição de imagem.")
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




