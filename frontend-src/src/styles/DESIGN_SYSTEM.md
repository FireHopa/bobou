# Autoridade ORI — Design System (Base)

## Direção
Clean, premium, espaçamento generoso. Glassmorphism discreto, microgradientes suaves e sombras leves.

## Tipografia
- Fonte: Inter
- Títulos: 32/40 (hero), 20/28 (section), 16/24 (card)
- Corpo: 14/20 ou 16/24 (preferir legibilidade)

## Paleta (Google-inspired)
- Primária: Azul
- Acentos (uso pontual): Vermelho, Amarelo, Verde
- Não “carnaval”: usar acentos em badges, highlights e detalhes.

Tokens em `globals.css`:
- `--g-blue`, `--g-red`, `--g-yellow`, `--g-green`

## Espaçamento (Guidelines)
- Layout: `container` com padding 16px (mobile) e 24px+ em desktop
- Seções: `py-12` (mobile) / `py-16` (desktop)
- Cards: padding 24px (`p-6`)
- Gaps: `gap-3` (tight), `gap-6` (normal), `gap-10` (hero)

## Componentes base
- Button: altura padrão `h-11`, radius `xl`, suporte a loading (`isLoading`)
- Input: altura padrão `h-11`, foco premium
- Card: `variant="glass"` para superfícies premium
- Badge: variantes `blue|red|yellow|green`

## Motion (Framer Motion)
Presets em `src/lib/motion.ts`.
- Entrada: `fadeUp` / `scaleIn` com blur leve
- Hover: lift sutil
- Timing: `transitions.base` (0.28s), evitar animações longas

## Acessibilidade
- Sempre manter `focus-visible`
- Contraste: texto em superfícies glass deve ficar em `foreground` / `muted-foreground`
