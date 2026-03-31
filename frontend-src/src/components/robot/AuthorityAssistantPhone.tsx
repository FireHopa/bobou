import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/services/robots";
import authorityAvatar from "@/autoridade.png";
import { toastApiError } from "@/lib/toast";

type Msg = { role: "user" | "assistant"; content: string; meta?: { kind: "thinking"; stage: string } };

function ThinkingBubble({ stage }: { stage: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30" />
      </div>
      <span className="text-xs">{stage}</span>
    </div>
  );
}


export function AuthorityAssistantPhone({
  publicId,
  systemInstructions,
  onApplySystemInstructions,
}: {
  publicId: string;
  systemInstructions: string;
  onApplySystemInstructions: (next: string) => void;
}) {
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [chat, setChat] = React.useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Eu sou o Assistente de Autoridade. Eu avalio a força do seu prompt (0–100) e, se fizer sentido, aplico melhorias automáticas com justificativa. Você pode pedir: ‘mais firme’, ‘anti-injection’, ‘formato de saída’, ‘validação’, etc.",
    },
  ]);

  const [beforeScore, setBeforeScore] = React.useState<number | null>(null);
  const [afterScore, setAfterScore] = React.useState<number | null>(null);
  const [changes, setChanges] = React.useState<{ what: string; why: string }[]>([]);
  const [suggestions, setSuggestions] = React.useState<{ title: string; detail: string }[]>([]);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.length]);

    const send = async () => {
    const msg = input.trim();
    if (!msg || busy) return;

    const thinkingStages = [
      "Analisando o prompt…",
      "Checando padrões anti-injection…",
      "Propondo melhorias (sem repetir)…",
      "Consolidando resposta…",
    ];

    const thinkingMsg: Msg = {
      role: "assistant",
      content: "",
      meta: { kind: "thinking", stage: thinkingStages[0] },
    };

    const nextChat: Msg[] = [...chat, { role: "user", content: msg }, thinkingMsg];
    setChat(nextChat);
    setInput("");
    setBusy(true);

    // animação de “raciocinando” sem travar a página
    let stageIdx = 0;
    const stageTimer = window.setInterval(() => {
      stageIdx = (stageIdx + 1) % thinkingStages.length;
      setChat((prev) => {
        if (!prev.length) return prev;
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.meta?.kind !== "thinking") return prev;
        copy[copy.length - 1] = { ...last, meta: { kind: "thinking", stage: thinkingStages[stageIdx] } };
        return copy;
      });
    }, 3500);

    try {
      const res = await api.robots.authorityAssistant(publicId, {
        message: msg,
        history: nextChat
          .filter((m) => m.meta?.kind !== "thinking")
          .map((m) => ({ role: m.role, content: m.content })),
      });

      setBeforeScore(res.before_score);
      setAfterScore(res.after_score);
      setChanges(res.changes_made ?? []);
      setSuggestions(res.suggestions ?? []);

      setChat((prev) => {
        const withoutThinking = prev.filter((m) => m.meta?.kind !== "thinking");
        return [...withoutThinking, { role: "assistant", content: res.assistant_reply }];
      });

      if (res.apply_change && res.updated_system_instructions) {
        onApplySystemInstructions(res.updated_system_instructions);
      }
    } catch (e) {
      // remove bolha de thinking pra não ficar “pendurado”
      setChat((prev) => prev.filter((m) => m.meta?.kind !== "thinking"));
      toastApiError(e, "Falha no assistente");
    } finally {
      window.clearInterval(stageTimer);
      setBusy(false);
    }
  };

  const scoreBadge =
    afterScore == null ? null : (
      <Badge className="rounded-full px-3 py-1" variant="secondary">
        Autoridade: {afterScore}/100
      </Badge>
    );

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Assistente</CardTitle>
          {scoreBadge}
        </div>
      </CardHeader>

      <CardContent>
        <div className="mx-auto w-full max-w-[360px] rounded-[28px] border bg-background/60 p-3 shadow-soft">
          <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-foreground/10" />
          <div className="mb-3 flex flex-col items-center justify-center">
            <img
              src={authorityAvatar}
              alt="yuna"
              className="h-20 w-20 rounded-full object-cover shadow-soft"
            />
            <div className="mt-2 text-xs font-medium tracking-wide text-muted-foreground">yuna</div>
          </div>
          <div
            ref={scrollerRef}
            className="h-[260px] space-y-3 overflow-y-auto rounded-2xl bg-background/40 p-3 text-sm"
          >
                        {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 shadow-soft " +
                    (m.role === "user" ? "bg-[rgba(0,200,232,0.08)]" : "bg-[rgba(0,200,232,0.08)]")
                  }
                >
                  {m.meta?.kind === "thinking" ? <ThinkingBubble stage={m.meta.stage} /> : m.content}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? "yuna está trabalhando… você já pode digitar a próxima mensagem" : "Digite o ajuste desejado..."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) send();
              }}
              disabled={false}
            />
            <Button onClick={send} disabled={busy || !input.trim()}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
                  <span>Raciocinando…</span>
                </span>
              ) : (
                "Enviar"
              )}
            </Button>
          </div>
        </div>

        {(beforeScore != null || afterScore != null) && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs">
                {beforeScore != null && <Badge variant="outline">Antes: {beforeScore}/100</Badge>}
                {afterScore != null && <Badge variant="secondary">Depois: {afterScore}/100</Badge>}
              </div>
              <div className="text-sm font-semibold">Alterações aplicadas</div>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {changes.length ? (
                  changes.map((c, idx) => (
                    <li key={idx}>
                      <span className="text-foreground">{c.what}</span> — {c.why}
                    </li>
                  ))
                ) : (
                  <li>Nenhuma alteração aplicada.</li>
                )}
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold">Sugestões (opcionais)</div>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {suggestions.length ? (
                  suggestions.map((s, idx) => (
                    <li key={idx}>
                      <span className="text-foreground">{s.title}</span> — {s.detail}
                    </li>
                  ))
                ) : (
                  <li>Sem sugestões no momento.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
