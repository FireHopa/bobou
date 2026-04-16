
from __future__ import annotations

import io
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

Rect = Tuple[int, int, int, int]


def _clamp_int(value: float | int, minimum: int, maximum: int) -> int:
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    return int(max(minimum, min(maximum, round(float(value)))))


def _fit_contain(width: int, height: int, target_width: int, target_height: int) -> Tuple[int, int]:
    scale = min(
        target_width / max(1.0, float(width)),
        target_height / max(1.0, float(height)),
    )
    return (
        max(1, int(round(width * scale))),
        max(1, int(round(height * scale))),
    )


def _fit_cover(width: int, height: int, target_width: int, target_height: int) -> Tuple[int, int]:
    scale = max(
        target_width / max(1.0, float(width)),
        target_height / max(1.0, float(height)),
    )
    return (
        max(1, int(round(width * scale))),
        max(1, int(round(height * scale))),
    )


def _fit_with_scale(width: int, height: int, scale: float) -> Tuple[int, int]:
    return (
        max(1, int(round(width * max(1e-6, float(scale))))),
        max(1, int(round(height * max(1e-6, float(scale))))),
    )


def _encode_png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _inset_rect(rect: Rect, inset_x: int, inset_y: int) -> Rect:
    x1, y1, x2, y2 = rect
    inset_x = max(0, int(inset_x))
    inset_y = max(0, int(inset_y))
    new_x1 = min(x2 - 1, x1 + inset_x)
    new_y1 = min(y2 - 1, y1 + inset_y)
    new_x2 = max(new_x1 + 1, x2 - inset_x)
    new_y2 = max(new_y1 + 1, y2 - inset_y)
    return (new_x1, new_y1, new_x2, new_y2)


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


def _rect_iou(a: Rect, b: Rect) -> float:
    inter_x1 = max(a[0], b[0])
    inter_y1 = max(a[1], b[1])
    inter_x2 = min(a[2], b[2])
    inter_y2 = min(a[3], b[3])
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h
    if intersection <= 0:
        return 0.0
    union = _rect_area(a) + _rect_area(b) - intersection
    return intersection / float(max(1, union))


def _rect_size(rect: Rect) -> Tuple[int, int]:
    return (max(1, rect[2] - rect[0]), max(1, rect[3] - rect[1]))


def _rect_area(rect: Rect) -> int:
    width, height = _rect_size(rect)
    return width * height


def _rect_center(rect: Rect) -> Tuple[float, float]:
    return ((rect[0] + rect[2]) * 0.5, (rect[1] + rect[3]) * 0.5)


def _map_source_rect_to_canvas(rect: Rect, placement: Dict[str, int], source_width: int, source_height: int) -> Rect:
    scale_x = placement["width"] / max(1.0, float(source_width))
    scale_y = placement["height"] / max(1.0, float(source_height))
    return (
        _clamp_int(placement["x"] + rect[0] * scale_x, 0, placement["target_width"]),
        _clamp_int(placement["y"] + rect[1] * scale_y, 0, placement["target_height"]),
        _clamp_int(placement["x"] + rect[2] * scale_x, 0, placement["target_width"]),
        _clamp_int(placement["y"] + rect[3] * scale_y, 0, placement["target_height"]),
    )


def _rect_outside_safe(rect: Rect, safe_rect: Rect) -> bool:
    return (
        rect[0] < safe_rect[0]
        or rect[1] < safe_rect[1]
        or rect[2] > safe_rect[2]
        or rect[3] > safe_rect[3]
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
    blur = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(radius=7))).astype(np.float32)
    local_contrast = np.abs(gray - blur)

    score = (
        grad_x * 0.52
        + grad_y * 0.52
        + saturation * 0.22
        + local_contrast * 0.36
    )
    score *= np.clip(alpha, 0.0, 1.0)

    yy, xx = np.mgrid[0:reduced_height, 0:reduced_width]
    vertical_focus = 1.0 - (np.abs((yy / max(1, reduced_height - 1)) - 0.5) * 0.28)
    horizontal_focus = 1.0 - (np.abs((xx / max(1, reduced_width - 1)) - 0.5) * 0.18)
    score *= np.clip(vertical_focus * horizontal_focus, 0.58, 1.0)

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


def _base_strength_profile(level: str) -> Dict[str, float]:
    normalized = (level or "medium").strip().lower()
    if normalized == "low":
        return {
            "render_pad_x": 0.05,
            "render_pad_y": 0.06,
            "safe_pad_x": 0.04,
            "safe_pad_y": 0.06,
            "text_pad_x": 0.08,
            "text_pad_y": 0.18,
            "saliency_pad": 0.08,
            "mask_blur": 3.0,
            "union_radius_ratio": 0.022,
            "text_radius_ratio": 0.18,
            "core_alpha": 188.0,
            "saliency_alpha": 208.0,
            "hard_feather": 8.0,
        }
    if normalized == "high":
        return {
            "render_pad_x": 0.12,
            "render_pad_y": 0.12,
            "safe_pad_x": 0.08,
            "safe_pad_y": 0.10,
            "text_pad_x": 0.14,
            "text_pad_y": 0.28,
            "saliency_pad": 0.12,
            "mask_blur": 4.0,
            "union_radius_ratio": 0.026,
            "text_radius_ratio": 0.20,
            "core_alpha": 172.0,
            "saliency_alpha": 196.0,
            "hard_feather": 9.0,
        }
    return {
        "render_pad_x": 0.08,
        "render_pad_y": 0.09,
        "safe_pad_x": 0.06,
        "safe_pad_y": 0.08,
        "text_pad_x": 0.12,
        "text_pad_y": 0.24,
        "saliency_pad": 0.10,
        "mask_blur": 3.5,
        "union_radius_ratio": 0.024,
        "text_radius_ratio": 0.19,
        "core_alpha": 180.0,
        "saliency_alpha": 202.0,
        "hard_feather": 8.0,
    }


def _choose_strength(score: int) -> str:
    if score >= 5:
        return "high"
    if score >= 3:
        return "medium"
    return "low"



def _normalize_instruction_text(text: Optional[str]) -> str:
    return " ".join((text or "").strip().lower().split())


def infer_exact_size_request_intent(instruction_text: Optional[str]) -> Dict[str, bool]:
    normalized = _normalize_instruction_text(instruction_text)

    def has_any(patterns: Sequence[str]) -> bool:
        return any(pattern in normalized for pattern in patterns)

    preserve_all_visuals = has_any((
        "mantenha todos os elementos visuais",
        "manter todos os elementos visuais",
        "preserve todos os elementos visuais",
        "preserve todos os elementos",
        "mantenha todos os elementos",
        "preservando todos os elementos",
        "keep all visual elements",
        "preserve all visual elements",
        "keep every visual element",
    ))
    minimal_change = has_any((
        "somente as adaptações necessárias",
        "somente adaptacoes necessarias",
        "apenas as adaptações necessárias",
        "apenas adaptacoes necessarias",
        "só as adaptações necessárias",
        "so as adaptacoes necessarias",
        "mude o mínimo possível",
        "mude o minimo possivel",
        "mude o mínimo",
        "mude o minimo",
        "preservar enquadramento original",
        "preserve o enquadramento original",
        "manter enquadramento original",
        "mantenha o enquadramento original",
        "preserve original framing",
        "preserve the original framing",
        "keep original framing",
        "keep the original framing",
        "only the necessary adaptations",
        "only the needed adaptations",
        "minimal changes",
        "change only what is necessary",
    ))
    avoid_background_rewrite = has_any((
        "não mude o fundo",
        "nao mude o fundo",
        "sem mudar o fundo",
        "preserve o fundo",
        "mantenha o fundo",
        "same background",
        "keep the background",
        "preserve the background",
    ))
    allow_layout_recompose = has_any((
        "recomposição",
        "recomposicao",
        "recompor",
        "reposicionar",
        "reposicione",
        "reorganizar",
        "reorganização",
        "reorganizacao",
        "reorganização inteligente",
        "reorganizacao inteligente",
        "layout inteligente",
        "reequilibrar",
        "adaptar a diagramação",
        "adaptar a diagramacao",
        "reflow",
        "rebalance",
        "recompose",
        "layout",
    ))
    commercial_preservation = has_any((
        "função comercial",
        "funcao comercial",
        "badge",
        "cta",
        "call to action",
        "datas e locais",
        "blocos informativos",
        "nenhum elemento importante pode sumir",
        "nenhum elemento obrigatório pode sumir",
        "nenhum elemento obrigatorio pode sumir",
        "nenhum elemento importante pode ser cortado",
        "nenhum elemento obrigatório pode ser cortado",
        "nenhum elemento obrigatorio pode ser cortado",
        "não trate isso como crop simples",
        "nao trate isso como crop simples",
        "não quero apenas crop",
        "nao quero apenas crop",
        "reorganização inteligente de layout",
        "reorganizacao inteligente de layout",
    ))

    strict_preservation = bool(preserve_all_visuals or minimal_change or commercial_preservation)
    return {
        "strict_preservation": strict_preservation,
        "preserve_all_visuals": bool(preserve_all_visuals),
        "minimal_change": bool(minimal_change),
        "avoid_background_rewrite": bool(avoid_background_rewrite),
        "allow_layout_recompose": bool(allow_layout_recompose),
        "commercial_preservation": bool(commercial_preservation),
    }


def _sanitize_exact_size_text_rects(
    text_rects: Optional[Sequence[Rect]],
    source_width: int,
    source_height: int,
) -> Tuple[List[Rect], Dict[str, Any]]:
    sanitized: List[Rect] = []
    dropped: List[Rect] = []

    image_area = float(max(1, source_width * source_height))
    edge_margin_x = max(16, int(round(source_width * 0.018)))
    edge_margin_y = max(16, int(round(source_height * 0.018)))

    for rect in list(text_rects or []):
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue

        x1 = _clamp_int(rect[0], 0, source_width)
        y1 = _clamp_int(rect[1], 0, source_height)
        x2 = _clamp_int(rect[2], 0, source_width)
        y2 = _clamp_int(rect[3], 0, source_height)
        if x2 <= x1 or y2 <= y1:
            continue

        width = x2 - x1
        height = y2 - y1
        area_ratio = (width * height) / image_area
        width_ratio = width / max(1.0, float(source_width))
        height_ratio = height / max(1.0, float(source_height))
        touches_edge = bool(
            x1 <= edge_margin_x
            or y1 <= edge_margin_y
            or x2 >= source_width - edge_margin_x
            or y2 >= source_height - edge_margin_y
        )

        # Peças comerciais costumam ter faixas largas e baixas no topo/rodapé.
        # Não trate esses blocos como ruído só por serem largos.
        wide_short_band = bool(width_ratio >= 0.56 and height_ratio <= 0.15 and area_ratio <= 0.11)
        narrow_tall_label = bool(width_ratio <= 0.28 and height_ratio <= 0.12 and area_ratio <= 0.035)

        unreliable = False
        if width < 18 or height < 10:
            unreliable = True
        if area_ratio >= 0.18 and not wide_short_band:
            unreliable = True
        if width_ratio >= 0.90 and height_ratio >= 0.18:
            unreliable = True
        if width_ratio >= 0.82 and area_ratio >= 0.11 and not wide_short_band:
            unreliable = True
        if touches_edge and area_ratio >= 0.10 and height_ratio >= 0.16 and not wide_short_band:
            unreliable = True
        if width_ratio >= 0.74 and height_ratio >= 0.24 and not narrow_tall_label:
            unreliable = True

        if unreliable:
            dropped.append((x1, y1, x2, y2))
            continue

        sanitized.append((x1, y1, x2, y2))

    union = _merge_rects(sanitized)
    union_area_ratio = (
        _rect_area(union) / image_area
        if union is not None
        else 0.0
    )
    total_area_ratio = sum(_rect_area(rect) for rect in sanitized) / image_area if sanitized else 0.0
    bands = _group_text_rects_by_bands(sanitized, source_width, source_height) if sanitized else []
    band_zones = sorted({_classify_text_band(rect, source_height) for rect in bands}) if bands else []
    multi_zone = len(band_zones) >= 2
    commercial_stack = "top" in band_zones and "bottom" in band_zones

    reliable = bool(sanitized) and (
        (
            union_area_ratio <= 0.30
            and total_area_ratio <= 0.18
            and len(dropped) <= max(3, len(sanitized) + 2)
        )
        or multi_zone
        or commercial_stack
    )

    return sanitized, {
        "reliable": bool(reliable),
        "raw_count": int(len(list(text_rects or []))),
        "sanitized_count": int(len(sanitized)),
        "dropped_count": int(len(dropped)),
        "union_area_ratio": float(union_area_ratio),
        "total_area_ratio": float(total_area_ratio),
        "band_zones": band_zones,
        "multi_zone": bool(multi_zone),
        "commercial_stack": bool(commercial_stack),
        "dropped_rects": dropped,
    }




