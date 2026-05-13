from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from .deps import get_current_user
from .models import User

router = APIRouter(prefix="/api/social-publisher", tags=["social-publisher"])

RUNTIME_DIR = Path(__file__).resolve().parent / "_runtime" / "social_publisher_media"
MAX_UPLOAD_MB = 20
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_MEDIA_ITEMS = 10
MAX_IMAGE_EDGE = 4096
MEDIA_TTL_DAYS = 7
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}


def _cleanup_old_media() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=MEDIA_TTL_DAYS)
    try:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        for path in RUNTIME_DIR.glob("*.jpg"):
            try:
                modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                if modified < cutoff:
                    path.unlink(missing_ok=True)
            except Exception:
                continue
    except Exception:
        # Limpeza é oportunista. Não deve bloquear publicação.
        pass


def _build_public_url(request: Request, filename: str) -> str:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = forwarded_host or request.headers.get("host", "").strip()

    if forwarded_proto and host:
        base = f"{forwarded_proto}://{host}"
    else:
        base = str(request.base_url).rstrip("/")

    return f"{base}/api/social-publisher/media/{filename}"


def _safe_filename(value: str) -> str:
    stem = Path(value or "imagem").stem.lower()
    stem = re.sub(r"[^a-z0-9_-]+", "-", stem).strip("-")[:48]
    return stem or "imagem"


def _image_to_publishable_jpeg(raw: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode in {"RGBA", "LA", "P"}:
                image = image.convert("RGBA")
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")

            width, height = image.size
            longest_edge = max(width, height)
            if longest_edge > MAX_IMAGE_EDGE:
                ratio = MAX_IMAGE_EDGE / longest_edge
                image = image.resize((max(1, int(width * ratio)), max(1, int(height * ratio))), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=92, optimize=True, progressive=True)
            return buffer.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Arquivo de imagem inválido.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Não foi possível preparar a imagem para publicação: {exc}")


@router.post("/media")
async def upload_social_publisher_media(
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="Envie pelo menos uma imagem.")
    if len(files) > MAX_MEDIA_ITEMS:
        raise HTTPException(status_code=400, detail=f"Envie no máximo {MAX_MEDIA_ITEMS} imagens por publicação.")

    _cleanup_old_media()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    uploaded: list[dict[str, str]] = []
    for index, file in enumerate(files, start=1):
        content_type = (file.content_type or "").lower()
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} não é uma imagem aceita.")

        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} está vazio.")
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} passou de {MAX_UPLOAD_MB}MB.")

        jpeg = _image_to_publishable_jpeg(raw)
        basename = _safe_filename(file.filename or f"imagem-{index}")
        filename = f"user-{current_user.id}-{uuid.uuid4().hex}-{basename}.jpg"
        path = RUNTIME_DIR / filename
        path.write_bytes(jpeg)
        uploaded.append({"url": _build_public_url(request, filename), "filename": filename})

    return {"ok": True, "items": uploaded, "urls": [item["url"] for item in uploaded]}


@router.get("/media/{filename}", name="get_social_publisher_media")
async def get_social_publisher_media(filename: str):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", filename or ""):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    path = RUNTIME_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return FileResponse(path, media_type="image/jpeg", filename=filename)
