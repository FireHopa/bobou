import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Particles } from "@/components/effects/Particles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { ChatSkeleton } from "@/components/chat/ChatSkeleton";
import { ChatStatus } from "@/components/chat/ChatStatus";
import { useRobot } from "@/hooks/useRobots";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import {
  useRobotMessages,
  useRobotChat,
  useRobotAudioChat,
  useClearRobotMessages,
} from "@/hooks/useRobotMessages";
import { transitions } from "@/lib/motion";
import { toastApiError } from "@/lib/toast";

function toAvatarSrc(avatarData?: string | null) {
  if (!avatarData) return undefined;
  if (avatarData.startsWith("data:")) return avatarData;
  // assume raw base64
  return `data:image/png;base64,${avatarData}`;
}

export function RobotChatPage() {
  const { publicId = "" } = useParams();

  const robot = useRobot(publicId);
  const msgs = useRobotMessages(publicId);
  const chat = useRobotChat(publicId);
  const audio = useRobotAudioChat(publicId);
  const clear = useClearRobotMessages(publicId);

  const { containerRef, endRef, isPinned, scrollToBottom } = useAutoScroll<HTMLDivElement>();

  const [text, setText] = React.useState("");
  const [phase, setPhase] = React.useState<null | "thinking" | "analyzing" | "insights">(null);

  const busy = chat.isPending || audio.isPending;

  const assistantAvatarSrc = toAvatarSrc(robot.data?.avatar_data);
  const assistantLabel = robot.data?.title ?? "Robô";

  // status phase cycling when busy
  React.useEffect(() => {
    if (!busy) {
      setPhase(null);
      return;
    }
    const phases: Array<"thinking" | "analyzing" | "insights"> = ["thinking", "analyzing", "insights"];
    let i = 0;
    setPhase(phases[i]);
    const id = window.setInterval(() => {
      i = (i + 1) % phases.length;
      setPhase(phases[i]);
    }, 1400);
    return () => window.clearInterval(id);
  }, [busy]);

  // auto scroll on new messages if pinned
  React.useEffect(() => {
    if (!msgs.data) return;
    if (isPinned) scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.data?.length]);

  const onSend = async () => {
    const message = text.trim();
    if (!message) return;

    setText("");

    try {
      await chat.mutateAsync({ message });
      if (isPinned) scrollToBottom();
    } catch (e) {
      toastApiError(e, "Falha ao enviar");
      setText(message);
    }
  };

  const onSendAudio = async (file: File) => {
    try {
      await audio.mutateAsync(file);
      if (isPinned) scrollToBottom();
    } catch (e) {
      toastApiError(e, "Falha ao enviar áudio");
    }
  };

  const onClear = () => clear.mutate();

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
      <Particles />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transitions.base} className="space-y-6">
        <Card variant="glass" className="overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-google-blue/60 via-google-green/40 to-google-yellow/40" />
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Chat</Badge>
                                    <ChatStatus phase={phase} />
                </div>
                <CardTitle className="mt-2 text-2xl">{assistantLabel}</CardTitle>
                <CardDescription>
                  Pergunte, refine e deixe o robô mais “citável”.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to={`/robots/${publicId}`}>Detalhe</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button variant="destructive" onClick={onClear} isLoading={clear.isPending} loadingLabel="Limpando…">
                  Limpar
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <SuggestionChips onPick={(t) => setText((p) => (p ? `${p}\n${t}` : t))} disabled={busy} />

            <div ref={containerRef} className="glass h-[52vh] overflow-y-auto rounded-2xl border p-4 shadow-soft">
              {msgs.isLoading ? (
                <ChatSkeleton />
              ) : msgs.isError ? (
                <div className="text-sm text-muted-foreground">Falha ao carregar mensagens. Verifique o backend.</div>
              ) : (msgs.data?.length ?? 0) === 0 ? (
                <div className="grid h-full place-items-center">
                  <div className="max-w-md text-center">
                    <div className="text-sm font-semibold">Comece com uma pergunta.</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Dica: use os chips acima para disparar respostas em formato citável.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {msgs.data!.map((m) => (
                    <ChatBubble
                      key={m.id}
                      msg={m}
                      assistantAvatarSrc={assistantAvatarSrc}
                      assistantLabel={assistantLabel}
                    />
                  ))}

                  {busy ? (
                    <div className="flex justify-start">
                      <div className="glass w-[72%] rounded-2xl border p-4 shadow-soft">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/10" />
                        <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-foreground/10" />
                        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
                      </div>
                    </div>
                  ) : null}

                  <div ref={endRef} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">{isPinned ? "Auto-scroll ativo" : "Você está vendo mensagens antigas"}</div>
              {!isPinned ? (
                <Button variant="glass" size="sm" onClick={() => scrollToBottom()}>
                  Ir para o fim
                </Button>
              ) : null}
            </div>

            <ChatComposer value={text} onChange={setText} onSend={onSend} onSendAudio={onSendAudio} busy={busy} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default RobotChatPage;