def detect_exact_size_recompose_profile(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    plan: Dict[str, Any],
    text_rects: Optional[Sequence[Rect]] = None,
    requested_strength: str = "medium",
    instruction_text: str = "",
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_rect = tuple(int(v) for v in plan["crop_rect"])

    intent = infer_exact_size_request_intent(instruction_text)
    raw_text_rects = [tuple(int(v) for v in rect) for rect in list(text_rects or []) if len(rect) == 4]
    sanitized_text_rects, text_meta = _sanitize_exact_size_text_rects(raw_text_rects, source_width, source_height)
    preserve_text_rects = _prepare_text_preserve_rects(raw_text_rects, source_width, source_height)
    mandatory_source_rects = _build_mandatory_source_rects(preserve_text_rects, source_width, source_height)
    background_meta = _analyze_edge_background(source)

    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = target_width / max(1.0, float(target_height))
    orientation_changed = (source_width >= source_height) != (target_width >= target_height)
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))

    default_width, default_height = _fit_contain(source_width, source_height, base_width, base_height)
    default_placement = {
        "x": max(0, (base_width - default_width) // 2),
        "y": max(0, (base_height - default_height) // 2),
        "width": int(default_width),
        "height": int(default_height),
        "target_width": int(base_width),
        "target_height": int(base_height),
    }

    crop_safe_rect = _inset_rect(
        crop_rect,
        max(20, int(round((crop_rect[2] - crop_rect[0]) * 0.06))),
        max(20, int(round((crop_rect[3] - crop_rect[1]) * 0.08))),
    )

    mapped_text_rects: List[Rect] = []
    mapped_mandatory_rects: List[Rect] = []
    edge_flags = {
        "top": False,
        "bottom": False,
        "left": False,
        "right": False,
        "crop_pressure": False,
    }

    source_edge_margin_x = max(24, int(round(source_width * 0.10)))
    source_edge_margin_y = max(24, int(round(source_height * 0.11)))

    for rect in sanitized_text_rects:
        mapped = _map_source_rect_to_canvas(rect, default_placement, source_width, source_height)
        mapped_text_rects.append(mapped)

        if rect[1] <= source_edge_margin_y:
            edge_flags["top"] = True
        if rect[3] >= source_height - source_edge_margin_y:
            edge_flags["bottom"] = True
        if rect[0] <= source_edge_margin_x:
            edge_flags["left"] = True
        if rect[2] >= source_width - source_edge_margin_x:
            edge_flags["right"] = True

        if (
            mapped[0] < crop_safe_rect[0]
            or mapped[1] < crop_safe_rect[1]
            or mapped[2] > crop_safe_rect[2]
            or mapped[3] > crop_safe_rect[3]
        ):
            edge_flags["crop_pressure"] = True

    for rect in mandatory_source_rects or preserve_text_rects:
        if rect[1] <= source_edge_margin_y:
            edge_flags["top"] = True
        if rect[3] >= source_height - source_edge_margin_y:
            edge_flags["bottom"] = True
        if rect[0] <= source_edge_margin_x:
            edge_flags["left"] = True
        if rect[2] >= source_width - source_edge_margin_x:
            edge_flags["right"] = True

    for rect in mandatory_source_rects:
        mapped = _map_source_rect_to_canvas(rect, default_placement, source_width, source_height)
        mapped_mandatory_rects.append(mapped)

    text_union_source = _merge_rects(sanitized_text_rects)
    text_union_canvas = _merge_rects(mapped_text_rects)
    preserve_text_union_source = _merge_rects(preserve_text_rects)
    mandatory_union_source = _merge_rects(mandatory_source_rects)

    saliency_source = _estimate_saliency_bbox(source)
    saliency_canvas = _map_source_rect_to_canvas(
        saliency_source,
        default_placement,
        source_width,
        source_height,
    )

    saliency_width_ratio = (saliency_source[2] - saliency_source[0]) / max(1.0, float(source_width))
    saliency_height_ratio = (saliency_source[3] - saliency_source[1]) / max(1.0, float(source_height))
    placed_width_ratio = default_width / max(1.0, float(crop_rect[2] - crop_rect[0]))
    center_compression = bool(
        orientation_changed
        and default_width < (crop_rect[2] - crop_rect[0]) * 0.66
    ) or bool(
        saliency_width_ratio <= 0.52 and saliency_height_ratio >= 0.54 and placed_width_ratio <= 0.78
    )

    dense_foreground = bool(
        len(sanitized_text_rects) >= 2
        or (
            text_union_source is not None
            and _rect_area(text_union_source) / float(max(1, source_width * source_height)) >= 0.075
        )
        or (
            _rect_area(saliency_source) / float(max(1, source_width * source_height)) >= 0.18
            and len(sanitized_text_rects) >= 1
        )
    )

    footer_pressure = bool(
        edge_flags["bottom"]
        or (
            text_union_source is not None
            and text_union_source[3] >= source_height - source_edge_margin_y
        )
        or (
            preserve_text_union_source is not None
            and preserve_text_union_source[3] >= source_height - source_edge_margin_y
        )
    )

    title_pressure = bool(
        edge_flags["top"]
        or (
            text_union_source is not None
            and text_union_source[1] <= source_edge_margin_y
        )
        or (
            preserve_text_union_source is not None
            and preserve_text_union_source[1] <= source_edge_margin_y
        )
    )

    strong_geometry_change = bool(orientation_changed or ratio_delta >= 0.42)
    mandatory_pressure = any(_rect_outside_safe(rect, crop_safe_rect) for rect in mapped_mandatory_rects)

    score = 0
    reasons: List[str] = []

    if orientation_changed:
        score += 2
        reasons.append("orientation_changed")
    if ratio_delta >= 0.72:
        score += 2
        reasons.append("strong_ratio_delta")
    elif ratio_delta >= 0.42:
        score += 1
        reasons.append("ratio_delta")
    if edge_flags["crop_pressure"]:
        score += 2
        reasons.append("text_crop_pressure")
    if center_compression:
        score += 1
        reasons.append("center_compression")
    if mandatory_pressure:
        score += 3
        reasons.append("mandatory_pressure")
    if dense_foreground:
        score += 1
        reasons.append("dense_foreground")
    if footer_pressure:
        score += 1
        reasons.append("footer_pressure")
    if title_pressure and footer_pressure:
        score += 1
        reasons.append("vertical_stack_pressure")
    if preserve_text_rects:
        reasons.append("text_hard_preserve")
    if background_meta["plain"]:
        reasons.append("plain_background")

    if intent["strict_preservation"] and orientation_changed and ratio_delta >= 0.72:
        reasons.append("strict_preservation_request")
        if not text_meta["reliable"]:
            reasons.append("unreliable_text_detection")

    requested = (requested_strength or "medium").strip().lower()
    computed_strength = _choose_strength(score)
    strength_rank = {"low": 0, "medium": 1, "high": 2}
    resolved_strength = requested
    if strength_rank.get(computed_strength, 1) > strength_rank.get(requested, 1):
        resolved_strength = computed_strength
    if intent["strict_preservation"] and resolved_strength == "high":
        resolved_strength = "medium"

    text_bands = _group_text_rects_by_bands(preserve_text_rects, source_width, source_height)
    top_text_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "top"]
    bottom_text_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "bottom"]
    middle_text_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "middle"]
    band_zone_names = {_classify_text_band(rect, source_height) for rect in text_bands}
    multi_zone_text = bool(len(text_bands) >= 3 or len(band_zone_names) >= 2 or (top_text_bands and bottom_text_bands))
    commercial_layout_lock = bool(top_text_bands and bottom_text_bands)
    fragmented_text_support = bool(
        text_meta["reliable"]
        or commercial_layout_lock
        or multi_zone_text
        or len(preserve_text_rects) >= 3
        or (len(top_text_bands) >= 1 and len(bottom_text_bands) >= 1)
    )

    allow_assisted = bool((text_meta["reliable"] or multi_zone_text) and (sanitized_text_rects or preserve_text_rects))
    prefer_fragmented_preserve = bool(
        strong_geometry_change
        and fragmented_text_support
        and (
            mandatory_pressure
            or commercial_layout_lock
            or intent.get("commercial_preservation")
            or (title_pressure and footer_pressure)
        )
        and (
            center_compression
            or dense_foreground
            or footer_pressure
            or title_pressure
            or background_meta["plain"]
            or score >= 4
            or len(middle_text_bands) >= 1
            or intent.get("commercial_preservation")
        )
    )

    prefer_layout_preserve = bool(
        not prefer_fragmented_preserve
        and orientation_changed
        and (mandatory_pressure or (preserve_text_rects and (title_pressure or footer_pressure)) or intent.get("commercial_preservation"))
        and (
            ratio_delta >= 0.72
            or score >= 4
            or intent["strict_preservation"]
            or intent.get("commercial_preservation")
            or not fragmented_text_support
        )
    )

    use_assisted_recompose = bool(
        allow_assisted
        and (
            score >= 4
            or (strong_geometry_change and edge_flags["crop_pressure"])
            or (strong_geometry_change and center_compression and dense_foreground)
            or intent["allow_layout_recompose"]
        )
        and not prefer_layout_preserve
        and not prefer_fragmented_preserve
    )

    strategy = "assisted_recompose" if use_assisted_recompose else "simple_expand"
    if prefer_layout_preserve:
        strategy = "layout_preserve"
    if prefer_fragmented_preserve:
        strategy = "fragmented_preserve"

    prefer_deterministic_layout = bool(
        orientation_changed
        and intent.get("strict_preservation")
        and intent.get("commercial_preservation")
        and (
            background_meta.get("plain")
            or ratio_delta >= 0.72
            or commercial_layout_lock
            or len(preserve_text_rects) >= 2
            or mandatory_pressure
        )
    )
    if prefer_deterministic_layout:
        strategy = "commercial_layout_deterministic"
        reasons.append("deterministic_layout_first")

    return {
        "strategy": strategy,
        "strength": resolved_strength,
        "score": int(score),
        "reasons": reasons,
        "orientation_changed": bool(orientation_changed),
        "ratio_delta": float(ratio_delta),
        "center_compression": bool(center_compression),
        "dense_foreground": bool(dense_foreground),
        "edge_flags": edge_flags,
        "crop_safe_rect": crop_safe_rect,
        "text_union_source": text_union_source,
        "text_union_canvas": text_union_canvas,
        "saliency_source": saliency_source,
        "saliency_canvas": saliency_canvas,
        "text_rects": sanitized_text_rects,
        "text_rects_reliable": bool(text_meta["reliable"]),
        "text_rects_meta": text_meta,
        "preserve_text_rects": preserve_text_rects,
        "mandatory_source_rects": mandatory_source_rects,
        "mandatory_union_source": mandatory_union_source,
        "mapped_mandatory_rects": mapped_mandatory_rects,
        "mandatory_pressure": bool(mandatory_pressure),
        "text_bands": text_bands,
        "multi_zone_text": bool(multi_zone_text),
        "commercial_layout_lock": bool(commercial_layout_lock),
        "background_meta": background_meta,
        "intent": intent,
        "prefer_deterministic_layout": bool(prefer_deterministic_layout),
    }


