import { motion } from "framer-motion";
import * as Progress from "@radix-ui/react-progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreAuthority, authorityLabel } from "@/lib/authority";
import { transitions } from "@/lib/motion";

export function AuthorityMeter({ systemInstructions }: { systemInstructions: string }) {
  const { score, signals } = scoreAuthority(systemInstructions);
  const meta = authorityLabel(score);

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Força de autoridade</CardTitle>
            <CardDescription>Heurística local — ajuda a manter consistência e “citabilidade”.</CardDescription>
          </div>
          <Badge variant={meta.tone}>{meta.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress.Root className="relative h-2 w-full overflow-hidden rounded-full bg-[rgba(0,200,232,0.08)]">
          <motion.div
            className="h-full rounded-full bg-google-blue/75"
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={transitions.base}
          />
        </Progress.Root>

        <div className="grid gap-2 sm:grid-cols-2">
          {signals.map((sig) => (
            <div
              key={sig.id}
              className="flex items-center justify-between rounded-2xl border bg-background/40 px-3 py-2 text-xs shadow-soft"
            >
              <span className="text-muted-foreground">{sig.label}</span>
              <span className={sig.hit ? "text-google-green" : "text-google-red"}>{sig.hit ? "ok" : "falta"}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
