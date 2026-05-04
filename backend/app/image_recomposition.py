from __future__ import annotations

import base64
import io
import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
from PIL import Image, ImageFilter, ImageOps

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
            return _encode_png_bytes(final)

        copy_side = "center"
        if isinstance(layout_contract, dict):
            copy_side = str(layout_contract.get("source_copy_side") or "center")

        if source_ratio < target_ratio:
            # Saída mais vertical que o alvo: precisa cortar altura, não criar bordas.
            crop_h = int(round(src.width / target_ratio))
            crop_h = max(1, min(src.height, crop_h))
            crop_y = _choose_full_bleed_crop_y(src, crop_h)
            cropped = src.crop((0, crop_y, src.width, crop_y + crop_h))
        else:
            # Saída mais horizontal que o alvo: precisa cortar largura.
            crop_w = int(round(src.height * target_ratio))
            crop_w = max(1, min(src.width, crop_w))
            crop_x = _choose_full_bleed_crop_x(src, crop_w, copy_side=copy_side)
            cropped = src.crop((crop_x, 0, crop_x + crop_w, src.height))

        final = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
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


def _make_soft_gradient_background(source_image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
    """Fallback não destrutivo, sem blur, mirror, smear ou stretch."""
    target_width, target_height = target_size
    arr = _flatten_image_rgb(source_image)
    h, w = arr.shape[:2]
    band_x = max(2, int(w * 0.035))
    band_y = max(2, int(h * 0.035))
    left = np.median(arr[:, :band_x, :].reshape(-1, 3), axis=0)
    right = np.median(arr[:, -band_x:, :].reshape(-1, 3), axis=0)
    top = np.median(arr[:band_y, :, :].reshape(-1, 3), axis=0)
    bottom = np.median(arr[-band_y:, :, :].reshape(-1, 3), axis=0)
    yy = np.linspace(0, 1, target_height)[:, None, None]
    xx = np.linspace(0, 1, target_width)[None, :, None]
    horizontal = left[None, None, :] * (1 - xx) + right[None, None, :] * xx
    vertical = top[None, None, :] * (1 - yy) + bottom[None, None, :] * yy
    gradient = (horizontal * 0.55 + vertical * 0.45).astype(np.uint8)
    return Image.fromarray(gradient, mode="RGB").convert("RGBA")


def _build_safe_single_piece_fallback(source_image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
    """Fallback final que nunca monta colagem de pedaços.

    Ele usa uma única cópia preservada da peça inteira, sobre fundo discreto.
    Melhor entregar uma peça conservadora do que uma colagem quebrada.
    """
    target_width, target_height = target_size
    canvas = _make_soft_gradient_background(source_image, target_size)
    layer = source_image.convert("RGBA")
    layer.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    x = max(0, (target_width - layer.width) // 2)
    y = max(0, (target_height - layer.height) // 2)
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
        role = _normalize_role(item.get("role"))
        importance = str(item.get("importance") or "normal").lower()
        text = str(item.get("visible_text") or "").lower()
        if role in {"cta", "logo", "price", "date", "title", "overline"} or importance in {"critical", "high"}:
            if "program" in text or "confira" in text or "saiba" in text or "inscre" in text:
                role = "cta"
            if role not in roles:
                roles.append(role)
    return roles


def _layout_map_from_ai(ai_layout: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(ai_layout, dict):
        return {}
    layout_map = ai_layout.get("layout_map")
    return layout_map if isinstance(layout_map, dict) else {}


def _infer_spatial_sides(ai_layout: Optional[Dict[str, Any]]) -> Tuple[str, str]:
    if not isinstance(ai_layout, dict):
        return "center", "none"
    layout_map = _layout_map_from_ai(ai_layout)
    visual_side = str(layout_map.get("visual_side") or "left").strip().lower()
    copy_side = str(layout_map.get("copy_column_side") or "right").strip().lower()
    if visual_side not in {"left", "right", "center"}:
        visual_side = "left"
    if copy_side not in {"left", "right", "center", "none"}:
        copy_side = "right"
    return visual_side, copy_side


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
            "copy_column": (58.0, 7.0, 95.0, 72.0),
            "price": (52.0, 23.0, 72.0, 47.0),
            "footer_logos": (68.0, 76.0, 96.0, 88.0),
            "footer_cta": (66.0, 87.0, 96.0, 95.0),
        }
        hard_rules = [
            "a coluna de texto deve permanecer visualmente ancorada à direita, nunca centralizada no canvas",
            "preço, data, logos e CTA pertencem à mesma família da coluna direita",
            "CTA deve ficar no rodapé direito do arquivo final, inteiro e legível, sem subir para o meio",
            "elementos decorativos do cenário ficam na esquerda/centro-esquerda e não podem virar cards soltos no topo",
        ]
    elif landscape and source_copy_side == "left":
        slots = {
            "hero_visual": (42.0, 16.0, 96.0, 91.0),
            "support_panels": (45.0, 11.0, 94.0, 56.0),
            "copy_column": (5.0, 7.0, 42.0, 72.0),
            "price": (28.0, 23.0, 48.0, 47.0),
            "footer_logos": (4.0, 76.0, 32.0, 88.0),
            "footer_cta": (4.0, 87.0, 34.0, 95.0),
        }
        hard_rules = [
            "a coluna de texto deve permanecer visualmente ancorada à esquerda, nunca centralizada no canvas",
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
            "bicicleta, patinete, prédios, rua e elementos digitais ficam preservados no lado esquerdo e parte inferior, sem cortes grosseiros",
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
        slots = {
            "hero_visual": (6.0, 30.0, 94.0, 90.0) if not landscape else (8.0, 18.0, 92.0, 78.0),
            "support_panels": (8.0, 18.0, 92.0, 58.0) if not landscape else (10.0, 12.0, 90.0, 48.0),
            "copy_column": (8.0, 7.0, 92.0, 55.0) if not landscape else (10.0, 8.0, 90.0, 72.0),
            "price": (55.0, 30.0, 88.0, 48.0) if not landscape else (58.0, 22.0, 88.0, 45.0),
            "footer_logos": (48.0, 66.0, 92.0, 76.0) if not landscape else (52.0, 77.0, 92.0, 88.0),
            "footer_cta": (46.0, 75.0, 92.0, 84.0) if not landscape else (50.0, 87.0, 92.0, 95.0),
        }
        hard_rules = [
            "preserve a lógica espacial dominante detectada na referência, sem centralização automática",
            "CTA e logos precisam ficar agrupados na parte inferior do arquivo final",
            "elementos decorativos nunca devem ficar isolados no topo",
            "em portrait, mantenha todos os elementos críticos dentro da safe area lateral x 8%–92%",
        ]

    return {
        "target_ratio": round(target_ratio, 4),
        "generated_ratio": round(generated_ratio, 4),
        "target_orientation": orientation,
        "source_visual_side": source_visual_side,
        "source_copy_side": source_copy_side,
        "required_roles": _required_roles_from_layout(ai_layout),
        "slots": slots,
        "hard_rules": hard_rules,
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
            "Não coloque título, preço, data, logos, CTA, bicicleta, patinete ou rostos/objetos principais fora dessa janela. "
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
        "Não coloque nada crítico fora dessa janela. Porém, no ARQUIVO FINAL, o CTA deve continuar no rodapé: "
        "posicione-o baixo dentro da janela útil, não no meio da peça."
    )

def _guardrail_issue_weight(issue: str) -> int:
    if any(token in issue for token in ["missing_cta", "missing_logo", "copy_not_right", "copy_not_left", "cta_too_low", "cta_too_high", "cta_outside", "cta_not_anchored"]):
        return 4
    if any(token in issue for token in ["price", "date", "title", "support_floating_top", "logo_outside", "portrait_safe_area"]):
        return 3
    return 1


def _evaluate_layout_guardrails(
    source_ai_layout: Optional[Dict[str, Any]],
    final_ai_layout: Optional[Dict[str, Any]],
    contract: Dict[str, Any],
) -> Dict[str, Any]:
    required_source_roles = set(_required_roles_from_layout(source_ai_layout))
    detected_roles: Dict[str, List[Tuple[float, float, float, float]]] = {}
    issues: List[str] = []
    if isinstance(final_ai_layout, dict):
        required = final_ai_layout.get("required_visible_elements")
        if isinstance(required, list):
            for item in required:
                if not isinstance(item, dict):
                    continue
                role = _normalize_role(item.get("role"))
                visible_text = str(item.get("visible_text") or "").lower()
                if "program" in visible_text or "confira" in visible_text or "saiba" in visible_text or "inscre" in visible_text:
                    role = "cta"
                bbox = _as_pct_bbox(item.get("bbox_pct"))
                if bbox:
                    detected_roles.setdefault(role, []).append(bbox)

    orientation = str(contract.get("target_orientation") or "landscape").lower()
    final_map = _layout_map_from_ai(final_ai_layout)
    source_copy_side = str(contract.get("source_copy_side") or "").lower()
    final_copy_side = str(final_map.get("copy_column_side") or "").lower()
    if source_copy_side == "right" and final_copy_side and final_copy_side not in {"right", "center" if orientation == "portrait" else "right"}:
        issues.append("copy_not_right")
    if source_copy_side == "left" and final_copy_side and final_copy_side not in {"left", "center" if orientation == "portrait" else "left"}:
        issues.append("copy_not_left")

    for role in sorted(required_source_roles):
        if role in {"cta", "logo", "price", "date", "title"} and not detected_roles.get(role):
            issues.append(f"missing_{role}")

    # Guard específico do CTA: em landscape ele deve ficar no rodapé real; em portrait,
    # ele pode ficar na área inferior da coluna, acima do visual de base, mas nunca cortado.
    cta_boxes = detected_roles.get("cta") or []
    if cta_boxes:
        best_cta = max(cta_boxes, key=lambda b: b[2] * b[3])
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

    logo_boxes = detected_roles.get("logo") or []
    if orientation == "portrait" and logo_boxes:
        for box in logo_boxes:
            x1, y1, x2, y2 = _bbox_edges_pct(box)
            if x1 < 5.0 or x2 > 95.0 or y2 > 88.5:
                issues.append("logo_outside_portrait_safe_area")
                break

    # Preço em portrait não pode ir para o topo absoluto nem descolar do bloco de oferta.
    price_boxes = detected_roles.get("price") or []
    if orientation == "portrait" and price_boxes:
        best_price = max(price_boxes, key=lambda b: b[2] * b[3])
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

    score = sum(_guardrail_issue_weight(issue) for issue in issues)
    return {
        "passed": score == 0,
        "score": score,
        "issues": issues,
        "detected_roles": sorted(detected_roles.keys()),
        "final_copy_side": final_copy_side or None,
        "target_orientation": orientation,
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
- Bicicleta, patinete, prédios, rua, título, preço, data, logos e CTA não podem ser cortados.
- CTA e logos devem ficar agrupados na área inferior da coluna de oferta, acima da base visual, com margem segura.
- O visual principal pode ocupar esquerda/base, mas não pode engolir ou cortar a copy.
""" if orientation == "portrait" else ""
    return f"""
{base_prompt}

REFAÇA COM CORREÇÃO OBRIGATÓRIA DE LAYOUT PARA FORMATO {layout_name}.
A tentativa anterior falhou nos seguintes pontos técnicos: {issue_text}.

Prioridades absolutas desta nova tentativa:
1. Não centralize a coluna de conteúdo. Respeite o lado original da copy.
2. Não deixe nenhum elemento decorativo/painel/holograma solto no topo.
3. CTA e logos devem ficar agrupados, inteiros, legíveis e com margem segura.
4. O CTA não pode subir para o centro da arte e também não pode encostar/cortar na borda inferior.
5. O preço deve ficar associado ao título/oferta, nunca isolado no meio da imagem.
6. Preserve a sensação de peça nativa no formato solicitado, sem colagem, blur, mirror, smear ou stretch.
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
4. Liste obrigatoriamente botões de CTA, logos, selos, datas, preço, overline e textos pequenos em required_visible_elements.
5. Se existir botão de chamada como "Confira a Programação", "Saiba mais", "Comprar", "Inscreva-se" ou similar, marque como role "cta" e importance "critical".
6. Identifique o mapa espacial original. Se o texto principal estiver na direita, copy_column_side deve ser "right". Se o visual estiver na esquerda, visual_side deve ser "left".
7. Elementos decorativos, dashboards, gráficos e hologramas devem ser classificados como support_panel/background quando não forem a mensagem principal.
8. Para alvo portrait, preserve a relação espacial original, mas pense como direção de arte vertical nativa. Não recomende crop simples da horizontal.
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
            parts.append(f"background_style: {bg.get('style')}")
        if bg.get("notes"):
            parts.append(f"background_notes: {bg.get('notes')}")
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
) -> str:
    safe_area_note = _final_crop_window_note(target_width, target_height, generated_width, generated_height)
    contract_text = _layout_contract_text(layout_contract)
    portrait = target_width < target_height
    formato = "vertical/portrait" if portrait else "horizontal/landscape"
    resultado = "peça publicitária vertical full-bleed" if portrait else "peça publicitária horizontal full-bleed"

    if portrait:
        direction_rules = """
Direção de arte obrigatória para PORTRAIT:
1. Recrie a composição em layout vertical nativo, preservando o MAPA ESPACIAL da peça original. Não faça apenas crop da arte quadrada ou da arte horizontal.
2. Se a referência tiver visual principal à esquerda e coluna de copy à direita, preserve essa lógica em portrait: cena/prédios/objetos ancorados na esquerda e na base; copy como bloco alto/direito com leitura clara.
3. A coluna de texto/oferta deve ficar no alto/direita ou centro-direita, dentro da safe area x 8%–92%. Nada crítico pode encostar nas bordas laterais.
4. O título, subtítulo, preço, data, logos e CTA precisam formar uma família visual. Não espalhe os elementos.
5. O selo de preço deve ficar associado à oferta, entre o bloco visual e a copy, ou próximo do título/descrição. Nunca deixe o preço perdido no centro, cortado ou como elemento solto.
6. Logos e CTA devem permanecer agrupados na parte inferior da coluna de oferta, acima da base visual. Em portrait eles NÃO precisam ficar colados no rodapé extremo, mas precisam parecer parte do bloco de conversão.
7. O CTA, especialmente se for "Confira a Programação", deve aparecer inteiro, legível, com texto completo e margem segura.
8. Bicicleta, patinete, prédios, rua, vegetação, gráficos, hologramas e trilhas de luz devem ser preservados e reencaixados como uma cena única. Bicicleta e patinete não podem ser cortados de forma grosseira.
9. Em 768x1376, deixe respiro vertical: céu e topo limpos, conteúdo com hierarquia, base visual bem aterrada e sem elementos empilhados de forma apertada.
10. Elementos decorativos como dashboards, painéis, hologramas e linhas luminosas são de APOIO. Eles devem ficar integrados ao fundo/visual principal, nunca colados na borda superior, nunca isolados como um card solto e nunca mais importantes que a mensagem principal.
11. O fundo precisa preencher 100% do canvas com cena real da própria arte, com iluminação, perspectiva, textura e profundidade consistentes.
12. Não crie miniaturas, picture-in-picture, mosaico, colagem de prints, caixas sobrepostas ou pedaços duplicados da imagem original.
13. Não deixe áreas chapadas cinza/verde, faixas laterais, margens externas, blocos retangulares visíveis, emendas duras ou fragmentos desalinhados.
14. Não use blur, mirror, smear, stretch, borda espelhada, fundo borrado ou preenchimento lateral genérico.
15. Preserve o máximo possível dos textos, marcas, cores e identidade original. Não invente branding e não troque a campanha.
16. Antes de finalizar mentalmente, faça um checklist visual: overline, título, subtítulo, preço, data, logos/selo, CTA, bicicleta/patinete e visual principal aparecem inteiros, sem cortes, agrupados corretamente e com a coluna de texto ancorada.
17. Resultado esperado: uma peça publicitária vertical full-bleed pronta para uso, parecida com uma versão profissionalmente reeditada no Canva/Photoshop para stories/reels/poster vertical, não uma montagem automática.
""".strip()
    else:
        direction_rules = """
Direção de arte obrigatória para LANDSCAPE:
1. Recrie a composição em layout horizontal unificado, mas preserve o MAPA ESPACIAL da peça original.
2. Se a referência já tiver visual principal à esquerda e coluna de copy à direita, mantenha essa lógica. Não transforme a coluna de texto em uma ilha central.
3. Para peças quadradas com texto no lado direito, a versão horizontal deve ter uma coluna direita clara, agrupada e estável: overline/título, descrição, data, logos e CTA precisam formar um mesmo bloco visual.
4. A coluna de texto/oferta deve permanecer no lado direito do canvas, aproximadamente no terço direito ou entre 58% e 94% da largura, com alinhamento parecido ao original.
5. O bloco visual principal deve permanecer à esquerda ou centro-esquerda, integrado à cena, com prédios, rua, bicicleta, patinete e elementos digitais harmonizados como uma única imagem.
6. Ao transformar de quadrado para horizontal, expanda/reconstrua o ambiente para o lado livre da composição, especialmente rua/céu/vegetação, sem centralizar tudo e sem afastar a coluna de texto da direita.
7. O selo de preço deve continuar associado ao bloco textual/oferta, não isolado no centro e não distante demais da copy.
8. Logos e CTA devem permanecer na mesma família visual, no rodapé direito ou parte inferior da coluna direita. Não separe logos do CTA.
9. Se a referência tiver botão CTA no rodapé, ele é elemento CRÍTICO. Ele deve aparecer inteiro, legível e com texto completo no resultado final. Não basta preservar apenas os logos.
10. Se o CTA visível for semelhante a "Confira a Programação", preserve o botão completo no canto inferior direito, abaixo dos logos, com margem segura e visualmente próximo do rodapé como na referência.
11. Encontre o meio-termo vertical: não deixe o CTA cortado, mas também não empurre título, texto, preço e cena principal para o topo. Mantenha respiro superior e inferior equilibrado.
12. Elementos decorativos como gráficos flutuantes, dashboards, painéis, hologramas e linhas luminosas são de APOIO. Eles devem ficar integrados ao fundo/visual principal, nunca colados na borda superior, nunca isolados como um card solto e nunca mais importantes que a mensagem principal.
13. Não mova um painel, dashboard ou gráfico para o topo extremo. Se houver dashboard na referência, mantenha-o dentro da cena, em escala secundária, com margem interna e sem corte.
14. O fundo precisa preencher 100% do canvas com cena real da própria arte, com iluminação, perspectiva, textura e profundidade consistentes.
15. Não crie miniaturas, picture-in-picture, mosaico, colagem de prints, caixas sobrepostas ou pedaços duplicados da imagem original.
16. Não deixe áreas chapadas cinza/verde, faixas laterais, margens externas, blocos retangulares visíveis, emendas duras ou fragmentos desalinhados.
17. Não use blur, mirror, smear, stretch, borda espelhada, fundo borrado ou preenchimento lateral genérico.
18. Preserve o máximo possível dos textos, marcas, cores e identidade original. Não invente branding e não troque a campanha.
19. Antes de finalizar mentalmente, faça um checklist visual: overline, título, subtítulo, preço, data, logos/selo e CTA aparecem inteiros, sem cortes, agrupados corretamente e com a coluna de texto ancorada à direita.
20. Resultado esperado: uma peça publicitária horizontal full-bleed pronta para uso, parecida com uma versão profissionalmente reeditada no Canva/Photoshop, não uma montagem automática.
""".strip()

    return f"""
Use a imagem enviada como referência visual obrigatória e recomponha a peça publicitária como UMA ARTE ÚNICA, finalizada, {formato} e limpa.

Objetivo final: entregar a mesma campanha no tamanho exato {target_width}x{target_height}.
{safe_area_note}

Instrução original do usuário:
{instruction_text or 'Transformar para a nova resolução mantendo o conteúdo original e fazendo apenas o necessário.'}

Leitura técnica do layout original:
{layout_context}

Contrato obrigatório de recomposição:
{contract_text}

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
    final_prompt = _build_unified_recomposition_prompt(
        target_width=target_width,
        target_height=target_height,
        generated_width=generated_size[0],
        generated_height=generated_size[1],
        instruction_text=instruction_text,
        layout_context=layout_context,
        layout_contract=layout_contract,
    )

    fallback_applied = False
    warning: Optional[str] = None
    api_calls_used = 1 if ai_layout else 0
    generated_dimensions: Optional[Dict[str, int]] = None
    guardrail_qa: Optional[Dict[str, Any]] = None
    retry_count = 0

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
            prompts_to_try = [final_prompt]

            for attempt_index in range(2):
                prompt_to_use = prompts_to_try[attempt_index]
                ai_result = await _edit_openai_unified_layout(
                    client=client,
                    image_bytes=image_bytes,
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

                if best_qa is None or int(candidate_qa.get("score", 999)) < int(best_qa.get("score", 999)):
                    best_final_bytes = candidate_final_bytes
                    best_generated_dimensions = candidate_dimensions
                    best_qa = candidate_qa

                if candidate_qa.get("passed"):
                    break

                if attempt_index == 0:
                    retry_count = 1
                    prompts_to_try.append(_build_retry_prompt(final_prompt, candidate_qa, layout_contract))

            if best_final_bytes is None:
                raise ValueError("Nenhuma tentativa de recomposição retornou bytes finais.")
            final_bytes = best_final_bytes
            generated_dimensions = best_generated_dimensions
            guardrail_qa = best_qa
            if guardrail_qa and not guardrail_qa.get("passed"):
                warning = (
                    "Recomposição entregue com o melhor candidato disponível, mas a auditoria automática ainda encontrou pontos de atenção: "
                    + ", ".join(str(x) for x in guardrail_qa.get("issues") or [])
                )
        except Exception as exc:
            fallback_applied = True
            warning = f"Falha na recomposição real por IA ({type(exc).__name__}: {str(exc)[:240]}). Entreguei fallback conservador de peça única, sem colagem."
            final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
            final_bytes = _encode_png_bytes(final_image)

    return {
        "engine_id": "openai_unified_layout_recomposition_v5" if not fallback_applied else "safe_single_piece_fallback_v5",
        "motor": "Recomposição real por IA V5" if not fallback_applied else "Fallback seguro de peça única V5",
        "url": _result_url_from_image_bytes(final_bytes, "image/png"),
        "warning": warning,
        "exact_canvas_expand": None,
        "layout_recomposition": {
            "request_id": request_id,
            "algorithm_version": "v5_orientation_aware_layout_contract_guardrails_with_auto_qa",
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
                "guardrail_qa": guardrail_qa,
                "layout_contract": layout_contract,
                "background": _infer_background_meta(ai_layout, source_image),
                "quality": openai_quality,
                "no_blur_mirror_smear_stretch_policy": True,
                "no_local_collage_policy": True,
                "strategy": "openai_unified_full_design_edit_then_contract_qa_and_exact_finalize" if not fallback_applied else "safe_single_piece_no_collage_fallback",
            },
            "plan": {
                "layout_kind": "unified_ai_landscape_recomposition" if target_width >= target_height else "unified_ai_portrait_recomposition",
                "source_size": {"width": source_width, "height": source_height},
                "target_size": {"width": target_width, "height": target_height},
                "generated_size": {"width": generated_size[0], "height": generated_size[1]},
                "finalization": "full_bleed_orientation_aware_crop_with_footer_guard_v5" if not fallback_applied else "single_piece_contain_on_clean_background",
                "prompt": final_prompt,
            },
        },
    }