def _build_cover_background(source: Image.Image, target_width: int, target_height: int) -> Image.Image:
    cover_width, cover_height = _fit_cover(source.width, source.height, target_width, target_height)
    cover = source.resize((cover_width, cover_height), Image.Resampling.LANCZOS)
    crop_x = max(0, (cover_width - target_width) // 2)
    crop_y = max(0, (cover_height - target_height) // 2)
    return cover.crop((crop_x, crop_y, crop_x + target_width, crop_y + target_height))


def _dedupe_rects(rects: Sequence[Rect], iou_threshold: float = 0.74) -> List[Rect]:
    deduped: List[Rect] = []
    for rect in sorted(
        [r for r in rects if r[2] > r[0] and r[3] > r[1]],
        key=lambda item: (_rect_area(item), item[1], item[0]),
        reverse=True,
    ):
        if any(_rect_iou(rect, existing) >= iou_threshold for existing in deduped):
            continue
        deduped.append(rect)
    deduped.sort(key=lambda item: (item[1], item[0]))
    return deduped


def _prepare_text_preserve_rects(
    text_rects: Optional[Sequence[Rect]],
    source_width: int,
    source_height: int,
) -> List[Rect]:
    prepared: List[Rect] = []
    image_area = float(max(1, source_width * source_height))

    for rect in list(text_rects or []):
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue

        x1 = _clamp_int(rect[0], 0, source_width)
        y1 = _clamp_int(rect[1], 0, source_height)
        x2 = _clamp_int(rect[2], 0, source_width)
        y2 = _clamp_int(rect[3], 0, source_height)
        if x2 <= x1 or y2 <= y1:
            continue

        width = x2 - x1
        height = y2 - y1
        area_ratio = (width * height) / image_area
        width_ratio = width / max(1.0, float(source_width))
        height_ratio = height / max(1.0, float(source_height))

        if width < 10 or height < 8:
            continue
        if area_ratio > 0.22:
            continue
        if height_ratio > 0.26:
            continue
        if width_ratio > 0.96 and area_ratio > 0.10:
            continue

        prepared.append((x1, y1, x2, y2))

    if not prepared:
        return []

    prepared.sort(key=lambda item: (item[1], item[0]))
    row_groups: List[Rect] = []
    for rect in prepared:
        attached = False
        for idx, existing in enumerate(row_groups):
            vertical_overlap = max(0, min(existing[3], rect[3]) - max(existing[1], rect[1]))
            min_height = min(existing[3] - existing[1], rect[3] - rect[1])
            same_row = vertical_overlap >= max(4, int(min_height * 0.30))
            near_x = rect[0] <= existing[2] + max(20, int(source_width * 0.05))
            if same_row and near_x:
                row_groups[idx] = (
                    min(existing[0], rect[0]),
                    min(existing[1], rect[1]),
                    max(existing[2], rect[2]),
                    max(existing[3], rect[3]),
                )
                attached = True
                break
        if not attached:
            row_groups.append(rect)

    return _dedupe_rects(prepared + row_groups, iou_threshold=0.82)



def _build_mandatory_source_rects(
    text_rects: Optional[Sequence[Rect]],
    source_width: int,
    source_height: int,
) -> List[Rect]:
    prepared = _prepare_text_preserve_rects(text_rects, source_width, source_height)
    if not prepared:
        return []

    bands = _group_text_rects_by_bands(prepared, source_width, source_height)
    top_bands = [rect for rect in bands if _classify_text_band(rect, source_height) == "top"]
    bottom_bands = [rect for rect in bands if _classify_text_band(rect, source_height) == "bottom"]
    middle_bands = [rect for rect in bands if _classify_text_band(rect, source_height) == "middle"]

    result: List[Rect] = list(prepared)

    top_union = _merge_rects(top_bands)
    if top_union is not None:
        result.append(
            _inflate_rect(
                top_union,
                max(18, int(round(source_width * 0.045))),
                max(22, int(round(source_height * 0.030))),
                source_width,
                source_height,
            )
        )

    bottom_union = _merge_rects(bottom_bands)
    if bottom_union is not None:
        result.append(
            _inflate_rect(
                bottom_union,
                max(18, int(round(source_width * 0.045))),
                max(22, int(round(source_height * 0.030))),
                source_width,
                source_height,
            )
        )

    middle_union = _merge_rects(middle_bands)
    if middle_union is not None:
        result.append(
            _inflate_rect(
                middle_union,
                max(16, int(round(source_width * 0.035))),
                max(14, int(round(source_height * 0.024))),
                source_width,
                source_height,
            )
        )

    return _dedupe_rects(result, iou_threshold=0.78)



def _analyze_edge_background(source: Image.Image) -> Dict[str, Any]:
    rgba = np.asarray(source.convert("RGBA")).astype(np.float32)
    height, width = rgba.shape[:2]
    patch_w = max(12, int(round(width * 0.10)))
    patch_h = max(12, int(round(height * 0.10)))

    def _patch(x1: int, y1: int, x2: int, y2: int) -> np.ndarray:
        return rgba[max(0, y1):min(height, y2), max(0, x1):min(width, x2), :3]

    patches = {
        "top_left": _patch(0, 0, patch_w, patch_h),
        "top_center": _patch(max(0, (width - patch_w) // 2), 0, max(0, (width - patch_w) // 2) + patch_w, patch_h),
        "top_right": _patch(width - patch_w, 0, width, patch_h),
        "bottom_left": _patch(0, height - patch_h, patch_w, height),
        "bottom_center": _patch(max(0, (width - patch_w) // 2), height - patch_h, max(0, (width - patch_w) // 2) + patch_w, height),
        "bottom_right": _patch(width - patch_w, height - patch_h, width, height),
        "left_center": _patch(0, max(0, (height - patch_h) // 2), patch_w, max(0, (height - patch_h) // 2) + patch_h),
        "right_center": _patch(width - patch_w, max(0, (height - patch_h) // 2), width, max(0, (height - patch_h) // 2) + patch_h),
    }

    def _mean_color(arr: np.ndarray) -> Tuple[int, int, int]:
        mean = np.mean(arr.reshape(-1, 3), axis=0)
        return tuple(int(round(float(v))) for v in mean)

    def _patch_stats(arr: np.ndarray) -> Tuple[float, float]:
        gray = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
        grad_x = np.abs(gray[:, 1:] - gray[:, :-1]) if gray.shape[1] > 1 else np.zeros((gray.shape[0], 1), dtype=np.float32)
        grad_y = np.abs(gray[1:, :] - gray[:-1, :]) if gray.shape[0] > 1 else np.zeros((1, gray.shape[1]), dtype=np.float32)
        grad = float(np.mean(np.concatenate([grad_x.reshape(-1), grad_y.reshape(-1)])))
        std = float(np.mean(np.std(arr.reshape(-1, 3), axis=0)))
        return std, grad

    patch_metrics = {name: _patch_stats(arr) for name, arr in patches.items() if arr.size > 0}
    std_values = [value[0] for value in patch_metrics.values()]
    grad_values = [value[1] for value in patch_metrics.values()]
    quiet_patches = sum(1 for std, grad in patch_metrics.values() if std <= 22.0 and grad <= 14.0)

    color_std = float(np.median(std_values)) if std_values else 0.0
    edge_grad = float(np.median(grad_values)) if grad_values else 0.0
    plain = bool(quiet_patches >= 5 and color_std <= 24.0 and edge_grad <= 16.0)

    def _mix(names: Sequence[str]) -> Tuple[int, int, int]:
        selected = [patches[name] for name in names if name in patches and patches[name].size > 0]
        if not selected:
            return (24, 34, 58)
        merged = np.concatenate([item.reshape(-1, 3) for item in selected], axis=0)
        return _mean_color(merged.reshape(-1, 1, 3))

    return {
        "plain": plain,
        "color_std": color_std,
        "edge_grad": edge_grad,
        "top_color": _mix(("top_left", "top_center", "top_right")),
        "bottom_color": _mix(("bottom_left", "bottom_center", "bottom_right")),
        "left_color": _mix(("top_left", "left_center", "bottom_left")),
        "right_color": _mix(("top_right", "right_center", "bottom_right")),
        "mean_color": _mix(tuple(patches.keys())),
    }

def _build_edge_gradient_background(
    target_width: int,
    target_height: int,
    background_meta: Dict[str, Any],
) -> Image.Image:
    top = np.array(background_meta.get("top_color") or background_meta.get("mean_color") or (24, 34, 58), dtype=np.float32)
    bottom = np.array(background_meta.get("bottom_color") or background_meta.get("mean_color") or (18, 24, 44), dtype=np.float32)
    left = np.array(background_meta.get("left_color") or background_meta.get("mean_color") or (22, 30, 52), dtype=np.float32)
    right = np.array(background_meta.get("right_color") or background_meta.get("mean_color") or (22, 30, 52), dtype=np.float32)

    x = np.linspace(0.0, 1.0, max(1, int(target_width)), dtype=np.float32)[None, :, None]
    y = np.linspace(0.0, 1.0, max(1, int(target_height)), dtype=np.float32)[:, None, None]

    vertical = top * (1.0 - y) + bottom * y
    horizontal = left * (1.0 - x) + right * x
    rgb = np.clip((vertical + horizontal) * 0.5, 0.0, 255.0).astype(np.uint8)

    alpha = np.full((max(1, int(target_height)), max(1, int(target_width)), 1), 255, dtype=np.uint8)
    rgba = np.concatenate([rgb, alpha], axis=2)
    return Image.fromarray(rgba, mode="RGBA")


def _build_seed_background(
    source: Image.Image,
    target_width: int,
    target_height: int,
    profile_info: Optional[Dict[str, Any]] = None,
) -> Image.Image:
    info = dict(profile_info or {})
    background_meta = dict(info.get("background_meta") or _analyze_edge_background(source))
    intent = dict(info.get("intent") or {})

    prefer_plain_seed = bool(
        background_meta.get("plain")
        or intent.get("avoid_background_rewrite")
        or intent.get("strict_preservation")
    )
    if prefer_plain_seed:
        return _build_edge_gradient_background(target_width, target_height, background_meta)
    return _build_cover_background(source, target_width, target_height)




def _build_soft_cover_background(
    source: Image.Image,
    target_width: int,
    target_height: int,
    background_meta: Optional[Dict[str, Any]] = None,
    source_region: Optional[Rect] = None,
) -> Image.Image:
    """
    Monta um fundo final e íntegro para o layout-first determinístico.

    Importante: aqui não pode nascer um preview/proto com cantos soltos.
    O canvas precisa sair preenchido e coerente para já poder ser entregue
    como composição final sem depender de etapa generativa.
    """
    meta = background_meta or _analyze_edge_background(source)

    region = source_region
    if region is not None:
        region = (
            _clamp_int(region[0], 0, source.width),
            _clamp_int(region[1], 0, source.height),
            _clamp_int(region[2], 0, source.width),
            _clamp_int(region[3], 0, source.height),
        )
        if region[2] <= region[0] or region[3] <= region[1]:
            region = None

    background_source = source.crop(region).convert("RGBA") if region is not None else source.convert("RGBA")
    canvas = _build_cover_background(background_source, target_width, target_height).convert("RGBA")
    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=8.0))
    canvas = ImageEnhance.Brightness(canvas).enhance(0.80)
    canvas = ImageEnhance.Color(canvas).enhance(0.94)

    vignette = Image.new("L", (target_width, target_height), 0)
    vignette_draw = ImageDraw.Draw(vignette)
    vignette_draw.rounded_rectangle(
        (0, 0, target_width, target_height),
        radius=max(24, int(round(min(target_width, target_height) * 0.06))),
        fill=255,
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=max(18, int(round(min(target_width, target_height) * 0.06)))))
    vignette_arr = np.asarray(vignette).astype(np.float32) / 255.0
    canvas_arr = np.asarray(canvas).astype(np.float32)
    falloff = 0.90 + (vignette_arr[..., None] * 0.10)
    canvas_arr[..., :3] *= falloff
    return Image.fromarray(np.clip(canvas_arr, 0, 255).astype(np.uint8), mode="RGBA")



def _validate_commercial_deterministic_composition(
    target_width: int,
    target_height: int,
    hero_box: Optional[Rect],
    city_box: Optional[Rect],
    dates_box: Optional[Rect],
    cta_box: Optional[Rect],
    placed_boxes: Sequence[Rect],
) -> Tuple[bool, str]:
    valid_boxes = [tuple(int(v) for v in rect) for rect in list(placed_boxes or []) if rect[2] > rect[0] and rect[3] > rect[1]]
    if not valid_boxes:
        return False, "no_boxes"

    if hero_box is None:
        return False, "missing_hero"

    hero_width_ratio = (hero_box[2] - hero_box[0]) / max(1.0, float(target_width))
    hero_height_ratio = (hero_box[3] - hero_box[1]) / max(1.0, float(target_height))
    if hero_width_ratio < 0.52 or hero_height_ratio < 0.34:
        return False, "hero_too_small"

    if city_box is None and dates_box is None and cta_box is None:
        return False, "missing_bottom_stack"

    if cta_box is not None and cta_box[1] <= hero_box[3]:
        return False, "cta_overlapping_hero"

    if city_box is not None and city_box[1] <= hero_box[1]:
        return False, "city_invalid_position"

    return True, "ok"


def _choose_bottom_commercial_blocks(
    preserve_rects: Sequence[Rect],
    source_width: int,
    source_height: int,
) -> Dict[str, Optional[Rect]]:
    prepared = _prepare_text_preserve_rects(preserve_rects, source_width, source_height)
    if not prepared:
        return {"city": None, "dates": None, "cta": None}

    bands = _group_text_rects_by_bands(prepared, source_width, source_height)
    ordered = sorted(bands or prepared, key=lambda rect: (rect[1], rect[0]))
    bottom_candidates = [rect for rect in ordered if _classify_text_band(rect, source_height) == "bottom"]
    if len(bottom_candidates) < 2:
        bottom_candidates = [rect for rect in ordered if (rect[1] + rect[3]) * 0.5 >= source_height * 0.52]
    bottom_candidates = sorted(bottom_candidates, key=lambda rect: (rect[1], rect[0]))

    def _pick_city(candidates: Sequence[Rect]) -> Optional[Rect]:
        wide = [rect for rect in candidates if (rect[2] - rect[0]) / max(1.0, float(source_width)) >= 0.42]
        if wide:
            return min(wide, key=lambda rect: rect[1])
        return candidates[0] if candidates else None

    city = _pick_city(bottom_candidates)
    remaining = [rect for rect in bottom_candidates if rect != city]
    cta = None
    if remaining:
        cta = max(
            remaining,
            key=lambda rect: (
                (rect[1] + rect[3]) * 0.5,
                -abs(((rect[0] + rect[2]) * 0.5) - (source_width * 0.5)),
            ),
        )
    dates = None
    remaining_no_cta = [rect for rect in remaining if rect != cta]
    if remaining_no_cta:
        dates = min(remaining_no_cta, key=lambda rect: rect[1])

    if dates is None and city is not None:
        below_city = [rect for rect in prepared if rect[1] >= city[3] - max(8, int(source_height * 0.01))]
        below_city = [rect for rect in below_city if rect != cta and rect != city]
        if below_city:
            dates = _merge_rects(sorted(below_city, key=lambda rect: (rect[1], rect[0]))[:2])

    if cta is None:
        low = [rect for rect in prepared if (rect[1] + rect[3]) * 0.5 >= source_height * 0.74]
        if low:
            cta = max(
                low,
                key=lambda rect: (
                    (rect[1] + rect[3]) * 0.5,
                    -abs(((rect[0] + rect[2]) * 0.5) - (source_width * 0.5)),
                ),
            )

    return {"city": city, "dates": dates, "cta": cta}


def _detect_bottom_commercial_blocks_from_pixels(source: Image.Image) -> Dict[str, Optional[Rect]]:
    source_rgba = source.convert("RGBA")
    source_width, source_height = source_rgba.size
    if source_width < 64 or source_height < 64:
        return {"city": None, "dates": None, "cta": None}

    reduce_scale = min(1.0, 400.0 / max(1.0, float(source_width)))
    reduced_width = max(96, int(round(source_width * reduce_scale)))
    reduced_height = max(96, int(round(source_height * reduce_scale)))
    reduced = source_rgba.resize((reduced_width, reduced_height), Image.Resampling.LANCZOS)

    arr = np.asarray(reduced).astype(np.float32)
    rgb = arr[..., :3]
    gray = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    saturation = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    gray_image = Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8), mode="L")
    blur = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(radius=4))).astype(np.float32)
    local_contrast = np.abs(gray - blur)
    bright = np.clip(gray - 35.0, 0.0, None)
    score = saturation * 0.38 + local_contrast * 1.00 + bright * 0.12

    def _extract_components(y_ratio_start: float, y_ratio_end: float, percentile: float, center_bias: bool) -> List[Rect]:
        y1 = _clamp_int(int(round(reduced_height * y_ratio_start)), 0, reduced_height - 1)
        y2 = _clamp_int(int(round(reduced_height * y_ratio_end)), y1 + 1, reduced_height)
        sub = score[y1:y2].copy()
        if center_bias:
            xx = np.linspace(0.0, 1.0, reduced_width, dtype=np.float32)[None, :]
            sub *= np.clip(1.0 - np.abs(xx - 0.5) * 1.4, 0.2, 1.0)
        non_zero = sub[sub > 0]
        if non_zero.size == 0:
            return []
        threshold = float(np.percentile(non_zero, percentile))
        mask = np.zeros((reduced_height, reduced_width), dtype=np.uint8)
        mask[y1:y2] = (sub >= threshold).astype(np.uint8)
        mask_image = Image.fromarray((mask * 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(radius=3))
        mask = (np.asarray(mask_image) > 75).astype(np.uint8)

        visited = np.zeros_like(mask, dtype=bool)
        components: List[Rect] = []
        for row in range(y1, y2):
            for col in range(reduced_width):
                if not mask[row, col] or visited[row, col]:
                    continue
                stack = [(row, col)]
                visited[row, col] = True
                xs: List[int] = []
                ys: List[int] = []
                while stack:
                    cy, cx = stack.pop()
                    xs.append(cx)
                    ys.append(cy)
                    if cy > 0 and mask[cy - 1, cx] and not visited[cy - 1, cx]:
                        visited[cy - 1, cx] = True
                        stack.append((cy - 1, cx))
                    if cy + 1 < reduced_height and mask[cy + 1, cx] and not visited[cy + 1, cx]:
                        visited[cy + 1, cx] = True
                        stack.append((cy + 1, cx))
                    if cx > 0 and mask[cy, cx - 1] and not visited[cy, cx - 1]:
                        visited[cy, cx - 1] = True
                        stack.append((cy, cx - 1))
                    if cx + 1 < reduced_width and mask[cy, cx + 1] and not visited[cy, cx + 1]:
                        visited[cy, cx + 1] = True
                        stack.append((cy, cx + 1))
                if not xs or not ys:
                    continue
                components.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))

        merged: List[Rect] = []
        for rect in sorted(components, key=lambda item: (item[1], item[0])):
            attached = False
            for idx, existing in enumerate(merged):
                vertical_overlap = max(0, min(existing[3], rect[3]) - max(existing[1], rect[1]))
                min_height = min(existing[3] - existing[1], rect[3] - rect[1])
                same_row = vertical_overlap >= max(3, int(min_height * 0.28))
                near_x = rect[0] <= existing[2] + max(10, int(round(reduced_width * 0.06)))
                if same_row and near_x:
                    merged[idx] = (
                        min(existing[0], rect[0]),
                        min(existing[1], rect[1]),
                        max(existing[2], rect[2]),
                        max(existing[3], rect[3]),
                    )
                    attached = True
                    break
            if not attached:
                merged.append(rect)
        return merged

    info_components = _extract_components(0.52, 0.80, percentile=89.0, center_bias=True)
    cta_components = _extract_components(0.80, 0.98, percentile=88.0, center_bias=True)

    def _scaled(rect: Rect) -> Rect:
        return (
            _clamp_int(int(round(rect[0] * source_width / max(1.0, float(reduced_width)))), 0, source_width),
            _clamp_int(int(round(rect[1] * source_height / max(1.0, float(reduced_height)))), 0, source_height),
            _clamp_int(int(round(rect[2] * source_width / max(1.0, float(reduced_width)))), 0, source_width),
            _clamp_int(int(round(rect[3] * source_height / max(1.0, float(reduced_height)))), 0, source_height),
        )

    def _metrics(rect: Rect) -> Tuple[float, float, float, float]:
        width_ratio = (rect[2] - rect[0]) / max(1.0, float(reduced_width))
        height_ratio = (rect[3] - rect[1]) / max(1.0, float(reduced_height))
        center_x = ((rect[0] + rect[2]) * 0.5) / max(1.0, float(reduced_width))
        center_y = ((rect[1] + rect[3]) * 0.5) / max(1.0, float(reduced_height))
        return width_ratio, height_ratio, center_x, center_y

    city_rect_reduced: Optional[Rect] = None
    city_candidates = [
        rect
        for rect in info_components
        if _metrics(rect)[0] >= 0.22 and _metrics(rect)[1] <= 0.12 and abs(_metrics(rect)[2] - 0.5) <= 0.28 and 0.56 <= _metrics(rect)[3] <= 0.78
    ]
    if city_candidates:
        city_rect_reduced = sorted(city_candidates, key=lambda rect: (rect[1], -_metrics(rect)[0], abs(_metrics(rect)[2] - 0.5)))[0]

    dates_rect_reduced: Optional[Rect] = None
    if city_rect_reduced is not None:
        dates_candidates = [
            rect
            for rect in info_components
            if rect != city_rect_reduced and rect[1] >= city_rect_reduced[3] - max(4, int(round(reduced_height * 0.008)))
            and _metrics(rect)[0] >= 0.10 and _metrics(rect)[1] <= 0.09 and abs(_metrics(rect)[2] - 0.5) <= 0.34
        ]
        if dates_candidates:
            dates_rect_reduced = sorted(dates_candidates, key=lambda rect: (rect[1], -_metrics(rect)[0]))[0]

    cta_rect_reduced: Optional[Rect] = None
    cta_candidates = [
        rect
        for rect in cta_components
        if 0.10 <= _metrics(rect)[0] <= 0.42 and 0.03 <= _metrics(rect)[1] <= 0.13 and abs(_metrics(rect)[2] - 0.5) <= 0.20 and _metrics(rect)[3] >= 0.82
    ]
    if cta_candidates:
        cta_rect_reduced = sorted(
            cta_candidates,
            key=lambda rect: (-((rect[2] - rect[0]) * (rect[3] - rect[1])), abs(_metrics(rect)[2] - 0.5), -_metrics(rect)[3]),
        )[0]

    city = None
    if city_rect_reduced is not None:
        city = _scaled(city_rect_reduced)
        city = _inflate_rect(city, max(10, int(round(source_width * 0.05))), max(8, int(round(source_height * 0.012))), source_width, source_height)
        city_width = max(1, city[2] - city[0])
        city_height = max(1, city[3] - city[1])
        min_city_width = int(round(source_width * (0.74 if city_height <= int(round(source_height * 0.10)) else 0.58)))
        desired_city_width = max(city_width, min_city_width)
        city_center_x = source_width * 0.5
        city = (
            _clamp_int(int(round(city_center_x - desired_city_width * 0.5)), 0, max(0, source_width - desired_city_width)),
            city[1],
            _clamp_int(int(round(city_center_x - desired_city_width * 0.5)) + desired_city_width, min(desired_city_width, source_width), source_width),
            city[3],
        )
        city = _expand_rect_to_min_width(city, int(round(source_width * 0.42)), source_width)

    dates = None
    if dates_rect_reduced is not None:
        dates = _scaled(dates_rect_reduced)
        dates = _inflate_rect(dates, max(12, int(round(source_width * 0.08))), max(10, int(round(source_height * 0.015))), source_width, source_height)
        dates = _expand_rect_to_min_width(dates, int(round(source_width * 0.46)), source_width)

    cta = None
    if cta_rect_reduced is not None:
        cta = _scaled(cta_rect_reduced)
        cta = _inflate_rect(cta, max(12, int(round(source_width * 0.08))), max(14, int(round(source_height * 0.020))), source_width, source_height)
        cta = _expand_rect_to_min_width(cta, int(round(source_width * 0.22)), source_width)

    return {"city": city, "dates": dates, "cta": cta}


def build_exact_size_commercial_deterministic_assets(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    profile_info: Dict[str, Any],
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    background_meta = dict(profile_info.get("background_meta") or _analyze_edge_background(source))

    preserve_rects = list(profile_info.get("preserve_text_rects") or profile_info.get("mandatory_source_rects") or [])
    blocks = _choose_bottom_commercial_blocks(preserve_rects, source_width, source_height)
    if blocks.get("city") is None and blocks.get("dates") is None and blocks.get("cta") is None:
        blocks = _detect_bottom_commercial_blocks_from_pixels(source)
    city_rect = blocks.get("city")
    dates_rect = blocks.get("dates")
    cta_rect = blocks.get("cta")

    hero_cut_y = city_rect[1] - max(18, int(round(source_height * 0.026))) if city_rect else int(round(source_height * 0.58))
    hero_cut_y = _clamp_int(hero_cut_y, int(round(source_height * 0.34)), int(round(source_height * 0.76)))
    hero_region = (0, 0, source_width, hero_cut_y)
    canvas = _build_soft_cover_background(
        source,
        target_width,
        target_height,
        background_meta,
        source_region=hero_region,
    )
    focus = _estimate_focus_bbox_within_region(source, hero_region, percentile=98.8)
    focus_w = max(1, focus[2] - focus[0])
    focus_h = max(1, focus[3] - focus[1])
    hero_rect = (
        max(0, min(focus[0] - int(round(focus_w * 0.18)), int(round(source_width * 0.06)))),
        max(0, min(focus[1] - int(round(focus_h * 0.16)), int(round(source_height * 0.03)))),
        min(source_width, max(focus[2] + int(round(focus_w * 0.18)), int(round(source_width * 0.94)))),
        min(hero_cut_y, max(focus[3] + int(round(focus_h * 0.10)), int(round(hero_cut_y * 0.96)))),
    )
    if hero_rect[3] - hero_rect[1] < int(round(source_height * 0.18)):
        hero_rect = (0, 0, source_width, hero_cut_y)

    placed_boxes: List[Rect] = []
    transition_boxes: List[Rect] = []

    hero_patch, _ = _extract_padded_patch(
        source=source,
        rect=hero_rect,
        pad_x_ratio=0.03,
        pad_y_ratio=0.03,
    )
    desired_hero_width = max(170, int(round(target_width * 0.72)))
    scale = desired_hero_width / max(1.0, float(hero_patch.width))
    scaled_height = max(1, int(round(hero_patch.height * scale)))
    hero_patch = hero_patch.resize((desired_hero_width, scaled_height), Image.Resampling.LANCZOS)
    hero_max_height = max(145, int(round(target_height * 0.60)))
    if hero_patch.height > hero_max_height:
        overflow = hero_patch.height - hero_max_height
        crop_top = max(0, int(round(overflow * 0.10)))
        hero_patch = hero_patch.crop((0, crop_top, hero_patch.width, crop_top + hero_max_height))
    hero_x = max(0, (target_width - hero_patch.width) // 2)
    hero_y = max(8, int(round(target_height * 0.018)))
    hero_box = _paste_patch_with_feather(canvas, hero_patch, hero_x, hero_y, feather_px=10)
    placed_boxes.append(hero_box)
    transition_boxes.append(_inflate_rect(hero_box, 18, 16, target_width, target_height))

    next_y = hero_box[3] + max(4, int(round(target_height * 0.010)))

    bottom_stack_box: Optional[Rect] = None
    bottom_stack_rect = _merge_rects([rect for rect in (city_rect, dates_rect, cta_rect) if rect is not None])
    if bottom_stack_rect is not None:
        stack_patch, _ = _extract_padded_patch(
            source=source,
            rect=bottom_stack_rect,
            pad_x_ratio=0.10,
            pad_y_ratio=0.12,
        )
        stack_patch = _resize_patch_to_fit(
            stack_patch,
            max_width=max(150, int(round(target_width * 0.40))),
            max_height=max(108, int(round(target_height * 0.26))),
            max_upscale=1.16,
        )
        stack_x = max(0, (target_width - stack_patch.width) // 2)
        stack_bottom_margin = max(18, int(round(target_height * 0.042)))
        preferred_y = target_height - stack_patch.height - stack_bottom_margin
        stack_y = max(next_y, preferred_y)
        stack_y = min(stack_y, max(next_y, target_height - stack_patch.height - 6))
        bottom_stack_box = _paste_patch_with_feather(canvas, stack_patch, stack_x, stack_y, feather_px=10)
        placed_boxes.append(bottom_stack_box)
        transition_boxes.append(_inflate_rect(bottom_stack_box, 18, 16, target_width, target_height))

    def _place_optional_block(rect: Optional[Rect], max_w_ratio: float, max_h_ratio: float, pad_x: float, pad_y: float, feather_px: int) -> Optional[Rect]:
        nonlocal next_y
        if rect is None:
            return None
        patch, _ = _extract_padded_patch(source=source, rect=rect, pad_x_ratio=pad_x, pad_y_ratio=pad_y)
        patch = _resize_patch_to_fit(
            patch,
            max_width=max(80, int(round(target_width * max_w_ratio))),
            max_height=max(36, int(round(target_height * max_h_ratio))),
            max_upscale=1.20,
        )
        place_x = max(0, (target_width - patch.width) // 2)
        place_y = min(max(0, target_height - patch.height - 4), next_y)
        box = _paste_patch_with_feather(canvas, patch, place_x, place_y, feather_px=feather_px)
        next_y = box[3] + max(1, int(round(target_height * 0.004)))
        placed_boxes.append(box)
        transition_boxes.append(_inflate_rect(box, 12, 12, target_width, target_height))
        return box

    city_box: Optional[Rect] = None
    dates_box: Optional[Rect] = None
    cta_box: Optional[Rect] = None
    if bottom_stack_box is not None:
        city_box = bottom_stack_box if city_rect is not None else None
        dates_box = bottom_stack_box if dates_rect is not None else None
        cta_box = bottom_stack_box if cta_rect is not None else None
    else:
        city_box = _place_optional_block(city_rect, 0.52, 0.11, 0.05, 0.10, 6)
        dates_box = _place_optional_block(dates_rect, 0.56, 0.10, 0.06, 0.18, 6)
        if cta_rect is not None:
            cta_patch, _ = _extract_padded_patch(source=source, rect=cta_rect, pad_x_ratio=0.10, pad_y_ratio=0.22)
            cta_patch = _resize_patch_to_fit(
                cta_patch,
                max_width=max(90, int(round(target_width * 0.22))),
                max_height=max(42, int(round(target_height * 0.12))),
                max_upscale=1.18,
            )
            cta_x = max(0, (target_width - cta_patch.width) // 2)
            cta_y = max(next_y + max(4, int(round(target_height * 0.008))), target_height - cta_patch.height - max(8, int(round(target_height * 0.018))))
            cta_y = min(target_height - cta_patch.height - 4, cta_y)
            cta_box = _paste_patch_with_feather(canvas, cta_patch, cta_x, cta_y, feather_px=6)
            placed_boxes.append(cta_box)
            transition_boxes.append(_inflate_rect(cta_box, 12, 12, target_width, target_height))

    preserve_union = _merge_rects(placed_boxes) or (0, 0, target_width, target_height)

    mask_alpha = Image.new("L", (target_width, target_height), 0)
    draw = ImageDraw.Draw(mask_alpha)
    transition_union = _merge_rects(transition_boxes) or preserve_union
    draw.rounded_rectangle(
        transition_union,
        radius=max(10, int(round(min(target_width, target_height) * 0.018))),
        fill=184,
    )
    for rect in transition_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=220,
        )
    for rect in placed_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=255,
        )
    mask_alpha = mask_alpha.filter(ImageFilter.GaussianBlur(radius=3.0))
    redraw = ImageDraw.Draw(mask_alpha)
    for rect in placed_boxes:
        redraw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=255,
        )
    mask = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    mask.putalpha(mask_alpha)

    composition_ok, composition_reason = _validate_commercial_deterministic_composition(
        target_width=target_width,
        target_height=target_height,
        hero_box=hero_box,
        city_box=city_box,
        dates_box=dates_box,
        cta_box=cta_box,
        placed_boxes=placed_boxes,
    )
    if not composition_ok:
        raise ValueError(
            "A recomposição determinística do layout não atingiu confiança suficiente para entrega final. "
            f"Motivo: {composition_reason}"
        )

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": {
            "x": int(preserve_union[0]),
            "y": int(preserve_union[1]),
            "width": int(max(1, preserve_union[2] - preserve_union[0])),
            "height": int(max(1, preserve_union[3] - preserve_union[1])),
            "target_width": int(target_width),
            "target_height": int(target_height),
        },
        "visible_rect": preserve_union,
        "preserve_union": preserve_union,
        "crop_safe_rect": tuple(int(v) for v in profile_info.get("crop_safe_rect") or (0, 0, target_width, target_height)),
        "hard_preserve_boxes": _dedupe_rects(placed_boxes, iou_threshold=0.82),
        "hard_feather": 10,
        "hard_preserve_limits": {
            "max_area_ratio": 0.58,
            "max_width_ratio": 0.86,
            "max_height_ratio": 0.72,
        },
        "strategy": "commercial_layout_deterministic",
        "strength": "low",
        "profile_info": {**dict(profile_info or {}), "deterministic_only": True, "layout_first_non_native": True},
        "composition_ok": True,
        "composition_reason": "ok",
        "direct_result_bytes": None,
        "direct_result_is_exact": False,
    }


def _compute_exact_text_preserve_boxes(
    source_text_rects: Optional[Sequence[Rect]],
    placement: Dict[str, int],
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> List[Rect]:
    boxes: List[Rect] = []
    for rect in _prepare_text_preserve_rects(source_text_rects, source_width, source_height):
        mapped = _map_source_rect_to_canvas(rect, placement, source_width, source_height)
        rect_width = max(1, mapped[2] - mapped[0])
        rect_height = max(1, mapped[3] - mapped[1])

        near_top = rect[1] <= int(round(source_height * 0.22))
        near_bottom = rect[3] >= int(round(source_height * 0.78))
        near_side = rect[0] <= int(round(source_width * 0.10)) or rect[2] >= int(round(source_width * 0.90))

        pad_x = max(12, int(round(rect_width * (0.38 if (near_top or near_bottom or near_side) else 0.22))))
        pad_y = max(12, int(round(rect_height * (1.40 if (near_top or near_bottom) else 0.92))))
        boxes.append(_inflate_rect(mapped, pad_x, pad_y, target_width, target_height))

        if near_top or near_bottom:
            band_pad_x = max(pad_x, int(round(target_width * 0.04)))
            band_pad_y = max(pad_y, int(round(rect_height * 1.65)))
            boxes.append(_inflate_rect(mapped, band_pad_x, band_pad_y, target_width, target_height))

    return _dedupe_rects(boxes, iou_threshold=0.78)


def _map_raw_source_preserve_boxes(
    source_rects: Optional[Sequence[Rect]],
    placement: Dict[str, int],
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> List[Rect]:
    boxes: List[Rect] = []

    for rect in list(source_rects or []):
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue

        mapped = _map_source_rect_to_canvas(rect, placement, source_width, source_height)
        rect_width = max(1, mapped[2] - mapped[0])
        rect_height = max(1, mapped[3] - mapped[1])

        pad_x = max(10, int(round(rect_width * 0.04)))
        pad_y = max(10, int(round(rect_height * 0.06)))
        boxes.append(_inflate_rect(mapped, pad_x, pad_y, target_width, target_height))

    return _dedupe_rects(boxes, iou_threshold=0.80)


def _compute_text_union_for_placement(
    text_rects: Sequence[Rect],
    placement: Dict[str, int],
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
    profile: Dict[str, float],
) -> Tuple[List[Rect], Optional[Rect]]:
    mapped_text_rects: List[Rect] = []
    for rect in list(text_rects or []):
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            continue
        mapped = _map_source_rect_to_canvas(rect, placement, source_width, source_height)
        rect_width = max(1, mapped[2] - mapped[0])
        rect_height = max(1, mapped[3] - mapped[1])
        pad_x = max(8, int(round(rect_width * profile["text_pad_x"])))
        pad_y = max(8, int(round(rect_height * profile["text_pad_y"])))
        mapped_text_rects.append(_inflate_rect(mapped, pad_x, pad_y, target_width, target_height))
    return mapped_text_rects, _merge_rects(mapped_text_rects)




def _group_text_rects_by_bands(
    text_rects: Optional[Sequence[Rect]],
    source_width: int,
    source_height: int,
) -> List[Rect]:
    prepared = _prepare_text_preserve_rects(text_rects, source_width, source_height)
    if not prepared:
        return []

    gap_y = max(28, int(round(source_height * 0.045)))
    groups: List[Rect] = []

    for rect in sorted(prepared, key=lambda item: (item[1], item[0])):
        attached = False
        for idx, existing in enumerate(groups):
            vertical_overlap = max(0, min(existing[3], rect[3]) - max(existing[1], rect[1]))
            same_band = vertical_overlap > 0 or rect[1] <= existing[3] + gap_y
            if same_band:
                groups[idx] = (
                    min(existing[0], rect[0]),
                    min(existing[1], rect[1]),
                    max(existing[2], rect[2]),
                    max(existing[3], rect[3]),
                )
                attached = True
                break
        if not attached:
            groups.append(rect)

    return _dedupe_rects(groups, iou_threshold=0.86)


def _extract_padded_patch(
    source: Image.Image,
    rect: Rect,
    pad_x_ratio: float,
    pad_y_ratio: float,
) -> Tuple[Image.Image, Rect]:
    source_width, source_height = source.size
    rect_width = max(1, rect[2] - rect[0])
    rect_height = max(1, rect[3] - rect[1])
    pad_x = max(10, int(round(rect_width * max(0.0, pad_x_ratio))))
    pad_y = max(10, int(round(rect_height * max(0.0, pad_y_ratio))))
    crop_rect = _inflate_rect(rect, pad_x, pad_y, source_width, source_height)
    return source.crop(crop_rect), crop_rect


def _resize_patch_to_fit(
    patch: Image.Image,
    max_width: int,
    max_height: int,
    max_upscale: float = 1.22,
) -> Image.Image:
    max_width = max(1, int(max_width))
    max_height = max(1, int(max_height))
    patch_width, patch_height = patch.size
    if patch_width <= 0 or patch_height <= 0:
        return patch

    scale = min(
        max_width / max(1.0, float(patch_width)),
        max_height / max(1.0, float(patch_height)),
    )
    scale = max(0.20, min(float(max_upscale), float(scale)))
    resized_width = max(1, int(round(patch_width * scale)))
    resized_height = max(1, int(round(patch_height * scale)))
    if (resized_width, resized_height) == patch.size:
        return patch
    return patch.resize((resized_width, resized_height), Image.Resampling.LANCZOS)


def _paste_patch_with_feather(
    canvas: Image.Image,
    patch: Image.Image,
    x: int,
    y: int,
    feather_px: int,
) -> Rect:
    patch_rgba = patch.convert("RGBA")
    patch_width, patch_height = patch_rgba.size
    x = _clamp_int(x, 0, max(0, canvas.width - patch_width))
    y = _clamp_int(y, 0, max(0, canvas.height - patch_height))

    if feather_px <= 0:
        canvas.alpha_composite(patch_rgba, (x, y))
        return (x, y, x + patch_width, y + patch_height)

    alpha = Image.new("L", (patch_width, patch_height), 255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=max(1, int(feather_px))))
    canvas.paste(patch_rgba, (x, y), alpha)
    return (x, y, x + patch_width, y + patch_height)


def _classify_text_band(rect: Rect, source_height: int) -> str:
    center_y = (rect[1] + rect[3]) * 0.5
    normalized = center_y / max(1.0, float(source_height))
    if normalized <= 0.36:
        return "top"
    if normalized >= 0.64:
        return "bottom"
    return "middle"


def _estimate_focus_bbox_within_region(
    source: Image.Image,
    region_rect: Rect,
    percentile: float = 99.0,
) -> Rect:
    source_width, source_height = source.size
    region = (
        _clamp_int(region_rect[0], 0, source_width),
        _clamp_int(region_rect[1], 0, source_height),
        _clamp_int(region_rect[2], 0, source_width),
        _clamp_int(region_rect[3], 0, source_height),
    )
    if region[2] <= region[0] or region[3] <= region[1]:
        return (0, 0, source_width, source_height)

    crop = source.crop(region).convert("RGBA")
    crop_width, crop_height = crop.size
    if crop_width < 48 or crop_height < 48:
        return region

    arr = np.asarray(crop).astype(np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3] / 255.0
    gray = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    saturation = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    gray_image = Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8), mode="L")
    blur = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(radius=7))).astype(np.float32)
    local_contrast = np.abs(gray - blur)

    yy, xx = np.mgrid[0:crop_height, 0:crop_width]
    horizontal_focus = np.clip(1.0 - np.abs((xx / max(1, crop_width - 1)) - 0.5) * 0.55, 0.72, 1.0)
    vertical_focus = np.clip(1.0 - np.abs((yy / max(1, crop_height - 1)) - 0.46) * 0.35, 0.72, 1.0)

    score = (saturation * 0.34 + local_contrast * 0.82) * np.clip(alpha, 0.0, 1.0)
    score *= horizontal_focus * vertical_focus

    non_zero = score[score > 0]
    if non_zero.size == 0:
        return region

    tried = [float(percentile), min(99.4, float(percentile) + 0.35), min(99.7, float(percentile) + 0.70)]
    best_region = region
    for pct in tried:
        threshold = float(np.percentile(non_zero, pct))
        ys, xs = np.where(score >= threshold)
        if xs.size == 0 or ys.size == 0:
            continue
        x1 = int(xs.min())
        y1 = int(ys.min())
        x2 = int(xs.max()) + 1
        y2 = int(ys.max()) + 1
        width = max(1, x2 - x1)
        height = max(1, y2 - y1)
        area_ratio = (width * height) / float(max(1, crop_width * crop_height))
        if area_ratio > 0.88:
            continue
        if width < int(crop_width * 0.14) or height < int(crop_height * 0.14):
            continue
        best_region = (region[0] + x1, region[1] + y1, region[0] + x2, region[1] + y2)
        if area_ratio <= 0.56:
            break

    return best_region


