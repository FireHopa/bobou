from __future__ import annotations

import base64
import io
import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL") or "gpt-image-1.5"
OPENAI_LAYOUT_MODEL = os.getenv("OPENAI_LAYOUT_MODEL") or "gpt-5.4"


def _encode_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.convert("RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


def _result_url_from_image_bytes(image_bytes: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(image_bytes).decode('utf-8')}"


def _data_uri_from_b64(b64: str, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{b64}"


def _image_bytes_from_result_url(url: str) -> Tuple[bytes, str]:
    if not isinstance(url, str) or not url.startswith("data:"):
        raise ValueError("Resultado de imagem inválido: URL não é data URI.")
    header, encoded = url.split(",", 1)
    mime = "image/png"
    if header.startswith("data:") and ";base64" in header:
        mime = header[5:].split(";", 1)[0] or mime
    return base64.b64decode(encoded), mime


def _read_image_dimensions(image_bytes: bytes) -> Tuple[int, int]:
    with Image.open(io.BytesIO(image_bytes)) as im:
        return im.size


def _choose_openai_canvas_size(target_width: int, target_height: int) -> Tuple[int, int]:
    ratio = target_width / max(1.0, float(target_height))
    if ratio >= 1.18:
        return 1536, 1024
    if ratio <= 0.82:
        return 1024, 1536
    return 1024, 1024


def _base_size_to_aspect_ratio(width: int, height: int) -> str:
    if width == height:
        return "1:1"
    return "3:2" if width > height else "2:3"


def _strip_saliency_score(src: Image.Image, box: Tuple[int, int, int, int]) -> float:
    """Mede se uma faixa que seria cortada contém conteúdo visual importante.

    Não é usado para refazer a arte. É apenas um guard técnico para evitar cortar CTA,
    logos, selos ou elementos luminosos no fechamento para tamanho exato.
    """
    x1, y1, x2, y2 = box
    x1 = max(0, min(src.width, int(x1)))
    x2 = max(0, min(src.width, int(x2)))
    y1 = max(0, min(src.height, int(y1)))
    y2 = max(0, min(src.height, int(y2)))
    if x2 <= x1 or y2 <= y1:
        return 0.0
    crop = src.crop((x1, y1, x2, y2)).convert("RGB")
    arr = np.asarray(crop, dtype=np.float32)
    full = np.asarray(src.convert("RGB"), dtype=np.float32)
    bg = _estimate_background_color(full.astype(np.uint8)).astype(np.float32)
    color_score = float(np.mean(np.linalg.norm(arr - bg, axis=2)) / 255.0)
    edges = np.asarray(crop.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32)
    edge_score = float(np.mean(edges) / 255.0)
    return color_score + edge_score * 1.35


def _build_safe_exact_canvas_from_full_image(src: Image.Image, target_width: int, target_height: int) -> Image.Image:
    """Fecha no tamanho exato preservando a imagem inteira quando o crop cortaria conteúdo.

    Em vez de cortar CTA/rodapé, mantém a composição gerada inteira e cria apenas um
    fundo discreto por gradiente a partir das bordas da própria imagem. Sem blur, mirror,
    smear, stretch ou colagem de recortes.
    """
    canvas = _make_soft_gradient_background(src, (target_width, target_height))
    layer = src.convert("RGBA")
    layer.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - layer.width) // 2)
    y = max(0, (target_height - layer.height) // 2)
    canvas.alpha_composite(layer, (x, y))
    return canvas


def _row_saliency_projection(src: Image.Image) -> np.ndarray:
    """Projeção de saliência por linha para escolher crop full-bleed sem criar bordas.

    V3.4: a projeção passou a valorizar elementos pequenos de rodapé, como CTA,
    logos e selos. Antes, a média da linha diluía botões pequenos no canto direito
    e o fechamento podia cortar exatamente a chamada de ação. Agora usamos uma
    combinação de média + percentil alto de bordas/contraste, com leve boost no
    terço inferior. Continua sem blur, mirror, smear, stretch ou letterbox.
    """
    rgb = np.asarray(src.convert("RGB"), dtype=np.float32)
    bg = _estimate_background_color(rgb.astype(np.uint8)).astype(np.float32)
    color = np.linalg.norm(rgb - bg, axis=2) / 255.0
    edges = np.asarray(src.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    saliency = np.clip(color * 0.50 + edges * 1.55, 0.0, 2.0)

    row_mean = saliency.mean(axis=1)
    row_peak = np.percentile(saliency, 92, axis=1)
    projection = row_mean * 0.52 + row_peak * 0.48

    if src.height > 8:
        y = np.linspace(0.0, 1.0, src.height)
        footer_boost = 1.0 + np.clip((y - 0.62) / 0.38, 0.0, 1.0) * 0.42
        projection = projection * footer_boost

    return projection.astype(np.float64)


def _choose_full_bleed_crop_y(src: Image.Image, crop_h: int) -> int:
    extra_h = max(0, src.height - crop_h)
    if extra_h <= 0:
        return 0

    projection = _row_saliency_projection(src)
    cumulative = np.concatenate([[0.0], np.cumsum(projection, dtype=np.float64)])
    step = max(1, extra_h // 128)

    top_mean = float(projection[: max(1, int(src.height * 0.22))].mean())
    footer_start = int(src.height * 0.66)
    bottom_mean = float(projection[footer_start:].mean())
    center_bias = 0.50

    # V4: o crop final não pode virar o principal responsável pelo layout.
    # Nas versões anteriores, o rodapé recebia peso alto e o crop_y crescia, removendo
    # topo demais e empurrando CTA/logos para cima no resultado final. A IA agora recebe
    # contrato explícito de posição; aqui fazemos apenas um fechamento conservador.
    if bottom_mean > top_mean * 1.04:
        center_bias = 0.53
    elif top_mean > bottom_mean * 1.18:
        center_bias = 0.47

    preferred_y = extra_h * center_bias
    best_y = int(round(preferred_y))
    best_score = -1e18

    for y in range(0, extra_h + 1, step):
        inside = cumulative[y + crop_h] - cumulative[y]
        top_out = cumulative[y]
        bottom_out = cumulative[-1] - cumulative[y + crop_h]
        # Rodapé é protegido, mas sem exagerar. A penalidade de distância evita saltos
        # bruscos entre versões e reduz regressões visuais em patches sucessivos.
        distance_penalty = abs(y - preferred_y) * 0.006
        score = inside - top_out * 0.48 - bottom_out * 0.64 - distance_penalty
        if score > best_score:
            best_score = score
            best_y = y

    return int(max(0, min(extra_h, best_y)))


def _choose_full_bleed_crop_x(src: Image.Image, crop_w: int, copy_side: str = "center") -> int:
    extra_w = max(0, src.width - crop_w)
    if extra_w <= 0:
        return 0

    rgb = np.asarray(src.convert("RGB"), dtype=np.float32)
    bg = _estimate_background_color(rgb.astype(np.uint8)).astype(np.float32)
    color = np.linalg.norm(rgb - bg, axis=2) / 255.0
    edges = np.asarray(src.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    saliency = np.clip(color * 0.55 + edges * 1.35, 0.0, 2.0).mean(axis=0)
    cumulative = np.concatenate([[0.0], np.cumsum(saliency, dtype=np.float64)])
    step = max(1, extra_w // 96)

    # V5: em formatos muito verticais, o canvas intermediário da OpenAI é 2:3,
    # mas o alvo pode ser mais estreito (ex.: 768x1376). O fechamento precisa
    # cortar largura. Se a copy original é ancorada à direita, um crop puramente
    # central pode raspar título/CTA/logos na direita; se a copy é à esquerda,
    # pode raspar o bloco de oferta. Aqui aplicamos apenas um viés suave, sem
    # sacrificar o visual principal, e ainda deixamos a saliência decidir.
    side = str(copy_side or "center").strip().lower()
    if side == "right":
        preferred_x = extra_w * 0.62  # corta um pouco mais da esquerda e protege a coluna direita
    elif side == "left":
        preferred_x = extra_w * 0.38  # corta um pouco mais da direita e protege a coluna esquerda
    else:
        preferred_x = extra_w * 0.50

    best_x = int(round(preferred_x))
    best_score = -1e18

    for x in range(0, extra_w + 1, step):
        inside = cumulative[x + crop_w] - cumulative[x]
        left_out = cumulative[x]
        right_out = cumulative[-1] - cumulative[x + crop_w]
        if side == "right":
            # Penaliza mais perder a direita, mas sem ignorar visual esquerdo.
            outside_penalty = left_out * 0.38 + right_out * 0.64
        elif side == "left":
            outside_penalty = left_out * 0.64 + right_out * 0.38
        else:
            outside_penalty = (left_out + right_out) * 0.42
        score = inside - outside_penalty - abs(x - preferred_x) * 0.004
        if score > best_score:
            best_score = score
            best_x = x

    return int(max(0, min(extra_w, best_x)))

def _adaptive_contract_prefers_safe_contain(layout_contract: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(layout_contract, dict):
        return False
    strategy = layout_contract.get("adaptive_strategy")
    if not isinstance(strategy, dict):
        return False
    return bool(
        strategy.get("qa_failover_to_safe_contain")
        or strategy.get("posture") == "layout_preserving"
        or strategy.get("edge_pressure")
        or strategy.get("dense_text_layout")
    )


def _crop_would_remove_salient_edges(
    src: Image.Image,
    crop_box: Tuple[int, int, int, int],
    *,
    axis: str,
    layout_contract: Optional[Dict[str, Any]] = None,
) -> bool:
    """Detecta quando o fechamento full-bleed ameaça remover conteúdo importante.

    O modelo intermediário nem sempre respeita a safe area. Se o fechamento técnico
    ainda precisar cortar exatamente uma faixa com saliência alta, o resultado final
    costuma perder overline, cidade, data, CTA ou logos. Nesses casos, para pedidos
    conservadores, o sistema preserva a peça inteira em canvas seguro.
    """
    if not _adaptive_contract_prefers_safe_contain(layout_contract):
        return False
    x1, y1, x2, y2 = crop_box
    removed_scores: List[float] = []
    if axis == "y":
        if y1 > 0:
            removed_scores.append(_strip_saliency_score(src, (0, 0, src.width, y1)))
        if y2 < src.height:
            removed_scores.append(_strip_saliency_score(src, (0, y2, src.width, src.height)))
    elif axis == "x":
        if x1 > 0:
            removed_scores.append(_strip_saliency_score(src, (0, 0, x1, src.height)))
        if x2 < src.width:
            removed_scores.append(_strip_saliency_score(src, (x2, 0, src.width, src.height)))
    if not removed_scores:
        return False
    # Threshold conservador: só troca o full-bleed por contain quando a faixa cortada
    # tem contraste/borda suficientes para indicar informação real, não apenas fundo.
    return max(removed_scores) >= 0.18

def _finalize_to_exact_size(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    layout_contract: Optional[Dict[str, Any]] = None,
) -> bytes:
    """Fecha a saída no tamanho exato em full-bleed, sem bordas laterais.

    V5: o fechamento agora conhece a orientação e o lado da copy. Isso evita que
    uma arte portrait, gerada em 1024x1536 e fechada em 768x1376, perca título,
    logos, CTA ou elementos visuais por um crop lateral central demais.
    """
    with Image.open(io.BytesIO(image_bytes)) as im:
        src = im.convert("RGBA")
        target_ratio = target_width / max(1.0, float(target_height))
        source_ratio = src.width / max(1.0, float(src.height))

        if abs(math.log(max(1e-6, source_ratio / max(1e-6, target_ratio)))) <= 0.015:
            final = src.resize((target_width, target_height), Image.Resampling.LANCZOS)
            final = _remove_solid_letterbox_if_needed(final, target_width, target_height)
            return _encode_png_bytes(final)

        copy_side = "center"
        if isinstance(layout_contract, dict):
            copy_side = str(layout_contract.get("source_copy_side") or "center")

        if source_ratio < target_ratio:
            # Saída mais vertical que o alvo: precisa cortar altura, não criar bordas.
            crop_h = int(round(src.width / target_ratio))
            crop_h = max(1, min(src.height, crop_h))
            crop_y = _choose_full_bleed_crop_y(src, crop_h)
            crop_box = (0, crop_y, src.width, crop_y + crop_h)
            if _crop_would_remove_salient_edges(src, crop_box, axis="y", layout_contract=layout_contract):
                final = _build_safe_exact_canvas_from_full_image(src, target_width, target_height)
                final = _remove_solid_letterbox_if_needed(final, target_width, target_height)
                return _encode_png_bytes(final)
            cropped = src.crop(crop_box)
        else:
            # Saída mais horizontal que o alvo: precisa cortar largura.
            crop_w = int(round(src.height * target_ratio))
            crop_w = max(1, min(src.width, crop_w))
            crop_x = _choose_full_bleed_crop_x(src, crop_w, copy_side=copy_side)
            crop_box = (crop_x, 0, crop_x + crop_w, src.height)
            if _crop_would_remove_salient_edges(src, crop_box, axis="x", layout_contract=layout_contract):
                final = _build_safe_exact_canvas_from_full_image(src, target_width, target_height)
                final = _remove_solid_letterbox_if_needed(final, target_width, target_height)
                return _encode_png_bytes(final)
            cropped = src.crop(crop_box)

        final = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
        final = _remove_solid_letterbox_if_needed(final, target_width, target_height)
        return _encode_png_bytes(final)

def _flatten_image_rgb(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def _estimate_background_color(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    border = max(2, int(min(h, w) * 0.035))
    samples = np.concatenate([
        arr[:border, :, :].reshape(-1, 3),
        arr[-border:, :, :].reshape(-1, 3),
        arr[:, :border, :].reshape(-1, 3),
        arr[:, -border:, :].reshape(-1, 3),
    ], axis=0)
    return np.median(samples, axis=0)


def _smooth_profile(profile: np.ndarray, radius: int = 18) -> np.ndarray:
    """Suaviza perfis de cor 1D sem aplicar blur na arte final."""
    arr = np.asarray(profile, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[0] <= 2:
        return arr
    radius = max(2, min(int(radius), max(2, arr.shape[0] // 5)))
    kernel = np.ones(radius * 2 + 1, dtype=np.float32)
    kernel = kernel / max(1e-6, float(kernel.sum()))
    padded = np.pad(arr, ((radius, radius), (0, 0)), mode="edge")
    out = np.zeros_like(arr)
    for c in range(arr.shape[1]):
        out[:, c] = np.convolve(padded[:, c], kernel, mode="valid")
    return out


def _resize_profile(profile: np.ndarray, target_len: int) -> np.ndarray:
    arr = np.asarray(profile, dtype=np.float32)
    if target_len <= 0:
        return np.zeros((0, 3), dtype=np.float32)
    if arr.ndim != 2 or arr.shape[0] <= 1:
        value = arr[0] if arr.ndim == 2 and arr.shape[0] else np.array([8, 18, 45], dtype=np.float32)
        return np.tile(value.reshape(1, 3), (target_len, 1)).astype(np.float32)
    src_x = np.linspace(0.0, 1.0, arr.shape[0])
    dst_x = np.linspace(0.0, 1.0, target_len)
    out = np.zeros((target_len, 3), dtype=np.float32)
    for c in range(3):
        out[:, c] = np.interp(dst_x, src_x, arr[:, c])
    return out


def _pick_accent_colors(arr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    rgb = np.asarray(arr, dtype=np.float32)
    if rgb.size == 0:
        return np.array([0, 230, 255], dtype=np.float32), np.array([255, 43, 214], dtype=np.float32)
    flat = rgb.reshape(-1, 3)
    luminance = flat @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    saturation = flat.max(axis=1) - flat.min(axis=1)
    mask = (luminance >= np.percentile(luminance, 78)) & (saturation >= np.percentile(saturation, 58))
    vivid = flat[mask]
    if vivid.shape[0] < 10:
        vivid = flat[np.argsort(luminance)[-max(10, min(800, flat.shape[0])):]]
    cyan_score = vivid[:, 1] + vivid[:, 2] * 1.15 - vivid[:, 0] * 0.7
    magenta_score = vivid[:, 0] + vivid[:, 2] * 1.05 - vivid[:, 1] * 0.55
    cyan = vivid[int(np.argmax(cyan_score))].astype(np.float32)
    magenta = vivid[int(np.argmax(magenta_score))].astype(np.float32)
    # Mantém o fundo na identidade da arte mesmo quando a amostra for muito escura.
    if float(cyan.max()) < 80:
        cyan = np.array([0, 220, 245], dtype=np.float32)
    if float(magenta.max()) < 90:
        magenta = np.array([235, 35, 210], dtype=np.float32)
    return cyan, magenta


def _make_soft_gradient_background(source_image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
    """Cria um fundo ambiente sem barras sólidas.

    V9: o fallback/safe-contain não pode gerar laterais chapadas. Em vez de uma cor
    média por borda, este fundo sintetiza a ambiência da peça a partir de perfis das
    quatro bordas, glows suaves e ruído determinístico. Não espelha, não estica e não
    cola recortes da arte original.
    """
    target_width, target_height = target_size
    arr_u8 = _flatten_image_rgb(source_image)
    arr = arr_u8.astype(np.float32)
    h, w = arr.shape[:2]
    band_x = max(3, int(w * 0.055))
    band_y = max(3, int(h * 0.055))

    left_profile = _smooth_profile(np.median(arr[:, :band_x, :], axis=1), radius=max(4, h // 44))
    right_profile = _smooth_profile(np.median(arr[:, -band_x:, :], axis=1), radius=max(4, h // 44))
    top_profile = _smooth_profile(np.median(arr[:band_y, :, :], axis=0), radius=max(4, w // 44))
    bottom_profile = _smooth_profile(np.median(arr[-band_y:, :, :], axis=0), radius=max(4, w // 44))

    left_y = _resize_profile(left_profile, target_height)[:, None, :]
    right_y = _resize_profile(right_profile, target_height)[:, None, :]
    top_x = _resize_profile(top_profile, target_width)[None, :, :]
    bottom_x = _resize_profile(bottom_profile, target_width)[None, :, :]

    yy = np.linspace(0.0, 1.0, target_height, dtype=np.float32)[:, None, None]
    xx = np.linspace(0.0, 1.0, target_width, dtype=np.float32)[None, :, None]
    horizontal = left_y * (1.0 - xx) + right_y * xx
    vertical = top_x * (1.0 - yy) + bottom_x * yy
    gradient = horizontal * 0.58 + vertical * 0.42

    cyan, magenta = _pick_accent_colors(arr_u8)
    x2 = np.linspace(0.0, 1.0, target_width, dtype=np.float32)[None, :]
    y2 = np.linspace(0.0, 1.0, target_height, dtype=np.float32)[:, None]
    glow_a = np.exp(-(((x2 - 0.72) / 0.38) ** 2 + ((y2 - 0.22) / 0.42) ** 2))[:, :, None]
    glow_b = np.exp(-(((x2 - 0.13) / 0.30) ** 2 + ((y2 - 0.86) / 0.36) ** 2))[:, :, None]
    glow_c = np.exp(-(((x2 - 0.92) / 0.28) ** 2 + ((y2 - 0.88) / 0.30) ** 2))[:, :, None]
    gradient = gradient * (1.0 + glow_a * 0.10 + glow_b * 0.08)
    gradient = gradient + cyan.reshape(1, 1, 3) * glow_a * 0.12
    gradient = gradient + magenta.reshape(1, 1, 3) * glow_b * 0.10
    gradient = gradient + magenta.reshape(1, 1, 3) * glow_c * 0.07

    # Variação sutil para impedir aparência de faixa sólida mesmo em peças muito escuras.
    seed = int((target_width * 73856093) ^ (target_height * 19349663) ^ int(arr_u8.mean() * 83492791)) & 0xFFFFFFFF
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 3.0, (target_height, target_width, 1)).astype(np.float32)
    waves = (
        np.sin((x2 * 17.0 + y2 * 3.0) * math.pi) +
        np.sin((x2 * 5.0 - y2 * 11.0) * math.pi)
    )[:, :, None] * 2.2
    gradient = gradient + noise + waves

    # Vinheta discreta para manter profundidade e esconder transições laterais.
    dist = np.sqrt((x2 - 0.5) ** 2 + (y2 - 0.5) ** 2)[:, :, None]
    vignette = np.clip(1.08 - dist * 0.48, 0.72, 1.05)
    gradient = gradient * vignette

    out = np.clip(gradient, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGB").convert("RGBA")


def _feather_layer_for_canvas(layer: Image.Image, canvas_size: Tuple[int, int], offset: Tuple[int, int]) -> Image.Image:
    """Suaviza apenas a transição da camada quando ela não ocupa o canvas inteiro."""
    target_width, target_height = canvas_size
    x, y = offset
    rgba = layer.convert("RGBA")
    if rgba.width >= target_width and rgba.height >= target_height:
        return rgba
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32)
    min_dim = max(1, min(target_width, target_height))
    feather = max(16, min(54, int(min_dim * 0.055)))

    if x > 0 and rgba.width > 8:
        fx = min(feather, max(2, rgba.width // 5))
        ramp = np.linspace(0.0, 1.0, fx, dtype=np.float32)[None, :]
        alpha[:, :fx] *= ramp
    if x + rgba.width < target_width and rgba.width > 8:
        fx = min(feather, max(2, rgba.width // 5))
        ramp = np.linspace(1.0, 0.0, fx, dtype=np.float32)[None, :]
        alpha[:, -fx:] *= ramp
    if y > 0 and rgba.height > 8:
        fy = min(feather, max(2, rgba.height // 5))
        ramp = np.linspace(0.0, 1.0, fy, dtype=np.float32)[:, None]
        alpha[:fy, :] *= ramp
    if y + rgba.height < target_height and rgba.height > 8:
        fy = min(feather, max(2, rgba.height // 5))
        ramp = np.linspace(1.0, 0.0, fy, dtype=np.float32)[:, None]
        alpha[-fy:, :] *= ramp

    alpha_img = Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8), mode="L")
    rgba.putalpha(alpha_img)
    return rgba


def _build_safe_exact_canvas_from_full_image(src: Image.Image, target_width: int, target_height: int) -> Image.Image:
    """Fecha no tamanho exato preservando a imagem inteira sem criar bordas sólidas.

    Quando o crop técnico cortaria informação relevante, a V9 mantém a peça inteira,
    mas sintetiza um fundo ambiente contínuo e aplica feather nas bordas da camada.
    Isso elimina o problema visual de faixas laterais chapadas.
    """
    canvas = _make_soft_gradient_background(src, (target_width, target_height))
    layer = src.convert("RGBA")
    layer.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - layer.width) // 2)
    y = max(0, (target_height - layer.height) // 2)
    layer = _feather_layer_for_canvas(layer, (target_width, target_height), (x, y))
    canvas.alpha_composite(layer, (x, y))
    return canvas


def _solid_edge_bar_bounds(image: Image.Image) -> Optional[Tuple[int, int, int, int]]:
    """Detecta letterbox/pillarbox sólido criado por contain técnico.

    Retorna a caixa útil (left, top, right, bottom) quando encontra barras sólidas.
    É um guard técnico final, não um detector criativo.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    if h < 80 or w < 80:
        return None

    def channel_bar_width(axis: str, from_end: bool = False) -> int:
        if axis == "x":
            max_scan = max(4, int(w * 0.24))
            min_scan = max(3, int(w * 0.028))
            prev_edges: List[float] = []
            for i in range(1, max_scan):
                x = w - 1 - i if from_end else i
                if not (1 <= x < w):
                    continue
                # A barra pode ter gradiente vertical, então std global engana.
                # O sinal correto é quase nenhuma variação horizontal por vários pixels
                # e uma quebra vertical forte quando começa a arte central.
                if from_end and x + 1 < w:
                    edge = float(np.mean(np.abs(rgb[:, x + 1, :] - rgb[:, x, :])))
                else:
                    edge = float(np.mean(np.abs(rgb[:, x, :] - rgb[:, x - 1, :])))
                prev_edges.append(edge)
                baseline = float(np.median(prev_edges[-max(4, min_scan):])) if prev_edges else 0.0
                if i >= min_scan and edge >= max(8.5, baseline * 9.0):
                    return i
            return 0
        max_scan = max(4, int(h * 0.24))
        min_scan = max(3, int(h * 0.028))
        prev_edges: List[float] = []
        for i in range(1, max_scan):
            y = h - 1 - i if from_end else i
            if not (1 <= y < h):
                continue
            if from_end and y + 1 < h:
                edge = float(np.mean(np.abs(rgb[y + 1, :, :] - rgb[y, :, :])))
            else:
                edge = float(np.mean(np.abs(rgb[y, :, :] - rgb[y - 1, :, :])))
            prev_edges.append(edge)
            baseline = float(np.median(prev_edges[-max(4, min_scan):])) if prev_edges else 0.0
            if i >= min_scan and edge >= max(8.5, baseline * 9.0):
                return i
        return 0

    left = channel_bar_width("x", False)
    right = w - channel_bar_width("x", True)
    top = channel_bar_width("y", False)
    bottom = h - channel_bar_width("y", True)

    min_bar_x = int(w * 0.035)
    min_bar_y = int(h * 0.035)
    # Letterbox/pillarbox técnico aparece como par de barras.
    # Uma única área escura de canto/rodapé pode fazer parte da arte e não deve ser reparada.
    has_x_bar = left >= min_bar_x and (w - right) >= min_bar_x
    has_y_bar = top >= min_bar_y and (h - bottom) >= min_bar_y
    if not has_x_bar and not has_y_bar:
        return None
    if right - left < int(w * 0.45) or bottom - top < int(h * 0.45):
        return None
    return left, top, right, bottom


def _remove_solid_letterbox_if_needed(final: Image.Image, target_width: int, target_height: int) -> Image.Image:
    """Última trava: se ainda aparecer barra sólida, refaz o fundo e dissolve a borda."""
    bounds = _solid_edge_bar_bounds(final)
    if not bounds:
        return final
    left, top, right, bottom = bounds
    content = final.crop((left, top, right, bottom)).convert("RGBA")
    canvas = _make_soft_gradient_background(content, (target_width, target_height))
    content.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - content.width) // 2)
    y = max(0, (target_height - content.height) // 2)
    content = _feather_layer_for_canvas(content, (target_width, target_height), (x, y))
    canvas.alpha_composite(content, (x, y))
    return canvas


def _build_safe_single_piece_fallback(source_image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
    """Fallback final que nunca monta colagem de pedaços nem bordas sólidas."""
    target_width, target_height = target_size
    canvas = _make_soft_gradient_background(source_image, target_size)
    layer = source_image.convert("RGBA")
    layer.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - layer.width) // 2)
    y = max(0, (target_height - layer.height) // 2)
    layer = _feather_layer_for_canvas(layer, (target_width, target_height), (x, y))
    canvas.alpha_composite(layer, (x, y))
    return canvas

def _as_pct_bbox(value: Any) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        x, y, w, h = (float(value[0]), float(value[1]), float(value[2]), float(value[3]))
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None
    # Alguns modelos podem devolver 0..1. Normaliza para 0..100.
    if max(abs(x), abs(y), abs(w), abs(h)) <= 1.5:
        x, y, w, h = x * 100.0, y * 100.0, w * 100.0, h * 100.0
    x = max(0.0, min(100.0, x))
    y = max(0.0, min(100.0, y))
    w = max(0.1, min(100.0 - x, w))
    h = max(0.1, min(100.0 - y, h))
    return (x, y, w, h)


def _bbox_edges_pct(bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
    x, y, w, h = bbox
    return x, y, min(100.0, x + w), min(100.0, y + h)


def _normalize_role(value: Any) -> str:
    role = str(value or "other").strip().lower()
    aliases = {
        "button": "cta",
        "call_to_action": "cta",
        "call-to-action": "cta",
        "brand": "logo",
        "logos": "logo",
        "headline": "title",
        "heading": "title",
        "valor": "price",
        "preco": "price",
        "preço": "price",
        "data": "date",
        "decorative": "support_panel",
        "support": "support_panel",
        "panel": "support_panel",
    }
    return aliases.get(role, role)


def _required_roles_from_layout(ai_layout: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(ai_layout, dict):
        return []
    roles: List[str] = []
    required = ai_layout.get("required_visible_elements")
    if not isinstance(required, list):
        return []
    for item in required:
        if not isinstance(item, dict):
            continue
        if not _is_critical_item(item):
            continue
        role = _normalize_role(item.get("role"))
        text = str(item.get("visible_text") or "").lower()
        if "program" in text or "confira" in text or "saiba" in text or "inscre" in text:
            role = "cta"
        if role not in roles:
            roles.append(role)
    return roles

def _extract_layout_items(ai_layout: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extrai os elementos visuais normalizados da leitura de layout da IA.

    Este é o checker universal do fluxo. Ele não depende de uma campanha específica:
    qualquer peça que tenha título, CTA, logo, preço, data, pessoa, produto ou bloco de
    texto passa pelo mesmo contrato de preservação, borda, ancoragem e agrupamento.
    """
    items: List[Dict[str, Any]] = []
    if not isinstance(ai_layout, dict):
        return items
    required = ai_layout.get("required_visible_elements")
    if not isinstance(required, list):
        return items
    for raw in required:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("visible_text") or "").strip()
        role = _normalize_role(raw.get("role"))
        if _is_cta_text(text):
            role = "cta"
        bbox = _as_pct_bbox(raw.get("bbox_pct"))
        items.append({
            "role": role,
            "visible_text": text,
            "visual_description": str(raw.get("visual_description") or "").strip(),
            "importance": str(raw.get("importance") or "normal").strip().lower(),
            "source_anchor": str(raw.get("source_anchor") or "").strip().lower(),
            "bbox": bbox,
        })
    return items


def _bbox_area_pct(bbox: Tuple[float, float, float, float]) -> float:
    return max(0.0, float(bbox[2])) * max(0.0, float(bbox[3]))


def _bbox_center_pct(bbox: Tuple[float, float, float, float]) -> Tuple[float, float]:
    x, y, w, h = bbox
    return x + w / 2.0, y + h / 2.0


def _bbox_intersection_ratio(
    bbox: Tuple[float, float, float, float],
    slot: Tuple[float, float, float, float],
    pad: float = 0.0,
) -> float:
    x1, y1, x2, y2 = _bbox_edges_pct(bbox)
    sx1, sy1, sx2, sy2 = slot
    sx1 = max(0.0, sx1 - pad)
    sy1 = max(0.0, sy1 - pad)
    sx2 = min(100.0, sx2 + pad)
    sy2 = min(100.0, sy2 + pad)
    ix1, iy1 = max(x1, sx1), max(y1, sy1)
    ix2, iy2 = min(x2, sx2), min(y2, sy2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area = max(1e-6, (x2 - x1) * (y2 - y1))
    return float(inter / area)


def _role_compatible(expected: str, detected: str) -> bool:
    expected = _normalize_role(expected)
    detected = _normalize_role(detected)
    if expected == detected:
        return True
    compatibility = {
        "seal": {"logo"},
        "logo": {"seal"},
    }
    return detected in compatibility.get(expected, set())


def _text_tokens_lite(text: str) -> List[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in str(text or ""))
    return [token for token in cleaned.split() if len(token) >= 3]


def _has_visible_text_match(source_text: str, final_items: List[Dict[str, Any]]) -> bool:
    source_tokens = set(_text_tokens_lite(source_text))
    if not source_tokens:
        return False
    for item in final_items:
        final_tokens = set(_text_tokens_lite(str(item.get("visible_text") or "")))
        if not final_tokens:
            continue
        overlap = len(source_tokens.intersection(final_tokens)) / max(1, len(source_tokens))
        if overlap >= 0.60:
            return True
    return False


def _role_to_contract_slot(role: str) -> Optional[str]:
    role = _normalize_role(role)
    if role in {"title", "overline", "subtitle", "date"}:
        return "copy_column"
    if role == "cta":
        return "footer_cta"
    if role in {"logo", "seal"}:
        return "footer_logos"
    if role == "price":
        return "price"
    if role == "hero":
        return "hero_visual"
    if role == "support_panel":
        return "support_panels"
    return None


def _is_critical_item(item: Dict[str, Any]) -> bool:
    """Define criticidade sem transformar alucinações da análise em obrigações.

    V11: preço, logo e selo só são obrigatórios quando realmente houver texto/
    evidência visível. Antes o analyzer às vezes classificava sombras, bolinhas
    ou ornamentos como price/logo/seal; o QA passava a exigir elementos que a
    peça original não tinha e acionava fallbacks ruins.
    """
    role = _normalize_role(item.get("role"))
    importance = str(item.get("importance") or "normal").lower()
    text = str(item.get("visible_text") or "").strip()
    text_l = text.lower()

    if role == "hero":
        return importance in {"critical", "high"}
    if role == "support_panel":
        return False
    if role in {"title", "overline", "subtitle", "date", "cta"}:
        return bool(text) or importance in {"critical", "high"}
    if role == "price":
        return bool(text) and bool(re.search(r"(?:r\$|\$|€|\d|gratis|gratuito|pre[cç]o|valor)", text_l))
    if role in {"logo", "seal"}:
        return bool(text) and importance in {"critical", "high"}
    return bool(text) and importance in {"critical", "high"}

def _copy_group_boxes(items: List[Dict[str, Any]]) -> List[Tuple[float, float, float, float]]:
    copy_roles = {"title", "overline", "subtitle", "price", "date", "logo", "seal", "cta"}
    boxes: List[Tuple[float, float, float, float]] = []
    for item in items:
        role = _normalize_role(item.get("role"))
        bbox = item.get("bbox")
        if role in copy_roles and bbox:
            boxes.append(bbox)
    return boxes


def _group_edges_pct(boxes: List[Tuple[float, float, float, float]]) -> Optional[Tuple[float, float, float, float]]:
    if not boxes:
        return None
    edges = [_bbox_edges_pct(b) for b in boxes]
    return min(e[0] for e in edges), min(e[1] for e in edges), max(e[2] for e in edges), max(e[3] for e in edges)


def _layout_map_from_ai(ai_layout: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(ai_layout, dict):
        return {}
    layout_map = ai_layout.get("layout_map")
    return layout_map if isinstance(layout_map, dict) else {}


def _infer_spatial_sides(ai_layout: Optional[Dict[str, Any]]) -> Tuple[str, str]:
    """Infere o mapa espacial sem inventar coluna lateral.

    Regressão corrigida na V11: quando a análise não traz um mapa confiável,
    o código antigo assumia visual=left/copy=right. Em peças centralizadas e
    minimalistas isso empurrava a IA para uma diagramação lateral que não existia
    na referência, gerando descentralização, cortes e fundos estranhos.
    """
    if not isinstance(ai_layout, dict):
        return "center", "center"

    layout_map = _layout_map_from_ai(ai_layout)
    visual_side_raw = layout_map.get("visual_side") if isinstance(layout_map, dict) else None
    copy_side_raw = layout_map.get("copy_column_side") if isinstance(layout_map, dict) else None

    def normalize(value: Any, allowed: set[str], default: str) -> str:
        side = str(value or "").strip().lower()
        return side if side in allowed else default

    visual_side = normalize(visual_side_raw, {"left", "right", "center"}, "center")
    copy_side = normalize(copy_side_raw, {"left", "right", "center", "none"}, "center")

    # Se o modelo não informou lado de copy, infere pelo centro dos blocos textuais.
    if copy_side in {"", "none", "center"} and not copy_side_raw:
        boxes: List[Tuple[float, float, float, float]] = []
        for item in _extract_layout_items(ai_layout):
            role = _normalize_role(item.get("role"))
            text = str(item.get("visible_text") or "").strip()
            bbox = item.get("bbox")
            if bbox and (role in {"title", "overline", "subtitle", "date", "cta", "price"} or text):
                boxes.append(bbox)
        edges = _group_edges_pct(boxes)
        if edges:
            gx1, _gy1, gx2, _gy2 = edges
            center_x = (gx1 + gx2) / 2.0
            if center_x <= 42.0:
                copy_side = "left"
            elif center_x >= 58.0:
                copy_side = "right"
            else:
                copy_side = "center"

    return visual_side, copy_side

def _instruction_has_any(instruction: str, tokens: List[str]) -> bool:
    text = str(instruction or "").lower()
    return any(token in text for token in tokens)


def _layout_item_stats(ai_layout: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    items = _extract_layout_items(ai_layout)
    text_roles = {"title", "overline", "subtitle", "price", "date", "cta", "other"}
    text_count = 0
    critical_count = 0
    top_edge_count = 0
    bottom_edge_count = 0
    side_edge_count = 0
    roles: List[str] = []
    for item in items:
        role = _normalize_role(item.get("role"))
        if role not in roles:
            roles.append(role)
        if role in text_roles and str(item.get("visible_text") or "").strip():
            text_count += 1
        if _is_critical_item(item):
            critical_count += 1
        bbox = item.get("bbox")
        if bbox:
            x1, y1, x2, y2 = _bbox_edges_pct(bbox)
            if y1 <= 6.0:
                top_edge_count += 1
            if y2 >= 94.0:
                bottom_edge_count += 1
            if x1 <= 4.0 or x2 >= 96.0:
                side_edge_count += 1
    return {
        "item_count": len(items),
        "text_count": text_count,
        "critical_count": critical_count,
        "top_edge_count": top_edge_count,
        "bottom_edge_count": bottom_edge_count,
        "side_edge_count": side_edge_count,
        "roles": roles,
    }


def _make_adaptive_strategy_decision(
    *,
    ai_layout: Optional[Dict[str, Any]],
    instruction_text: str,
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
    generated_width: int,
    generated_height: int,
) -> Dict[str, Any]:
    """Decide a postura da edição antes de gerar a imagem.

    A V7 sempre entrava no mesmo modo de recomposição para quase qualquer troca de
    resolução. Isso funcionava em peças simples, mas em peças densas a IA mudava a
    diagramação mais do que deveria ou colocava elementos críticos perto demais das
    bordas. A V8 mantém a rota de IA, mas deixa a decisão estratégica explícita:
    preservar layout, recompor de forma balanceada ou aceitar reestruturação maior.
    """
    source_ratio = source_width / max(1.0, float(source_height))
    target_ratio = target_width / max(1.0, float(target_height))
    generated_ratio = generated_width / max(1.0, float(generated_height))
    ratio_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, source_ratio))))
    generation_to_target_delta = abs(math.log(max(1e-6, target_ratio / max(1e-6, generated_ratio))))
    orientation_changed = (source_width >= source_height) != (target_width >= target_height)
    stats = _layout_item_stats(ai_layout)

    preserve_intent = _instruction_has_any(
        instruction_text,
        [
            "apenas", "somente", "só", "so", "mínimo", "minimo", "mantendo", "manter",
            "preserv", "sem mudar", "sem alterar", "igual", "mesmo layout", "mesma diagrama",
            "encaixe", "encaixar", "ajustes necessários", "ajustes necessarios",
        ],
    )
    creative_intent = _instruction_has_any(
        instruction_text,
        [
            "troque", "mude o fundo", "mudar o fundo", "adicione", "remova", "substitua",
            "recrie do zero", "redesenhe tudo", "novo estilo", "estilo anime", "estilo cartoon",
            "cinematográfico", "cinematografico", "crie uma nova",
        ],
    )
    dense_text_layout = stats["text_count"] >= 4 or stats["critical_count"] >= 6
    edge_pressure = (stats["top_edge_count"] + stats["bottom_edge_count"] + stats["side_edge_count"]) >= 2
    target_landscape = target_width >= target_height

    reasons: List[str] = []
    if orientation_changed:
        reasons.append("orientation_changed")
    if ratio_delta >= 0.42:
        reasons.append("large_ratio_change")
    if generation_to_target_delta >= 0.12:
        reasons.append("openai_canvas_needs_final_crop")
    if preserve_intent:
        reasons.append("user_requested_minimal_adjustment")
    if dense_text_layout:
        reasons.append("dense_text_or_many_critical_elements")
    if edge_pressure:
        reasons.append("source_has_edge_anchored_elements")
    if creative_intent:
        reasons.append("creative_edit_requested")

    if creative_intent and not preserve_intent:
        strategy_id = "adaptive_full_recomposition_v9"
        posture = "creative_relayout"
        allow_major_relayout = True
        max_attempts = 2
    elif preserve_intent or dense_text_layout or edge_pressure:
        strategy_id = "adaptive_layout_preservation_v10"
        posture = "layout_preserving"
        allow_major_relayout = False
        max_attempts = 3 if (orientation_changed or dense_text_layout) else 2
    else:
        strategy_id = "adaptive_balanced_recomposition_v9"
        posture = "balanced_relayout"
        allow_major_relayout = False
        max_attempts = 2

    return {
        "strategy_id": strategy_id,
        "posture": posture,
        "allow_major_relayout": allow_major_relayout,
        "max_attempts": max_attempts,
        "ratio_delta": round(ratio_delta, 4),
        "orientation_changed": orientation_changed,
        "target_orientation": "landscape" if target_landscape else "portrait",
        "source_orientation": "landscape" if source_width >= source_height else "portrait",
        "generated_to_target_delta": round(generation_to_target_delta, 4),
        "preserve_intent": preserve_intent,
        "creative_intent": creative_intent,
        "dense_text_layout": dense_text_layout,
        "edge_pressure": edge_pressure,
        "layout_stats": stats,
        "reasons": reasons,
        "safe_area_pct": {
            "x1": 8.0,
            "y1": 10.0 if generation_to_target_delta >= 0.12 else 7.0,
            "x2": 92.0,
            "y2": 90.0 if generation_to_target_delta >= 0.12 else 93.0,
        },
        "qa_failover_to_safe_contain": False,
    }


def _adaptive_strategy_text(strategy: Optional[Dict[str, Any]]) -> str:
    if not isinstance(strategy, dict):
        return "Modo adaptativo indisponível. Preserve a referência e evite cortes."
    posture = str(strategy.get("posture") or "balanced_relayout")
    safe = strategy.get("safe_area_pct") if isinstance(strategy.get("safe_area_pct"), dict) else {}
    x1 = float(safe.get("x1", 8.0))
    y1 = float(safe.get("y1", 9.0))
    x2 = float(safe.get("x2", 92.0))
    y2 = float(safe.get("y2", 91.0))
    reasons = ", ".join(str(x) for x in (strategy.get("reasons") or [])) or "sem motivo adicional"

    common = f"""
Decisão adaptativa da IA antes da geração:
- modo escolhido: {strategy.get('strategy_id')}
- postura: {posture}
- motivos técnicos: {reasons}
- safe area interna obrigatória para TODO elemento crítico: x {x1:.0f}%–{x2:.0f}%, y {y1:.0f}%–{y2:.0f}% da imagem intermediária e também do arquivo final.
- A saída intermediária pode ser maior/proporcionalmente diferente do alvo; por isso overline, título, cidade, datas, CTA, logos, preço, rostos/produtos e textos pequenos NÃO podem nascer perto de y 0%, y 100%, x 0% ou x 100%.
""".strip()

    if posture == "layout_preserving":
        specific = """
Regras do modo PRESERVAR DIAGRAMAÇÃO:
1. Trate a imagem original como layout aprovado. Não reinterprete a peça do zero.
2. Preserve a ordem visual, hierarquia e agrupamento original. Só ajuste escala, respiro, quebras e posição quando necessário para caber no novo formato.
3. Não mude a distribuição sem necessidade. Se a peça original é centralizada, mantenha uma composição centralizada adaptada; se ela tem coluna lateral, mantenha a coluna no lado correto.
4. Em conversão de vertical para horizontal, não jogue a faixa superior/overline para fora da tela. Ela deve ficar inteira e com margem superior real.
5. O bloco inferior, cidade, data/local e CTA devem continuar como família visual, com margem inferior real. Não empurre o CTA para fora nem para o meio sem necessidade.
6. Elementos decorativos podem ser expandidos/recriados no fundo, mas a informação comercial precisa permanecer intacta.
""".strip()
    elif posture == "creative_relayout":
        specific = """
Regras do modo RECOMPOSIÇÃO AMPLA:
1. Pode reorganizar mais a composição para parecer nativa no novo formato.
2. Mesmo assim, preserve todos os textos, logos, CTA, datas, produtos e hierarquia de campanha.
3. A liberdade criativa não autoriza remover, resumir ou trocar informação.
""".strip()
    else:
        specific = """
Regras do modo BALANCEADO:
1. Reorganize apenas o suficiente para o formato solicitado parecer profissional.
2. Preserve o DNA espacial da peça original e evite centralização automática quando houver coluna lateral.
3. Faça microdiagramação para encaixe, mas sem alterar conteúdo.
""".strip()
    return f"{common}\n{specific}"


def _qa_has_severe_edge_or_missing_issue(qa: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(qa, dict):
        return False
    issues = [str(x) for x in (qa.get("issues") or [])]
    score = int(qa.get("score", 0) or 0)
    severe_tokens = (
        "missing_", "critical_missing", "cut_risk", "touching_edge", "too_close_top",
        "too_close_bottom", "too_low_or_cut", "outside_expected_slot", "not_cohesive",
    )
    return bool(score >= 12 or any(any(token in issue for token in severe_tokens) for issue in issues))


def _build_safe_area_repair_prompt(base_prompt: str, qa: Dict[str, Any], contract: Dict[str, Any], strategy: Dict[str, Any]) -> str:
    issues = ", ".join(str(x) for x in (qa.get("issues") or [])) or "elementos perto das bordas"
    return f"""
{base_prompt}

PASSO EXTRA DE REPARO DE SAFE AREA.
A tentativa anterior ainda falhou nestes pontos: {issues}.
Use a imagem enviada nesta chamada como referência da tentativa anterior, mas CORRIJA a diagramação antes de finalizar:
1. Faça um leve zoom-out/reencaixe da composição informativa para dentro da safe area.
2. Preserve todos os textos exatamente como estão na campanha original. Não reescreva, não resuma e não invente.
3. Overline/faixa superior, título, cidade, data/local e CTA precisam ficar inteiros, legíveis e com margem real.
4. Não deixe nenhum texto ou botão tocando a borda superior/inferior.
5. Preencha o fundo com a própria estética da peça, sem blur, mirror, smear, stretch, colagem ou bordas chapadas.
6. Mantenha o modo adaptativo escolhido: {strategy.get('strategy_id')}.
7. Se houver conflito entre full-bleed e preservar elementos, vença a preservação dos elementos críticos.

Checklist final obrigatório antes de gerar: topo inteiro, rodapé inteiro, CTA inteiro, cidade inteira, data/local inteiro, título inteiro, sem corte e sem desalinhamento grosseiro.
Contrato de layout:
{_layout_contract_text(contract)}
""".strip()



def _is_clean_light_minimal_design(image: Image.Image) -> bool:
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    if arr.size == 0:
        return False
    luma = arr @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    sat = arr.max(axis=2) - arr.min(axis=2)
    bright_low_sat = (luma >= 202.0) & (sat <= 42.0)
    return bool(float(np.mean(bright_low_sat)) >= 0.42 and float(np.median(luma)) >= 188.0)


def _detect_soft_edge_haze_issue(image_bytes: bytes) -> Dict[str, Any]:
    """Detecta moldura difusa nas bordas em artes claras/minimalistas.

    Não tenta reparar por pós-processamento para não criar barras artificiais.
    O detector serve para pedir nova tentativa de IA com bordas limpas.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            image = im.convert("RGBA")
    except Exception:
        return {"has_issue": False, "score": 0.0, "sides": []}
    if not _is_clean_light_minimal_design(image):
        return {"has_issue": False, "score": 0.0, "sides": []}

    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    edges = np.asarray(image.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32)
    center = rgb[int(h * 0.18): int(h * 0.82), int(w * 0.16): int(w * 0.84), :]
    center_luma = center @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    center_sat = center.max(axis=2) - center.min(axis=2)
    bg_mask = (center_luma >= 205.0) & (center_sat <= 42.0)
    if np.count_nonzero(bg_mask) >= 32:
        bg = np.median(center[bg_mask], axis=0).astype(np.float32)
    else:
        bg = np.median(center.reshape(-1, 3), axis=0).astype(np.float32)

    bands = {
        "top": (slice(0, max(22, int(h * 0.11))), slice(0, w)),
        "bottom": (slice(max(0, h - max(22, int(h * 0.11))), h), slice(0, w)),
        "left": (slice(0, h), slice(0, max(24, int(w * 0.08)))),
        "right": (slice(0, h), slice(max(0, w - max(24, int(w * 0.08))), w)),
    }
    sides: List[str] = []
    scores: Dict[str, float] = {}
    for side, (ys, xs) in bands.items():
        band_rgb = rgb[ys, xs, :]
        band_luma = luma[ys, xs]
        band_sat = sat[ys, xs]
        band_edges = edges[ys, xs]
        delta = np.linalg.norm(band_rgb - bg.reshape(1, 1, 3), axis=2)
        # Área de baixa informação: não conta textos, cantos coloridos nítidos ou formas decorativas.
        low_info = (band_edges <= 24.0) & ~((band_sat >= 64.0) & (delta >= 24.0)) & ~(band_luma <= 150.0)
        if np.count_nonzero(low_info) < max(64, int(low_info.size * 0.18)):
            score = 0.0
        else:
            score = float(np.mean(delta[low_info]) + np.mean(band_sat[low_info]) * 0.20 + np.std(band_luma[low_info]) * 0.12)
        scores[side] = round(score, 2)
        if score >= 18.0:
            sides.append(side)

    return {"has_issue": bool(sides), "score": max(scores.values()) if scores else 0.0, "sides": sides, "scores": scores}




def _clean_light_edge_haze(image: Image.Image) -> Image.Image:
    """Remove moldura borrada/desconexa em artes claras por reenquadramento mínimo.

    Depois da V9, o problema deixou de ser barra sólida e passou a ser uma névoa
    difusa nas extremidades. A correção mais segura para peças clean é um crop
    técnico pequeno, seguido de resize para o tamanho exato. Isso remove a moldura
    gerada pela IA sem criar blur, sem preencher bordas manualmente e sem tocar nos
    textos ou blocos principais. A função só roda quando o detector já confirmou
    que a peça é majoritariamente clara/minimalista.
    """
    if not _is_clean_light_minimal_design(image):
        return image

    rgba = image.convert("RGBA")
    w, h = rgba.size
    if w < 96 or h < 96:
        return rgba

    # Crop mínimo e assimétrico: remove mais no eixo vertical, onde a IA costuma
    # criar vinheta/névoa, e pouco nas laterais para não amputar elementos decorativos.
    crop_y = max(10, min(46, int(round(h * 0.055))))
    crop_x = max(6, min(28, int(round(w * 0.018))))

    # Protege contra imagens pequenas e contra crops exagerados.
    if (w - crop_x * 2) < int(w * 0.90) or (h - crop_y * 2) < int(h * 0.86):
        crop_x = max(0, int(w * 0.012))
        crop_y = max(0, int(h * 0.040))

    if crop_x <= 0 and crop_y <= 0:
        return rgba

    cropped = rgba.crop((crop_x, crop_y, w - crop_x, h - crop_y))
    return cropped.resize((w, h), Image.Resampling.LANCZOS)


def _clean_light_edge_haze_bytes_if_needed(image_bytes: bytes) -> Tuple[bytes, bool, Dict[str, Any]]:
    initial = _detect_soft_edge_haze_issue(image_bytes)
    if not initial.get("has_issue"):
        return image_bytes, False, initial
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            cleaned = _clean_light_edge_haze(im.convert("RGBA"))
        cleaned_bytes = _encode_png_bytes(cleaned)
        after = _detect_soft_edge_haze_issue(cleaned_bytes)
        return cleaned_bytes, True, {"before": initial, "after": after}
    except Exception:
        return image_bytes, False, initial

def _merge_edge_haze_issue_into_qa(qa: Dict[str, Any], edge_haze: Dict[str, Any]) -> Dict[str, Any]:
    if not edge_haze.get("has_issue"):
        return qa
    merged = dict(qa or {})
    issues = list(merged.get("issues") or [])
    sides = ",".join(str(x) for x in (edge_haze.get("sides") or []))
    issue = f"soft_disconnected_edge_haze:{sides}" if sides else "soft_disconnected_edge_haze"
    if issue not in issues:
        issues.append(issue)
    merged["issues"] = issues
    merged["passed"] = False
    merged["score"] = int(merged.get("score", 0) or 0) + 18
    merged["edge_haze_guard"] = edge_haze
    return merged


def _build_clean_edge_repair_prompt(base_prompt: str, edge_haze: Dict[str, Any], contract: Dict[str, Any]) -> str:
    sides = ", ".join(str(x) for x in (edge_haze.get("sides") or [])) or "bordas externas"
    return f"""
{base_prompt}

PASSO EXTRA DE REPARO DE BORDAS LIMPAS.
A tentativa anterior criou bordas borradas/desconexas em: {sides}.
Refaça a arte mantendo a mesma diagramação, mas corrija a integração das extremidades:
1. As bordas externas precisam parecer parte natural do mesmo design, sem vinheta cinza, névoa colorida, halo borrado, sombra de moldura, faixa lavada ou canto desconexo.
2. Em fundo branco/minimalista, mantenha o canvas limpo, contínuo e nítido. Use o mesmo fundo branco suave da peça, não uma moldura desfocada.
3. Elementos decorativos das bordas podem aparecer, mas precisam ser nítidos e integrados, não uma mancha borrada.
4. Não use blur, fundo borrado, borda espelhada, smear, stretch, colagem ou preenchimento genérico.
5. Preserve textos, cidade, data, CTA, hierarquia, cores e composição.

Contrato de layout:
{_layout_contract_text(contract)}
""".strip()

def _format_slot(slot: Tuple[float, float, float, float]) -> str:
    return f"x {slot[0]:.0f}%–{slot[2]:.0f}%, y {slot[1]:.0f}%–{slot[3]:.0f}%"


def _build_layout_guardrail_contract(
    ai_layout: Optional[Dict[str, Any]],
    target_width: int,
    target_height: int,
    generated_width: int,
    generated_height: int,
) -> Dict[str, Any]:
    """Contrato de layout em porcentagem do ARQUIVO FINAL.

    V5: além do mapa landscape validado na V4, agora existe contrato específico
    para retrato/nove-dezesseis. O erro anterior vinha de usar um contrato genérico
    e um prompt ainda escrito como horizontal; a IA acertava 1376x768, mas no
    768x1376 tentava reaproveitar a lógica horizontal e acabava cortando elementos.
    """
    target_ratio = target_width / max(1.0, float(target_height))
    generated_ratio = generated_width / max(1.0, float(generated_height))
    source_visual_side, source_copy_side = _infer_spatial_sides(ai_layout)
    landscape = target_width >= target_height
    orientation = "landscape" if landscape else "portrait"

    if landscape and source_copy_side == "right":
        slots = {
            "hero_visual": (4.0, 16.0, 58.0, 91.0),
            "support_panels": (6.0, 11.0, 55.0, 56.0),
            "copy_column": (60.0, 10.0, 97.0, 73.0),
            "price": (58.0, 24.0, 96.0, 55.0),
            "footer_logos": (68.0, 76.0, 97.0, 88.0),
            "footer_cta": (68.0, 86.0, 97.0, 94.5),
        }
        hard_rules = [
            "a coluna de texto deve permanecer visualmente ancorada à direita, nunca centralizada no canvas, com o grupo chegando perto da margem direita e sem grande faixa vazia depois dele",
            "preço, data, logos e CTA pertencem à mesma família da coluna direita",
            "CTA deve ficar no rodapé direito do arquivo final, inteiro e legível, sem subir para o meio",
            "elementos decorativos do cenário ficam na esquerda/centro-esquerda e não podem virar cards soltos no topo",
        ]
    elif landscape and source_copy_side == "left":
        slots = {
            "hero_visual": (42.0, 16.0, 96.0, 91.0),
            "support_panels": (45.0, 11.0, 94.0, 56.0),
            "copy_column": (3.0, 10.0, 40.0, 73.0),
            "price": (4.0, 24.0, 42.0, 55.0),
            "footer_logos": (3.0, 76.0, 32.0, 88.0),
            "footer_cta": (3.0, 86.0, 32.0, 94.5),
        }
        hard_rules = [
            "a coluna de texto deve permanecer visualmente ancorada à esquerda, nunca centralizada no canvas, com o grupo chegando perto da margem esquerda e sem grande faixa vazia antes dele",
            "preço, data, logos e CTA pertencem à mesma família da coluna esquerda",
            "CTA deve ficar no rodapé esquerdo do arquivo final, inteiro e legível, sem subir para o meio",
            "elementos decorativos do cenário ficam na direita/centro-direita e não podem virar cards soltos no topo",
        ]
    elif not landscape and source_copy_side == "right":
        slots = {
            # Retrato validado: cena/hero ocupa esquerda + base; copy fica no topo/direita.
            # Nada crítico deve passar de x 92%, porque o canvas intermediário 2:3 será
            # fechado em 768x1376, mais estreito que 1024x1536.
            "hero_visual": (0.0, 15.0, 70.0, 90.0),
            "support_panels": (3.0, 16.0, 58.0, 58.0),
            "copy_column": (43.0, 8.0, 92.0, 66.0),
            "price": (39.0, 34.0, 68.0, 52.0),
            "footer_logos": (61.0, 66.0, 92.0, 76.0),
            "footer_cta": (50.0, 75.0, 92.0, 84.0),
        }
        hard_rules = [
            "a versão vertical deve parecer peça nativa em portrait, não crop da horizontal",
            "a coluna de copy continua ancorada no alto/direita, mas dentro da safe area x 8%–92%",
            "título, descrição, data, logos e CTA não podem encostar na borda direita, porque haverá fechamento lateral para 768x1376",
            "o visual principal e os elementos decorativos existentes ficam preservados e reencaixados sem cortes grosseiros, sem inventar novos objetos",
            "CTA e logos ficam agrupados na área inferior da coluna direita, acima da base visual, não colados na borda inferior",
            "preço deve ficar associado ao bloco de oferta, entre cena e copy, nunca perdido no centro e nunca solto no topo",
            "painéis/dashboard/hologramas permanecem integrados à cena esquerda/centro-esquerda, nunca como ilha no topo",
        ]
    elif not landscape and source_copy_side == "left":
        slots = {
            "hero_visual": (30.0, 15.0, 100.0, 90.0),
            "support_panels": (42.0, 16.0, 97.0, 58.0),
            "copy_column": (8.0, 8.0, 57.0, 66.0),
            "price": (32.0, 34.0, 61.0, 52.0),
            "footer_logos": (8.0, 66.0, 39.0, 76.0),
            "footer_cta": (8.0, 75.0, 50.0, 84.0),
        }
        hard_rules = [
            "a versão vertical deve parecer peça nativa em portrait, não crop da horizontal",
            "a coluna de copy continua ancorada no alto/esquerda, mas dentro da safe area x 8%–92%",
            "título, descrição, data, logos e CTA não podem encostar na borda esquerda",
            "o visual principal fica preservado no lado direito e parte inferior, sem cortes grosseiros",
            "CTA e logos ficam agrupados na área inferior da coluna esquerda, acima da base visual, não colados na borda inferior",
            "painéis/dashboard/hologramas permanecem integrados à cena, nunca como ilha no topo",
        ]
    else:
        # Layout centralizado ou indeterminado. Não força coluna direita/esquerda.
        # Isso corrige peças clean/quadradas com título e CTA centralizados.
        slots = {
            "hero_visual": (4.0, 22.0, 96.0, 92.0) if not landscape else (4.0, 14.0, 96.0, 82.0),
            "support_panels": (3.0, 8.0, 97.0, 96.0) if not landscape else (3.0, 7.0, 97.0, 93.0),
            "copy_column": (6.0, 5.0, 94.0, 68.0) if not landscape else (12.0, 7.0, 88.0, 78.0),
            "price": (16.0, 42.0, 84.0, 70.0) if not landscape else (25.0, 40.0, 75.0, 72.0),
            "footer_logos": (12.0, 64.0, 88.0, 82.0) if not landscape else (25.0, 70.0, 75.0, 86.0),
            "footer_cta": (12.0, 72.0, 88.0, 94.0) if not landscape else (25.0, 76.0, 75.0, 95.0),
        }
        hard_rules = [
            "se a referência for centralizada, mantenha a composição centralizada; não force coluna lateral",
            "CTA, data/local e card de informação devem continuar agrupados e alinhados ao bloco principal",
            "elementos decorativos das bordas devem continuar como decoração de fundo, nítidos e sem invadir o conteúdo",
            "em portrait, mantenha todos os elementos críticos dentro da safe area lateral x 8%–92%",
        ]

    # V7: em troca de resolução, preservar texto não significa manter posição pixel-perfect.
    # O modelo pode fazer microdiagramação para evitar desalinhamento, desde que preserve
    # todos os textos, ordem, hierarquia e elementos obrigatórios.
    text_reflow_rules = [
        "em adaptação de resolução, não tente manter posição pixel-perfect dos textos quando isso gerar corte, desalinhamento ou excesso de espaço vazio; é permitido microajuste de diagramação",
        "microajuste textual permitido: escala levemente menor/maior, nova quebra de linha, espaçamento, entrelinha, alinhamento e reposicionamento dentro do slot correto",
        "microajuste textual proibido: trocar palavras, resumir, reescrever, inventar textos, remover datas, remover locais, remover CTA, apagar logos ou sumir elementos obrigatórios",
        "quando houver muito texto, lista de datas, locais, preços ou blocos repetidos, agrupe tudo como uma família textual coesa, com eixo de alinhamento consistente e ordem preservada",
        "se a referência tiver vários blocos de texto, todos devem continuar legíveis e visualmente alinhados; prefira reencaixar o bloco inteiro a deixar elementos espalhados ou desalinhados",
    ]
    hard_rules = list(hard_rules) + text_reflow_rules

    return {
        "target_ratio": round(target_ratio, 4),
        "generated_ratio": round(generated_ratio, 4),
        "target_orientation": orientation,
        "source_visual_side": source_visual_side,
        "source_copy_side": source_copy_side,
        "required_roles": _required_roles_from_layout(ai_layout),
        "slots": slots,
        "hard_rules": hard_rules,
        "text_reflow_policy": {
            "enabled": True,
            "purpose": "Permitir microdiagramação em mudanças de resolução para encaixar texto sem perda de conteúdo.",
            "allowed": ["scale", "line_breaks", "spacing", "alignment", "position_inside_contract_slot"],
            "forbidden": ["remove_text", "rewrite_text", "change_dates", "change_locations", "remove_cta", "remove_logo", "drop_required_elements"],
        },
    }

def _layout_contract_text(contract: Dict[str, Any]) -> str:
    slots = contract.get("slots") if isinstance(contract, dict) else None
    hard_rules = contract.get("hard_rules") if isinstance(contract, dict) else None
    required_roles = contract.get("required_roles") if isinstance(contract, dict) else None
    if not isinstance(slots, dict):
        return "Contrato rígido indisponível; preserve o mapa espacial original sem centralizar automaticamente."
    parts = [
        "Contrato rígido de layout para o ARQUIVO FINAL, não para a imagem intermediária:",
        f"- mapa original: visual={contract.get('source_visual_side')}, coluna_copy={contract.get('source_copy_side')}",
    ]
    if required_roles:
        parts.append("- elementos obrigatórios a proteger: " + ", ".join(str(x) for x in required_roles))
    ordered = ["hero_visual", "support_panels", "copy_column", "price", "footer_logos", "footer_cta"]
    labels = {
        "hero_visual": "visual principal",
        "support_panels": "elementos de apoio",
        "copy_column": "coluna de texto/oferta",
        "price": "selo/preço",
        "footer_logos": "logos do rodapé",
        "footer_cta": "CTA do rodapé",
    }
    for key in ordered:
        slot = slots.get(key)
        if isinstance(slot, tuple):
            parts.append(f"- {labels.get(key, key)}: {_format_slot(slot)}")
    text_policy = contract.get("text_reflow_policy") if isinstance(contract, dict) else None
    if isinstance(text_policy, dict) and text_policy.get("enabled"):
        allowed = ", ".join(str(x) for x in (text_policy.get("allowed") or []))
        forbidden = ", ".join(str(x) for x in (text_policy.get("forbidden") or []))
        parts.append("Política obrigatória de microdiagramação textual:")
        parts.append(f"- permitido para encaixe: {allowed}")
        parts.append(f"- proibido alterar/remover: {forbidden}")
    if isinstance(hard_rules, list):
        parts.append("Regras duras:")
        parts.extend(f"- {rule}" for rule in hard_rules if rule)
    return "\n".join(parts)


def _final_crop_window_note(
    target_width: int,
    target_height: int,
    generated_width: int,
    generated_height: int,
) -> str:
    target_ratio = target_width / max(1.0, float(target_height))
    source_ratio = generated_width / max(1.0, float(generated_height))
    if abs(math.log(max(1e-6, source_ratio / max(1e-6, target_ratio)))) <= 0.015:
        return "A imagem intermediária tem proporção muito próxima ao alvo. Ainda assim, mantenha margem segura para textos, logos e CTA."
    if source_ratio >= target_ratio:
        crop_w = int(round(generated_height * target_ratio))
        crop_w = max(1, min(generated_width, crop_w))
        extra_w = max(0, generated_width - crop_w)
        center_crop_x = extra_w / 2.0
        visible_left = (center_crop_x / max(1, generated_width)) * 100.0
        visible_right = ((center_crop_x + crop_w) / max(1, generated_width)) * 100.0
        return (
            f"A saída intermediária será {generated_width}x{generated_height} e será fechada em {target_width}x{target_height}. "
            f"Como o alvo é mais estreito, considere a janela útil lateral aproximada entre x {visible_left:.1f}% e {visible_right:.1f}% da imagem intermediária. "
            "Não coloque título, overline, preço, data, logos, CTA, produto, rosto ou objetos principais fora dessa janela. "
            "Além da janela técnica, mantenha todos os elementos críticos com margem interna real: não encoste nada em x 0%, x 100%, y 0% ou y 100%. "
            "Para retrato 768x1376, trabalhe com safe area real x 8%–92%, deixando margem visível nas laterais."
        )
    crop_h = int(round(generated_width / target_ratio))
    crop_h = max(1, min(generated_height, crop_h))
    extra_h = max(0, generated_height - crop_h)
    center_crop_y = extra_h / 2.0
    visible_top = (center_crop_y / max(1, generated_height)) * 100.0
    visible_bottom = ((center_crop_y + crop_h) / max(1, generated_height)) * 100.0
    return (
        f"A saída intermediária será {generated_width}x{generated_height} e será fechada em {target_width}x{target_height}. "
        f"Considere a janela útil central aproximada entre y {visible_top:.1f}% e {visible_bottom:.1f}% da imagem intermediária. "
        "Não coloque nada crítico fora dessa janela. Overline, título, subtítulo, data, preço, logos e CTA precisam nascer dentro dessa área, com respiro. "
        "Em especial: não coloque overline/título no topo absoluto da imagem intermediária, porque o fechamento para o tamanho exato pode cortar. "
        "No ARQUIVO FINAL, o CTA deve continuar no rodapé: posicione-o baixo dentro da janela útil, não no meio da peça e não colado na borda."
    )

def _guardrail_issue_weight(issue: str) -> int:
    # Peso alto: qualquer coisa que normalmente gera arte inutilizável.
    if any(token in issue for token in [
        "missing_cta", "missing_logo", "missing_title", "missing_overline", "missing_subtitle",
        "critical_missing", "copy_not_right", "copy_not_left", "copy_group_not_flush",
        "copy_group_drifted", "cta_too_low", "cta_too_high", "cta_outside", "cta_not_anchored",
        "critical_cut_risk", "critical_touching_edge", "title_cut_risk", "overline_cut_risk",
    ]):
        return 4
    # Peso médio: quebra de hierarquia, posição ou agrupamento que costuma exigir retry.
    if any(token in issue for token in [
        "price", "date", "support_floating_top", "logo_outside", "portrait_safe_area",
        "outside_expected_slot", "group_not_cohesive", "edge_risk", "anchor_drift",
        "copy_group_too_wide", "copy_group_split", "copy_group_too_close",
    ]):
        return 3
    return 1


def _evaluate_layout_guardrails(
    source_ai_layout: Optional[Dict[str, Any]],
    final_ai_layout: Optional[Dict[str, Any]],
    contract: Dict[str, Any],
) -> Dict[str, Any]:
    """Auditoria universal do layout final.

    A versão anterior avaliava poucos papéis fixos e deixou passar um caso real:
    o overline/topo foi cortado e a coluna de copy não ficou suficientemente ancorada.
    Agora o checker olha para qualquer elemento crítico que a análise inicial marcou
    como obrigatório, não para uma campanha específica.
    """
    source_items = _extract_layout_items(source_ai_layout)
    final_items = _extract_layout_items(final_ai_layout)

    detected_roles: Dict[str, List[Tuple[float, float, float, float]]] = {}
    detected_texts_by_role: Dict[str, List[str]] = {}
    issues: List[str] = []
    for item in final_items:
        role = _normalize_role(item.get("role"))
        bbox = item.get("bbox")
        if bbox:
            detected_roles.setdefault(role, []).append(bbox)
        text = str(item.get("visible_text") or "").strip().lower()
        if text:
            detected_texts_by_role.setdefault(role, []).append(text)

    orientation = str(contract.get("target_orientation") or "landscape").lower()
    final_map = _layout_map_from_ai(final_ai_layout)
    source_copy_side = str(contract.get("source_copy_side") or "").lower()
    final_copy_side = str(final_map.get("copy_column_side") or "").lower()
    if source_copy_side == "right" and final_copy_side and final_copy_side not in {"right", "center" if orientation == "portrait" else "right"}:
        issues.append("copy_not_right")
    if source_copy_side == "left" and final_copy_side and final_copy_side not in {"left", "center" if orientation == "portrait" else "left"}:
        issues.append("copy_not_left")

    # 1) Preservação obrigatória universal: tudo que a referência marcou como crítico/alto
    # precisa continuar aparecendo no resultado final. Isso cobre overline, pequenos selos,
    # datas, preço, CTA, logos, produto, rosto, etc.
    for src_item in source_items:
        src_role = _normalize_role(src_item.get("role"))
        if not _is_critical_item(src_item):
            continue
        has_role = any(_role_compatible(src_role, role) and boxes for role, boxes in detected_roles.items())
        source_text = str(src_item.get("visible_text") or "").strip()
        if not has_role and source_text:
            has_role = _has_visible_text_match(source_text, final_items)
        if not has_role:
            issues.append(f"missing_{src_role}")

    slots = contract.get("slots") if isinstance(contract, dict) else None
    slots = slots if isinstance(slots, dict) else {}

    # 2) Safe area e risco de corte: qualquer elemento importante perto demais de borda
    # vira problema, independentemente do tipo de arte.
    for item in final_items:
        bbox = item.get("bbox")
        if not bbox or not _is_critical_item(item):
            continue
        role = _normalize_role(item.get("role"))
        x1, y1, x2, y2 = _bbox_edges_pct(bbox)
        if y1 <= 1.2:
            issues.append(f"{role}_cut_risk_top")
        if y2 >= 98.8:
            issues.append(f"{role}_cut_risk_bottom")
        if x1 <= 0.8:
            issues.append(f"{role}_critical_touching_edge_left")
        if x2 >= 99.2:
            issues.append(f"{role}_critical_touching_edge_right")
        # Margem preventiva: não reprova agressivamente todos os cenários, mas força retry
        # quando algo essencial está muito perto da borda depois do fechamento técnico.
        if role in {"title", "overline", "subtitle", "price", "date", "logo", "seal", "cta"}:
            if y1 < 3.2 or y2 > 96.8:
                issues.append(f"{role}_edge_risk_vertical")
            if x1 < 2.0 or x2 > 98.0:
                issues.append(f"{role}_edge_risk_horizontal")

        slot_key = _role_to_contract_slot(role)
        slot = slots.get(slot_key) if slot_key else None
        if isinstance(slot, tuple):
            intersection = _bbox_intersection_ratio(bbox, slot, pad=7.0)
            # Texto/CTA/logos precisam respeitar o slot. Hero e support têm mais liberdade.
            if role in {"title", "overline", "subtitle", "price", "date", "logo", "seal", "cta"} and intersection < 0.42:
                issues.append(f"{role}_outside_expected_slot")
            elif role in {"hero", "support_panel"} and intersection < 0.20:
                issues.append(f"{role}_outside_expected_slot_soft")

    # 3) Ancoragem da família de copy. Não basta o analyzer dizer "right" ou "left":
    # medimos as caixas finais. Isso evita coluna visualmente centralizada ou com branco
    # sobrando demais no lado em que deveria estar ancorada.
    copy_boxes = _copy_group_boxes(final_items)
    group_edges = _group_edges_pct(copy_boxes)
    if group_edges:
        gx1, gy1, gx2, gy2 = group_edges
        group_center_x = (gx1 + gx2) / 2.0
        group_center_y = (gy1 + gy2) / 2.0
        if source_copy_side == "right":
            if orientation == "landscape":
                if gx2 < 93.0:
                    issues.append("copy_group_not_flush_right")
                if group_center_x < 64.0:
                    issues.append("copy_group_drifted_from_right")
            else:
                if gx2 < 88.0:
                    issues.append("copy_group_not_flush_right_portrait")
                if group_center_x < 50.0:
                    issues.append("copy_group_drifted_from_right_portrait")
        elif source_copy_side == "left":
            if orientation == "landscape":
                if gx1 > 7.0:
                    issues.append("copy_group_not_flush_left")
                if group_center_x > 36.0:
                    issues.append("copy_group_drifted_from_left")
            else:
                if gx1 > 12.0:
                    issues.append("copy_group_not_flush_left_portrait")
                if group_center_x > 50.0:
                    issues.append("copy_group_drifted_from_left_portrait")

        # V7: em peças com muito texto, a IA pode microdiagramar, mas o grupo textual
        # ainda precisa parecer uma coluna/família coesa. Este guard pega o caso comum
        # em que título/subtítulo ficam centralizados e datas/CTA vão para outra coluna.
        if orientation == "landscape" and source_copy_side == "right" and gx1 < 50.0:
            issues.append("copy_group_too_wide_or_split_left")
        if orientation == "landscape" and source_copy_side == "left" and gx2 > 50.0:
            issues.append("copy_group_too_wide_or_split_right")
        if orientation == "landscape" and gy1 < 3.5:
            issues.append("copy_group_too_close_top")
        if orientation == "landscape" and gy2 > 97.0:
            issues.append("copy_group_too_close_bottom")

        # Agrupamento vertical básico: elementos de conversão não podem ficar espalhados
        # demais em qualquer orientação.
        if orientation == "landscape" and (gy2 - gy1) > 92.0:
            issues.append("copy_group_not_cohesive_vertical")
        if orientation == "portrait" and (gy2 - gy1) > 88.0:
            issues.append("copy_group_not_cohesive_vertical_portrait")

    # Guard específico do CTA: em landscape ele deve ficar no rodapé real; em portrait,
    # ele pode ficar na área inferior da coluna, acima do visual de base, mas nunca cortado.
    cta_boxes = detected_roles.get("cta") or []
    if cta_boxes:
        best_cta = max(cta_boxes, key=_bbox_area_pct)
        x1, y1, x2, y2 = _bbox_edges_pct(best_cta)
        if orientation == "portrait":
            if y1 < 63.0:
                issues.append("cta_too_high")
            if y2 > 91.5:
                issues.append("cta_too_low_or_cut_risk")
            if x1 < 6.0 or x2 > 94.0:
                issues.append("cta_outside_portrait_safe_area")
            if source_copy_side == "right" and x1 < 45.0:
                issues.append("cta_not_anchored_right")
            if source_copy_side == "left" and x2 > 55.0:
                issues.append("cta_not_anchored_left")
        else:
            if y1 < 73.0:
                issues.append("cta_too_high")
            if y2 > 97.5:
                issues.append("cta_too_low_or_cut_risk")
            if source_copy_side == "right" and x1 < 55.0:
                issues.append("cta_not_anchored_right")
            if source_copy_side == "left" and x2 > 45.0:
                issues.append("cta_not_anchored_left")

    logo_boxes = detected_roles.get("logo") or detected_roles.get("seal") or []
    if orientation == "portrait" and logo_boxes:
        for box in logo_boxes:
            x1, y1, x2, y2 = _bbox_edges_pct(box)
            if x1 < 5.0 or x2 > 95.0 or y2 > 88.5:
                issues.append("logo_outside_portrait_safe_area")
                break

    # Preço em portrait não pode ir para o topo absoluto nem descolar do bloco de oferta.
    price_boxes = detected_roles.get("price") or []
    if orientation == "portrait" and price_boxes:
        best_price = max(price_boxes, key=_bbox_area_pct)
        x1, y1, x2, y2 = _bbox_edges_pct(best_price)
        if y1 < 18.0 or y2 > 62.0:
            issues.append("price_outside_portrait_offer_zone")
        if x1 < 5.0 or x2 > 95.0:
            issues.append("price_outside_portrait_safe_area")

    support_boxes = detected_roles.get("support_panel") or []
    for box in support_boxes:
        x1, y1, x2, y2 = _bbox_edges_pct(box)
        area = (x2 - x1) * (y2 - y1)
        if y1 < 4.0 and area < 900.0:
            issues.append("support_floating_top")
            break

    deduped_issues: List[str] = []
    for issue in issues:
        if issue not in deduped_issues:
            deduped_issues.append(issue)
    score = sum(_guardrail_issue_weight(issue) for issue in deduped_issues)
    return {
        "passed": score == 0,
        "score": score,
        "issues": deduped_issues,
        "detected_roles": sorted(detected_roles.keys()),
        "required_roles": sorted({_normalize_role(item.get("role")) for item in source_items if _is_critical_item(item)}),
        "final_copy_side": final_copy_side or None,
        "target_orientation": orientation,
        "copy_group_edges": group_edges,
    }

def _build_retry_prompt(base_prompt: str, qa: Dict[str, Any], contract: Dict[str, Any]) -> str:
    issues = qa.get("issues") if isinstance(qa, dict) else []
    issue_text = ", ".join(str(x) for x in issues) if issues else "falha de aderência ao contrato"
    orientation = str(contract.get("target_orientation") or "landscape").lower()
    layout_name = "vertical/portrait" if orientation == "portrait" else "horizontal/landscape"
    portrait_rules = """
Regras extras para portrait:
- Não reaproveite a composição horizontal como crop. Recrie a arte como vertical nativa.
- Todos os elementos críticos devem ficar dentro da safe area x 8%–92%.
- Título, subtítulo, data/local, card de informação, CTA, ícones e elementos visuais existentes não podem ser cortados.
- CTA e logos devem ficar agrupados na área inferior da coluna de oferta, acima da base visual, com margem segura.
- O visual principal pode ocupar esquerda/base, mas não pode engolir ou cortar a copy.
""" if orientation == "portrait" else ""
    return f"""
{base_prompt}

REFAÇA COM CORREÇÃO OBRIGATÓRIA DE LAYOUT PARA FORMATO {layout_name}.
A tentativa anterior falhou nos seguintes pontos técnicos: {issue_text}.

Prioridades absolutas desta nova tentativa:
1. Preserve TODOS os elementos obrigatórios da referência: overline, título, subtítulo, preço, data, logos, selos, CTA, produto, rosto, objeto principal e qualquer texto pequeno marcado como crítico.
2. Se a tentativa anterior manteve textos mas deixou tudo desalinhado, espalhado ou apertado, faça microdiagramação: ajuste escala, quebras, espaçamento, eixo de alinhamento e posição dentro da mesma coluna/família visual.
3. Microdiagramação NÃO autoriza alterar conteúdo: não troque palavras, não reescreva, não resuma, não remova datas, não remova locais, não remova CTA, não remova logos e não apague elementos obrigatórios.
4. Nenhum elemento crítico pode ficar cortado, encostado na borda ou fora da safe area final.
5. Não centralize automaticamente a coluna de conteúdo. Respeite o lado original da copy e deixe a família de copy realmente ancorada nesse lado.
6. Se a copy original fica à direita, o grupo de texto, datas, logos e CTA precisa chegar visualmente perto da margem direita com respiro profissional, sem deixar uma grande faixa vazia depois dele. Se fica à esquerda, aplique a mesma lógica para a esquerda.
7. Não deixe elemento decorativo, painel, gráfico, holograma, selo ou card solto no topo. Tudo deve pertencer à cena ou ao bloco de conversão.
8. CTA e logos devem ficar agrupados, inteiros, legíveis e com margem segura.
9. O CTA não pode subir para o centro da arte e também não pode encostar/cortar na borda inferior.
10. Preço, data e selos devem ficar associados ao bloco de oferta, nunca isolados no meio da imagem.
11. Preserve a sensação de peça nativa no formato solicitado, sem colagem, blur, mirror, smear ou stretch.
{portrait_rules}
Contrato de layout que deve vencer qualquer interpretação criativa:
{_layout_contract_text(contract)}
""".strip()

async def _post_json_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    retries: int = 2,
) -> httpx.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # pragma: no cover
            last_exc = exc
            if attempt >= retries:
                raise
    raise last_exc or RuntimeError("Falha desconhecida na chamada JSON.")


async def _post_multipart_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    data: Dict[str, Any],
    files: List[Tuple[str, Tuple[str, bytes, str]]],
    retries: int = 2,
) -> httpx.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            resp = await client.post(url, headers=headers, data=data, files=files)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # pragma: no cover
            last_exc = exc
            if attempt >= retries:
                raise
    raise last_exc or RuntimeError("Falha desconhecida na chamada multipart.")


async def _analyze_layout_with_openai(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: Optional[str],
    instruction_text: str,
    target_width: Optional[int] = None,
    target_height: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if not openai_key:
        return None

    data_uri = _result_url_from_image_bytes(image_bytes)
    orientation = "portrait" if (target_width and target_height and target_width < target_height) else "landscape"
    system_text = """
Você é um diretor de arte técnico. Analise uma peça publicitária rasterizada e retorne SOMENTE JSON válido.
Formato:
{
  "background": {"style": string, "dominant_colors": [string], "notes": string},
  "composition": {
    "hero_visual": string,
    "text_column": string,
    "offer": string,
    "footer": string,
    "recommended_target_layout": string,
    "recommended_landscape_layout": string
  },
  "layout_map": {
    "visual_side": "left|right|center",
    "copy_column_side": "left|right|center|none",
    "copy_column_bbox_pct": [x_percent, y_percent, width_percent, height_percent],
    "hero_bbox_pct": [x_percent, y_percent, width_percent, height_percent],
    "footer_cta_bbox_pct": [x_percent, y_percent, width_percent, height_percent],
    "spatial_dna": string
  },
  "required_visible_elements": [
    {"role": "title|overline|subtitle|price|date|logo|cta|seal|hero|support_panel|other", "visible_text": string, "visual_description": string, "importance": "critical|high|normal", "source_anchor": "top-left|top-right|center-left|center-right|bottom-left|bottom-right|footer|background", "bbox_pct": [x_percent, y_percent, width_percent, height_percent], "safe_zone_instruction": string}
  ],
  "risk_notes": [string]
}
Regras:
1. Não invente novos textos.
2. Não peça colagem de pedaços.
3. Descreva onde cada bloco deve ficar numa versão unificada para a resolução alvo.
4. Liste obrigatoriamente botões de CTA, logos, selos, datas, preço, overline, título, subtítulo, produto/objeto principal, rostos/pessoas e textos pequenos em required_visible_elements.
5. Se existir botão de chamada como "Confira a Programação", "Saiba mais", "Comprar", "Inscreva-se" ou similar, marque como role "cta" e importance "critical".
6. Identifique o mapa espacial original. Se o texto principal estiver na direita, copy_column_side deve ser "right". Se o visual estiver na esquerda, visual_side deve ser "left".
7. Elementos decorativos, dashboards, gráficos e hologramas devem ser classificados como support_panel/background quando não forem a mensagem principal.
8. Para alvo portrait, preserve a relação espacial original, mas pense como direção de arte vertical nativa. Não recomende crop simples da horizontal.
9. Ao auditar uma imagem final, marque como bbox_pct somente a área realmente visível do elemento. Se um elemento estiver cortado, encostado na borda ou ilegível, mantenha o role correto e descreva o risco em risk_notes.
10. Se a coluna de texto estiver visualmente à direita mas com uma grande faixa vazia depois dela, ainda retorne copy_column_side="right", mas descreva o problema em risk_notes.
11. Em peças com muito texto, datas, locais, listas ou blocos repetidos, trate esses itens como uma família textual única: preserve cada texto, mas indique quando é necessário microajustar escala, quebras, espaçamento e alinhamento para caber na resolução alvo.
12. Na auditoria final, se os textos existem mas ficaram desalinhados, espalhados, em colunas quebradas ou com eixo visual inconsistente, descreva isso em risk_notes e mantenha os bbox reais de cada bloco.
13. Não marque microajuste como erro quando o texto literal foi preservado; marque como erro apenas se houve remoção, reescrita, troca de datas/locais ou desalinhamento visual relevante.
""".strip()
    target_text = f"{target_width}x{target_height} ({orientation})" if target_width and target_height else f"formato {orientation}"
    user_text = (
        f"Analise a imagem para orientar uma recomposição real por IA no alvo {target_text}. "
        "O resultado final precisa parecer uma arte única, não uma montagem de recortes. "
        f"Instrução do usuário: {instruction_text or 'não informada'}."
    )
    payload = {
        "model": OPENAI_LAYOUT_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}},
            ]},
        ],
        "temperature": 0.05,
    }
    headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
    try:
        resp = await _post_json_with_retry(client, "https://api.openai.com/v1/chat/completions", headers, payload, retries=1)
        data = json.loads(resp.json()["choices"][0]["message"]["content"])
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _sanitize_prompt_text_for_edge_integrity(value: Any) -> str:
    """Remove termos da leitura de layout que podem induzir bordas borradas/desconexas."""
    text = str(value or "")
    replacements = {
        "glow/blur": "glow suave integrado",
        "blur/glow": "glow suave integrado",
        "blur": "iluminação suave",
        "borrado": "limpo",
        "borrada": "limpa",
        "borradas": "limpas",
        "borrados": "limpos",
        "desfoque": "transição limpa",
        "desfocado": "limpo",
        "desfocada": "limpa",
        "desconexo": "integrado",
        "desconexa": "integrada",
    }
    out = text
    for old, new in replacements.items():
        out = out.replace(old, new).replace(old.capitalize(), new)
    return out

def _layout_context_text(ai_layout: Optional[Dict[str, Any]]) -> str:
    if not isinstance(ai_layout, dict):
        return "Sem análise auxiliar disponível. Use a imagem de referência como fonte única de verdade."
    parts: List[str] = []
    composition = ai_layout.get("composition")
    if isinstance(composition, dict):
        for key in ["hero_visual", "text_column", "offer", "footer", "recommended_target_layout", "recommended_landscape_layout"]:
            value = composition.get(key)
            if value:
                parts.append(f"{key}: {value}")
    layout_map = ai_layout.get("layout_map")
    if isinstance(layout_map, dict):
        if layout_map.get("spatial_dna"):
            parts.append(f"spatial_dna: {layout_map.get('spatial_dna')}")
        for key in ["visual_side", "copy_column_side", "copy_column_bbox_pct", "hero_bbox_pct", "footer_cta_bbox_pct"]:
            value = layout_map.get(key)
            if value:
                parts.append(f"layout_map.{key}: {value}")

    required = ai_layout.get("required_visible_elements")
    if isinstance(required, list) and required:
        preserved: List[str] = []
        for item in required[:14]:
            if not isinstance(item, dict):
                continue
            if not _is_critical_item(item):
                continue
            role = str(item.get("role") or "elemento")
            visible_text = str(item.get("visible_text") or "").strip()
            visual_description = str(item.get("visual_description") or "").strip()
            importance = str(item.get("importance") or "normal")
            safe_zone = str(item.get("safe_zone_instruction") or "").strip()
            source_anchor = str(item.get("source_anchor") or "").strip()
            bbox_pct = item.get("bbox_pct")
            detail = f"{role} [{importance}]"
            if visible_text:
                detail += f': texto="{visible_text}"'
            if visual_description:
                detail += f"; visual={visual_description}"
            if source_anchor:
                detail += f"; anchor={source_anchor}"
            if isinstance(bbox_pct, list) and len(bbox_pct) == 4:
                detail += f"; bbox_pct={bbox_pct}"
            if safe_zone:
                detail += f"; safe_zone={safe_zone}"
            preserved.append(detail)
        if preserved:
            parts.append("elementos_obrigatorios_visiveis: " + " | ".join(preserved))

    bg = ai_layout.get("background")
    if isinstance(bg, dict):
        if bg.get("style"):
            parts.append(f"background_style: {_sanitize_prompt_text_for_edge_integrity(bg.get('style'))}")
        if bg.get("notes"):
            parts.append(f"background_notes: {_sanitize_prompt_text_for_edge_integrity(bg.get('notes'))}")
    risks = ai_layout.get("risk_notes")
    if isinstance(risks, list) and risks:
        parts.append("riscos: " + "; ".join(str(x) for x in risks[:6]))
    return "\n".join(parts) if parts else "Use a imagem de referência como fonte única de verdade."


def _build_unified_recomposition_prompt(
    *,
    target_width: int,
    target_height: int,
    generated_width: int,
    generated_height: int,
    instruction_text: str,
    layout_context: str,
    layout_contract: Dict[str, Any],
    adaptive_strategy: Optional[Dict[str, Any]] = None,
) -> str:
    safe_area_note = _final_crop_window_note(target_width, target_height, generated_width, generated_height)
    contract_text = _layout_contract_text(layout_contract)
    adaptive_text = _adaptive_strategy_text(adaptive_strategy)
    portrait = target_width < target_height
    formato = "vertical/portrait" if portrait else "horizontal/landscape"

    text_reflow_rules = """
Política obrigatória para textos em alteração de resolução:
1. Preserve o conteúdo literal dos textos existentes. Não reescreva, não resuma, não invente, não altere cidade, data, local, CTA ou título.
2. Você PODE fazer microdiagramação profissional: escala, quebra de linha, espaçamento, alinhamento e reposicionamento mínimo para caber no novo formato.
3. O resultado deve parecer uma peça nativa no novo tamanho, não uma imagem antiga colada dentro de outro canvas.
4. Se houver conflito entre manter posição antiga e evitar corte/desalinhamento, vença a diagramação correta, preservando todos os textos e blocos.
5. Não crie elementos comerciais que não existem na referência: preço, selo, logo, skyline, prédios, rua, objetos, personagens, dashboards ou painéis extras.
""".strip()

    universal_rules = """
Regras universais de recomposição:
1. Use a imagem enviada como referência obrigatória de conteúdo, hierarquia, cores, estilo e distribuição.
2. Preserve a lógica espacial real da referência. Se a peça é centralizada, mantenha centralizada. Se ela tem coluna lateral, preserve o lado correto.
3. Todos os elementos críticos precisam ficar inteiros, legíveis e dentro da safe area: overline/faixa superior, título, subtítulo, card de cidade/local, data, hotel/local, CTA, ícones e elementos decorativos relevantes.
4. Não use blur, mirror, smear, stretch, borda espelhada, fundo borrado, colagem, picture-in-picture, moldura, faixa sólida, emenda vertical ou lateral duplicada.
5. As bordas externas devem parecer continuação natural do próprio design, com elementos nítidos e coerentes.
6. Em artes claras/minimalistas, mantenha fundo branco/clean contínuo, sem névoa cinza, halo colorido, vinheta borrada, sombra de moldura ou laterais lavadas.
7. Elementos decorativos das bordas podem ser reposicionados ou completados, mas não podem ser cortados de forma estranha nem virar ruído borrado.
8. Não adicione novos cenários ou objetos que não aparecem na base. Se não existe skyline/prédio/rua/foto real na referência, não invente isso.
9. Não remova CTA, cidade, data, local, título, subtítulo ou ícones importantes.
10. Antes de finalizar, confira: nada cortado, nada descentralizado sem motivo, nada borrado nas bordas, nenhum texto pela metade, CTA completo e card de local inteiro.
""".strip()

    if portrait:
        direction_rules = """
Direção de arte para PORTRAIT:
1. Crie uma versão vertical nativa da mesma peça, com respiro superior, bloco principal legível e CTA/card inferior preservados.
2. Não transforme a horizontal/quadrada em crop ampliado. Reencaixe os blocos para caber no formato vertical.
3. Se a referência é centralizada, mantenha eixo central, com título, subtítulo, card de cidade/data/local e CTA alinhados de forma coesa.
4. O CTA deve aparecer inteiro e legível, preferencialmente abaixo do card de informação, com margem inferior segura.
5. O fundo deve preencher 100% do canvas sem imagem antiga colada, sem laterais borradas e sem elementos novos inventados.
""".strip()
    else:
        direction_rules = """
Direção de arte para LANDSCAPE:
1. Crie uma versão horizontal nativa da mesma peça, preservando a campanha e a diagramação aprovada.
2. Se a referência é centralizada, mantenha a mensagem centralizada e use as laterais apenas como respiro/decorativo coerente. Não empurre o bloco principal para um lado sem necessidade.
3. Se a referência tem conteúdo lateral, preserve esse mapa; mas não aplique regra lateral a peças centralizadas.
4. O bloco de título, subtítulo, card de cidade/data/local e CTA precisa continuar alinhado e visualmente agrupado.
5. O fundo horizontal precisa parecer redesenhado no mesmo estilo, sem duplicação, blur, emenda vertical, faixa sólida ou moldura.
""".strip()

    return f"""
Use a imagem enviada como referência visual obrigatória e recomponha a peça publicitária como UMA ARTE ÚNICA, finalizada, {formato}, limpa e no tamanho final {target_width}x{target_height}.

Objetivo final: entregar a mesma campanha no tamanho exato {target_width}x{target_height}.
{safe_area_note}

Instrução original do usuário:
{instruction_text or 'Transformar para a nova resolução mantendo o conteúdo original e fazendo apenas o necessário.'}

Leitura técnica do layout original:
{layout_context}

Contrato obrigatório de recomposição:
{contract_text}

{text_reflow_rules}

{adaptive_text}

{universal_rules}

{direction_rules}
""".strip()

async def _edit_openai_unified_layout(
    *,
    client: httpx.AsyncClient,
    image_bytes: bytes,
    openai_key: str,
    prompt: str,
    quality: str,
    generated_size: Tuple[int, int],
) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {openai_key}"}
    generated_width, generated_height = generated_size
    data = {
        "model": OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": f"{generated_width}x{generated_height}",
        "quality": quality if quality in {"low", "medium", "high"} else "high",
        "output_format": "png",
        "input_fidelity": "high",
        "background": "opaque",
    }
    files = [("image[]", ("reference-layout.png", image_bytes, "image/png"))]
    resp = await _post_multipart_with_retry(
        client=client,
        url="https://api.openai.com/v1/images/edits",
        headers=headers,
        data=data,
        files=files,
        retries=2,
    )
    body = resp.json()
    data_items = body.get("data") or []
    if not data_items:
        raise ValueError(f"OpenAI edit sem data: {body}")
    b64_json = data_items[0].get("b64_json")
    if not b64_json:
        raise ValueError(f"OpenAI edit não retornou b64_json: {body}")
    return {"url": _data_uri_from_b64(b64_json, "image/png"), "raw": body}


def _infer_background_meta(ai_layout: Optional[Dict[str, Any]], source_image: Image.Image) -> Dict[str, Any]:
    bg = ai_layout.get("background") if isinstance(ai_layout, dict) else None
    if isinstance(bg, dict):
        return bg
    arr = _flatten_image_rgb(source_image)
    color = _estimate_background_color(arr)
    return {
        "style": "estimado localmente a partir da imagem original",
        "dominant_colors": ["#%02x%02x%02x" % tuple(int(v) for v in color)],
        "notes": "fallback de metadados; a recomposição visual principal usa a imagem de referência.",
    }


async def adapt_image_to_custom_layout(
    *,
    client: httpx.AsyncClient,
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    openai_key: Optional[str],
    openai_quality: str,
    instruction_text: str = "",
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    source_image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    source_width, source_height = source_image.size
    target_width = int(target_width)
    target_height = int(target_height)
    generated_size = _choose_openai_canvas_size(target_width, target_height)

    ai_layout = await _analyze_layout_with_openai(client, image_bytes, openai_key, instruction_text, target_width, target_height) if openai_key else None
    layout_context = _layout_context_text(ai_layout)
    layout_contract = _build_layout_guardrail_contract(
        ai_layout=ai_layout,
        target_width=target_width,
        target_height=target_height,
        generated_width=generated_size[0],
        generated_height=generated_size[1],
    )
    adaptive_strategy = _make_adaptive_strategy_decision(
        ai_layout=ai_layout,
        instruction_text=instruction_text,
        source_width=source_width,
        source_height=source_height,
        target_width=target_width,
        target_height=target_height,
        generated_width=generated_size[0],
        generated_height=generated_size[1],
    )
    layout_contract["adaptive_strategy"] = adaptive_strategy
    final_prompt = _build_unified_recomposition_prompt(
        target_width=target_width,
        target_height=target_height,
        generated_width=generated_size[0],
        generated_height=generated_size[1],
        instruction_text=instruction_text,
        layout_context=layout_context,
        layout_contract=layout_contract,
        adaptive_strategy=adaptive_strategy,
    )

    fallback_applied = False
    warning: Optional[str] = None
    api_calls_used = 1 if ai_layout else 0
    generated_dimensions: Optional[Dict[str, int]] = None
    guardrail_qa: Optional[Dict[str, Any]] = None
    retry_count = 0
    qa_safe_fallback_applied = False
    clean_edge_postprocess: Dict[str, Any] = {"applied": False}

    if not openai_key:
        fallback_applied = True
        warning = "OPENAI_API_KEY ausente. Entreguei fallback conservador de peça única, sem colagem."
        final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
        final_bytes = _encode_png_bytes(final_image)
    else:
        try:
            best_final_bytes: Optional[bytes] = None
            best_generated_dimensions: Optional[Dict[str, int]] = None
            best_qa: Optional[Dict[str, Any]] = None
            max_attempts = max(2, min(3, int(adaptive_strategy.get("max_attempts") or 2)))
            attempts_to_try: List[Tuple[str, bytes]] = [(final_prompt, image_bytes)]

            for attempt_index in range(max_attempts):
                if attempt_index >= len(attempts_to_try):
                    break
                prompt_to_use, input_image_bytes = attempts_to_try[attempt_index]
                ai_result = await _edit_openai_unified_layout(
                    client=client,
                    image_bytes=input_image_bytes,
                    openai_key=openai_key,
                    prompt=prompt_to_use,
                    quality=openai_quality,
                    generated_size=generated_size,
                )
                api_calls_used += 1
                generated_bytes, _ = _image_bytes_from_result_url(ai_result["url"])
                gw, gh = _read_image_dimensions(generated_bytes)
                candidate_dimensions = {"width": gw, "height": gh}
                candidate_final_bytes = _finalize_to_exact_size(generated_bytes, target_width, target_height, layout_contract=layout_contract)

                final_layout = await _analyze_layout_with_openai(
                    client,
                    candidate_final_bytes,
                    openai_key,
                    "Audite a peça final já fechada. Detecte lado da coluna, CTA, logos, preço, data, título, hero visual e elementos de apoio. Considere a orientação alvo.",
                    target_width,
                    target_height,
                )
                api_calls_used += 1
                candidate_qa = _evaluate_layout_guardrails(ai_layout, final_layout, layout_contract)
                edge_haze_guard = _detect_soft_edge_haze_issue(candidate_final_bytes)
                candidate_qa = _merge_edge_haze_issue_into_qa(candidate_qa, edge_haze_guard)

                if best_qa is None or int(candidate_qa.get("score", 999)) < int(best_qa.get("score", 999)):
                    best_final_bytes = candidate_final_bytes
                    best_generated_dimensions = candidate_dimensions
                    best_qa = candidate_qa

                if candidate_qa.get("passed"):
                    break

                if attempt_index < max_attempts - 1:
                    retry_count = attempt_index + 1
                    edge_haze_guard = candidate_qa.get("edge_haze_guard") if isinstance(candidate_qa, dict) else None
                    if isinstance(edge_haze_guard, dict) and edge_haze_guard.get("has_issue"):
                        attempts_to_try.append((_build_clean_edge_repair_prompt(final_prompt, edge_haze_guard, layout_contract), image_bytes))
                    elif attempt_index == 0:
                        attempts_to_try.append((_build_retry_prompt(final_prompt, candidate_qa, layout_contract), image_bytes))
                    elif _qa_has_severe_edge_or_missing_issue(candidate_qa):
                        attempts_to_try.append((_build_safe_area_repair_prompt(final_prompt, candidate_qa, layout_contract, adaptive_strategy), candidate_final_bytes))
                    else:
                        attempts_to_try.append((_build_retry_prompt(final_prompt, candidate_qa, layout_contract), image_bytes))

            if best_final_bytes is None:
                raise ValueError("Nenhuma tentativa de recomposição retornou bytes finais.")
            final_bytes = best_final_bytes
            generated_dimensions = best_generated_dimensions
            guardrail_qa = best_qa
            if (
                False
                and guardrail_qa
                and _qa_has_severe_edge_or_missing_issue(guardrail_qa)
                and adaptive_strategy.get("qa_failover_to_safe_contain")
                and int(guardrail_qa.get("score", 0) or 0) >= 32
            ):
                # Segurança final: se todas as tentativas ainda ameaçarem cortar CTA/títulos/textos,
                # é melhor entregar a peça original inteira em canvas adaptado do que uma arte bonita
                # porém comercialmente quebrada. Esse fallback só entra em score muito alto.
                qa_safe_fallback_applied = True
                fallback_applied = True
                warning = (
                    "A IA escolheu fallback conservador porque as tentativas de recomposição ainda indicavam risco alto de corte/perda de elementos: "
                    + ", ".join(str(x) for x in guardrail_qa.get("issues") or [])
                )
                final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
                final_bytes = _encode_png_bytes(final_image)
            elif guardrail_qa and not guardrail_qa.get("passed"):
                warning = (
                    "Recomposição entregue com o melhor candidato disponível, mas a auditoria automática ainda encontrou pontos de atenção: "
                    + ", ".join(str(x) for x in guardrail_qa.get("issues") or [])
                )
        except Exception as exc:
            fallback_applied = True
            warning = f"Falha na recomposição real por IA ({type(exc).__name__}: {str(exc)[:240]}). Entreguei fallback conservador de peça única, sem colagem."
            final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
            final_bytes = _encode_png_bytes(final_image)

    # V11: não faz crop/zoom técnico nas bordas depois da IA. Esse pós-processamento
    # tentou resolver haze no V10, mas em peças clean acabou ampliando, cortando e
    # piorando a diagramação. Agora apenas registra o detector; a correção acontece
    # por prompt/retry e pela remoção dos fallbacks com blur.
    clean_edge_report = _detect_soft_edge_haze_issue(final_bytes)
    clean_edge_postprocess = {
        "applied": False,
        "report": {"detected": clean_edge_report, "reason": "v11_no_destructive_edge_crop"},
    }
    if isinstance(guardrail_qa, dict):
        guardrail_qa = dict(guardrail_qa)
        guardrail_qa["clean_edge_postprocess"] = clean_edge_postprocess

    engine_id = "openai_adaptive_layout_recomposition_v11"
    motor = "Recomposição adaptativa por IA V11"
    if fallback_applied:
        engine_id = "safe_single_piece_fallback_v11"
        motor = "Fallback seguro de peça única V11"

    return {
        "engine_id": engine_id,
        "motor": motor,
        "url": _result_url_from_image_bytes(final_bytes, "image/png"),
        "warning": warning,
        "exact_canvas_expand": None,
        "layout_recomposition": {
            "request_id": request_id,
            "algorithm_version": "v11_stable_native_recomposition_no_blur_no_false_fallback",
            "diagnostics": {
                "source_size": {"width": source_width, "height": source_height},
                "target_size": {"width": target_width, "height": target_height},
                "openai_generation_size": {"width": generated_size[0], "height": generated_size[1]},
                "generated_dimensions": generated_dimensions,
                "used_ai_layout_analysis": bool(ai_layout),
                "used_ai_generation": bool(openai_key and not fallback_applied),
                "api_calls_used": api_calls_used,
                "retry_count": retry_count,
                "fallback_applied": fallback_applied,
                "qa_safe_fallback_applied": qa_safe_fallback_applied,
                "guardrail_qa": guardrail_qa,
                "adaptive_strategy": adaptive_strategy,
                "layout_contract": layout_contract,
                "background": _infer_background_meta(ai_layout, source_image),
                "quality": openai_quality,
                "no_blur_mirror_smear_stretch_policy": True,
                "no_local_collage_policy": True,
                "no_solid_letterbox_policy": True,
                "solid_border_guard": "detect_and_repair_before_delivery",
                "clean_edge_haze_guard": "detect_and_retry_without_destructive_crop",
                "clean_edge_postprocess": clean_edge_postprocess,
                "strategy": adaptive_strategy.get("strategy_id") if not fallback_applied else "emergency_safe_fallback",
            },
            "plan": {
                "layout_kind": "unified_ai_landscape_recomposition" if target_width >= target_height else "unified_ai_portrait_recomposition",
                "source_size": {"width": source_width, "height": source_height},
                "target_size": {"width": target_width, "height": target_height},
                "generated_size": {"width": generated_size[0], "height": generated_size[1]},
                "finalization": "adaptive_full_bleed_safe_area_finalize_v11_native" if not fallback_applied else "emergency_fallback_only",
                "prompt": final_prompt,
            },
        },
    }
