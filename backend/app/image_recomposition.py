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

    # V3.5: o guard do CTA não pode exagerar e empurrar a arte inteira para cima.
    # Na V3.4, quando o rodapé tinha saliência, o bias ia para 0.70 e preservava o
    # CTA, mas cortava céu/topo e deixava o layout alto demais. Aqui usamos uma
    # âncora intermediária: protege rodapé sem abandonar o enquadramento central.
    if bottom_mean > top_mean * 1.04:
        center_bias = 0.60
    elif top_mean > bottom_mean * 1.18:
        center_bias = 0.42

    preferred_y = extra_h * center_bias
    best_y = int(round(preferred_y))
    best_score = -1e18

    for y in range(0, extra_h + 1, step):
        inside = cumulative[y + crop_h] - cumulative[y]
        top_out = cumulative[y]
        bottom_out = cumulative[-1] - cumulative[y + crop_h]
        # Rodapé ainda é protegido, mas com peso moderado para não gerar
        # composição alta demais. O resultado deve ficar no meio-termo.
        distance_penalty = abs(y - preferred_y) * 0.004
        score = inside - top_out * 0.46 - bottom_out * 0.86 - distance_penalty
        if score > best_score:
            best_score = score
            best_y = y

    return int(max(0, min(extra_h, best_y)))


def _choose_full_bleed_crop_x(src: Image.Image, crop_w: int) -> int:
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
    preferred_x = extra_w * 0.5
    best_x = int(round(preferred_x))
    best_score = -1e18

    for x in range(0, extra_w + 1, step):
        inside = cumulative[x + crop_w] - cumulative[x]
        outside = cumulative[-1] - inside
        score = inside - outside * 0.42 - abs(x - preferred_x) * 0.004
        if score > best_score:
            best_score = score
            best_x = x

    return int(max(0, min(extra_w, best_x)))


def _finalize_to_exact_size(image_bytes: bytes, target_width: int, target_height: int) -> bytes:
    """Fecha a saída no tamanho exato em full-bleed, sem bordas laterais.

    A versão anterior, ao detectar risco de corte em topo/rodapé, preservava a peça
    inteira em modo contain sobre um fundo gerado. Isso evitava o corte, mas criava
    bordas verdes/cinzas nas laterais. Agora o fechamento nunca usa letterbox:
    ele sempre preenche 100% do canvas final e escolhe o crop com saliência visual.
    """
    with Image.open(io.BytesIO(image_bytes)) as im:
        src = im.convert("RGBA")
        target_ratio = target_width / max(1.0, float(target_height))
        source_ratio = src.width / max(1.0, float(src.height))

        if abs(math.log(max(1e-6, source_ratio / max(1e-6, target_ratio)))) <= 0.015:
            final = src.resize((target_width, target_height), Image.Resampling.LANCZOS)
            return _encode_png_bytes(final)

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
            crop_x = _choose_full_bleed_crop_x(src, crop_w)
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
) -> Optional[Dict[str, Any]]:
    if not openai_key:
        return None

    data_uri = _result_url_from_image_bytes(image_bytes)
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
3. Descreva onde cada bloco deve ficar numa versão horizontal unificada.
4. Liste obrigatoriamente botões de CTA, logos, selos, datas, preço, overline e textos pequenos em required_visible_elements.
5. Se existir botão de chamada como "Confira a Programação", "Saiba mais", "Comprar", "Inscreva-se" ou similar, marque como role "cta" e importance "critical".
6. Identifique o mapa espacial original. Se o texto principal estiver na direita, copy_column_side deve ser "right". Se o visual estiver na esquerda, visual_side deve ser "left".
7. Elementos decorativos, dashboards, gráficos e hologramas devem ser classificados como support_panel/background quando não forem a mensagem principal.
""".strip()
    user_text = (
        "Analise a imagem para orientar uma recomposição horizontal real por IA. "
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
        for key in ["hero_visual", "text_column", "offer", "footer", "recommended_landscape_layout"]:
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
) -> str:
    target_ratio = target_width / max(1.0, float(target_height))
    vertical_bleed = max(0, generated_height - int(round(generated_width / target_ratio)))
    bleed_each_side = max(0, vertical_bleed // 2)
    safe_top_pct = min(18.0, max(7.0, (bleed_each_side / max(1, generated_height)) * 100.0 + 4.0))
    safe_bottom_pct = max(76.0, min(90.0, 100.0 - safe_top_pct - 5.0))
    safe_area_note = (
        f"A saída nativa será {generated_width}x{generated_height}, mas o arquivo final será fechado em {target_width}x{target_height} em full-bleed, sem letterbox. "
        f"Pense na saída nativa como uma arte com bleed técnico vertical: aproximadamente {bleed_each_side}px podem ser descartados no topo/rodapé durante o fechamento. "
        f"Mantenha TODO conteúdo importante dentro da área segura central, preferencialmente entre {safe_top_pct:.1f}% e {safe_bottom_pct:.1f}% da altura nativa. "
        f"CTA, logos, selos, preço, datas e textos pequenos nunca podem ficar no rodapé extremo; deixe apenas fundo/ambiente nas bordas técnicas."
    )
    return f"""
