export type AuthoritySignal = {
  id: string;
  label: string;
  points: number;
  hit: boolean;
};

export function scoreAuthority(systemInstructions: string): { score: number; signals: AuthoritySignal[] } {
  const s = (systemInstructions || "").trim();
  const lower = s.toLowerCase();

  const signals: AuthoritySignal[] = [
    {
      id: "length",
      label: "Detalhamento suficiente",
      points: 20,
      hit: s.length >= 600,
    },
    {
      id: "structure",
      label: "Estrutura (títulos/listas/FAQ)",
      points: 16,
      hit: /\n\s*#|\n\s*- |\n\s*\d+\./.test(s) || lower.includes("faq"),
    },
    {
      id: "no_hallucination",
      label: "Anti-alucinação (não inventar)",
      points: 12,
      hit: lower.includes("não invente") || lower.includes("nao invente") || lower.includes("se faltar informação"),
    },
    {
      id: "aio",
      label: "AIO presente",
      points: 10,
      hit: lower.includes("aio"),
    },
    {
      id: "aeo",
      label: "AEO presente",
      points: 10,
      hit: lower.includes("aeo"),
    },
    {
      id: "geo",
      label: "GEO presente",
      points: 10,
      hit: lower.includes("geo"),
    },
    {
      id: "tone",
      label: "Tom definido",
      points: 10,
      hit: lower.includes("tom") || lower.includes("linguagem") || lower.includes("estilo"),
    },
    {
      id: "outputs",
      label: "Saídas prontas (checklists/templates)",
      points: 12,
      hit: lower.includes("checklist") || lower.includes("template") || lower.includes("passo a passo") || lower.includes("exemplos"),
    },
  ];

  const raw = signals.reduce((acc, sig) => acc + (sig.hit ? sig.points : 0), 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, signals };
}

export function authorityLabel(score: number): { label: string; tone: "red" | "yellow" | "green" | "blue" } {
  if (score >= 85) return { label: "Muito forte", tone: "green" };
  if (score >= 65) return { label: "Forte", tone: "blue" };
  if (score >= 45) return { label: "Médio", tone: "yellow" };
  return { label: "Fraco", tone: "red" };
}
