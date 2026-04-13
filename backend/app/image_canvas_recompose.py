from __future__ import annotations

import io
import math
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _encode_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _clamp_int(value: float | int, minimum: int, maximum: int) -> int:
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    return int(max(minimum, min(maximum, round(float(value)))))


def _fit_with_scale(source_width: int, source_height: int, target_width: int, target_height: int, scale: float) -> Tuple[int, int]:
    width = max(1, int(round(source_width * scale)))
    height = max(1, int(round(source_height * scale)))
    return width, height


def _estimate_saliency_bbox(source: Image.Image) -> Dict[str, int]:
    rgba = source.convert("RGBA")
    source_width, source_height = rgba.size

    longest_side = max(source_width, source_height)
    reduction = min(1.0, 448.0 / max(1.0, float(longest_side)))
    reduced_width = max(48, int(round(source_width * reduction)))
    reduced_height = max(48, int(round(source_height * reduction)))

    reduced = rgba.resize((reduced_width, reduced_height), Image.Resampling.LANCZOS)
    arr = np.asarray(reduced).astype(np.float32)

    rgb = arr[..., :3]
    alpha = arr[..., 3] / 255.0

    if float(alpha.mean()) <= 0.01:
        return {
            "x1": int(source_width * 0.2),
            "y1": int(source_height * 0.18),
            "x2": int(source_width * 0.8),
            "y2": int(source_height * 0.82),
            "center_x": int(source_width * 0.5),
            "center_y": int(source_height * 0.5),
        }

    gray = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    saturation = np.max(rgb, axis=2) - np.min(rgb, axis=2)

    grad_x = np.zeros_like(gray)
    grad_y = np.zeros_like(gray)
    grad_x[:, 1:] = np.abs(gray[:, 1:] - gray[:, :-1])
    grad_y[1:, :] = np.abs(gray[1:, :] - gray[:-1, :])

    gray_image = Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8), mode="L")
    blur = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(radius=8))).astype(np.float32)
    local_contrast = np.abs(gray - blur)

    score = (
        grad_x * 0.55
        + grad_y * 0.55
        + saturation * 0.28
        + local_contrast * 0.42
    )
    score *= np.clip(alpha, 0.0, 1.0)

    yy, xx = np.mgrid[0:reduced_height, 0:reduced_width]
    vertical_focus = 1.0 - (np.abs((yy / max(1, reduced_height - 1)) - 0.48) * 0.35)
    horizontal_focus = 1.0 - (np.abs((xx / max(1, reduced_width - 1)) - 0.5) * 0.15)
    score *= np.clip(vertical_focus * horizontal_focus, 0.55, 1.0)

    non_zero = score[score > 0]
    if non_zero.size == 0:
        return {
            "x1": int(source_width * 0.2),
            "y1": int(source_height * 0.18),
            "x2": int(source_width * 0.8),
            "y2": int(source_height * 0.82),
            "center_x": int(source_width * 0.5),
            "center_y": int(source_height * 0.5),
        }

    threshold = float(np.percentile(non_zero, 85))
    ys, xs = np.where(score >= threshold)
    if xs.size == 0 or ys.size == 0:
        return {
            "x1": int(source_width * 0.2),
            "y1": int(source_height * 0.18),
            "x2": int(source_width * 0.8),
            "y2": int(source_height * 0.82),
            "center_x": int(source_width * 0.5),
            "center_y": int(source_height * 0.5),
        }

    x1_small = int(xs.min())
    y1_small = int(ys.min())
    x2_small = int(xs.max()) + 1
    y2_small = int(ys.max()) + 1

    def scale_back_x(value: int) -> int:
        return _clamp_int(value / reduction, 0, source_width)

    def scale_back_y(value: int) -> int:
        return _clamp_int(value / reduction, 0, source_height)

    x1 = scale_back_x(x1_small)
    y1 = scale_back_y(y1_small)
    x2 = scale_back_x(x2_small)
    y2 = scale_back_y(y2_small)

    center_x = _clamp_int(((x1_small + x2_small) * 0.5) / reduction, 0, source_width)
    center_y = _clamp_int(((y1_small + y2_small) * 0.5) / reduction, 0, source_height)

    if x2 <= x1:
        x1, x2 = int(source_width * 0.25), int(source_width * 0.75)
    if y2 <= y1:
        y1, y2 = int(source_height * 0.2), int(source_height * 0.8)

    return {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "center_x": center_x,
        "center_y": center_y,
    }


