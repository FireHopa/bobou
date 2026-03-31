import * as React from "react";
import { Trash2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Particles } from "@/components/effects/Particles";
import { AuthorityMeter } from "@/components/robot/AuthorityMeter";
import { AuthorityAssistantPhone } from "@/components/robot/AuthorityAssistantPhone";
import { RobotTimeline } from "@/components/robot/RobotTimeline";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as Tabs from "@radix-ui/react-tabs";
import { useRobot, useUpdateRobot } from "@/hooks/useRobots";
import { useRobotMessages, useClearRobotMessages } from "@/hooks/useRobotMessages";
import { useAuthorityEdits } from "@/hooks/useAuthorityEdits";
import { fileToResizedDataUrl } from "@/lib/image";
import { fadeUp } from "@/lib/motion";
import { toastApiError, toastSuccess } from "@/lib/toast";

// Importamos o componente de Uploader
import { KnowledgeUploader } from "@/components/robot/KnowledgeUploader";

function initials(title: string) {
  return (title || "ORI")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function RobotDetailPage() {
  const { publicId = "" } = useParams();
  // Adicionamos o "refetch" aqui para recarregar os dados após o upload do arquivo
  const { data: robot, isLoading, isError, error, refetch } = useRobot(publicId);
  const upd = useUpdateRobot(publicId);

  const msgs = useRobotMessages(publicId);
  const edits = useAuthorityEdits(publicId);
  const clear = useClearRobotMessages(publicId);

  const [desc, setDesc] = React.useState("");
  const [sys, setSys] = React.useState("");

  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!robot) return;
    setDesc(robot.description ?? "");
    setSys(robot.system_instructions ?? "");
    setTitleDraft(robot.title ?? "");
    setIsEditingTitle(false);
  }, [robot?.public_id]);

  const pickAvatar = () => fileRef.current?.click();

  const onAvatarFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.currentTarget.value = "";

    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 256, mime: "image/webp", quality: 0.92 });
      await upd.mutateAsync({ avatar_data: dataUrl });
      toastSuccess("Avatar atualizado.");
    } catch (err) {
      toastApiError(err, "Falha ao atualizar avatar");
    }
  };

  const clearAvatar = async () => {
    try {
      await upd.mutateAsync({ avatar_data: null });
      toastSuccess("Avatar removido.");
    } catch (err) {
      toastApiError(err, "Falha ao remover avatar");
    }
  };

  const commitTitle = async () => {
    if (!robot) return;
    const next = (titleDraft || "").trim();
    if (!next || next === (robot.title ?? "")) {
      setIsEditingTitle(false);
      setTitleDraft(robot.title ?? "");
      return;
    }
    try {
      await upd.mutateAsync({ title: next });
      setIsEditingTitle(false);
      toastSuccess("Nome do robô atualizado.");
    } catch (err) {
      toastApiError(err, "Falha ao atualizar nome");
    }
  };

  const onSaveProfile = async () => {
    try {
      await upd.mutateAsync({ description: desc });
      toastSuccess("Descrição salva.");
    } catch (err) {
      toastApiError(err, "Falha ao salvar descrição");
    }
  };

  const onSaveInstructions = async () => {
    try {
      await upd.mutateAsync({ system_instructions: sys });
      toastSuccess("Instruções salvas.");
    } catch (err) {
      toastApiError(err, "Falha ao salvar instruções");
    }
  };

  const onClearHistory = async () => {
    try {
      await clear.mutateAsync();
      toastSuccess("Histórico limpo.");
    } catch (err) {
      toastApiError(err, "Falha ao limpar histórico");
    }
  };

  if (isLoading) {
    return (
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
        <Particles />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Carregando…</CardTitle>
              <CardDescription>Buscando dados do robô.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (isError || !robot) {
    return (
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
        <Particles />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Não foi possível carregar o robô</CardTitle>
              <CardDescription>{(error as any)?.message ?? "Tente novamente."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/robots">Voltar</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const messageCount = (msgs.data as any)?.length ?? (msgs.data as any)?.messages?.length ?? 0;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
      <Particles />

      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="mx-auto max-w-6xl px-4 py-8"
      >
        <Card className="shadow-soft">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={pickAvatar}
                  className="block rounded-full focus:outline-none focus:ring-2 focus:ring-google-blue/40 disabled:opacity-60"
                  title="Clique para trocar o avatar"
                  disabled={upd.isPending}
                >
                  <Avatar tone="blue" className="h-12 w-12">
                    {robot.avatar_data ? <AvatarImage src={robot.avatar_data} alt={robot.title} /> : null}
                    <AvatarFallback tone="blue">{initials(robot.title)}</AvatarFallback>
                  </Avatar>
                </button>

                {robot.avatar_data ? (
                  <button
                    type="button"
                    onClick={() => void clearAvatar()}
                    className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background/95 shadow-soft transition hover:bg-background disabled:opacity-60"
                    title="Remover avatar"
                    aria-label="Remover avatar"
                    disabled={upd.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onAvatarFile}
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Robô</Badge>
                  <Badge variant="blue">ativo</Badge>
                  <Badge variant="outline" className="max-w-[280px] truncate">
                    {publicId}
                  </Badge>
                </div>

                {isEditingTitle ? (
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void commitTitle()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitTitle();
                      if (e.key === "Escape") {
                        setIsEditingTitle(false);
                        setTitleDraft(robot.title ?? "");
                      }
                    }}
                    autoFocus
                    className="mt-2 h-10 max-w-[520px]"
                  />
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <CardTitle
                      className="truncate text-2xl cursor-text"
                      title="Clique para editar o nome"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      {robot.title}
                    </CardTitle>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background/60 shadow-soft transition hover:bg-background"
                      title="Editar nome"
                      aria-label="Editar nome"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <CardDescription className="truncate">
                  Criado em {new Date(robot.created_at).toLocaleString("pt-BR")}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="default">
                <Link to={`/robots/${publicId}/chat`}>Abrir chat</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Perfil</CardTitle>
                <CardDescription>Edite rápido. Ajuste fino vem depois.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs.Root defaultValue="perfil">
                  <Tabs.List className="flex gap-2 rounded-2xl border bg-background/40 p-1">
                    <Tabs.Trigger
                      value="perfil"
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                    >
                      Perfil
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      value="instrucoes"
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                    >
                      Instruções
                    </Tabs.Trigger>
                    <Tabs.Trigger
                      value="neuro"
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                    >
                      Neuroplasticidade
                    </Tabs.Trigger>
                  </Tabs.List>

                  <Tabs.Content value="perfil" className="mt-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Descrição</div>
                      <Textarea
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="Descreva este robô…"
                        rows={3}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">Dica: descreva o público e a promessa em 1 linha.</div>
                        <Button onClick={() => void onSaveProfile()} disabled={upd.isPending}>
                          Salvar
                        </Button>
                      </div>
                    </div>
                  </Tabs.Content>

                  {/* ABA DE INSTRUÇÕES COM O UPLOADER EMBUTIDO */}
                  <Tabs.Content value="instrucoes" className="mt-4">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Instruções do sistema</div>
                        <Textarea
                          value={sys}
                          onChange={(e) => setSys(e.target.value)}
                          placeholder="Regras, tom, limites, exemplos…"
                          rows={8}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">Dica: escreva exemplos do que ele deve e não deve dizer.</div>
                          <Button onClick={() => void onSaveInstructions()} disabled={upd.isPending}>
                            Salvar
                          </Button>
                        </div>
                      </div>

                      {/* Uploader Complementar */}
                      <div className="pt-2 border-t border-border/40">
                        <KnowledgeUploader 
                          publicId={robot.public_id} 
                          type="robot" 
                          existingFilesJson={robot.knowledge_files_json}
                          onUploadSuccess={() => refetch()} 
                        />
                      </div>
                    </div>
                  </Tabs.Content>

                  <Tabs.Content value="neuro" className="mt-4">
                    <RobotTimeline robot={robot} messages={(msgs.data as any) ?? []} localEdits={((edits.data as any) ?? []).map((e: any) => ({ at: new Date(e.created_at).getTime(), what: `Assistente de autoridade: ${e.change}` }))} />
                  </Tabs.Content>
                </Tabs.Root>
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Histórico do chat</CardTitle>
                <CardDescription>Você pode limpar para recomeçar testes.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">Mensagens: {messageCount}</div>
                <Button variant="destructive" onClick={() => void onClearHistory()} disabled={clear.isPending}>
                  Limpar histórico
                </Button>
              </CardContent>
            </Card>

            <AuthorityMeter systemInstructions={sys} />
          </div>

          <div className="space-y-6">
            <AuthorityAssistantPhone publicId={publicId} systemInstructions={sys} onApplySystemInstructions={setSys} />

            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
                <CardDescription>Sinais rápidos para orientar melhorias.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                  <div className="text-xs text-muted-foreground">Mensagens</div>
                  <div className="mt-1 text-2xl font-semibold">{messageCount}</div>
                </div>
                <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                  <div className="text-xs text-muted-foreground">Cérebro</div>
                  <div className="mt-1 text-sm font-semibold">{sys.length.toLocaleString("pt-BR")} chars</div>
                  <div className="mt-1 text-xs text-muted-foreground">Mais estrutura = mais consistência.</div>
                </div>
                <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                  <div className="text-xs text-muted-foreground">Ação recomendada</div>
                  <div className="mt-1 text-sm font-semibold">Teste no chat</div>
                  <div className="mt-1 text-xs text-muted-foreground">Pergunte algo difícil e refine regras.</div>
                  <div className="mt-3">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/robots/${publicId}/chat`}>Abrir chat</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default RobotDetailPage;