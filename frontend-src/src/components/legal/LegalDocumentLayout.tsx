import * as React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, FileText, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants/app";

type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type LegalDocumentLayoutProps = {
  badge: string;
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
  complementaryHref: string;
  complementaryLabel: string;
};

function LegalSectionBlock({ index, section }: { index: number; section: LegalSection }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-card">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-google-blue/10 text-sm font-semibold text-google-blue">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{section.title}</h2>

          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-muted-foreground md:text-[15px]">
              {paragraph}
            </p>
          ))}

          {section.bullets?.length ? (
            <ul className="space-y-2 pl-5 text-sm leading-7 text-muted-foreground md:text-[15px]">
              {section.bullets.map((item) => (
                <li key={item} className="list-disc">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function LegalDocumentLayout({
  badge,
  title,
  description,
  lastUpdated,
  sections,
  complementaryHref,
  complementaryLabel,
}: LegalDocumentLayoutProps) {
  React.useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;
  }, [title]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10%] top-[-20%] h-[38rem] w-[38rem] rounded-full bg-google-blue/10 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-18%] right-[-10%] h-[34rem] w-[34rem] rounded-full bg-google-green/10 blur-[140px]"
      />

      <main className="container py-10 md:py-14">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" className="justify-start rounded-full px-4">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao início
              </Link>
            </Button>

            <Button asChild variant="outline" className="rounded-full px-4">
              <Link to={complementaryHref}>
                <ExternalLink className="h-4 w-4" />
                {complementaryLabel}
              </Link>
            </Button>
          </div>

          <Card variant="glass" className="overflow-hidden border-border/80">
            <CardContent className="space-y-6 p-8 md:p-10">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-google-blue/20 bg-google-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-google-blue">
                {badge === "Política de Privacidade" ? (
                  <ShieldCheck className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {badge}
              </div>

              <div className="space-y-4">
                <h1 className="text-balance text-4xl font-extrabold tracking-tight md:text-5xl">{title}</h1>
                <p className="max-w-3xl text-pretty text-base leading-8 text-muted-foreground md:text-lg">
                  {description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-google-blue">Aplicação</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Este documento rege o uso da plataforma {APP_NAME}, dos seus recursos, integrações e serviços
                    relacionados disponibilizados pela web.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-google-blue">Última atualização</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{lastUpdated}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {sections.map((section, index) => (
              <LegalSectionBlock key={section.title} index={index} section={section} />
            ))}
          </div>

          <Card className="border-border/70">
            <CardContent className="space-y-3 p-6">
              <p className="text-sm font-semibold text-foreground">Canal para solicitações legais e exercício de direitos</p>
              <p className="text-sm leading-7 text-muted-foreground">
                Solicitações relacionadas a estes documentos, proteção de dados, notificações ou dúvidas sobre uso da
                plataforma devem ser encaminhadas pelos canais oficiais informados no site e no ambiente autenticado da
                aplicação.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export type { LegalSection };
