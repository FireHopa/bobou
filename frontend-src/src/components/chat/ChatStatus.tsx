import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { TypingDots } from "@/components/chat/TypingDots";
import { transitions } from "@/lib/motion";

export type ChatPhase = null | "thinking" | "analyzing" | "insights";

/**
 * Indicador de andamento do chat.
 * - Português simples (sem inglês na interface)
 * - Não interfere no teclado do usuário
 */
export function ChatStatus({ phase }: { phase: ChatPhase }) {
  const label =
    phase === "thinking"
      ? "Pensando"
      : phase === "analyzing"
        ? "Analisando"
        : phase === "insights"
          ? "Organizando os principais pontos"
          : null;

  return (
    <AnimatePresence>
      {label ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={transitions.base}
          className="flex items-center gap-2"
          aria-live="polite"
        >
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-google-blue/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-google-blue/70" />
          </span>

          <Badge variant="blue" className="flex items-center gap-2">
            <TypingDots />
            {label}
          </Badge>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Mantém compatibilidade caso algum lugar use o nome antigo
export const ChatAndamento = ChatStatus;
