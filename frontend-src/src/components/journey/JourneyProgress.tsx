import * as React from "react";
import { motion } from "framer-motion";
import * as Progress from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";
import { LEVELS, JOURNEY_STEPS } from "@/constants/journey";
import { Badge } from "@/components/ui/badge";

export function JourneyProgress({ stepIndex }: { stepIndex: number }) {
  const total = JOURNEY_STEPS.length;
  const pct = Math.round(((stepIndex + 1) / total) * 100);

  const step = JOURNEY_STEPS[stepIndex];
  const currentLevel = step.level;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Progresso</div>
          <div className="text-xs text-muted-foreground">Nível {currentLevel} • {pct}%</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {LEVELS.map((l) => (
            <Badge
              key={l.level}
              variant={l.level === currentLevel ? "blue" : "secondary"}
              className={cn("transition", l.level < currentLevel ? "opacity-75" : "opacity-100")}
              title={l.subtitle}
            >
              {l.level}: {l.title}
            </Badge>
          ))}
        </div>
      </div>

      <Progress.Root className="relative h-2 w-full overflow-hidden rounded-full bg-[rgba(0,200,232,0.08)]">
        <motion.div
          className="h-full rounded-full bg-google-blue/70"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </Progress.Root>
    </div>
  );
}