def _expand_rect_to_min_width(
    rect: Rect,
    min_width: int,
    canvas_width: int,
) -> Rect:
    width = max(1, rect[2] - rect[0])
    if width >= min_width:
        return rect
    deficit = int(min_width - width)
    pad_left = deficit // 2
    pad_right = deficit - pad_left
    x1 = max(0, rect[0] - pad_left)
    x2 = min(canvas_width, rect[2] + pad_right)
    current = x2 - x1
    if current < min_width:
        if x1 == 0:
            x2 = min(canvas_width, x1 + min_width)
        else:
            x1 = max(0, x2 - min_width)
    return (x1, rect[1], x2, rect[3])


def _infer_commercial_section_rects(
    source: Image.Image,
    profile_info: Dict[str, Any],
) -> Optional[Dict[str, Rect]]:
    source_width, source_height = source.size
    text_rects = _prepare_text_preserve_rects(
        profile_info.get("preserve_text_rects") or profile_info.get("text_rects"),
        source_width,
        source_height,
    )
    if not text_rects:
        return None

    sorted_rects = sorted(text_rects, key=lambda item: (item[1], item[0]))
    wide_rects = [rect for rect in sorted_rects if (rect[2] - rect[0]) / max(1.0, float(source_width)) >= 0.40]

    cta_candidates = [
        rect
        for rect in sorted_rects
        if ((rect[1] + rect[3]) * 0.5) / max(1.0, float(source_height)) >= 0.76
    ]
    cta_rect = cta_candidates[-1] if cta_candidates else sorted_rects[-1]

    info_candidates = [
        rect
        for rect in wide_rects
        if rect != cta_rect
        and ((rect[1] + rect[3]) * 0.5) / max(1.0, float(source_height)) >= 0.46
        and ((rect[1] + rect[3]) * 0.5) / max(1.0, float(source_height)) <= 0.82
    ]

    city_rect = info_candidates[0] if info_candidates else None
    date_rects = [rect for rect in info_candidates[1:] if rect[1] < cta_rect[1]]
    dates_rect = _merge_rects(date_rects) if date_rects else None

    if city_rect is None:
        fallback_info = [rect for rect in sorted_rects if rect != cta_rect and rect[1] < cta_rect[1]]
        city_rect = fallback_info[0] if fallback_info else None
    if dates_rect is None and city_rect is not None:
        lower = [rect for rect in sorted_rects if rect[1] > city_rect[1] and rect[1] < cta_rect[1]]
        if lower:
            dates_rect = _merge_rects(lower)

    ribbon_candidates = [
        rect
        for rect in sorted_rects
        if ((rect[1] + rect[3]) * 0.5) / max(1.0, float(source_height)) <= 0.22
    ]
    ribbon_union = _merge_rects(ribbon_candidates)
    if ribbon_union is None:
        ribbon_union = (
            int(round(source_width * 0.28)),
            int(round(source_height * 0.04)),
            int(round(source_width * 0.72)),
            int(round(source_height * 0.12)),
        )
    ribbon_union_width_ratio = (ribbon_union[2] - ribbon_union[0]) / max(1.0, float(source_width))
    if ribbon_union_width_ratio < 0.12:
        ribbon_rect = (
            int(round(source_width * 0.20)),
            int(round(source_height * 0.03)),
            int(round(source_width * 0.82)),
            int(round(source_height * 0.17)),
        )
    else:
        ribbon_rect = _inflate_rect(
            ribbon_union,
            max(80, int(round(source_width * 0.18))),
            max(24, int(round(source_height * 0.04))),
            source_width,
            source_height,
        )
    max_ribbon_y2 = int(round(source_height * 0.18))
    ribbon_rect = (
        ribbon_rect[0],
        max(0, ribbon_rect[1]),
        ribbon_rect[2],
        min(max_ribbon_y2, max(ribbon_rect[1] + 40, ribbon_rect[3])),
    )
    ribbon_rect = _expand_rect_to_min_width(
        ribbon_rect,
        max(320, int(round(source_width * 0.46))),
        source_width,
    )

    info_start_y = city_rect[1] if city_rect is not None else cta_rect[1]
    hero_top = max(int(round(source_height * 0.13)), ribbon_rect[3] - int(round(source_height * 0.01)))
    hero_bottom = min(
        max(hero_top + int(round(source_height * 0.16)), info_start_y - int(round(source_height * 0.08))),
        int(round(source_height * 0.60)),
    )
    if hero_bottom <= hero_top:
        hero_bottom = min(source_height, hero_top + int(round(source_height * 0.22)))

    hero_region = (
        int(round(source_width * 0.02)),
        hero_top,
        int(round(source_width * 0.98)),
        hero_bottom,
    )
    hero_focus = _estimate_focus_bbox_within_region(source, hero_region, percentile=99.0)
    hero_rect = _inflate_rect(
        hero_focus,
        max(20, int(round(source_width * 0.04))),
        max(18, int(round(source_height * 0.04))),
        source_width,
        source_height,
    )

    sections: Dict[str, Rect] = {
        "ribbon_rect": ribbon_rect,
        "hero_rect": hero_rect,
    }

    if city_rect is not None:
        city_band = _inflate_rect(
            city_rect,
            max(20, int(round(source_width * 0.10))),
            max(18, int(round(source_height * 0.04))),
            source_width,
            source_height,
        )
        city_band = _expand_rect_to_min_width(city_band, int(round(source_width * 0.82)), source_width)
        sections["city_rect"] = city_band

    if dates_rect is not None:
        date_band = _inflate_rect(
            dates_rect,
            max(20, int(round(source_width * 0.10))),
            max(18, int(round(source_height * 0.03))),
            source_width,
            source_height,
        )
        date_band = _expand_rect_to_min_width(date_band, int(round(source_width * 0.78)), source_width)
        sections["dates_rect"] = date_band

    cta_band = _inflate_rect(
        cta_rect,
        max(18, int(round(source_width * 0.08))),
        max(18, int(round(source_height * 0.04))),
        source_width,
        source_height,
    )
    cta_band = _expand_rect_to_min_width(cta_band, int(round(source_width * 0.46)), source_width)
    sections["cta_rect"] = cta_band
    return sections


