from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image

from backend.app.image_canvas_exact_size import build_exact_size_expand_assets, finalize_exact_size_expand
from backend.app.image_local_edit import list_local_text_candidate_rects


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--instruction", type=str, default="")
    args = parser.parse_args()

    image_path = Path(args.image)
    image_bytes = image_path.read_bytes()
    rects = list_local_text_candidate_rects(image_bytes)

    assets = build_exact_size_expand_assets(
        image_bytes=image_bytes,
        target_width=args.width,
        target_height=args.height,
        text_rects=rects,
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

    if isinstance(finalized, dict):
        final_bytes = finalized.get("image_bytes", b"")
        overlay = finalized.get("overlay", {})
        finalized_kind = "dict"
    else:
        final_bytes = finalized
        overlay = {}
        finalized_kind = "bytes"

    report = {
        "strategy": assets.get("strategy"),
        "exact_strategy": assets["plan"].get("exact_strategy"),
        "reasons": list((assets.get("profile") or {}).get("reasons") or []),
        "finalize_return_type": finalized_kind,
        "overlay": overlay,
    }

    out_dir = image_path.parent / "exact_size_runtime_check"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with Image.open(io.BytesIO(assets["canvas_bytes"])) as im:
        im.save(out_dir / "canvas.png")
    with Image.open(io.BytesIO(assets["mask_bytes"])) as im:
        im.save(out_dir / "mask.png")
    with Image.open(io.BytesIO(final_bytes)) as im:
        im.save(out_dir / "finalized_preview.png")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
