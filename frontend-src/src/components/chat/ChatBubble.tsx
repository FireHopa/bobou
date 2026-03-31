import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { transitions } from "@/lib/motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ChatMessageOut } from "@/types/api";
import { Markdown } from "@/components/markdown/Markdown";

function unwrapAssistantDisplayContent(content: string): string {
  const raw = (content || "").trim();
  if (!raw) return "";

  const stripFence = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith("```")) return trimmed;
    const lines = trimmed.split("\n");
    const body = lines
      .slice(1, lines[lines.length - 1]?.trim() === "```" ? -1 : undefined)
      .join("\n")
      .trim();
    return body.toLowerCase().startsWith("json") ? body.slice(4).trim() : body;
  };

  const tryExtract = (value: string): string => {
    const cleaned = stripFence(value);
    if (!cleaned.startsWith("{")) return cleaned;

    try {
      const parsed: unknown = JSON.parse(cleaned);
      if (typeof parsed === "string") return tryExtract(parsed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return cleaned;

      const record = parsed as Record<string, unknown>;
      const preferredKeys = ["resposta", "answer", "content", "mensagem", "texto", "reply"];
      for (const key of preferredKeys) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      }

      const scalarValues = Object.values(record).filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      );
      if (scalarValues.length === 1) return scalarValues[0].trim();
      return cleaned;
    } catch {
      return value;
    }
  };

  return tryExtract(raw);
}

/**
 * ChatBubble (produção)
 * - Sem "editar mensagem" (evita edição fake que não reprocessa o fluxo do chat no backend).
 * - Avatar do robô sempre visível nas mensagens do assistente.
 */
export function ChatBubble({
  msg,
  assistantAvatarSrc,
  assistantLabel = "Robô",
}: {
  msg: ChatMessageOut;
  assistantAvatarSrc?: string | null;
  assistantLabel?: string;
}) {
  const isUser = msg.role === "user";
  const assistantContent = isUser ? msg.content : unwrapAssistantDisplayContent(msg.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.base}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex max-w-full items-start gap-3", isUser ? "flex-row-reverse ml-auto" : "mr-auto")}>
        {!isUser ? (
          <Avatar className="mt-1 h-9 w-9" tone="blue">
            {assistantAvatarSrc ? <AvatarImage src={assistantAvatarSrc} alt={assistantLabel} /> : null}
            <AvatarFallback tone="blue">{assistantLabel.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : null}

        <div
          className={cn(
            "max-w-[92%] sm:max-w-[75%] rounded-2xl border px-4 py-3 shadow-soft",
            isUser ? "bg-[rgba(0,200,232,0.08)] border-google-blue/20" : "bg-background/55 border-border/70",
            "glass"
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.content}</div>
          ) : (
            <Markdown content={assistantContent} />
          )}

          <div className="mt-2 text-[11px] text-muted-foreground">{new Date(msg.created_at).toLocaleString("pt-BR")}</div>
        </div>
      </div>
    </motion.div>
  );
}