def _build_commercial_fragmented_preserve_assets(
    source: Image.Image,
    plan: Dict[str, Any],
    profile_info: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    source_width, source_height = source.size
    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_safe_rect = tuple(int(v) for v in profile_info.get("crop_safe_rect") or plan["crop_rect"])

    sections = _infer_commercial_section_rects(source, profile_info)
    if not sections:
        return None

    background = _build_seed_background(source, base_width, base_height, profile_info)
    canvas = background.copy()

    safe_x1, safe_y1, safe_x2, safe_y2 = crop_safe_rect
    safe_width = max(1, safe_x2 - safe_x1)
    safe_height = max(1, safe_y2 - safe_y1)
    top_cursor = safe_y1 + max(8, int(round(safe_height * 0.01)))
    bottom_cursor = safe_y2 - max(8, int(round(safe_height * 0.01)))
    gap_small = max(8, int(round(safe_height * 0.015)))
    gap_medium = max(12, int(round(safe_height * 0.022)))

    resized: Dict[str, Image.Image] = {}
    order_specs = {
        "ribbon_rect": (0.56, 0.12, 1.20),
        "hero_rect": (0.82, 0.60, 1.12),
        "city_rect": (0.74, 0.13, 1.10),
        "dates_rect": (0.72, 0.095, 1.08),
        "cta_rect": (0.32, 0.11, 1.08),
    }

    for key, rect in sections.items():
        patch = source.crop(rect)
        max_w_ratio, max_h_ratio, max_upscale = order_specs.get(key, (0.60, 0.18, 1.10))
        resized[key] = _resize_patch_to_fit(
            patch,
            max_width=max(80, int(round(safe_width * max_w_ratio))),
            max_height=max(48, int(round(safe_height * max_h_ratio))),
            max_upscale=max_upscale,
        )

    reserved_height = 0
    if "ribbon_rect" in resized:
        reserved_height += resized["ribbon_rect"].height + gap_small
    if "city_rect" in resized:
        reserved_height += resized["city_rect"].height + gap_small
    if "dates_rect" in resized:
        reserved_height += resized["dates_rect"].height + gap_small
    if "cta_rect" in resized:
        reserved_height += resized["cta_rect"].height + gap_small

    hero_patch = resized.get("hero_rect")
    available_for_hero = max(120, safe_height - reserved_height - gap_medium * 2)
    if hero_patch is not None and hero_patch.height > available_for_hero:
        resized["hero_rect"] = _resize_patch_to_fit(
            source.crop(sections["hero_rect"]),
            max_width=max(80, int(round(safe_width * 0.74))),
            max_height=available_for_hero,
            max_upscale=1.0,
        )

    placed_boxes: List[Rect] = []
    transition_boxes: List[Rect] = []

    def _place_centered(patch: Image.Image, y: int, feather_px: int = 12) -> Rect:
        place_x = safe_x1 + max(0, (safe_width - patch.width) // 2)
        place_y = _clamp_int(y, safe_y1, max(safe_y1, safe_y2 - patch.height))
        box = _paste_patch_with_feather(canvas, patch, place_x, place_y, feather_px=feather_px)
        placed_boxes.append(box)
        transition_boxes.append(_inflate_rect(box, 12, 12, base_width, base_height))
        return box

    ribbon_patch = resized.get("ribbon_rect")
    if ribbon_patch is not None:
        ribbon_box = _place_centered(ribbon_patch, top_cursor, feather_px=10)
        top_cursor = ribbon_box[3] + gap_small

    hero_patch = resized.get("hero_rect")
    if hero_patch is not None:
        hero_box = _place_centered(hero_patch, top_cursor, feather_px=14)
        top_cursor = hero_box[3] + gap_medium

    cta_patch = resized.get("cta_rect")
    cta_box: Optional[Rect] = None
    if cta_patch is not None:
        cta_box = _place_centered(cta_patch, bottom_cursor - cta_patch.height, feather_px=10)
        bottom_cursor = cta_box[1] - gap_small

    dates_patch = resized.get("dates_rect")
    dates_box: Optional[Rect] = None
    if dates_patch is not None:
        dates_box = _place_centered(dates_patch, bottom_cursor - dates_patch.height, feather_px=10)
        bottom_cursor = dates_box[1] - gap_small

    city_patch = resized.get("city_rect")
    if city_patch is not None:
        city_y = bottom_cursor - city_patch.height
        min_city_y = top_cursor
        if city_y < min_city_y:
            city_y = min_city_y
        city_box = _place_centered(city_patch, city_y, feather_px=12)
        bottom_cursor = city_box[1] - gap_small

    preserve_union = _merge_rects(placed_boxes) or crop_safe_rect

    mask_alpha = Image.new("L", (base_width, base_height), 0)
    draw = ImageDraw.Draw(mask_alpha)
    transition_union = _merge_rects(transition_boxes) or preserve_union
    draw.rounded_rectangle(
        transition_union,
        radius=max(10, int(round(min(base_width, base_height) * 0.018))),
        fill=188,
    )
    for rect in transition_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=224,
        )
    for rect in placed_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=255,
        )
    mask_alpha = mask_alpha.filter(ImageFilter.GaussianBlur(radius=3.0))
    redraw = ImageDraw.Draw(mask_alpha)
    for rect in placed_boxes:
        redraw.rounded_rectangle(
            rect,
            radius=max(6, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.10))),
            fill=255,
        )

    mask = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
    mask.putalpha(mask_alpha)

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": {
            "x": int(preserve_union[0]),
            "y": int(preserve_union[1]),
            "width": int(max(1, preserve_union[2] - preserve_union[0])),
            "height": int(max(1, preserve_union[3] - preserve_union[1])),
            "target_width": int(base_width),
            "target_height": int(base_height),
        },
        "visible_rect": preserve_union,
        "preserve_union": preserve_union,
        "crop_safe_rect": crop_safe_rect,
        "hard_preserve_boxes": _dedupe_rects(placed_boxes, iou_threshold=0.80),
        "hard_feather": 12,
        "hard_preserve_limits": {
            "max_area_ratio": 0.34,
            "max_width_ratio": 0.82,
            "max_height_ratio": 0.62,
        },
        "strategy": "fragmented_preserve",
        "strength": profile_info.get("strength") or "medium",
        "profile_info": profile_info,
    }