def _strength_config(level: str) -> Dict[str, float]:
    normalized = (level or "medium").strip().lower()
    if normalized == "low":
        return {
            "zoom_base": 1.05,
            "zoom_bonus": 0.07,
            "preserve_ratio_x": 0.82,
            "preserve_ratio_y": 0.84,
            "saliency_padding": 0.12,
            "feather_px": 56,
            "mask_blur": 3,
        }
    if normalized == "high":
        return {
            "zoom_base": 1.13,
            "zoom_bonus": 0.14,
            "preserve_ratio_x": 0.66,
            "preserve_ratio_y": 0.72,
            "saliency_padding": 0.19,
            "feather_px": 96,
            "mask_blur": 5,
        }
    return {
        "zoom_base": 1.09,
        "zoom_bonus": 0.1,
        "preserve_ratio_x": 0.74,
        "preserve_ratio_y": 0.78,
        "saliency_padding": 0.16,
        "feather_px": 76,
        "mask_blur": 4,
    }


def build_recompose_expand_assets(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    strength: str = "medium",
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    if source_width <= 0 or source_height <= 0:
        raise ValueError("Imagem de referência inválida para recomposição de canvas.")

    config = _strength_config(strength)
    source_ratio = source_width / max(1, source_height)
    target_ratio = target_width / max(1, target_height)
    ratio_gap = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))

    contain_scale = min(target_width / source_width, target_height / source_height)
    zoom_multiplier = config["zoom_base"] + min(config["zoom_bonus"], ratio_gap * 0.12)
    render_scale = contain_scale * zoom_multiplier

    placed_width, placed_height = _fit_with_scale(
        source_width,
        source_height,
        target_width,
        target_height,
        render_scale,
    )
    rendered = source.resize((placed_width, placed_height), Image.Resampling.LANCZOS)

    saliency = _estimate_saliency_bbox(source)
    saliency_center_x = saliency["center_x"] * render_scale
    saliency_center_y = saliency["center_y"] * render_scale

    desired_center_x = target_width * 0.5
    desired_center_y = target_height * 0.48

    if placed_width > target_width:
        min_x = target_width - placed_width
        max_x = 0
    else:
        min_x = 0
        max_x = target_width - placed_width

    if placed_height > target_height:
        min_y = target_height - placed_height
        max_y = 0
    else:
        min_y = 0
        max_y = target_height - placed_height

    placement_x = _clamp_int(desired_center_x - saliency_center_x, min_x, max_x)
    placement_y = _clamp_int(desired_center_y - saliency_center_y, min_y, max_y)

    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    canvas.alpha_composite(rendered, (placement_x, placement_y))

    visible_x1 = max(0, placement_x)
    visible_y1 = max(0, placement_y)
    visible_x2 = min(target_width, placement_x + placed_width)
    visible_y2 = min(target_height, placement_y + placed_height)

    visible_width = max(1, visible_x2 - visible_x1)
    visible_height = max(1, visible_y2 - visible_y1)

    box_margin_x = max(12, int(round(visible_width * (1.0 - config["preserve_ratio_x"]) * 0.5)))
    box_margin_y = max(12, int(round(visible_height * (1.0 - config["preserve_ratio_y"]) * 0.5)))
    central_box = (
        visible_x1 + box_margin_x,
        visible_y1 + box_margin_y,
        visible_x2 - box_margin_x,
        visible_y2 - box_margin_y,
    )

    saliency_box = (
        _clamp_int(placement_x + saliency["x1"] * render_scale, visible_x1, visible_x2),
        _clamp_int(placement_y + saliency["y1"] * render_scale, visible_y1, visible_y2),
        _clamp_int(placement_x + saliency["x2"] * render_scale, visible_x1, visible_x2),
        _clamp_int(placement_y + saliency["y2"] * render_scale, visible_y1, visible_y2),
    )

    inflate_x = max(16, int(round(visible_width * config["saliency_padding"])))
    inflate_y = max(16, int(round(visible_height * config["saliency_padding"])))
    preserve_x1 = max(visible_x1, min(central_box[0], saliency_box[0] - inflate_x))
    preserve_y1 = max(visible_y1, min(central_box[1], saliency_box[1] - inflate_y))
    preserve_x2 = min(visible_x2, max(central_box[2], saliency_box[2] + inflate_x))
    preserve_y2 = min(visible_y2, max(central_box[3], saliency_box[3] + inflate_y))

    preserve_box = (
        int(preserve_x1),
        int(preserve_y1),
        int(max(preserve_x1 + 1, preserve_x2)),
        int(max(preserve_y1 + 1, preserve_y2)),
    )

    mask = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        preserve_box,
        radius=max(10, int(round(min(visible_width, visible_height) * 0.02))),
        fill=(255, 255, 255, 255),
    )
    if int(config["mask_blur"]) > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=float(config["mask_blur"])))

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": {
            "x": int(placement_x),
            "y": int(placement_y),
            "width": int(placed_width),
            "height": int(placed_height),
            "target_width": int(target_width),
            "target_height": int(target_height),
        },
        "preserve_box": preserve_box,
        "feather_px": int(config["feather_px"]),
        "strategy": "recompose",
        "strength": (strength or "medium").strip().lower() or "medium",
        "saliency_box": saliency_box,
        "ratio_gap": float(ratio_gap),
    }


