from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.image_canvas_exact_size import build_exact_size_expand_assets  # noqa: E402
from app.image_engine import SUPPORTED_BASE_SIZES  # noqa: E402
from app.image_local_edit import list_local_text_candidate_rects  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspeciona a estratégia de recomposição exata.")
    parser.add_argument("image", help="Caminho da imagem base")
    parser.add_argument("--width", type=int, required=True, help="Largura final")
    parser.add_argument("--height", type=int, required=True, help="Altura final")
    parser.add_argument("--instruction", type=str, default="", help="Instrução enviada pelo usuário")
    args = parser.parse_args()

    image_path = Path(args.image)
    image_bytes = image_path.read_bytes()
    text_rects = list_local_text_candidate_rects(image_bytes)

    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=args.width,
        target_height=args.height,
        supported_sizes=SUPPORTED_BASE_SIZES,
        text_rects=text_rects,
        strength="medium",
        instruction_text=args.instruction,
    )

    profile = assets.get("profile") or {}
    payload = {
        "strategy": assets.get("strategy"),
        "plan": assets.get("plan"),
        "reasons": profile.get("reasons"),
        "text_rects_meta": profile.get("text_rects_meta"),
        "zone_count": profile.get("zone_count"),
        "text_bands": profile.get("text_bands"),
        "mandatory_pressure": profile.get("mandatory_pressure"),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
