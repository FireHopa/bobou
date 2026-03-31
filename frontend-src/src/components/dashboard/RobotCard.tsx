import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { RobotOut } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

function initials(title: string) {
  return (title || "AR")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function toneFrom(robot: RobotOut): "blue" | "red" | "yellow" | "green" {
  const s = `${robot.title} ${robot.description}`.toLowerCase();
  if (/(m[eé]d|sa[uú]de|cl[ií]nica)/.test(s)) return "green";
  if (/(vendas|copy|lan[cç]amento|marketing)/.test(s)) return "red";
  if (/(jur[ií]d|advoc|finan|b2b)/.test(s)) return "blue";
  return "yellow";
}

export function RobotCard({
  robot,
  onDelete,
  deleting,
}: {
  robot: RobotOut;
  onDelete: (publicId: string) => void;
  deleting?: boolean;
}) {
  const tone = toneFrom(robot);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.base}
      whileHover={{ y: -2 }}
    >
      <Card variant="glass" className="glass-hover overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <Avatar tone={tone} className={cn("h-11 w-11", robot.avatar_data ? "ring-2 ring-google-blue/20" : "")}>
              {robot.avatar_data ? <AvatarImage src={robot.avatar_data} alt={robot.title} /> : null}
              <AvatarFallback tone={tone}>{initials(robot.title)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{robot.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {robot.description?.trim() ? robot.description : "Sem descrição (você pode ajustar depois)."}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={tone}>ativo</Badge>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">criado</Badge>
            <span className="text-xs text-muted-foreground">{new Date(robot.created_at).toLocaleString("pt-BR")}</span>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="accent" size="sm">
                <Link to={`/robots/${robot.public_id}/chat`}>Chat</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={`/robots/${robot.public_id}`}>Editar</Link>
              </Button>
            </div>

            <div className="flex gap-2 sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard?.writeText(robot.public_id)}
                title="Copiar ID público"
              >
                Copiar ID
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(robot.public_id)}
                isLoading={deleting}
                loadingLabel="Removendo…"
              >
                Remover
              </Button>
            </div>
          </div>
        </div>

        <div className="h-1 w-full bg-gradient-to-r from-google-blue/50 via-google-green/35 to-google-yellow/35" />
      </Card>
    </motion.div>
  );
}
