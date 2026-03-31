import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RobotDetail, ChatMessageOut } from "@/types/api";

type Event = {
  ts: number;
  title: string;
  desc?: string;
  tone: "blue" | "green" | "yellow" | "red";
};

function toTs(iso: string) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

export function RobotTimeline({
  robot,
  messages,
  localEdits,
}: {
  robot: RobotDetail;
  messages: ChatMessageOut[];
  localEdits: Array<{ at: number; what: string }>;
}) {
  const events: Event[] = [];

  events.push({
    ts: toTs(robot.created_at),
    title: "Robô criado",
    desc: `Base inicial do robô: ${robot.title}`,
    tone: "green",
  });

  const lastMsg = messages[messages.length - 1];
  if (lastMsg) {
    events.push({
      ts: toTs(lastMsg.created_at),
      title: "Última interação",
      desc: `Última mensagem: ${lastMsg.role === "user" ? "usuário" : "robô"}`,
      tone: "blue",
    });
  }

  if (messages.length) {
    const first = messages[0];
    events.push({
      ts: toTs(first.created_at),
      title: "Primeiro chat",
      desc: "Conversas iniciadas.",
      tone: "yellow",
    });
  }

  for (const e of localEdits) {
    events.push({
      ts: e.at,
      title: "Edição salva",
      desc: e.what,
      tone: "blue",
    });
  }

  events.sort((a, b) => a.ts - b.ts);

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>Neuroplasticidade</CardTitle>
        <CardDescription>Como o robô se adapta com suas interações (criação, conversas e edições).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((e, idx) => (
          <div key={idx} className="flex items-start gap-3 rounded-2xl border bg-background/40 p-4 shadow-soft">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-google-blue/70" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.tone}>{e.title}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString("pt-BR")}</span>
              </div>
              {e.desc ? <div className="mt-1 text-xs text-muted-foreground">{e.desc}</div> : null}
            </div>
          </div>
        ))}
        {!events.length ? <div className="text-sm text-muted-foreground">Sem eventos ainda.</div> : null}
      </CardContent>
    </Card>
  );
}