def build_recompose_expand_prompt(
    requested_width: int,
    requested_height: int,
    placement: Dict[str, int],
    preserve_box: Tuple[int, int, int, int],
    strength: str = "medium",
) -> str:
    normalized_strength = (strength or "medium").strip().lower() or "medium"
    preserve_width = max(1, preserve_box[2] - preserve_box[0])
    preserve_height = max(1, preserve_box[3] - preserve_box[1])

    return (
        "Adapte a peça para o novo formato como se ela tivesse sido originalmente composta nesse enquadramento. "
        "A referência enviada continua sendo a base dominante da identidade visual, da hierarquia e da cena. "
        "Preserve exatamente a área central protegida e trate as regiões externas e de transição como áreas de recomposição controlada. "
        "Redistribua com sutileza elementos secundários, linhas de luz, painéis, trilhas, vegetação, profundidade e respiros laterais para ocupar melhor a largura do banner. "
        "Quando necessário, reposicione levemente elementos decorativos periféricos em direção às bordas para evitar que tudo fique comprimido no centro. "
        "Não redesenhe textos existentes, datas, CTA, logos, títulos, nomes de cidades, marcas nem elementos tipográficos principais. "
        "É proibido criar linha visível de transição entre a arte original e a área recombinada. "
        "É proibido duplicar ícones, HUDs, veículos, botões, faixas de luz, dashboards ou clusters gráficos. "
        "Não espelhe a imagem, não copie bordas, não replique blocos inteiros, não gere remendos retos e não deixe padrões repetidos. "
        "A adaptação deve parecer uma recomposição premium de direção de arte, e não um expand automático. "
        f"Use recomposição horizontal com intensidade {normalized_strength}. "
        f"A área central protegida mede aproximadamente {preserve_width}x{preserve_height} dentro de um canvas {placement.get('target_width')}x{placement.get('target_height')}. "
        f"Entregue a peça final pronta para {requested_width}x{requested_height}, com acabamento limpo, sem seams e sem duplicações."
    )


def overlay_preserved_core_on_expanded(
    expanded_bytes: bytes,
    source_canvas_bytes: bytes,
    preserve_box: Tuple[int, int, int, int],
    feather_px: int = 76,
) -> bytes:
    with Image.open(io.BytesIO(expanded_bytes)) as expanded_im, Image.open(io.BytesIO(source_canvas_bytes)) as source_canvas_im:
        expanded = expanded_im.convert("RGBA")
        source_canvas = source_canvas_im.convert("RGBA")

        if expanded.size != source_canvas.size:
            source_canvas = source_canvas.resize(expanded.size, Image.Resampling.LANCZOS)

        mask = Image.new("L", expanded.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rectangle(preserve_box, fill=255)
        if feather_px > 0:
            mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, int(feather_px))))

        blended = Image.composite(source_canvas, expanded, mask)
        return _encode_png_bytes(blended)
