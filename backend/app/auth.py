from __future__ import annotations

import base64
import io
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from sqlmodel import Session, select

from .credits import (
    INITIAL_CREDITS,
    add_plan_credits,
    apply_daily_credit_allowance,
    attach_credit_headers,
    build_credit_catalog_payload,
)
from .db import get_session
from .deps import get_current_user
from .models import User
from .schemas import GoogleAuth, Token, UserCreate, UserLogin
from .security import create_access_token, get_password_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])

PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
PROFILE_IMAGE_OUTPUT_SIZE = 384
PROFILE_IMAGE_MIME_TYPE = "image/webp"


class CreditPlanActivateIn(BaseModel):
    plan_id: str


class AccountProfileUpdateIn(BaseModel):
    full_name: str


def _resample_filter() -> int:
    return Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS


def _build_profile_image_url(user: User) -> str | None:
    if not user.profile_image_data or not user.profile_image_mime_type:
        return None
    return f"data:{user.profile_image_mime_type};base64,{user.profile_image_data}"


def _user_payload(user: User) -> dict:
    return {
        "credits": user.credits,
        "has_linkedin": bool(user.linkedin_urn),
        "has_instagram": bool(user.instagram_account_id and user.instagram_meta_access_token),
        "instagram_username": user.instagram_username,
        "has_facebook": bool(user.facebook_page_id and user.facebook_page_access_token),
        "facebook_page_name": user.facebook_page_name,
        "facebook_page_username": user.facebook_page_username,
        "has_youtube": bool(user.youtube_channel_id and user.youtube_refresh_token),
        "youtube_channel_title": user.youtube_channel_title,
        "youtube_channel_handle": user.youtube_channel_handle,
        "has_tiktok": bool(user.tiktok_open_id and user.tiktok_refresh_token),
        "tiktok_display_name": user.tiktok_display_name,
        "tiktok_username": user.tiktok_username,
        "has_google_business_profile": bool(user.google_business_refresh_token),
        "google_business_account_display_name": user.google_business_account_display_name,
        "google_business_location_title": user.google_business_location_title,
        "profile_image_url": _build_profile_image_url(user),
    }


def _token_payload(user: User, access_token: str) -> dict:
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_email": user.email,
        "user_name": user.full_name,
        **_user_payload(user),
    }


def _me_payload(user: User) -> dict:
    return {
        "email": user.email,
        "full_name": user.full_name,
        "google_id": user.google_id,
        **_user_payload(user),
    }


def _normalize_full_name(full_name: str | None) -> str:
    normalized = " ".join(str(full_name or "").strip().split())
    if not normalized:
        raise HTTPException(status_code=400, detail="Informe um nome válido para a conta.")
    if len(normalized) > 120:
        raise HTTPException(status_code=400, detail="O nome da conta deve ter no máximo 120 caracteres.")
    return normalized


async def _prepare_profile_image(file: UploadFile) -> str:
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Nenhuma imagem foi enviada.")
    if len(raw_bytes) > PROFILE_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="A imagem de perfil deve ter no máximo 5 MB.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as image:
            processed = ImageOps.exif_transpose(image)
            has_alpha = processed.mode in {"RGBA", "LA"} or (processed.mode == "P" and "transparency" in processed.info)
            processed = ImageOps.fit(
                processed.convert("RGBA" if has_alpha else "RGB"),
                (PROFILE_IMAGE_OUTPUT_SIZE, PROFILE_IMAGE_OUTPUT_SIZE),
                method=_resample_filter(),
            )
            buffer = io.BytesIO()
            processed.save(buffer, format="WEBP", quality=84, method=6)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Arquivo inválido. Envie uma imagem PNG, JPG ou WEBP.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Não foi possível processar a imagem enviada.") from exc

    return base64.b64encode(buffer.getvalue()).decode("ascii")


def check_and_reset_credits(user: User, session: Session) -> User:
    return apply_daily_credit_allowance(user, session)


@router.post("/register", response_model=Token)
def register(user_in: UserCreate, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == user_in.email)).first()
    if user:
        raise HTTPException(status_code=400, detail="Este e-mail já está em uso.")

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        credits=INITIAL_CREDITS,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    access_token = create_access_token(data={"sub": new_user.email})
    return _token_payload(new_user, access_token)


@router.post("/login", response_model=Token)
def login(user_in: UserLogin, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == user_in.email)).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=400, detail="E-mail ou senha incorretos.")

    if not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="E-mail ou senha incorretos.")

    user = check_and_reset_credits(user, session)
    access_token = create_access_token(data={"sub": user.email})
    return _token_payload(user, access_token)


@router.post("/google", response_model=Token)
def google_auth(auth_in: GoogleAuth, session: Session = Depends(get_session)):
    try:
        response = httpx.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {auth_in.credential}"},
        )

        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Token do Google inválido ou expirado.")

        idinfo = response.json()
        email = idinfo.get("email")
        name = idinfo.get("name")
        google_id = idinfo.get("sub")

        if not email:
            raise HTTPException(status_code=400, detail="Token do Google não contém e-mail válido.")

        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            user = User(email=email, full_name=name, google_id=google_id, credits=INITIAL_CREDITS)
            session.add(user)
            session.commit()
            session.refresh(user)
        else:
            if not user.google_id:
                user.google_id = google_id
                session.add(user)
                session.commit()
                session.refresh(user)

        user = check_and_reset_credits(user, session)
        access_token = create_access_token(data={"sub": user.email})
        return _token_payload(user, access_token)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro de comunicação com o Google: {str(e)}")


@router.get("/me")
def get_me(
    response: Response,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    current_user = check_and_reset_credits(current_user, session)
    attach_credit_headers(response, current_user)
    return _me_payload(current_user)


@router.put("/profile")
def update_profile(
    payload: AccountProfileUpdateIn,
    response: Response,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    current_user.full_name = _normalize_full_name(payload.full_name)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    attach_credit_headers(response, current_user)
    return _me_payload(current_user)


@router.post("/profile-image")
async def upload_profile_image(
    response: Response,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    current_user.profile_image_data = await _prepare_profile_image(file)
    current_user.profile_image_mime_type = PROFILE_IMAGE_MIME_TYPE
    current_user.profile_image_updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    attach_credit_headers(response, current_user)
    return _me_payload(current_user)


@router.delete("/profile-image")
def delete_profile_image(
    response: Response,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    current_user.profile_image_data = None
    current_user.profile_image_mime_type = None
    current_user.profile_image_updated_at = None
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    attach_credit_headers(response, current_user)
    return _me_payload(current_user)


@router.get("/credits/catalog")
def get_credits_catalog(
    response: Response,
    current_user: User = Depends(get_current_user),
):
    attach_credit_headers(response, current_user)
    return build_credit_catalog_payload(current_user)


@router.post("/credits/activate-plan")
def activate_credit_plan(
    payload: CreditPlanActivateIn,
    response: Response,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        plan, current_credits = add_plan_credits(session, current_user, payload.plan_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Plano de créditos não encontrado.")

    attach_credit_headers(response, current_user, charged_credits=0, action_key=f"credit_plan:{plan.id}")

    return {
        "ok": True,
        "plan_id": plan.id,
        "title": plan.title,
        "display_price": plan.display_price,
        "credits_added": plan.total_credits,
        "base_credits": plan.base_credits,
        "bonus_credits": plan.bonus_credits,
        "credits": current_credits,
    }