def build_exact_size_fragmented_preserve_assets(
    image_bytes: bytes,
    plan: Dict[str, Any],
    profile_info: Dict[str, Any],
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_rect = tuple(int(v) for v in plan["crop_rect"])
    crop_safe_rect = tuple(int(v) for v in profile_info.get("crop_safe_rect") or crop_rect)

    commercial_layout = bool(
        (profile_info.get("intent") or {}).get("commercial_preservation")
        and (profile_info.get("commercial_layout_lock") or profile_info.get("multi_zone_text"))
    )
    if commercial_layout:
        commercial_assets = _build_commercial_fragmented_preserve_assets(
            source=source,
            plan=plan,
            profile_info=profile_info,
        )
        if commercial_assets is not None:
            return commercial_assets

    background = _build_seed_background(source, base_width, base_height, profile_info)
    canvas = background.copy()

    safe_x1, safe_y1, safe_x2, safe_y2 = crop_safe_rect
    safe_width = max(1, safe_x2 - safe_x1)
    safe_height = max(1, safe_y2 - safe_y1)

    margin_x = max(18, int(round(safe_width * 0.038)))
    margin_y = max(16, int(round(safe_height * 0.038)))
    inner_x1 = min(safe_x2 - 1, safe_x1 + margin_x)
    inner_y1 = min(safe_y2 - 1, safe_y1 + margin_y)
    inner_x2 = max(inner_x1 + 1, safe_x2 - margin_x)
    inner_y2 = max(inner_y1 + 1, safe_y2 - margin_y)

    text_bands = _group_text_rects_by_bands(
        profile_info.get("preserve_text_rects"),
        source_width,
        source_height,
    )

    top_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "top"]
    bottom_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "bottom"]
    middle_bands = [rect for rect in text_bands if _classify_text_band(rect, source_height) == "middle"]

    if not top_bands and text_bands:
        top_bands = [text_bands[0]]
    if not bottom_bands and len(text_bands) >= 2:
        candidate = text_bands[-1]
        if candidate not in top_bands:
            bottom_bands = [candidate]
    middle_bands = [rect for rect in text_bands if rect not in top_bands and rect not in bottom_bands]

    placed_boxes: List[Rect] = []
    placed_transition_boxes: List[Rect] = []

    cursor_top = inner_y1
    cursor_bottom = inner_y2
    vertical_gap = max(10, int(round(safe_height * 0.020)))

    def _place_text_band(rect: Rect, zone: str) -> None:
        nonlocal cursor_top, cursor_bottom
        width_ratio = (rect[2] - rect[0]) / max(1.0, float(source_width))

        patch, _ = _extract_padded_patch(
            source=source,
            rect=rect,
            pad_x_ratio=0.04 if width_ratio >= 0.58 else 0.12,
            pad_y_ratio=0.34 if zone != "middle" else 0.28,
        )

        if zone == "top":
            max_w = int(round((inner_x2 - inner_x1) * 0.94))
            max_h = int(round(safe_height * (0.18 if len(top_bands) <= 1 else 0.14)))
        elif zone == "bottom":
            max_w = int(round((inner_x2 - inner_x1) * 0.94))
            max_h = int(round(safe_height * (0.16 if len(bottom_bands) <= 1 else 0.13)))
        else:
            max_w = int(round((inner_x2 - inner_x1) * 0.24))
            max_h = int(round(safe_height * 0.11))

        patch = _resize_patch_to_fit(patch, max_width=max_w, max_height=max_h, max_upscale=1.18)

        rect_center_x = ((rect[0] + rect[2]) * 0.5) / max(1.0, float(source_width))
        if zone == "middle":
            pass
        elif rect_center_x <= 0.26:
            place_x = inner_x1
        elif rect_center_x >= 0.74:
            place_x = inner_x2 - patch.width
        else:
            place_x = inner_x1 + max(0, ((inner_x2 - inner_x1) - patch.width) // 2)

        if zone == "top":
            place_y = cursor_top
            cursor_top = place_y + patch.height + vertical_gap
        elif zone == "bottom":
            place_y = cursor_bottom - patch.height
            cursor_bottom = place_y - vertical_gap
        else:
            return

        place_x = _clamp_int(place_x, inner_x1, max(inner_x1, inner_x2 - patch.width))
        place_y = _clamp_int(place_y, inner_y1, max(inner_y1, inner_y2 - patch.height))
        box = _paste_patch_with_feather(canvas, patch, place_x, place_y, feather_px=12)
        placed_boxes.append(box)
        placed_transition_boxes.append(_inflate_rect(box, 10, 10, base_width, base_height))

    for rect in top_bands:
        _place_text_band(rect, "top")
    for rect in reversed(bottom_bands):
        _place_text_band(rect, "bottom")

    if cursor_bottom <= cursor_top + max(80, int(round(safe_height * 0.18))):
        cursor_top = inner_y1 + max(12, int(round(safe_height * 0.18)))
        cursor_bottom = inner_y2 - max(12, int(round(safe_height * 0.18)))

    center_y1 = _clamp_int(cursor_top, inner_y1, inner_y2)
    center_y2 = _clamp_int(cursor_bottom, center_y1 + 1, inner_y2)
    if center_y2 - center_y1 < max(120, int(round(safe_height * 0.24))):
        fallback_pad = max(14, int(round(safe_height * 0.22)))
        center_y1 = inner_y1 + fallback_pad
        center_y2 = inner_y2 - fallback_pad

    saliency_source = tuple(int(v) for v in profile_info.get("saliency_source") or _estimate_saliency_bbox(source))
    saliency_patch, _ = _extract_padded_patch(
        source=source,
        rect=saliency_source,
        pad_x_ratio=0.16,
        pad_y_ratio=0.18,
    )

    center_available_width = max(1, inner_x2 - inner_x1)
    center_available_height = max(1, center_y2 - center_y1)
    middle_count = len(middle_bands)
    if middle_count >= 2:
        center_max_width = int(round(center_available_width * 0.52))
    elif middle_count == 1:
        center_max_width = int(round(center_available_width * 0.60))
    else:
        center_max_width = int(round(center_available_width * 0.74))
    center_max_width = max(120, center_max_width)
    center_max_height = max(120, int(round(center_available_height * 0.94)))

    saliency_patch = _resize_patch_to_fit(
        saliency_patch,
        max_width=center_max_width,
        max_height=center_max_height,
        max_upscale=1.26,
    )

    saliency_x = inner_x1 + max(0, (center_available_width - saliency_patch.width) // 2)
    saliency_y = center_y1 + max(0, (center_available_height - saliency_patch.height) // 2)
    saliency_box = _paste_patch_with_feather(canvas, saliency_patch, saliency_x, saliency_y, feather_px=14)
    placed_boxes.append(saliency_box)
    placed_transition_boxes.append(_inflate_rect(saliency_box, 16, 16, base_width, base_height))

    center_cx = (saliency_box[0] + saliency_box[2]) // 2
    center_cy = (saliency_box[1] + saliency_box[3]) // 2

    for rect in middle_bands:
        patch, _ = _extract_padded_patch(
            source=source,
            rect=rect,
            pad_x_ratio=0.18,
            pad_y_ratio=0.40,
        )
        patch = _resize_patch_to_fit(
            patch,
            max_width=max(64, int(round(center_available_width * 0.20))),
            max_height=max(48, int(round(center_available_height * 0.16))),
            max_upscale=1.18,
        )

        rect_center_x = ((rect[0] + rect[2]) * 0.5) / max(1.0, float(source_width))
        rect_center_y = ((rect[1] + rect[3]) * 0.5) / max(1.0, float(source_height))
        prefer_left = rect_center_x < 0.50
        side_gap = max(16, int(round(center_available_width * 0.04)))

        if prefer_left:
            place_x = max(inner_x1, saliency_box[0] - side_gap - patch.width)
        else:
            place_x = min(inner_x2 - patch.width, saliency_box[2] + side_gap)

        vertical_offset = int(round((rect_center_y - 0.5) * max(60.0, (saliency_box[3] - saliency_box[1]) * 0.56)))
        place_y = center_cy - (patch.height // 2) + vertical_offset

        place_x = _clamp_int(place_x, inner_x1, max(inner_x1, inner_x2 - patch.width))
        place_y = _clamp_int(place_y, center_y1, max(center_y1, center_y2 - patch.height))

        box = _paste_patch_with_feather(canvas, patch, place_x, place_y, feather_px=10)
        placed_boxes.append(box)
        placed_transition_boxes.append(_inflate_rect(box, 10, 10, base_width, base_height))

    preserve_union = _merge_rects(placed_boxes) or crop_safe_rect

    mask_alpha = Image.new("L", (base_width, base_height), 0)
    draw = ImageDraw.Draw(mask_alpha)

    transition_union = _merge_rects(placed_transition_boxes) or preserve_union
    draw.rounded_rectangle(
        transition_union,
        radius=max(10, int(round(min(base_width, base_height) * 0.018))),
        fill=192,
    )

    for rect in placed_transition_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.12))),
            fill=224,
        )

    for rect in placed_boxes:
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.12))),
            fill=255,
        )

    mask_alpha = mask_alpha.filter(ImageFilter.GaussianBlur(radius=3.0))
    redraw = ImageDraw.Draw(mask_alpha)
    for rect in placed_boxes:
        redraw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * 0.12))),
            fill=255,
        )

    mask = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
    mask.putalpha(mask_alpha)

    placement = {
        "x": int(preserve_union[0]),
        "y": int(preserve_union[1]),
        "width": int(max(1, preserve_union[2] - preserve_union[0])),
        "height": int(max(1, preserve_union[3] - preserve_union[1])),
        "target_width": int(base_width),
        "target_height": int(base_height),
    }

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": placement,
        "visible_rect": preserve_union,
        "preserve_union": preserve_union,
        "crop_safe_rect": crop_safe_rect,
        "hard_preserve_boxes": _dedupe_rects(placed_boxes, iou_threshold=0.82),
        "hard_feather": 12,
        "hard_preserve_limits": None,
        "strategy": "fragmented_preserve",
        "strength": "low",
        "profile_info": profile_info,
    }



