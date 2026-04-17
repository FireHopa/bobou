
from __future__ import annotations

import io
import math
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image

from .image_canvas_exact_size_strategy import (
    build_exact_size_assisted_prompt,
    build_exact_size_assisted_recompose_assets,
    build_exact_size_fragmented_preserve_assets,
    build_exact_size_fragmented_preserve_prompt,
    build_non_native_exact_size_layout_first_assets,
    build_exact_size_commercial_ai_relayout_assets,
    build_exact_size_commercial_deterministic_assets,
    build_exact_size_layout_preserve_assets,
    build_exact_size_layout_preserve_prompt,
    detect_exact_size_recompose_profile,
)
from .image_canvas_smart_expand import build_smart_expand_assets, overlay_hard_preserve_regions

SUPPORTED_BASE_SIZES: List[Tuple[int, int]] = [
    (1024, 1024),
    (1024, 1536),
    (1536, 1024),
]

_EXACT_SIZE_PATTERNS = [
    re.compile(r"(?<!\d)(?P<w>\d{3,4})\s*[x×]\s*(?P<h>\d{3,4})(?!\d)", flags=re.IGNORECASE),
    re.compile(
        r"(?:resolu[cç][aã]o|resolution|tamanho|size|canvas|dimens(?:ao|ões|oes))[^\d]{0,24}(?P<w>\d{3,4})\s*(?:px)?\s*(?:por|x|×|by)\s*(?P<h>\d{3,4})(?:\s*px)?",
        flags=re.IGNORECASE,
    ),
]


