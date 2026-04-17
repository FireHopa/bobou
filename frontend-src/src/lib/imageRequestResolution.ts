export type ParsedImageRequestResolution = {
  width: number;
  height: number;
  source: "explicit" | "alias";
  label: string;
  matchedText: string;
};

export type RequestedImageResolution = ParsedImageRequestResolution;

const RESOLUTION_ALIASES: Array<{
  pattern: RegExp;
  width: number;
  height: number;
  label: string;
}> = [
  { pattern: /\bfull\s*hd\b|\bfhd\b|\b1080p\b/i, width: 1920, height: 1080, label: "1920x1080" },
  { pattern: /\b4k\b|\bultra\s*hd\b|\buhd\b/i, width: 3840, height: 2160, label: "3840x2160" },
  { pattern: /\b2k\b|\bqhd\b/i, width: 2560, height: 1440, label: "2560x1440" },
  { pattern: /\bhd\b|\b720p\b/i, width: 1280, height: 720, label: "1280x720" },
];

function isValidDimension(value: number) {
  return Number.isInteger(value) && value >= 256 && value <= 4096;
}

function parseImageRequestResolution(text: string): ParsedImageRequestResolution | null {
  const input = (text || "").trim();
  if (!input) return null;

  const explicitMatch = input.match(/\b(\d{3,4})\s*(?:x|×|by|por)\s*(\d{3,4})\b/i);
  if (explicitMatch) {
    const width = Number(explicitMatch[1]);
    const height = Number(explicitMatch[2]);

    if (isValidDimension(width) && isValidDimension(height)) {
      return {
        width,
        height,
        source: "explicit",
        label: `${width}x${height}`,
        matchedText: explicitMatch[0],
      };
    }
  }

  for (const alias of RESOLUTION_ALIASES) {
    const match = input.match(alias.pattern);
    if (!match) continue;

    return {
      width: alias.width,
      height: alias.height,
      source: "alias",
      label: alias.label,
      matchedText: match[0],
    };
  }

  return null;
}

export function extractImageRequestResolution(text: string): ParsedImageRequestResolution | null {
  return parseImageRequestResolution(text);
}

export function extractRequestedImageResolution(text: string): RequestedImageResolution | null {
  return parseImageRequestResolution(text);
}

export default extractImageRequestResolution;