def build_exact_size_layout_preserve_assets(
    image_bytes: bytes,
    plan: Dict[str, Any],
    profile_info: Dict[str, Any],
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_rect = tuple(int(v) for v in plan["crop_rect"])
    crop_width = max(1, crop_rect[2] - crop_rect[0])
    crop_height = max(1, crop_rect[3] - crop_rect[1])

    background = _build_seed_background(source, base_width, base_height, profile_info)
    crop_safe_rect = tuple(int(v) for v in profile_info.get("crop_safe_rect") or crop_rect)

    placed_width, placed_height = _fit_contain(source.width, source.height, crop_width, crop_height)
    placement_x = crop_rect[0] + max(0, (crop_width - placed_width) // 2)
    placement_y = crop_rect[1] + max(0, (crop_height - placed_height) // 2)

    placed = source.resize((placed_width, placed_height), Image.Resampling.LANCZOS)

    canvas = background.copy()
    canvas.alpha_composite(placed, (placement_x, placement_y))

    placement = {
        "x": int(placement_x),
        "y": int(placement_y),
        "width": int(placed_width),
        "height": int(placed_height),
        "target_width": int(base_width),
        "target_height": int(base_height),
    }

    preserve_union = (
        int(placement_x),
        int(placement_y),
        int(placement_x + placed_width),
        int(placement_y + placed_height),
    )

    text_preserve_boxes = _compute_exact_text_preserve_boxes(
        source_text_rects=profile_info.get("preserve_text_rects"),
        placement=placement,
        source_width=source.width,
        source_height=source.height,
        target_width=base_width,
        target_height=base_height,
    )
    raw_mandatory_boxes = _map_raw_source_preserve_boxes(
        source_rects=profile_info.get("mandatory_source_rects"),
        placement=placement,
        source_width=source.width,
        source_height=source.height,
        target_width=base_width,
        target_height=base_height,
    )

    transition_box = _inflate_rect(
        preserve_union,
        max(16, int(round(placed_width * 0.05))),
        max(16, int(round(placed_height * 0.03))),
        base_width,
        base_height,
    )

    mask_alpha = Image.new("L", (base_width, base_height), 0)
    draw = ImageDraw.Draw(mask_alpha)
    draw.rounded_rectangle(
        transition_box,
        radius=max(10, int(round(min(placed_width, placed_height) * 0.02))),
        fill=208,
    )
    draw.rounded_rectangle(
        preserve_union,
        radius=max(8, int(round(min(placed_width, placed_height) * 0.018))),
        fill=255,
    )
    for rect in _dedupe_rects(text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.80):
        rect_width = max(1, rect[2] - rect[0])
        rect_height = max(1, rect[3] - rect[1])
        draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect_width, rect_height) * 0.14))),
            fill=255,
        )

    mask_alpha = mask_alpha.filter(ImageFilter.GaussianBlur(radius=3.0))
    final_draw = ImageDraw.Draw(mask_alpha)
    final_draw.rounded_rectangle(
        preserve_union,
        radius=max(8, int(round(min(placed_width, placed_height) * 0.018))),
        fill=255,
    )
    for rect in _dedupe_rects(text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.80):
        rect_width = max(1, rect[2] - rect[0])
        rect_height = max(1, rect[3] - rect[1])
        final_draw.rounded_rectangle(
            rect,
            radius=max(8, int(round(min(rect_width, rect_height) * 0.14))),
            fill=255,
        )

    mask = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
    mask.putalpha(mask_alpha)

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": placement,
        "visible_rect": preserve_union,
        "preserve_union": preserve_union,
        "crop_safe_rect": crop_safe_rect,
        "hard_preserve_boxes": _dedupe_rects([preserve_union] + text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.80),
        "hard_feather": 14,
        "strategy": "layout_preserve",
        "strength": "low",
        "profile_info": profile_info,
    }


def build_exact_size_assisted_recompose_assets(
    image_bytes: bytes,
    plan: Dict[str, Any],
    profile_info: Dict[str, Any],
    text_rects: Optional[Sequence[Rect]] = None,
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    source_width, source_height = source.size
    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_rect = tuple(int(v) for v in plan["crop_rect"])
    crop_width = max(1, crop_rect[2] - crop_rect[0])
    crop_height = max(1, crop_rect[3] - crop_rect[1])

    strength = (profile_info.get("strength") or "medium").strip().lower()
    profile = _base_strength_profile(strength)

    background = _build_seed_background(source, base_width, base_height, profile_info)
    crop_safe_rect = tuple(int(v) for v in profile_info.get("crop_safe_rect") or crop_rect)

    render_box = _inset_rect(
        crop_rect,
        max(16, int(round(crop_width * profile["render_pad_x"]))),
        max(16, int(round(crop_height * profile["render_pad_y"]))),
    )
    render_width = max(1, render_box[2] - render_box[0])
    render_height = max(1, render_box[3] - render_box[1])

    current_scale = min(
        render_width / max(1.0, float(source_width)),
        render_height / max(1.0, float(source_height)),
    )

    working_text_rects = list(profile_info.get("text_rects") or text_rects or [])
    preserve_text_source_rects = list(
        profile_info.get("mandatory_source_rects")
        or profile_info.get("preserve_text_rects")
        or working_text_rects
        or []
    )

    placement: Dict[str, int] = {
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "target_width": int(base_width),
        "target_height": int(base_height),
    }
    mapped_text_rects: List[Rect] = []
    text_union: Optional[Rect] = None

    max_shift_left = min(crop_rect[0], max(12, int(round(crop_width * 0.08))))
    max_shift_right = min(base_width - crop_rect[2], max(12, int(round(crop_width * 0.08))))
    max_shift_up = min(crop_rect[1], max(12, int(round(crop_height * 0.10))))
    max_shift_down = min(base_height - crop_rect[3], max(12, int(round(crop_height * 0.10))))

    for _ in range(3):
        placed_width, placed_height = _fit_with_scale(source_width, source_height, current_scale)
        placement_x = crop_rect[0] + max(0, (crop_width - placed_width) // 2)
        placement_y = crop_rect[1] + max(0, (crop_height - placed_height) // 2)

        placement = {
            "x": int(placement_x),
            "y": int(placement_y),
            "width": int(placed_width),
            "height": int(placed_height),
            "target_width": int(base_width),
            "target_height": int(base_height),
        }

        mapped_text_rects, text_union = _compute_text_union_for_placement(
            text_rects=working_text_rects,
            placement=placement,
            source_width=source_width,
            source_height=source_height,
            target_width=base_width,
            target_height=base_height,
            profile=profile,
        )

        if not text_union:
            break

        safe_width = max(1, crop_safe_rect[2] - crop_safe_rect[0])
        safe_height = max(1, crop_safe_rect[3] - crop_safe_rect[1])
        union_width = max(1, text_union[2] - text_union[0])
        union_height = max(1, text_union[3] - text_union[1])

        overflow_ratio = max(
            union_width / max(1.0, float(safe_width)),
            union_height / max(1.0, float(safe_height)),
        )
        if overflow_ratio > 1.02:
            current_scale *= max(0.72, 0.96 / overflow_ratio)
            continue

        shift_x = 0
        if text_union[0] < crop_safe_rect[0]:
            shift_x += crop_safe_rect[0] - text_union[0]
        if text_union[2] > crop_safe_rect[2]:
            shift_x -= text_union[2] - crop_safe_rect[2]

        shift_y = 0
        if text_union[1] < crop_safe_rect[1]:
            shift_y += crop_safe_rect[1] - text_union[1]
        if text_union[3] > crop_safe_rect[3]:
            shift_y -= text_union[3] - crop_safe_rect[3]

        placement["x"] = _clamp_int(
            placement["x"] + shift_x,
            crop_rect[0] - max_shift_left,
            crop_rect[2] - placement["width"] + max_shift_right,
        )
        placement["y"] = _clamp_int(
            placement["y"] + shift_y,
            crop_rect[1] - max_shift_up,
            crop_rect[3] - placement["height"] + max_shift_down,
        )

        mapped_text_rects, text_union = _compute_text_union_for_placement(
            text_rects=working_text_rects,
            placement=placement,
            source_width=source_width,
            source_height=source_height,
            target_width=base_width,
            target_height=base_height,
            profile=profile,
        )
        break

    rendered = source.resize((placement["width"], placement["height"]), Image.Resampling.LANCZOS)
    canvas = background.copy()
    canvas.alpha_composite(rendered, (placement["x"], placement["y"]))

    saliency_source = tuple(int(v) for v in profile_info.get("saliency_source") or _estimate_saliency_bbox(source))
    saliency_canvas = _map_source_rect_to_canvas(
        saliency_source,
        placement,
        source_width,
        source_height,
    )
    saliency_pad_x = max(10, int(round(placement["width"] * profile["saliency_pad"])))
    saliency_pad_y = max(10, int(round(placement["height"] * profile["saliency_pad"])))
    saliency_focus = _inflate_rect(saliency_canvas, saliency_pad_x, saliency_pad_y, base_width, base_height)

    text_preserve_boxes = _compute_exact_text_preserve_boxes(
        source_text_rects=preserve_text_source_rects,
        placement=placement,
        source_width=source_width,
        source_height=source_height,
        target_width=base_width,
        target_height=base_height,
    )
    raw_mandatory_boxes = _map_raw_source_preserve_boxes(
        source_rects=profile_info.get("mandatory_source_rects"),
        placement=placement,
        source_width=source_width,
        source_height=source_height,
        target_width=base_width,
        target_height=base_height,
    )

    visible_rect = (
        max(0, placement["x"]),
        max(0, placement["y"]),
        min(base_width, placement["x"] + placement["width"]),
        min(base_height, placement["y"] + placement["height"]),
    )

    preserve_union = _merge_rects(
        [saliency_focus] + ([text_union] if text_union else [])
    ) or saliency_focus
    preserve_union = _merge_rects([
        preserve_union,
        _inset_rect(visible_rect, max(10, int(placement["width"] * 0.18)), max(10, int(placement["height"] * 0.16))),
    ]) or preserve_union

    mask_alpha = Image.new("L", (base_width, base_height), 0)
    alpha_draw = ImageDraw.Draw(mask_alpha)

    union_radius = max(10, int(round(min(base_width, base_height) * profile["union_radius_ratio"])))
    alpha_draw.rounded_rectangle(
        preserve_union,
        radius=union_radius,
        fill=int(profile["core_alpha"]),
    )

    saliency_radius = max(8, int(round(min(saliency_focus[2] - saliency_focus[0], saliency_focus[3] - saliency_focus[1]) * 0.08)))
    alpha_draw.rounded_rectangle(
        saliency_focus,
        radius=saliency_radius,
        fill=max(int(profile["saliency_alpha"]), int(profile["core_alpha"])),
    )

    for rect in _dedupe_rects(mapped_text_rects + text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.78):
        radius = max(6, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * profile["text_radius_ratio"])))
        alpha_draw.rounded_rectangle(rect, radius=radius, fill=255)

    mask_alpha = mask_alpha.filter(ImageFilter.GaussianBlur(radius=float(profile["mask_blur"])))

    redraw = ImageDraw.Draw(mask_alpha)
    for rect in _dedupe_rects(mapped_text_rects + text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.78):
        radius = max(6, int(round(min(rect[2] - rect[0], rect[3] - rect[1]) * profile["text_radius_ratio"])))
        redraw.rounded_rectangle(rect, radius=radius, fill=255)

    mask = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
    mask.putalpha(mask_alpha)

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": placement,
        "visible_rect": visible_rect,
        "preserve_union": preserve_union,
        "crop_safe_rect": crop_safe_rect,
        "hard_preserve_boxes": _dedupe_rects(mapped_text_rects + text_preserve_boxes + raw_mandatory_boxes, iou_threshold=0.78),
        "hard_feather": int(profile["hard_feather"]),
        "hard_preserve_limits": None,
        "strategy": "assisted_recompose",
        "strength": strength,
        "profile_info": profile_info,
    }


def _compact_user_exact_size_requirements(instruction_text: Optional[str], max_len: int = 480) -> str:
    raw = " ".join((instruction_text or "").replace("\n", " ").split())
    if not raw:
        return ""
    raw = raw.strip()
    if len(raw) <= max_len:
        return raw
    clipped = raw[: max(40, max_len - 1)].rsplit(" ", 1)[0].strip()
    if not clipped:
        clipped = raw[:max_len].strip()
    return f"{clipped}…"




def _scale_rect_into_destination(
    rect: Rect,
    source_width: int,
    source_height: int,
    destination_rect: Rect,
) -> Rect:
    dest_x1, dest_y1, dest_x2, dest_y2 = destination_rect
    dest_width = max(1, dest_x2 - dest_x1)
    dest_height = max(1, dest_y2 - dest_y1)
    scale_x = dest_width / max(1.0, float(source_width))
    scale_y = dest_height / max(1.0, float(source_height))
    return (
        int(round(dest_x1 + rect[0] * scale_x)),
        int(round(dest_y1 + rect[1] * scale_y)),
        int(round(dest_x1 + rect[2] * scale_x)),
        int(round(dest_y1 + rect[3] * scale_y)),
    )


