import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { transitions, fadeUp } from "@/lib/motion";
import type { JourneyStep } from "@/types/journey";
import coachUrl from "@/monica.jpeg";

export function MônicaPanel({
  step,
  message,
  kind = "info",
}: {
  step: JourneyStep;
  message: string;
  kind?: "info" | "success" | "phase";
}) {
  const badge =
    kind === "success"
      ? "feito"
      : step.optional
        ? "opcional"
        : kind === "phase"
          ? "em progresso"
          : "essencial";

  const variant =
    step.accent === "red" ? "red" : step.accent === "green" ? "green" : step.accent === "yellow" ? "yellow" : "blue";

  return (
    <Card variant="glass" className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <img src={coachUrl} alt="Mônica" className="h-9 w-9 rounded-2xl object-cover ring-1 ring-border/70" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Mônica</div>
            <div className="text-xs text-muted-foreground">guia de jornada</div>
          </div>
          <div className="ml-auto">
            <Badge variant={variant}>{badge}</Badge>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id + ":" + message}
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={fadeUp}
            transition={transitions.base}
            className="mt-4 space-y-2"
          >
            <div className="text-sm leading-relaxed">{message}</div>
            <div className="mt-3 h-[1px] w-full bg-foreground/10" />
            <div className="text-xs text-muted-foreground">
              Enter avança • Shift+Enter quebra linha (no chat)
            </div>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
