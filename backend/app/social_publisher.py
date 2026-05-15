from __future__ import annotations

import io
import mimetypes
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
MAX_IMAGE_UPLOAD_MB = 20
MAX_VIDEO_UPLOAD_MB = 300
MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024
MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_MB * 1024 * 1024
MAX_MEDIA_ITEMS = 10
MAX_IMAGE_EDGE = 4096
MEDIA_TTL_DAYS = 7
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/webm",
    "video/mpeg",
    "video/3gpp",
}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mpeg", ".mpg", ".3gp"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _cleanup_old_media() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=MEDIA_TTL_DAYS)
    try:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        for path in RUNTIME_DIR.iterdir():
            if not path.is_file():
                continue
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
    stem = Path(value or "midia").stem.lower()
    stem = re.sub(r"[^a-z0-9_-]+", "-", stem).strip("-")[:48]
    return stem or "midia"


def _extension_from_content_type(content_type: str, fallback: str = ".bin") -> str:
    guessed = mimetypes.guess_extension(content_type or "")
    if guessed == ".jpe":
        return ".jpg"
    if guessed:
        return guessed
    return fallback


def _detect_kind(file: UploadFile) -> tuple[str, str]:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    ext = Path(file.filename or "").suffix.lower()

    if content_type in ALLOWED_IMAGE_CONTENT_TYPES or (not content_type and ext in IMAGE_EXTENSIONS):
        return "image", content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    if content_type in ALLOWED_VIDEO_CONTENT_TYPES or (not content_type and ext in VIDEO_EXTENSIONS) or (content_type in {"application/octet-stream", "binary/octet-stream"} and ext in VIDEO_EXTENSIONS):
        return "video", content_type if content_type not in {"application/octet-stream", "binary/octet-stream"} else (mimetypes.guess_type(file.filename or "")[0] or "video/mp4")

    if content_type.startswith("image/"):
        return "image", content_type
    if content_type.startswith("video/"):
        return "video", content_type

    raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} não é uma imagem ou vídeo aceito.")


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
        raise HTTPException(status_code=400, detail="Envie pelo menos uma imagem ou vídeo.")
    if len(files) > MAX_MEDIA_ITEMS:
        raise HTTPException(status_code=400, detail=f"Envie no máximo {MAX_MEDIA_ITEMS} arquivos por publicação.")

    _cleanup_old_media()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    uploaded: list[dict[str, str]] = []
    for index, file in enumerate(files, start=1):
        kind, content_type = _detect_kind(file)
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} está vazio.")

        basename = _safe_filename(file.filename or f"midia-{index}")
        if kind == "image":
            if len(raw) > MAX_IMAGE_UPLOAD_BYTES:
                raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} passou de {MAX_IMAGE_UPLOAD_MB}MB.")
            prepared = _image_to_publishable_jpeg(raw)
            filename = f"user-{current_user.id}-{uuid.uuid4().hex}-{basename}.jpg"
            media_type = "image/jpeg"
        else:
            if len(raw) > MAX_VIDEO_UPLOAD_BYTES:
                raise HTTPException(status_code=400, detail=f"{file.filename or 'Arquivo'} passou de {MAX_VIDEO_UPLOAD_MB}MB.")
            prepared = raw
            ext = Path(file.filename or "").suffix.lower() or _extension_from_content_type(content_type, ".mp4")
            if ext not in VIDEO_EXTENSIONS:
                ext = ".mp4"
            filename = f"user-{current_user.id}-{uuid.uuid4().hex}-{basename}{ext}"
            media_type = content_type or mimetypes.guess_type(filename)[0] or "video/mp4"

        path = RUNTIME_DIR / filename
        path.write_bytes(prepared)
        uploaded.append({"url": _build_public_url(request, filename), "filename": filename, "type": kind, "content_type": media_type})

    return {"ok": True, "items": uploaded, "urls": [item["url"] for item in uploaded]}


@router.get("/media/{filename}", name="get_social_publisher_media")
async def get_social_publisher_media(filename: str):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", filename or ""):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    path = RUNTIME_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=filename)
