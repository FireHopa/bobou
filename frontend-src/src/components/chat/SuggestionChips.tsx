import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const chips = [
  "Me dê um checklist prático.",
  "Responda em formato FAQ.",
  "Quais são os principais erros nesse nicho?",
  "Crie 5 títulos prontos para blog.",
  "Me dê um plano de 7 dias.",
  "Resuma em bullets citáveis.",
];

export function SuggestionChips({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, idx) => (
        <motion.button
          key={c}
          type="button"
          disabled={disabled}
          className={cn(
            "rounded-full border bg-background/40 px-3 py-1 text-xs font-medium shadow-soft transition",
            "hover:bg-[rgba(0,200,232,0.10)] disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          onClick={() => onPick(c)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.03 * idx }}
        >
          {c}
        </motion.button>
      ))}
    </div>
  );
}