Use a imagem enviada como referência visual obrigatória e recomponha a peça publicitária como UMA ARTE ÚNICA, finalizada, horizontal e limpa.

Objetivo final: entregar a mesma campanha no tamanho exato {target_width}x{target_height}.
{safe_area_note}

Instrução original do usuário:
{instruction_text or 'Transformar para a nova resolução mantendo o conteúdo original e fazendo apenas o necessário.'}

Leitura técnica do layout original:
{layout_context}

Direção de arte obrigatória:
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

    ai_layout = await _analyze_layout_with_openai(client, image_bytes, openai_key, instruction_text) if openai_key else None
    layout_context = _layout_context_text(ai_layout)
    final_prompt = _build_unified_recomposition_prompt(
        target_width=target_width,
        target_height=target_height,
        generated_width=generated_size[0],
        generated_height=generated_size[1],
        instruction_text=instruction_text,
        layout_context=layout_context,
    )

    fallback_applied = False
    warning: Optional[str] = None
    api_calls_used = 1 if ai_layout else 0
    generated_dimensions: Optional[Dict[str, int]] = None

    if not openai_key:
        fallback_applied = True
        warning = "OPENAI_API_KEY ausente. Entreguei fallback conservador de peça única, sem colagem."
        final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
        final_bytes = _encode_png_bytes(final_image)
    else:
        try:
            ai_result = await _edit_openai_unified_layout(
                client=client,
                image_bytes=image_bytes,
                openai_key=openai_key,
                prompt=final_prompt,
                quality=openai_quality,
                generated_size=generated_size,
            )
            api_calls_used += 1
            generated_bytes, _ = _image_bytes_from_result_url(ai_result["url"])
            gw, gh = _read_image_dimensions(generated_bytes)
            generated_dimensions = {"width": gw, "height": gh}
            final_bytes = _finalize_to_exact_size(generated_bytes, target_width, target_height)
        except Exception as exc:
            fallback_applied = True
            warning = f"Falha na recomposição real por IA ({type(exc).__name__}: {str(exc)[:240]}). Entreguei fallback conservador de peça única, sem colagem."
            final_image = _build_safe_single_piece_fallback(source_image, (target_width, target_height))
            final_bytes = _encode_png_bytes(final_image)

    return {
        "engine_id": "openai_unified_layout_recomposition_v3" if not fallback_applied else "safe_single_piece_fallback_v3",
        "motor": "Recomposição real por IA V3" if not fallback_applied else "Fallback seguro de peça única V3",
        "url": _result_url_from_image_bytes(final_bytes, "image/png"),
        "warning": warning,
        "exact_canvas_expand": None,
        "layout_recomposition": {
            "request_id": request_id,
            "algorithm_version": "v3_unified_ai_recomposition_no_collage",
            "diagnostics": {
                "source_size": {"width": source_width, "height": source_height},
                "target_size": {"width": target_width, "height": target_height},
                "openai_generation_size": {"width": generated_size[0], "height": generated_size[1]},
                "generated_dimensions": generated_dimensions,
                "used_ai_layout_analysis": bool(ai_layout),
                "used_ai_generation": bool(openai_key and not fallback_applied),
                "api_calls_used": api_calls_used,
                "fallback_applied": fallback_applied,
                "background": _infer_background_meta(ai_layout, source_image),
                "quality": openai_quality,
                "no_blur_mirror_smear_stretch_policy": True,
                "no_local_collage_policy": True,
                "strategy": "openai_unified_full_design_edit_then_exact_finalize" if not fallback_applied else "safe_single_piece_no_collage_fallback",
            },
            "plan": {
                "layout_kind": "unified_ai_landscape_recomposition" if target_width >= target_height else "unified_ai_portrait_recomposition",
                "source_size": {"width": source_width, "height": source_height},
                "target_size": {"width": target_width, "height": target_height},
                "generated_size": {"width": generated_size[0], "height": generated_size[1]},
                "finalization": "full_bleed_spatial_anchor_crop_with_right_column_guard_v36" if not fallback_applied else "single_piece_contain_on_clean_background",
                "prompt": final_prompt,
            },
        },
    }