def _normalize_dimension(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    if 256 <= normalized <= 4096:
        return normalized
    return None


def extract_exact_dimensions_from_text(text: str) -> Optional[Tuple[int, int]]:
    raw = (text or "").strip()
    if not raw:
        return None

    for pattern in _EXACT_SIZE_PATTERNS:
        match = pattern.search(raw)
        if not match:
            continue
        width = _normalize_dimension(match.group("w"))
        height = _normalize_dimension(match.group("h"))
        if width and height:
            return width, height
    return None


def resolve_exact_dimensions_request(
    payload_width: Optional[int],
    payload_height: Optional[int],
    instruction_text: str,
) -> Optional[Tuple[int, int]]:
    width = _normalize_dimension(payload_width)
    height = _normalize_dimension(payload_height)
    if width and height:
        return width, height
    if width or height:
        return None
    return extract_exact_dimensions_from_text(instruction_text)


def is_native_supported_exact_size(
    target_width: int,
    target_height: int,
    supported_sizes: Optional[List[Tuple[int, int]]] = None,
) -> bool:
    candidates = supported_sizes or SUPPORTED_BASE_SIZES
    return (int(target_width), int(target_height)) in {(w, h) for w, h in candidates}


def _encode_png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


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


def choose_exact_size_canvas_plan(
    target_width: int,
    target_height: int,
    supported_sizes: Optional[List[Tuple[int, int]]] = None,
) -> Dict[str, Any]:
    if target_width <= 0 or target_height <= 0:
        raise ValueError("Tamanho exato inválido.")

    candidates = supported_sizes or SUPPORTED_BASE_SIZES
    best_plan: Optional[Dict[str, Any]] = None
    best_score: Optional[Tuple[float, float, float, float]] = None
    target_ratio = target_width / max(1.0, float(target_height))

    for base_width, base_height in candidates:
        orientation_penalty = 0.0
        if (target_width >= target_height) != (base_width >= base_height):
            orientation_penalty = 1.0

        working_scale = min(
            1.0,
            base_width / max(1.0, float(target_width)),
            base_height / max(1.0, float(target_height)),
        )
        working_width = max(1, int(round(target_width * working_scale)))
        working_height = max(1, int(round(target_height * working_scale)))
        working_width = min(base_width, working_width)
        working_height = min(base_height, working_height)

        waste = float((base_width * base_height) - (working_width * working_height))
        downscale_penalty = 1.0 - working_scale
        ratio_penalty = abs(
            math.log(
                max(1e-6, (base_width / max(1.0, float(base_height))) / max(1e-6, target_ratio))
            )
        )
        score = (orientation_penalty, downscale_penalty, waste, ratio_penalty)

        if best_score is None or score < best_score:
            crop_x = max(0, (base_width - working_width) // 2)
            crop_y = max(0, (base_height - working_height) // 2)
            best_score = score
            best_plan = {
                "base_width": int(base_width),
                "base_height": int(base_height),
                "working_width": int(working_width),
                "working_height": int(working_height),
                "crop_rect": (
                    int(crop_x),
                    int(crop_y),
                    int(crop_x + working_width),
                    int(crop_y + working_height),
                ),
                "target_width": int(target_width),
                "target_height": int(target_height),
                "needs_upscale_after_crop": bool(
                    working_width != target_width or working_height != target_height
                ),
            }

    if not best_plan:
        raise ValueError("Não foi possível montar um plano de canvas para o tamanho exato.")
    return best_plan


def build_exact_size_expand_assets(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    supported_sizes: Optional[List[Tuple[int, int]]] = None,
    text_rects: Optional[Sequence[Tuple[int, int, int, int]]] = None,
    strength: str = "medium",
    instruction_text: str = "",
) -> Dict[str, Any]:
    plan = choose_exact_size_canvas_plan(
        target_width=target_width,
        target_height=target_height,
        supported_sizes=supported_sizes,
    )

    profile = detect_exact_size_recompose_profile(
        image_bytes=image_bytes,
        target_width=target_width,
        target_height=target_height,
        plan=plan,
        text_rects=text_rects,
        requested_strength=strength,
        instruction_text=instruction_text,
    )

    debug_steps: List[Dict[str, Any]] = [{
        "stage": "exact_size_profile",
        "message": "Perfil de recomposição exata calculado.",
        "details": {
            "strategy": profile.get("strategy"),
            "reasons": list(profile.get("reasons") or []),
            "prefer_deterministic_layout": bool(profile.get("prefer_deterministic_layout")),
            "crop_safe_rect": profile.get("crop_safe_rect"),
            "text_rect_count": len(profile.get("text_rects") or text_rects or []),
        },
    }]

    plan["exact_strategy"] = profile["strategy"]
    plan["crop_safe_rect"] = tuple(int(v) for v in profile.get("crop_safe_rect") or plan["crop_rect"])
    plan["exact_recompose_reasons"] = list(profile.get("reasons") or [])

    effective_text_rects = profile.get("text_rects") or text_rects

    if profile["strategy"] == "commercial_ai_relayout":
        commercial_ai_assets = build_exact_size_commercial_ai_relayout_assets(
            image_bytes=image_bytes,
            plan=plan,
            profile_info=profile,
        )
        return {
            "canvas_bytes": commercial_ai_assets["canvas_bytes"],
            "mask_bytes": commercial_ai_assets["mask_bytes"],
            "plan": plan,
            "placement": commercial_ai_assets["placement"],
            "preserve_union": commercial_ai_assets.get("preserve_union"),
            "hard_preserve_boxes": list(commercial_ai_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(commercial_ai_assets.get("hard_feather") or 10),
            "hard_preserve_limits": commercial_ai_assets.get("hard_preserve_limits"),
            "strength": commercial_ai_assets.get("strength", "medium"),
            "strategy": commercial_ai_assets.get("strategy", "commercial_ai_relayout"),
            "profile": {**profile, "layout_first_non_native": True},
            "crop_safe_rect": commercial_ai_assets.get("crop_safe_rect"),
            "composition_ok": bool(commercial_ai_assets.get("composition_ok", True)),
            "composition_reason": commercial_ai_assets.get("composition_reason") or "ok",
            "direct_result_bytes": commercial_ai_assets.get("direct_result_bytes"),
            "direct_result_is_exact": bool(commercial_ai_assets.get("direct_result_is_exact")),
            "reference_images": commercial_ai_assets.get("reference_images") or [],
            "debug_steps": list(debug_steps) + list(commercial_ai_assets.get("debug_steps") or []),
        }

    if profile["strategy"] == "commercial_layout_deterministic":
        deterministic_assets = build_exact_size_commercial_deterministic_assets(
            image_bytes=image_bytes,
            target_width=target_width,
            target_height=target_height,
            profile_info=profile,
        )
        return {
            "canvas_bytes": deterministic_assets["canvas_bytes"],
            "mask_bytes": deterministic_assets["mask_bytes"],
            "plan": plan,
            "placement": deterministic_assets["placement"],
            "preserve_union": deterministic_assets.get("preserve_union"),
            "hard_preserve_boxes": list(deterministic_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(deterministic_assets.get("hard_feather") or 8),
            "hard_preserve_limits": deterministic_assets.get("hard_preserve_limits"),
            "strength": deterministic_assets.get("strength", "none"),
            "strategy": deterministic_assets.get("strategy", "commercial_layout_deterministic"),
            "profile": {**profile, "layout_first_non_native": True, "deterministic_only": True},
            "crop_safe_rect": deterministic_assets.get("crop_safe_rect"),
            "composition_ok": bool(deterministic_assets.get("composition_ok", True)),
            "composition_reason": deterministic_assets.get("composition_reason") or "ok",
            "direct_result_bytes": deterministic_assets.get("direct_result_bytes"),
            "direct_result_is_exact": bool(deterministic_assets.get("direct_result_is_exact")),
        }

    use_layout_first_non_native = bool(
        (int(plan["base_width"]) != int(target_width) or int(plan["base_height"]) != int(target_height))
        and profile["strategy"] in {"fragmented_preserve", "layout_preserve", "assisted_recompose"}
    )

    if use_layout_first_non_native:
        embedded_assets = build_non_native_exact_size_layout_first_assets(
            image_bytes=image_bytes,
            plan=plan,
            profile_info={**profile, "text_rects": list(effective_text_rects or [])},
        )
        return {
            "canvas_bytes": embedded_assets["canvas_bytes"],
            "mask_bytes": embedded_assets["mask_bytes"],
            "plan": plan,
            "placement": embedded_assets["placement"],
            "preserve_union": embedded_assets["preserve_union"],
            "hard_preserve_boxes": list(embedded_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(embedded_assets.get("hard_feather") or 10),
            "hard_preserve_limits": embedded_assets.get("hard_preserve_limits"),
            "strength": embedded_assets.get("strength", "low"),
            "strategy": embedded_assets.get("strategy", profile["strategy"]),
            "profile": {**profile, "layout_first_non_native": True},
            "crop_safe_rect": embedded_assets.get("crop_safe_rect"),
            "layout_first_preview_bytes": embedded_assets.get("layout_first_preview_bytes"),
        }

    if profile["strategy"] == "fragmented_preserve":
        fragmented_assets = build_exact_size_fragmented_preserve_assets(
            image_bytes=image_bytes,
            plan=plan,
            profile_info=profile,
        )
        return {
            "canvas_bytes": fragmented_assets["canvas_bytes"],
            "mask_bytes": fragmented_assets["mask_bytes"],
            "plan": plan,
            "placement": fragmented_assets["placement"],
            "preserve_union": fragmented_assets["preserve_union"],
            "hard_preserve_boxes": list(fragmented_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(fragmented_assets.get("hard_feather") or 12),
            "hard_preserve_limits": fragmented_assets.get("hard_preserve_limits"),
            "strength": fragmented_assets.get("strength", "low"),
            "strategy": fragmented_assets.get("strategy", "fragmented_preserve"),
            "profile": profile,
            "crop_safe_rect": fragmented_assets.get("crop_safe_rect"),
        }

    if profile["strategy"] == "layout_preserve":
        preserved_assets = build_exact_size_layout_preserve_assets(
            image_bytes=image_bytes,
            plan=plan,
            profile_info=profile,
        )
        return {
            "canvas_bytes": preserved_assets["canvas_bytes"],
            "mask_bytes": preserved_assets["mask_bytes"],
            "plan": plan,
            "placement": preserved_assets["placement"],
            "preserve_union": preserved_assets["preserve_union"],
            "hard_preserve_boxes": list(preserved_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(preserved_assets.get("hard_feather") or 14),
            "hard_preserve_limits": preserved_assets.get("hard_preserve_limits"),
            "strength": preserved_assets.get("strength", "low"),
            "strategy": preserved_assets.get("strategy", "layout_preserve"),
            "profile": profile,
            "crop_safe_rect": preserved_assets.get("crop_safe_rect"),
        }

    if profile["strategy"] == "assisted_recompose":
        assisted_assets = build_exact_size_assisted_recompose_assets(
            image_bytes=image_bytes,
            plan=plan,
            profile_info=profile,
            text_rects=effective_text_rects,
        )
        return {
            "canvas_bytes": assisted_assets["canvas_bytes"],
            "mask_bytes": assisted_assets["mask_bytes"],
            "plan": plan,
            "placement": assisted_assets["placement"],
            "preserve_union": assisted_assets["preserve_union"],
            "hard_preserve_boxes": list(assisted_assets.get("hard_preserve_boxes") or []),
            "hard_feather": int(assisted_assets.get("hard_feather") or 8),
            "hard_preserve_limits": assisted_assets.get("hard_preserve_limits"),
            "strength": assisted_assets.get("strength", profile.get("strength", strength)),
            "strategy": assisted_assets.get("strategy", "assisted_recompose"),
            "profile": profile,
            "crop_safe_rect": assisted_assets.get("crop_safe_rect"),
        }

    smart_assets = build_smart_expand_assets(
        image_bytes=image_bytes,
        target_width=int(plan["base_width"]),
        target_height=int(plan["base_height"]),
        text_rects=effective_text_rects,
        strength=profile.get("strength", strength),
    )

    return {
        "canvas_bytes": smart_assets["canvas_bytes"],
        "mask_bytes": smart_assets["mask_bytes"],
        "plan": plan,
        "placement": smart_assets["placement"],
        "preserve_union": smart_assets["preserve_union"],
        "hard_preserve_boxes": list(smart_assets.get("hard_preserve_boxes") or []),
        "hard_feather": int(smart_assets.get("hard_feather") or 8),
        "hard_preserve_limits": smart_assets.get("hard_preserve_limits"),
        "strength": profile.get("strength", strength),
        "strategy": "simple_expand",
        "profile": profile,
        "crop_safe_rect": profile.get("crop_safe_rect"),
    }


def build_exact_size_expand_prompt(
    target_width: int,
    target_height: int,
    plan: Dict[str, Any],
    placement: Dict[str, int],
    preserve_union: Optional[Tuple[int, int, int, int]] = None,
    strength: str = "medium",
    profile_info: Optional[Dict[str, Any]] = None,
    instruction_text: str = "",
) -> str:
    strategy = (plan.get("exact_strategy") or "simple_expand").strip().lower()
    crop_x1, crop_y1, crop_x2, crop_y2 = tuple(int(v) for v in plan["crop_rect"])
    crop_safe_rect = tuple(int(v) for v in plan.get("crop_safe_rect") or plan["crop_rect"])
    normalized_strength = (strength or "medium").strip().lower() or "medium"
    union = preserve_union or (
        int(placement.get("x", 0)),
        int(placement.get("y", 0)),
        int(placement.get("x", 0)) + int(placement.get("width", 0)),
        int(placement.get("y", 0)) + int(placement.get("height", 0)),
    )
    preserve_width = max(1, int(union[2]) - int(union[0]))
    preserve_height = max(1, int(union[3]) - int(union[1]))
    safe_width = max(1, crop_safe_rect[2] - crop_safe_rect[0])
    safe_height = max(1, crop_safe_rect[3] - crop_safe_rect[1])

    prompt_profile = profile_info or {
        "reasons": plan.get("exact_recompose_reasons") or [],
    }
    layout_first_non_native = bool((prompt_profile or {}).get("layout_first_non_native"))
    user_requirements = " ".join((instruction_text or "").replace("\n", " ").split()).strip()
    if len(user_requirements) > 480:
        user_requirements = user_requirements[:479].rsplit(" ", 1)[0].strip() + "…"
    user_clause = f"Requisitos explícitos do usuário: {user_requirements}. " if user_requirements else ""

    if strategy == "fragmented_preserve":
        return build_exact_size_fragmented_preserve_prompt(
            target_width=target_width,
            target_height=target_height,
            plan=plan,
            placement=placement,
            preserve_union=preserve_union,
            crop_safe_rect=crop_safe_rect,
            profile_info=prompt_profile,
            instruction_text=instruction_text,
        )

    if strategy == "layout_preserve":
        return build_exact_size_layout_preserve_prompt(
            target_width=target_width,
            target_height=target_height,
            plan=plan,
            placement=placement,
            crop_safe_rect=crop_safe_rect,
            profile_info=prompt_profile,
            instruction_text=instruction_text,
        )

    if strategy == "commercial_ai_relayout":
        reason_text = ", ".join(list((prompt_profile or {}).get("reasons") or [])[:4]) or "relayout comercial"
        return (
            "Você recebeu duas referências combinadas: a composição scaffold no novo canvas e a arte original completa. "
            "Use a primeira como guia de layout e a segunda como verdade visual da peça. "
            "Refaça a arte como um banner horizontal único e coeso, sem manter blocos separados, sem parecer colagem e sem parecer proto/mock. "
            "O resultado final deve ocupar a largura com presença comercial real, como uma arte publicitária horizontal pronta para uso. "
            "A faixa superior precisa continuar no topo. O bloco principal da oferta precisa virar um hero largo e integrado ao fundo. "
            "O box de cidade/local, as datas e o CTA precisam permanecer legíveis, centralizados e visualmente integrados, sem virarem cards soltos. "
            "Preserve exatamente os textos existentes, sem reescrever, traduzir, inventar ou deformar letras, números, datas, CTA, logos e nomes próprios. "
            "As áreas não protegidas podem e devem ser redesenhadas para unir o layout, reconstruir profundidade, brilho, partículas, gradientes, trilhas e continuidade visual. "
            "Não mantenha contornos de recorte, bordas de patch, caixas flutuantes, retângulos duros, miniaturas empilhadas nem faixas separadas. "
            "Não devolva a arte em formato de preview intermediário, cards, mosaico, scrapbook, colagem ou painel de blocos. "
            "A composição inteira precisa parecer que sempre nasceu horizontal. "
            f"A janela final prioritária é x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
            f"A safe area útil mede aproximadamente {safe_width}x{safe_height}. "
            f"A área protegida principal mede aproximadamente {preserve_width}x{preserve_height}. "
            f"O motivo deste relayout é: {reason_text}. "
            + f"{user_clause}"
            + f"A entrega final precisa ficar pronta para crop técnico exato em {target_width}x{target_height}."
        )

    if strategy == "commercial_layout_deterministic":
        return (
            "Use a composição enviada como um layout comercial já pré-organizado dentro do canvas final. "
            "A tarefa agora é harmonizar esse layout com acabamento premium, preservando obrigatoriamente a faixa superior, o hero principal, o box de cidade, as datas e o CTA. "
            "Não trate a peça como crop, zoom, stretch, expansão simples de fundo ou geração de cenário novo. "
            "Mantenha os blocos principais nas posições já sugeridas e trabalhe apenas integração visual, respiros, continuidade de fundo, costuras, brilho, profundidade e transições. "
            "É permitido somente microajuste visual para unir os blocos à composição final, sem reescrever, redesenhar, traduzir ou deformar textos, datas, CTA, logotipos e tipografia. "
            "Conecte hero e stack inferior ao fundo com acabamento natural, sem ilhas recortadas, sem retângulos aparentes, sem caixas flutuando e sem mock intermediário. "
            "Não invente elementos novos e não mude a identidade visual original. "
            f"A janela final prioritária é x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
            f"A safe area útil mede aproximadamente {safe_width}x{safe_height}. "
            f"A área principal protegida mede aproximadamente {preserve_width}x{preserve_height}. "
            + f"{user_clause}"
            + f"A entrega final precisa ficar pronta para crop técnico exato em {target_width}x{target_height}."
        )

    return (
        "Adapte a arte para o novo formato como uma recomposição premium, e não como um simples expand automático. "
        "A referência enviada continua sendo a base dominante da identidade visual, da cena, da paleta e da hierarquia. "
        "Preserve integralmente o conteúdo principal dentro da área protegida e use as regiões externas e de transição para redistribuir com sutileza cenário, profundidade, vegetação, céu, iluminação, trilhas, reflexos, HUDs e respiros laterais. "
        "Estenda estruturas, fachadas, linhas arquitetônicas e perspectiva com continuidade real, sem cortes secos e sem costuras visíveis nas áreas novas. "
        "Permita apenas reposicionamento leve de elementos periféricos e decorativos para ocupar melhor a largura final, sem deformar nem redesenhar o miolo principal. "
        "Não altere textos existentes, datas, CTA, logotipos, títulos, nomes de cidades ou tipografia principal. "
        "É proibido blur, espelhamento, duplicação artificial, faixas repetidas, botões duplicados, veículos duplicados, clusters duplicados ou costuras visíveis. "
        f"A recomposição deve priorizar a janela útil final x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
        f"A safe area interna útil mede aproximadamente {safe_width}x{safe_height}. "
        f"A área principal protegida mede aproximadamente {preserve_width}x{preserve_height}. "
        f"Use intensidade de recomposição {normalized_strength}. "
        + ("A composição principal já veio pré-organizada dentro da janela final; trate essa estrutura como layout-base e faça apenas harmonização visual, sem reinventar a peça. " if layout_first_non_native else "")
        + f"{user_clause}"
        f"A entrega final precisa ficar pronta para crop técnico exato em {target_width}x{target_height}."
    )


def finalize_exact_size_expand(
    expanded_bytes: bytes,
    source_canvas_bytes: bytes,
    plan: Dict[str, Any],
    hard_preserve_boxes: Optional[Sequence[Tuple[int, int, int, int]]] = None,
    hard_feather: int = 8,
    hard_preserve_limits: Optional[Dict[str, float]] = None,
) -> bytes:
    merged_bytes = overlay_hard_preserve_regions(
        expanded_bytes=expanded_bytes,
        source_canvas_bytes=source_canvas_bytes,
        hard_boxes=list(hard_preserve_boxes or []),
        feather_px=int(hard_feather or 0),
        sanitize_limits=hard_preserve_limits,
    )

    crop_rect = tuple(int(v) for v in plan["crop_rect"])
    target_width = int(plan["target_width"])
    target_height = int(plan["target_height"])

    with Image.open(io.BytesIO(merged_bytes)) as merged_im:
        cropped = merged_im.convert("RGBA").crop(crop_rect)
        if cropped.size != (target_width, target_height):
            cropped = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
        return _encode_png_bytes(cropped)
