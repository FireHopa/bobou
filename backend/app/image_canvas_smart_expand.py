
from __future__ import annotations

import io
import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


Rect = Tuple[int, int, int, int]


def _encode_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _clamp_int(value: float | int, minimum: int, maximum: int) -> int:
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    return int(max(minimum, min(maximum, round(float(value)))))


def _fit_contain(width: int, height: int, target_width: int, target_height: int) -> Tuple[int, int]:
    scale = min(target_width / max(1.0, float(width)), target_height / max(1.0, float(height)))
    return (
        max(1, int(round(width * scale))),
        max(1, int(round(height * scale))),
    )


def _fit_cover(width: int, height: int, target_width: int, target_height: int) -> Tuple[int, int]:
    scale = max(target_width / max(1.0, float(width)), target_height / max(1.0, float(height)))
    return (
        max(1, int(round(width * scale))),
        max(1, int(round(height * scale))),
    )


def _inflate_rect(rect: Rect, pad_x: int, pad_y: int, width: int, height: int) -> Rect:
    return (
        max(0, rect[0] - max(0, int(pad_x))),
        max(0, rect[1] - max(0, int(pad_y))),
        min(width, rect[2] + max(0, int(pad_x))),
        min(height, rect[3] + max(0, int(pad_y))),
    )


def _merge_rects(rects: Sequence[Rect]) -> Optional[Rect]:
    valid = [r for r in rects if r[2] > r[0] and r[3] > r[1]]
    if not valid:
        return None
    return (
        min(r[0] for r in valid),
        min(r[1] for r in valid),
        max(r[2] for r in valid),
        max(r[3] for r in valid),
    )


def _map_source_rect_to_canvas(rect: Rect, placement: Dict[str, int], source_width: int, source_height: int) -> Rect:
    scale_x = placement["width"] / max(1.0, float(source_width))
    scale_y = placement["height"] / max(1.0, float(source_height))
    return (
        _clamp_int(placement["x"] + rect[0] * scale_x, 0, placement["target_width"]),
        _clamp_int(placement["y"] + rect[1] * scale_y, 0, placement["target_height"]),
        _clamp_int(placement["x"] + rect[2] * scale_x, 0, placement["target_width"]),
        _clamp_int(placement["y"] + rect[3] * scale_y, 0, placement["target_height"]),
    )


def _estimate_saliency_bbox(source: Image.Image) -> Rect:
    rgba = source.convert("RGBA")
    width, height = rgba.size

    longest_side = max(width, height)
    reduction = min(1.0, 448.0 / max(1.0, float(longest_side)))
    reduced_width = max(48, int(round(width * reduction)))
    reduced_height = max(48, int(round(height * reduction)))

    reduced = rgba.resize((reduced_width, reduced_height), Image.Resampling.LANCZOS)
    arr = np.asarray(reduced).astype(np.float32)

    rgb = arr[..., :3]
    alpha = arr[..., 3] / 255.0

    if float(alpha.mean()) <= 0.01:
        return (
            int(width * 0.24),
            int(height * 0.18),
            int(width * 0.76),
            int(height * 0.82),
        )

    gray = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    saturation = np.max(rgb, axis=2) - np.min(rgb, axis=2)

    grad_x = np.zeros_like(gray)
    grad_y = np.zeros_like(gray)
    grad_x[:, 1:] = np.abs(gray[:, 1:] - gray[:, :-1])
    grad_y[1:, :] = np.abs(gray[1:, :] - gray[:-1, :])

    gray_image = Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8), mode="L")
    local_contrast = np.abs(gray - np.asarray(gray_image.filter(ImageFilter.GaussianBlur(radius=7))).astype(np.float32))

    score = (
        grad_x * 0.52
        + grad_y * 0.52
        + saturation * 0.24
        + local_contrast * 0.35
    )
    score *= np.clip(alpha, 0.0, 1.0)

    yy, xx = np.mgrid[0:reduced_height, 0:reduced_width]
    vertical_focus = 1.0 - (np.abs((yy / max(1, reduced_height - 1)) - 0.5) * 0.28)
    horizontal_focus = 1.0 - (np.abs((xx / max(1, reduced_width - 1)) - 0.5) * 0.16)
    score *= np.clip(vertical_focus * horizontal_focus, 0.62, 1.0)

    non_zero = score[score > 0]
    if non_zero.size == 0:
        return (
            int(width * 0.24),
            int(height * 0.18),
            int(width * 0.76),
            int(height * 0.82),
        )

    threshold = float(np.percentile(non_zero, 86))
    ys, xs = np.where(score >= threshold)
    if xs.size == 0 or ys.size == 0:
        return (
            int(width * 0.24),
            int(height * 0.18),
            int(width * 0.76),
            int(height * 0.82),
        )

    x1_small = int(xs.min())
    y1_small = int(ys.min())
    x2_small = int(xs.max()) + 1
    y2_small = int(ys.max()) + 1

    def sx(value: int) -> int:
        return _clamp_int(value / reduction, 0, width)

    def sy(value: int) -> int:
        return _clamp_int(value / reduction, 0, height)

    x1 = sx(x1_small)
    y1 = sy(y1_small)
    x2 = sx(x2_small)
    y2 = sy(y2_small)

    if x2 <= x1:
        x1, x2 = int(width * 0.24), int(width * 0.76)
    if y2 <= y1:
        y1, y2 = int(height * 0.18), int(height * 0.82)

    return (x1, y1, x2, y2)


