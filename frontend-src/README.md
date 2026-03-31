# Autoridade ORI (Frontend)

Base arquitetural (Parte 1) — React + TypeScript + Vite + Tailwind + shadcn/ui + Framer Motion + React Query.

## Requisitos
- Node.js 18+

## Setup
```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
Backend esperado: `http://localhost:8000`

## Estrutura

- `src/app/` — bootstrap da app (router)
- `src/components/` — layout + UI
- `src/components/ui/` — componentes shadcn (colados para controle total)
- `src/constants/` — constantes globais (inclui `API_BASE_URL`)
- `src/hooks/` — hooks (React Query)
- `src/services/` — cliente HTTP + SDK tipado para API
- `src/state/` — QueryClient e estado global (quando surgir)
- `src/styles/` — tema global (tokens CSS + Tailwind)

## Rotas (base)
- `/` landing placeholder (apenas status da API)
- `*` 404 placeholder

> Próximas partes: wizard/jornada, dashboard, detalhe e chat — mantendo essa base.


## Data layer (API + React Query)

- Tipos: `src/types/api.ts`
- Cliente HTTP: `src/services/http.ts`
- Endpoints tipados: `src/services/robots.ts`
- Query keys: `src/constants/queryKeys.ts`
- Hooks React Query:
  - `src/hooks/useHealth.ts`
  - `src/hooks/useRobots.ts`
  - `src/hooks/useRobotMessages.ts`
- Toast helpers: `src/lib/toast.ts`


## Part 4 — Landing Page
- Landing com hero premium, mock visual de robôs, bloco AIO/AEO/GEO e microanimações.
- Rotas placeholder: `/journey`, `/dashboard`.


## Part 5 — Journey Wizard (Gamificado)
- Wizard com progresso animado, níveis, coach, preview lateral, Enter avança, validação leve e finalização com conquistas.


## Part 6 — Dashboard
- Cards de robôs, busca, filtros, ordenação, ações rápidas, sugestões de próximos passos e animações suaves.


## Part 7 — Tela do Robô
- Avatar animado, descrição editável, editor de instruções (tabs), indicador de força de autoridade e linha do tempo de evolução.


## Part 8 — Chat Inteligente
- Bolhas, skeleton loading, auto-scroll, edição, upload de áudio, chips de sugestão e estados de pensamento.

## Part 9 — Microinterações e Polimento
- Transições entre telas
- Partículas discretas
- Confete minimalista
- Easter egg (Konami)
- Modo foco
- Sons opcionais
- Melhorias de acessibilidade (focus-visible, aria, teclado)
- Performance: animações leves, auto-scroll otimizado, lazy logic


## UX Update
- Removido modo foco e modo som.
- Logo clicável volta para Home.
- Chat com envio otimista (mensagem do usuário aparece imediatamente) + indicador de digitação.
- Coach menos frequente (apenas em pontos estratégicos).
- Renderização de Markdown nas respostas do robô.


## Update — Áudio gravado no site
- Chat agora grava áudio dentro do navegador (MediaRecorder) com feedback visual tipo WhatsApp e envia para o endpoint /audio.


## Update — Áudio inline + waveform
- Botão de microfone inline ao lado de Enviar, gravação no browser e waveform em canvas mais realista.


## Update — Menu lateral fixo
- Menu lateral fixo à esquerda com itens: Meus Agentes (funcional), Análise da Concorrência, Projetos, Materiais de Apoio, Video Aula (placeholders premium).
- Menu recolhível com persistência local.


## Análise da concorrência — endpoints
- POST /api/competition/find-competitors
- POST /api/competition/analyze
- GET /api/competition/jobs/{job_id}
- GET /api/competition/reports/{report_id}