def build_non_native_exact_size_layout_first_assets(
    image_bytes: bytes,
    plan: Dict[str, Any],
    profile_info: Dict[str, Any],
) -> Dict[str, Any]:
    with Image.open(io.BytesIO(image_bytes)) as image_file:
        source = image_file.convert("RGBA")

    exact_width = int(plan["target_width"])
    exact_height = int(plan["target_height"])
    exact_plan = {
        "base_width": int(exact_width),
        "base_height": int(exact_height),
        "working_width": int(exact_width),
        "working_height": int(exact_height),
        "crop_rect": (0, 0, int(exact_width), int(exact_height)),
        "target_width": int(exact_width),
        "target_height": int(exact_height),
        "needs_upscale_after_crop": False,
    }

    exact_profile = dict(profile_info or {})
    exact_profile["crop_safe_rect"] = _inset_rect(
        (0, 0, exact_width, exact_height),
        max(18, int(round(exact_width * 0.06))),
        max(18, int(round(exact_height * 0.08))),
    )

    strategy = (profile_info.get("strategy") or "").strip().lower()
    if strategy == "fragmented_preserve" or len(exact_profile.get("preserve_text_rects") or []) >= 2:
        exact_assets = build_exact_size_fragmented_preserve_assets(
            image_bytes=image_bytes,
            plan=exact_plan,
            profile_info=exact_profile,
        )
    elif strategy == "assisted_recompose":
        exact_assets = build_exact_size_assisted_recompose_assets(
            image_bytes=image_bytes,
            plan=exact_plan,
            profile_info=exact_profile,
            text_rects=exact_profile.get("text_rects"),
        )
    else:
        exact_assets = build_exact_size_layout_preserve_assets(
            image_bytes=image_bytes,
            plan=exact_plan,
            profile_info=exact_profile,
        )

    base_width = int(plan["base_width"])
    base_height = int(plan["base_height"])
    crop_rect = tuple(int(v) for v in plan["crop_rect"])
    crop_width = max(1, crop_rect[2] - crop_rect[0])
    crop_height = max(1, crop_rect[3] - crop_rect[1])

    background = _build_seed_background(source, base_width, base_height, profile_info)
    canvas = background.copy()

    with Image.open(io.BytesIO(exact_assets["canvas_bytes"])) as exact_canvas_file:
        exact_canvas = exact_canvas_file.convert("RGBA")
    with Image.open(io.BytesIO(exact_assets["mask_bytes"])) as exact_mask_file:
        exact_mask = exact_mask_file.convert("RGBA")

    if exact_canvas.size != (crop_width, crop_height):
        exact_canvas = exact_canvas.resize((crop_width, crop_height), Image.Resampling.LANCZOS)
        exact_mask = exact_mask.resize((crop_width, crop_height), Image.Resampling.LANCZOS)

    canvas.alpha_composite(exact_canvas, (crop_rect[0], crop_rect[1]))

    mask = Image.new("RGBA", (base_width, base_height), (0, 0, 0, 0))
    mask.alpha_composite(exact_mask, (crop_rect[0], crop_rect[1]))

    exact_boxes = [tuple(int(v) for v in rect) for rect in list(exact_assets.get("hard_preserve_boxes") or [])]
    mapped_boxes = [
        _scale_rect_into_destination(rect, exact_width, exact_height, crop_rect)
        for rect in exact_boxes
        if rect[2] > rect[0] and rect[3] > rect[1]
    ]
    preserve_union = _merge_rects(mapped_boxes)
    if preserve_union is None:
        preserve_union = (
            int(crop_rect[0]),
            int(crop_rect[1]),
            int(crop_rect[2]),
            int(crop_rect[3]),
        )

    placement = {
        "x": int(preserve_union[0]),
        "y": int(preserve_union[1]),
        "width": int(max(1, preserve_union[2] - preserve_union[0])),
        "height": int(max(1, preserve_union[3] - preserve_union[1])),
        "target_width": int(base_width),
        "target_height": int(base_height),
    }

    embedded_profile = dict(profile_info or {})
    embedded_profile["layout_first_non_native"] = True
    embedded_profile["strategy"] = exact_assets.get("strategy") or strategy or "layout_preserve"

    return {
        "canvas_bytes": _encode_png_bytes(canvas),
        "mask_bytes": _encode_png_bytes(mask),
        "placement": placement,
        "visible_rect": preserve_union,
        "preserve_union": preserve_union,
        "crop_safe_rect": tuple(int(v) for v in profile_info.get("crop_safe_rect") or plan["crop_rect"]),
        "hard_preserve_boxes": _dedupe_rects(mapped_boxes, iou_threshold=0.82),
        "hard_feather": int(exact_assets.get("hard_feather") or 10),
        "hard_preserve_limits": exact_assets.get("hard_preserve_limits"),
        "strategy": exact_assets.get("strategy") or strategy or "layout_preserve",
        "strength": exact_assets.get("strength") or "low",
        "profile_info": embedded_profile,
        "layout_first_preview_bytes": exact_assets["canvas_bytes"],
    }

def build_exact_size_fragmented_preserve_prompt(
    target_width: int,
    target_height: int,
    plan: Dict[str, Any],
    placement: Dict[str, int],
    preserve_union: Optional[Rect],
    crop_safe_rect: Optional[Rect],
    profile_info: Optional[Dict[str, Any]] = None,
    instruction_text: str = "",
) -> str:
    crop_x1, crop_y1, crop_x2, crop_y2 = tuple(int(v) for v in plan["crop_rect"])
    crop_safe_rect = tuple(int(v) for v in (crop_safe_rect or plan.get("crop_safe_rect") or plan["crop_rect"]))
    preserve_box = preserve_union or (
        int(placement.get("x", 0)),
        int(placement.get("y", 0)),
        int(placement.get("x", 0)) + int(placement.get("width", 0)),
        int(placement.get("y", 0)) + int(placement.get("height", 0)),
    )

    preserve_width = max(1, preserve_box[2] - preserve_box[0])
    preserve_height = max(1, preserve_box[3] - preserve_box[1])
    safe_width = max(1, crop_safe_rect[2] - crop_safe_rect[0])
    safe_height = max(1, crop_safe_rect[3] - crop_safe_rect[1])

    reasons = list((profile_info or {}).get("reasons") or [])
    reason_text = ", ".join(reasons[:5]) if reasons else "preservação fragmentada do layout"
    user_requirements = _compact_user_exact_size_requirements(instruction_text)
    background_meta = dict((profile_info or {}).get("background_meta") or {})
    plain_background_text = (
        "O fundo original é simples, abstrato ou pouco semântico. Nas áreas novas, mantenha apenas o mesmo fundo, gradiente, glow, textura leve, iluminação e paleta já existentes. "
        "Não invente prédios, estrada, montanha, cidade, arquitetura, paisagem ou elementos cênicos novos. "
        if background_meta.get("plain")
        else
        "Nas áreas novas, faça somente continuidade coerente do fundo e dos elementos de cena já existentes, sem trocar a linguagem visual da peça e sem criar cenário novo não presente na arte base. "
    )
    user_clause = f"Requisitos explícitos do usuário: {user_requirements}. " if user_requirements else ""
    commercial_layout_ready = bool((profile_info or {}).get("commercial_layout_lock") or ((profile_info or {}).get("intent") or {}).get("commercial_preservation"))
    layout_ready_text = (
        "A peça já veio pré-organizada em bandas e blocos comerciais dentro do canvas final. Preserve exatamente essa estrutura pré-montada e trate-a como layout-base obrigatório. "
        if commercial_layout_ready
        else ""
    )

    return (
        ("Adapte a peça como uma recomposição fiel com blocos preservados, e não como um poster vertical encolhido no centro. " + layout_ready_text)
        + "Os blocos já posicionados no canvas com textos, CTA, badge, datas, locais e elementos principais são obrigatórios e devem permanecer exatamente como estão. "
        "Você pode trabalhar apenas nas áreas não preservadas e nas transições entre esses blocos para integrar o layout ao novo formato. "
        "Mantenha exatamente os textos existentes, sem reescrever, traduzir, resumir, remover, deformar ou cortar qualquer elemento textual. "
        "Não redesenhe o título, o CTA, o badge, os chips, os selos, os labels, as datas, os locais nem o elemento principal. "
        f"{plain_background_text}"
        "Ajuste apenas o necessário para o banner horizontal parecer uma adaptação fiel da mesma peça, sem costuras, sem colagem artificial e sem shrink agressivo da arte original. "
        "É proibido blur destrutivo, espelhamento, duplicação artificial de botões, repetição de blocos, texto novo ou fundo inventado. "
        f"A janela final obrigatória fica em x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
        f"A safe area útil mede aproximadamente {safe_width}x{safe_height}. "
        f"A área preservada atual mede aproximadamente {preserve_width}x{preserve_height}. "
        f"Sinais detectados: {reason_text}. "
        f"{user_clause}"
        f"A entrega final precisa sair pronta para crop técnico exato em {target_width}x{target_height}, preservando todos os elementos obrigatórios visíveis."
    )



def build_exact_size_layout_preserve_prompt(
    target_width: int,
    target_height: int,
    plan: Dict[str, Any],
    placement: Dict[str, int],
    crop_safe_rect: Optional[Rect],
    profile_info: Optional[Dict[str, Any]] = None,
    instruction_text: str = "",
) -> str:
    crop_x1, crop_y1, crop_x2, crop_y2 = tuple(int(v) for v in plan["crop_rect"])
    crop_safe_rect = tuple(int(v) for v in (crop_safe_rect or plan.get("crop_safe_rect") or plan["crop_rect"]))
    placed_width = max(1, int(placement.get("width", 0)))
    placed_height = max(1, int(placement.get("height", 0)))
    safe_width = max(1, crop_safe_rect[2] - crop_safe_rect[0])
    safe_height = max(1, crop_safe_rect[3] - crop_safe_rect[1])

    reasons = list((profile_info or {}).get("reasons") or [])
    reason_text = ", ".join(reasons[:4]) if reasons else "preservação integral"
    user_requirements = _compact_user_exact_size_requirements(instruction_text)
    background_meta = dict((profile_info or {}).get("background_meta") or {})
    plain_background_text = (
        "O fundo original é liso ou pouco semântico. Nas áreas novas, continue apenas o mesmo fundo abstrato, gradiente, textura suave, luz e cor base já existentes. "
        "Não invente prédios, janelas, ruas, arquitetura, paisagem nova, mobiliário urbano nem objetos de cenário que não existiam. "
        if background_meta.get("plain")
        else
        "Crie continuidade estrutural real ao redor da peça: prolongue céu, vegetação, estrada, iluminação, perspectiva, sombras e profundidade sem costuras, sem cortes secos, sem blur, sem espelhamento e sem duplicação artificial. "
    )
    user_clause = f"Requisitos explícitos do usuário: {user_requirements}. " if user_requirements else ""

    return (
        "Adapte a arte para o novo formato preservando integralmente todos os elementos visuais originais já presentes na peça. "
        "A área protegida com a arte original não deve ser reescrita, redesenhada, movida nem simplificada. "
        "Qualquer elemento com texto precisa permanecer visível no resultado final, incluindo selos, chips, CTA, botões, labels, datas, locais e chamadas curtas. "
        "Use apenas as regiões externas e de transição para criar espaço lateral coerente, mantendo a mesma identidade visual, o mesmo fundo base, a mesma paleta e a mesma hierarquia percebida. "
        "Não remova, não esconda e não corte nenhum texto, CTA, logo, data, local, selo, objeto principal ou detalhe gráfico já existente. "
        "Não redesenhe nem reinterprete o fundo dentro da área preservada. "
        f"{plain_background_text}"
        f"A janela final obrigatória fica em x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
        f"A safe area útil mede aproximadamente {safe_width}x{safe_height}. "
        f"A área preservada atual mede aproximadamente {placed_width}x{placed_height}. "
        f"Sinais detectados: {reason_text}. "
        f"{user_clause}"
        f"A entrega final precisa sair pronta para crop técnico exato em {target_width}x{target_height}, mantendo todos os elementos visuais originais visíveis."
    )


def build_exact_size_assisted_prompt(
    target_width: int,
    target_height: int,
    plan: Dict[str, Any],
    placement: Dict[str, int],
    preserve_union: Optional[Rect],
    crop_safe_rect: Optional[Rect],
    strength: str,
    profile_info: Optional[Dict[str, Any]] = None,
    instruction_text: str = "",
) -> str:
    crop_x1, crop_y1, crop_x2, crop_y2 = tuple(int(v) for v in plan["crop_rect"])
    crop_safe_rect = tuple(int(v) for v in (crop_safe_rect or plan.get("crop_safe_rect") or plan["crop_rect"]))
    safe_width = max(1, crop_safe_rect[2] - crop_safe_rect[0])
    safe_height = max(1, crop_safe_rect[3] - crop_safe_rect[1])

    preserve_box = preserve_union or (
        int(placement.get("x", 0)),
        int(placement.get("y", 0)),
        int(placement.get("x", 0)) + int(placement.get("width", 0)),
        int(placement.get("y", 0)) + int(placement.get("height", 0)),
    )
    preserve_width = max(1, preserve_box[2] - preserve_box[0])
    preserve_height = max(1, preserve_box[3] - preserve_box[1])

    reasons = list((profile_info or {}).get("reasons") or [])
    reason_text = ", ".join(reasons[:4]) if reasons else "recomposição assistida"
    user_requirements = _compact_user_exact_size_requirements(instruction_text)
    background_meta = dict((profile_info or {}).get("background_meta") or {})
    plain_background_text = (
        "O fundo original é liso ou pouco semântico. Nas áreas expandidas, mantenha apenas o mesmo fundo abstrato, gradiente, textura suave, luz e cor base. "
        "Não invente prédios, fachadas, janelas, ruas, arquitetura, paisagens nem objetos de cenário que não existiam. "
        if background_meta.get("plain")
        else
        "Crie continuidade estrutural real nas áreas expandidas: prolongue arquitetura, linhas de perspectiva, iluminação, céu, sombras, reflexos e profundidade de forma coerente, sem prédios cortados, sem remendos secos e sem costuras. "
    )
    user_clause = f"Requisitos explícitos do usuário: {user_requirements}. " if user_requirements else ""

    return (
        "Adapte a peça como uma recomposição assistida de layout, e não como um simples expand lateral. "
        "A referência enviada continua sendo a base dominante da identidade visual, da paleta, da cena e da hierarquia. "
        "Use o canvas inteiro para reorganizar espacialmente a composição quando necessário, preservando a identidade da arte original. "
        "Reequilibre título, CTA, blocos informativos, datas, local e objetos principais para que respirem melhor dentro da janela final visível. "
        "Toda informação importante precisa caber dentro da janela final de crop, sem ficar colada nas bordas e sem parecer comprimida no centro. "
        "Qualquer elemento com texto precisa permanecer visível no resultado final, incluindo selos, badges, labels, datas, rodapés, CTA e botões. "
        "Mantenha exatamente os textos existentes, datas, CTA, logotipos, títulos e tipografia principal. Não invente nem reescreva texto. "
        f"{plain_background_text}"
        "É proibido blur, espelhamento, duplicação artificial, repetição de faixas, clusters, veículos, botões, HUDs ou blocos copiados. "
        f"A janela final obrigatória fica em x={crop_x1}, y={crop_y1}, w={crop_x2 - crop_x1}, h={crop_y2 - crop_y1} dentro de um canvas {plan['base_width']}x{plan['base_height']}. "
        f"A safe area útil dentro dessa janela mede aproximadamente {safe_width}x{safe_height}. "
        f"A área principal protegida mede aproximadamente {preserve_width}x{preserve_height}. "
        f"Use intensidade de recomposição {strength}. "
        f"Sinais detectados: {reason_text}. "
        f"{user_clause}"
        f"A entrega final precisa sair pronta para crop técnico exato em {target_width}x{target_height}, com distribuição visual equilibrada e sem cortes de informação importante."
    )