def _strategy_profile(level: str) -> Dict[str, float]:
    normalized = (level or "medium").strip().lower()
    if normalized == "low":
        return {
            "preserve_x": 0.54,
            "preserve_y": 0.52,
            "text_pad_x": 0.10,
            "text_pad_y": 0.22,
            "core_blur": 2.0,
            "hard_feather": 7.0,
            "bg_blur": 20.0,
            "bg_darken": 0.88,
            "saliency_pad": 0.08,
        }
    if normalized == "high":
        return {
            "preserve_x": 0.46,
            "preserve_y": 0.46,
            "text_pad_x": 0.14,
            "text_pad_y": 0.26,
            "core_blur": 2.5,
            "hard_feather": 8.0,
            "bg_blur": 28.0,
            "bg_darken": 0.84,
            "saliency_pad": 0.11,
        }
    return {
        "preserve_x": 0.50,
        "preserve_y": 0.49,
        "text_pad_x": 0.12,
        "text_pad_y": 0.24,
        "core_blur": 2.2,
        "hard_feather": 8.0,
        "bg_blur": 24.0,
        "bg_darken": 0.86,
        "saliency_pad": 0.10,
    }


def build_smart_expand_assets(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    text_rects: Optional[Sequence[Rect]] = None,
    strength: str = "medium",
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    profile = _strategy_profile(strength)

    bg_width, bg_height = _fit_cover(source_width, source_height, target_width, target_height)
    background = source.resize((bg_width, bg_height), Image.Resampling.LANCZOS)
    background = background.crop((
        max(0, (bg_width - target_width) // 2),
        max(0, (bg_height - target_height) // 2),
        max(0, (bg_width - target_width) // 2) + target_width,
        max(0, (bg_height - target_height) // 2) + target_height,
    ))
    background = background.filter(ImageFilter.GaussianBlur(radius=float(profile["bg_blur"])))
    background = ImageEnhance.Brightness(background).enhance(float(profile["bg_darken"]))

    placed_width, placed_height = _fit_contain(source_width, source_height, target_width, target_height)
    placement_x = max(0, (target_width - placed_width) // 2)
    placement_y = max(0, (target_height - placed_height) // 2)

    placed = source.resize((placed_width, placed_height), Image.Resampling.LANCZOS)

    canvas = background.copy()
    canvas.alpha_composite(placed, (placement_x, placement_y))

    placement = {
        "x": int(placement_x),
        "y": int(placement_y),
        "width": int(placed_width),
        "height": int(placed_height),
        "target_width": int(target_width),
        "target_height": int(target_height),
    }

    visible_rect = (
        placement_x,
        placement_y,
        placement_x + placed_width,
        placement_y + placed_height,
    )

    saliency_source = _estimate_saliency_bbox(source)
    saliency_canvas = _map_source_rect_to_canvas(saliency_source, placement, source_width, source_height)
    saliency_pad_x = max(10, int(round(placed_width * profile["saliency_pad"])))
    saliency_pad_y = max(10, int(round(placed_height * profile["saliency_pad"])))
    saliency_canvas = _inflate_rect(saliency_canvas, saliency_pad_x, saliency_pad_y, target_width, target_height)

    central_core = (
        _clamp_int(placement_x + placed_width * (0.5 - profile["preserve_x"] * 0.5), 0, target_width),
        _clamp_int(placement_y + placed_height * (0.5 - profile["preserve_y"] * 0.5), 0, target_height),
        _clamp_int(placement_x + placed_width * (0.5 + profile["preserve_x"] * 0.5), 0, target_width),
        _clamp_int(placement_y + placed_height * (0.5 + profile["preserve_y"] * 0.5), 0, target_height),
    )

    mapped_text_rects: List[Rect] = []
    for rect in list(text_rects or []):
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue
        mapped = _map_source_rect_to_canvas(rect, placement, source_width, source_height)
        rect_width = max(1, mapped[2] - mapped[0])
        rect_height = max(1, mapped[3] - mapped[1])
        pad_x = max(6, int(round(rect_width * profile["text_pad_x"])))
        pad_y = max(6, int(round(rect_height * profile["text_pad_y"])))
        mapped_text_rects.append(_inflate_rect(mapped, pad_x, pad_y, target_width, target_height))

    text_union = _merge_rects(mapped_text_rects)
    preserve_union = _merge_rects([central_core, saliency_canvas] + ([text_union] if text_union else [])) or central_core

    preserve_mask = Image.new("L", (target_width, target_height), 0)
    draw = ImageDraw.Draw(preserve_mask)
    draw.rounded_rectangle(
        preserve_union,
        radius=max(10, int(round(min(placed_width, placed_height) * 0.02))),
        fill=200,
    )

    for rect in mapped_text_rects:
        draw.rounded_rectangle(
            rect,
            radius=max(6, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.18))),
            fill=255,
        )

    preserve_mask = preserve_mask.filter(ImageFilter.GaussianBlur(radius=float(profile["core_blur"])))

    for rect in mapped_text_rects:
        ImageDraw.Draw(preserve_mask).rounded_rectangle(
            rect,
            radius=max(6, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.18))),
            fill=255,
        )

    mask = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    mask.putalpha(preserve_mask)

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": placement,
        "visible_rect": visible_rect,
        "preserve_union": preserve_union,
        "hard_preserve_boxes": mapped_text_rects,
        "hard_feather": int(profile["hard_feather"]),
        "strategy": "smart_recompose",
        "strength": (strength or "medium").strip().lower() or "medium",
    }


def build_smart_expand_prompt(
    requested_width: int,
    requested_height: int,
    placement: Dict[str, int],
    preserve_union: Rect,
    strength: str = "medium",
) -> str:
    normalized_strength = (strength or "medium").strip().lower() or "medium"
    preserve_width = max(1, preserve_union[2] - preserve_union[0])
    preserve_height = max(1, preserve_union[3] - preserve_union[1])

    return (
        "Adapte a arte para o novo formato como uma recomposição premium, e não como um simples expand automático. "
        "A referência enviada continua sendo a base dominante da identidade visual, da cena, da paleta e da hierarquia. "
        "Preserve integralmente o conteúdo principal dentro da área protegida e use as regiões externas e de transição para redistribuir com sutileza vegetação, profundidade, céu, trilhas de luz, reflexos, HUDs e respiros laterais. "
        "Permita um reposicionamento leve apenas de elementos periféricos e decorativos para ocupar melhor a largura do banner, sem deformar nem redesenhar o miolo principal. "
        "Não altere textos existentes, datas, CTA, logotipos, títulos, nomes de cidades ou tipografia principal. "
        "É proibido criar linhas visíveis de junção, repetir faixas verticais, espelhar a imagem, clonar ícones, duplicar veículos, duplicar botões, duplicar clusters gráficos ou copiar bordas. "
        "As transições entre a arte original e a área recombinada devem ficar invisíveis. "
        f"A recomposição deve respeitar um canvas final de {requested_width}x{requested_height}. "
        f"A área principal protegida mede aproximadamente {preserve_width}x{preserve_height} dentro de um canvas {placement.get('target_width')}x{placement.get('target_height')}. "
        f"Use intensidade de recomposição {normalized_strength}, mantendo o resultado limpo, natural e sem artefatos."
    )



def _normalize_rect_to_canvas(rect: Rect, canvas_width: int, canvas_height: int) -> Optional[Rect]:
    if rect is None or len(rect) != 4:
        return None

    x1 = _clamp_int(rect[0], 0, canvas_width)
    y1 = _clamp_int(rect[1], 0, canvas_height)
    x2 = _clamp_int(rect[2], 0, canvas_width)
    y2 = _clamp_int(rect[3], 0, canvas_height)

    if x2 <= x1 or y2 <= y1:
        return None
    return (x1, y1, x2, y2)


def sanitize_hard_preserve_boxes(
    hard_boxes: Sequence[Rect],
    canvas_width: int,
    canvas_height: int,
    max_area_ratio: float = 0.18,
    max_width_ratio: float = 0.60,
    max_height_ratio: float = 0.30,
) -> Dict[str, Any]:
    canvas_area = max(1, int(canvas_width) * int(canvas_height))
    accepted: List[Rect] = []
    rejected: List[Dict[str, Any]] = []
    seen: set[Rect] = set()

    for raw_rect in hard_boxes or []:
        rect = _normalize_rect_to_canvas(raw_rect, int(canvas_width), int(canvas_height))
        if rect is None:
            rejected.append({
                "rect": list(raw_rect) if raw_rect is not None else None,
                "reason": "invalid_rect",
            })
            continue

        if rect in seen:
            continue
        seen.add(rect)

        rect_width = max(1, rect[2] - rect[0])
        rect_height = max(1, rect[3] - rect[1])
        area_ratio = (rect_width * rect_height) / float(canvas_area)
        width_ratio = rect_width / max(1.0, float(canvas_width))
        height_ratio = rect_height / max(1.0, float(canvas_height))

        if (
            area_ratio > float(max_area_ratio)
            or width_ratio > float(max_width_ratio)
            or height_ratio > float(max_height_ratio)
        ):
            rejected.append({
                "rect": list(rect),
                "reason": "box_too_large",
                "area_ratio": area_ratio,
                "width_ratio": width_ratio,
                "height_ratio": height_ratio,
            })
            continue

        accepted.append(rect)

    largest_applied_area_ratio = 0.0
    if accepted:
        largest_applied_area_ratio = max(
            ((max(1, rect[2] - rect[0]) * max(1, rect[3] - rect[1])) / float(canvas_area))
            for rect in accepted
        )

    return {
        "boxes": accepted,
        "rejected_boxes": rejected,
        "input_count": len(list(hard_boxes or [])),
        "applied_count": len(accepted),
        "largest_applied_area_ratio": largest_applied_area_ratio,
        "limits": {
            "max_area_ratio": float(max_area_ratio),
            "max_width_ratio": float(max_width_ratio),
            "max_height_ratio": float(max_height_ratio),
        },
    }


def overlay_hard_preserve_regions(
    expanded_bytes: bytes,
    source_canvas_bytes: bytes,
    hard_boxes: Sequence[Rect],
    feather_px: int = 8,
) -> bytes:
    if not hard_boxes:
        return expanded_bytes

    with Image.open(io.BytesIO(expanded_bytes)) as expanded_im, Image.open(io.BytesIO(source_canvas_bytes)) as source_canvas_im:
        expanded = expanded_im.convert("RGBA")
        source_canvas = source_canvas_im.convert("RGBA")

        if expanded.size != source_canvas.size:
            source_canvas = source_canvas.resize(expanded.size, Image.Resampling.LANCZOS)

        sanitized = sanitize_hard_preserve_boxes(
            hard_boxes=hard_boxes,
            canvas_width=expanded.width,
            canvas_height=expanded.height,
        )
        safe_boxes = list(sanitized["boxes"])
        if not safe_boxes:
            return expanded_bytes

        result = expanded.copy()

        for rect in safe_boxes:
            mask = Image.new("L", expanded.size, 0)
            draw = ImageDraw.Draw(mask)
            draw.rounded_rectangle(rect, radius=max(4, int(feather_px)), fill=255)
            if feather_px > 0:
                mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, int(feather_px))))
            result = Image.composite(source_canvas, result, mask)

        return _encode_png_bytes(result)
