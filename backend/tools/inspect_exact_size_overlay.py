from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
BACKEND_DIR = CURRENT_FILE.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.image_canvas_exact_size import build_exact_size_expand_assets, finalize_exact_size_expand


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspeciona a estratégia exata e o overlay final.")
    parser.add_argument("image", help="Caminho da imagem base")
    parser.add_argument("--width", type=int, required=True, help="Largura final")
    parser.add_argument("--height", type=int, required=True, help="Altura final")
    parser.add_argument("--instruction", default="", help="Texto da instrução")
    args = parser.parse_args()

    image_path = Path(args.image).resolve()
    image_bytes = image_path.read_bytes()

    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=args.width,
        target_height=args.height,
        text_rects=[],
        strength="medium",
        instruction_text=args.instruction,
    )

    finalized = finalize_exact_size_expand(
        expanded_bytes=assets["canvas_bytes"],
        source_canvas_bytes=assets["canvas_bytes"],
        plan=assets["plan"],
        hard_preserve_boxes=assets.get("hard_preserve_boxes"),
        hard_feather=int(assets.get("hard_feather") or 8),
    )

    report = {
        "exact_strategy": assets.get("strategy"),
        "plan_exact_strategy": assets["plan"].get("exact_strategy"),
        "hard_preserve_boxes": assets.get("hard_preserve_boxes"),
        "overlay": finalized.get("overlay"),
    }

    output_dir = image_path.parent / "exact_size_overlay_debug"
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "canvas.png").write_bytes(assets["canvas_bytes"])
    (output_dir / "mask.png").write_bytes(assets["mask_bytes"])
    (output_dir / "finalized.png").write_bytes(finalized["image_bytes"])

    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Arquivos salvos em: {output_dir}")


if __name__ == "__main__":
    main()
