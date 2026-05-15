import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
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
  useRobotChatSessions,
  useCreateRobotChatSession,
  useDeleteRobotChatSession,
} from "@/hooks/useRobotMessages";
import { transitions } from "@/lib/motion";
import { toastApiError } from "@/lib/toast";
import { cn } from "@/lib/utils";

function toAvatarSrc(avatarData?: string | null) {
  if (!avatarData) return undefined;
  if (avatarData.startsWith("data:")) return avatarData;
  return `data:image/png;base64,${avatarData}`;
}

function formatSessionDate(value?: string) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

export function RobotChatPage() {
  const { publicId = "" } = useParams();

  const robot = useRobot(publicId);
  const chatSessions = useRobotChatSessions(publicId);
  const createChatSession = useCreateRobotChatSession(publicId);
  const deleteChatSession = useDeleteRobotChatSession(publicId);
  const [activeSessionId, setActiveSessionId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const sessions = chatSessions.data || [];
    if (!sessions.length) return;
    if (!activeSessionId || !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, chatSessions.data]);

  const msgs = useRobotMessages(publicId, activeSessionId);
  const chat = useRobotChat(publicId, activeSessionId);
  const audio = useRobotAudioChat(publicId, activeSessionId);
  const clear = useClearRobotMessages(publicId, activeSessionId);

  const { containerRef, endRef, isPinned, scrollToBottom } = useAutoScroll<HTMLDivElement>();

  const [text, setText] = React.useState("");
  const [phase, setPhase] = React.useState<null | "thinking" | "analyzing" | "insights">(null);

  const busy = chat.isPending || audio.isPending || createChatSession.isPending;
  const activeSessionReady = Boolean(activeSessionId);

  const assistantAvatarSrc = toAvatarSrc(robot.data?.avatar_data);
  const assistantLabel = robot.data?.title ?? "Robô";

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

  React.useEffect(() => {
    if (!msgs.data) return;
    if (isPinned) scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.data?.length]);

  const onCreateNewChat = async () => {
    try {
      const next = await createChatSession.mutateAsync("Novo chat");
      setActiveSessionId(next.id);
      setText("");
    } catch (e) {
      toastApiError(e, "Falha ao criar novo chat");
    }
  };

  const onDeleteChat = async (sessionId: number) => {
    const sessions = chatSessions.data || [];
    const nextSession = sessions.find((session) => session.id !== sessionId) || null;
    try {
      await deleteChatSession.mutateAsync(sessionId);
      if (activeSessionId === sessionId) setActiveSessionId(nextSession?.id ?? null);
    } catch (e) {
      toastApiError(e, "Falha ao excluir chat");
    }
  };

  const onSend = async () => {
    const message = text.trim();
    if (!message || !activeSessionReady) return;

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
    if (!activeSessionReady) return;
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
          <div className="h-1 w-full bg-gradient-to-r from-google-blue via-google-red to-google-green" />
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Chat</Badge>
                  <ChatStatus phase={phase} />
                </div>
                <CardTitle className="mt-2 text-2xl">{assistantLabel}</CardTitle>
                <CardDescription>
                  Crie novos chats, mantenha históricos separados e volte em conversas anteriores quando precisar.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to={`/robots/${publicId}`}>Detalhe</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button variant="destructive" onClick={onClear} isLoading={clear.isPending} loadingLabel="Limpando…" disabled={!activeSessionReady}>
                  Limpar chat atual
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="rounded-2xl border bg-background/55 p-3 shadow-soft">
                <Button className="w-full rounded-xl" variant="accent" onClick={onCreateNewChat} isLoading={createChatSession.isPending} loadingLabel="Criando…">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo chat
                </Button>

                <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                  {chatSessions.isLoading ? (
                    <div className="space-y-2">
                      <div className="h-12 animate-pulse rounded-xl bg-foreground/10" />
                      <div className="h-12 animate-pulse rounded-xl bg-foreground/10" />
                    </div>
                  ) : (chatSessions.data?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Nenhum chat salvo ainda.
                    </div>
                  ) : (
                    chatSessions.data!.map((session) => {
                      const active = session.id === activeSessionId;
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                            active ? "border-google-blue/50 bg-google-blue/10 shadow-soft" : "border-border/70 bg-card/60 hover:bg-theme-accent-soft"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveSessionId(session.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", active ? "bg-google-blue text-white" : "bg-muted text-muted-foreground")}>
                              <MessageSquare className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-foreground">{session.title || "Novo chat"}</span>
                              <span className="block truncate text-xs text-muted-foreground">{formatSessionDate(session.updated_at)}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-70 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                            title="Excluir chat"
                            onClick={() => void onDeleteChat(session.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>

              <div className="min-w-0 space-y-4">
                <SuggestionChips onPick={(t) => setText((p) => (p ? `${p}\n${t}` : t))} disabled={busy || !activeSessionReady} />

                <div ref={containerRef} className="glass h-[58vh] overflow-y-auto rounded-2xl border p-4 shadow-soft">
                  {!activeSessionReady || msgs.isLoading ? (
                    <ChatSkeleton />
                  ) : msgs.isError ? (
                    <div className="text-sm text-muted-foreground">Falha ao carregar mensagens. Verifique o backend.</div>
                  ) : (msgs.data?.length ?? 0) === 0 ? (
                    <div className="grid h-full place-items-center">
                      <div className="max-w-md text-center">
                        <div className="text-sm font-semibold">Comece este chat com uma pergunta.</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Cada conversa fica salva separadamente no histórico deste agente.
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

                <ChatComposer value={text} onChange={setText} onSend={onSend} onSendAudio={onSendAudio} busy={busy || !activeSessionReady} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default RobotChatPage;
