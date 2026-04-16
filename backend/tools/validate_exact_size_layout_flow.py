from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image

import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.image_canvas_exact_size import build_exact_size_expand_assets, choose_exact_size_canvas_plan
from app.image_canvas_exact_size_strategy import detect_exact_size_recompose_profile
from app.image_local_edit import list_local_text_candidate_rects


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida o fluxo de resize exato com preservação de layout.")
    parser.add_argument("image", help="Caminho da imagem base")
    parser.add_argument("--width", type=int, required=True, help="Largura final exata")
    parser.add_argument("--height", type=int, required=True, help="Altura final exata")
    parser.add_argument("--instruction", default="", help="Prompt de edição")
    parser.add_argument("--out-dir", default="validation_output", help="Diretório de saída para previews")
    args = parser.parse_args()

    image_path = Path(args.image).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    image_bytes = image_path.read_bytes()
    text_rects = list_local_text_candidate_rects(image_bytes)
    plan = choose_exact_size_canvas_plan(args.width, args.height)
    profile = detect_exact_size_recompose_profile(
        image_bytes=image_bytes,
        target_width=args.width,
        target_height=args.height,
        plan=plan,
        text_rects=text_rects,
        requested_strength="medium",
        instruction_text=args.instruction,
    )
    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=args.width,
        target_height=args.height,
        text_rects=text_rects,
        strength="medium",
        instruction_text=args.instruction,
    )

    canvas = Image.open(io.BytesIO(assets["canvas_bytes"])).convert("RGBA")
    mask = Image.open(io.BytesIO(assets["mask_bytes"])).convert("RGBA")
    canvas.save(out_dir / "exact_size_canvas_preview.png")
    mask.save(out_dir / "exact_size_mask_preview.png")

    report = {
        "image": str(image_path),
        "requested_size": {"width": args.width, "height": args.height},
        "plan": plan,
        "strategy": assets.get("strategy"),
        "profile": {
            "strategy": profile.get("strategy"),
            "score": profile.get("score"),
            "reasons": profile.get("reasons"),
            "mandatory_pressure": profile.get("mandatory_pressure"),
            "text_rects_reliable": profile.get("text_rects_reliable"),
            "text_bands": profile.get("text_bands"),
            "mandatory_source_rects": profile.get("mandatory_source_rects"),
            "crop_safe_rect": profile.get("crop_safe_rect"),
        },
        "assets": {
            "placement": assets.get("placement"),
            "preserve_union": assets.get("preserve_union"),
            "hard_preserve_boxes": assets.get("hard_preserve_boxes"),
        },
        "text_rects": text_rects,
    }

    (out_dir / "exact_size_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nArquivos gerados em: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
