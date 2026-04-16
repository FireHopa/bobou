from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.image_canvas_exact_size import build_exact_size_expand_assets  # noqa: E402
from app.image_local_edit import list_local_text_candidate_rects  # noqa: E402


def _draw_boxes(image: Image.Image, boxes, outline=(255, 80, 80, 255), width: int = 3) -> Image.Image:
    preview = image.convert("RGBA").copy()
    draw = ImageDraw.Draw(preview)
    for rect in boxes or []:
        if len(rect) != 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in rect]
        if x2 <= x1 or y2 <= y1:
            continue
        draw.rectangle((x1, y1, x2, y2), outline=outline, width=width)
    return preview


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida o fluxo de exact-size e salva previews do canvas/máscara.")
    parser.add_argument("image", help="Caminho da imagem base")
    parser.add_argument("--width", type=int, required=True, help="Largura final")
    parser.add_argument("--height", type=int, required=True, help="Altura final")
    parser.add_argument("--instruction", default="", help="Prompt de edição")
    parser.add_argument("--output-dir", default="exact_size_debug", help="Diretório de saída")
    args = parser.parse_args()

    image_path = Path(args.image).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    image_bytes = image_path.read_bytes()
    text_rects = list_local_text_candidate_rects(image_bytes)
    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=int(args.width),
        target_height=int(args.height),
        text_rects=text_rects,
        strength="medium",
        instruction_text=args.instruction,
    )

    canvas = Image.open(io.BytesIO(assets["canvas_bytes"])).convert("RGBA")
    mask = Image.open(io.BytesIO(assets["mask_bytes"])).convert("RGBA")

    canvas.save(output_dir / "exact_size_canvas_preview.png")
    mask.save(output_dir / "exact_size_mask_preview.png")
    _draw_boxes(canvas, assets.get("hard_preserve_boxes")).save(output_dir / "exact_size_hard_boxes_preview.png")
    _draw_boxes(canvas, [assets.get("preserve_union")] if assets.get("preserve_union") else [], outline=(80, 255, 160, 255)).save(
        output_dir / "exact_size_union_preview.png"
    )

    report = {
        "strategy": assets.get("strategy"),
        "plan": assets.get("plan"),
        "placement": assets.get("placement"),
        "preserve_union": assets.get("preserve_union"),
        "hard_preserve_boxes": assets.get("hard_preserve_boxes"),
        "profile": assets.get("profile"),
        "raw_text_rects": text_rects,
    }
    (output_dir / "exact_size_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({
        "strategy": assets.get("strategy"),
        "output_dir": str(output_dir),
        "hard_preserve_boxes": len(assets.get("hard_preserve_boxes") or []),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
