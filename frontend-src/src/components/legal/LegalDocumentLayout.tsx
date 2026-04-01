import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/constants/app";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalDocumentLayoutProps {
  badge: string;
  title: string;
  summary: string;
  updatedAt: string;
  sections: LegalSection[];
  relatedLinks?: Array<{ href: string; label: string }>;
}

export default function LegalDocumentLayout({
  badge,
  title,
  summary,
  updatedAt,
  sections,
  relatedLinks = [],
}: LegalDocumentLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10%] top-[-15%] h-[34rem] w-[34rem] rounded-full bg-[rgba(0,200,232,0.10)] blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[28rem] w-[28rem] rounded-full bg-google-green/10 blur-[140px]"
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Voltar para o início
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="blue" className="rounded-full px-3 py-1">
              {APP_NAME}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-zinc-300">
              Documento público
            </Badge>
          </div>
        </div>

        <section className="rounded-[32px] border border-border/60 bg-card/70 p-6 shadow-card backdrop-blur md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-4 rounded-full px-3 py-1 text-zinc-300">
                {badge}
              </Badge>
              <h1 className="text-balance text-3xl font-bold tracking-tight md:text-5xl">{title}</h1>
              <p className="mt-4 max-w-3xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
                {summary}
              </p>
            </div>

            <Card variant="glass" className="min-w-[240px] rounded-3xl border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[rgba(0,200,232,0.10)] p-3">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Última atualização</p>
                    <p className="text-sm text-white">{updatedAt}</p>
                  </div>
                </div>

                {relatedLinks.length ? (
                  <div className="mt-5 border-t border-border/60 pt-4">
                    <p className="mb-3 text-sm font-medium text-zinc-300">Documentos relacionados</p>
                    <div className="space-y-2">
                      {relatedLinks.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="flex items-center justify-between rounded-2xl border border-border/60 px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/5"
                        >
                          <span>{item.label}</span>
                          <ExternalLink className="h-4 w-4 text-primary" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card variant="glass" className="rounded-3xl border-border/60">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white">Base operacional</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Texto ajustado ao funcionamento observado no sistema enviado: cadastro, autenticação, robôs, chat,
                áudio, uploads, IA e integrações com redes sociais.
              </p>
            </CardContent>
          </Card>

          <Card variant="glass" className="rounded-3xl border-border/60">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white">Objetivo jurídico</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dar transparência real sobre uso da plataforma e tratamento de dados, sem depender de texto genérico
                desconectado da operação.
              </p>
            </CardContent>
          </Card>

          <Card variant="glass" className="rounded-3xl border-border/60">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white">Ponto de atenção</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Para fechamento jurídico completo, ainda vale conferir a identificação formal da controladora e o canal
                oficial de privacidade antes de publicar em produção.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4">
          {sections.map((section) => (
            <Card key={section.id} className="rounded-[28px] border-border/60 bg-card/80">
              <CardContent className="p-6 md:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-[rgba(0,200,232,0.10)] p-3">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">{section.id}</p>
                    <h2 className="text-xl font-semibold md:text-2xl">{section.title}</h2>
                  </div>
                </div>

                <div className="space-y-4 text-sm leading-7 text-zinc-200 md:text-[15px]">{section.content}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <footer className="pb-6 text-center text-sm text-zinc-400">
          <p>
            {APP_NAME} — documento público de referência contratual e de privacidade, aplicável ao uso da plataforma e
            das funcionalidades disponibilizadas no domínio e nos canais oficiais do serviço.
          </p>
        </footer>
      </main>
    </div>
  );
}