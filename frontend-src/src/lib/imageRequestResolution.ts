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
  {
    pattern: /\b(?:16\s*[:/]\s*9|horizontal\s*16\s*[:/]\s*9|horizontal|formato\s+horizontal|vers[aã]o\s+horizontal|imagem\s+horizontal|paisagem|landscape|banner|banner\s+horizontal|capa|capa\s+de\s+site|capa\s+do\s+site|thumbnail|thumb|wide)\b/i,
    width: 1536,
    height: 1024,
    label: "16:9 padrão 1536x1024",
  },
  {
    pattern: /\b(?:9\s*[:/]\s*16|vertical\s*9\s*[:/]\s*16|vertical|formato\s+vertical|vers[aã]o\s+vertical|imagem\s+vertical|story|stories|storie|reel|reels|short|shorts|portrait|status|whatsapp\s+status)\b/i,
    width: 1024,
    height: 1536,
    label: "9:16 padrão 1024x1536",
  },
  {
    pattern: /\b(?:1\s*[:/]\s*1|quadrado|feed\s+quadrado|post\s+quadrado|post\s+feed|feed|carrossel|carousel|square)\b/i,
    width: 1024,
    height: 1024,
    label: "1:1 padrão 1024x1024",
  },
  { pattern: /\bfull\s*hd\b|\bfhd\b|\b1080p\b/i, width: 1920, height: 1080, label: "1920x1080" },
  { pattern: /\b4k\b|\bultra\s*hd\b|\buhd\b/i, width: 3840, height: 2160, label: "3840x2160" },
  { pattern: /\b2k\b|\bqhd\b/i, width: 2560, height: 1440, label: "2560x1440" },
  { pattern: /\bhd\b|\b720p\b/i, width: 1280, height: 720, label: "1280x720" },
];

type ResolutionCandidate = ParsedImageRequestResolution & { index: number };

function isValidDimension(value: number) {
  return Number.isInteger(value) && value >= 256 && value <= 4096;
}

function dedupeCandidates(candidates: ResolutionCandidate[], limit = 4): ParsedImageRequestResolution[] {
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => a.index - b.index)
    .filter((candidate) => {
      const key = `${candidate.width}x${candidate.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ index: _index, ...candidate }) => candidate);
}

function parseImageRequestResolutions(text: string, limit = 4): ParsedImageRequestResolution[] {
  const input = (text || "").trim();
  if (!input) return [];

  const candidates: ResolutionCandidate[] = [];
  const explicitPattern = /\b(\d{3,4})\s*(?:x|×|by|por)\s*(\d{3,4})\b/gi;

  for (const match of input.matchAll(explicitPattern)) {
    const width = Number(match[1]);
    const height = Number(match[2]);

    if (!isValidDimension(width) || !isValidDimension(height)) continue;

    candidates.push({
      width,
      height,
      source: "explicit",
      label: `${width}x${height}`,
      matchedText: match[0],
      index: match.index ?? 0,
    });
  }

  for (const alias of RESOLUTION_ALIASES) {
    const pattern = new RegExp(alias.pattern.source, alias.pattern.flags.includes("g") ? alias.pattern.flags : `${alias.pattern.flags}g`);
    for (const match of input.matchAll(pattern)) {
      candidates.push({
        width: alias.width,
        height: alias.height,
        source: "alias",
        label: alias.label,
        matchedText: match[0],
        index: match.index ?? 0,
      });
    }
  }

  const allFormatsPattern = /\b(?:todos\s+os\s+(?:3|tr[eê]s)\s+formatos|usar\s+(?:os\s+)?(?:3|tr[eê]s)\s+formatos|(?:3|tr[eê]s)\s+formatos|formatos\s+16\s*[:/]\s*9\s*,?\s*9\s*[:/]\s*16\s*(?:e|,)?\s*1\s*[:/]\s*1)\b/i;
  const allFormatsMatch = input.match(allFormatsPattern);
  if (allFormatsMatch) {
    const startIndex = allFormatsMatch.index ?? 0;
    [
      { width: 1536, height: 1024, label: "16:9 padrão 1536x1024" },
      { width: 1024, height: 1536, label: "9:16 padrão 1024x1536" },
      { width: 1024, height: 1024, label: "1:1 padrão 1024x1024" },
    ].forEach((item, offset) => {
      candidates.push({
        width: item.width,
        height: item.height,
        source: "alias",
        label: item.label,
        matchedText: allFormatsMatch[0],
        index: startIndex + offset / 10,
      });
    });
  }

  return dedupeCandidates(candidates, limit);
}

export function extractImageRequestResolutions(text: string): ParsedImageRequestResolution[] {
  return parseImageRequestResolutions(text);
}

export function extractImageRequestResolution(text: string): ParsedImageRequestResolution | null {
  return parseImageRequestResolutions(text, 1)[0] ?? null;
}

export function extractRequestedImageResolution(text: string): RequestedImageResolution | null {
  return extractImageRequestResolution(text);
}

export default extractImageRequestResolution;
