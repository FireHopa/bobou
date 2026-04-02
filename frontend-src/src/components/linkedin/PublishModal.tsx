import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Globe2, Linkedin, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";
import type { LinkedInPublishPayload, LinkedInPublishMode } from "@/services/linkedin";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  onPublish: (payload: LinkedInPublishPayload) => void | Promise<void>;
  loading: boolean;
};

type FormValues = {
  mode: LinkedInPublishMode;
  text: string;
  articleTitle: string;
  articleUrl: string;
  articleDescription: string;
};

function buildInitialValues(initialText: string): FormValues {
  return {
    mode: "feed",
    text: initialText,
    articleTitle: "",
    articleUrl: "",
    articleDescription: "",
  };
}

export function PublishModal({ isOpen, onClose, initialText, onPublish, loading }: Props) {
  const { user } = useAuthStore();
  const [values, setValues] = useState<FormValues>(buildInitialValues(initialText));
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(buildInitialValues(initialText));
    setLocalSubmitting(false);
  }, [isOpen, initialText]);

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "U";
  const displayName = user?.name || "Usuário do LinkedIn";
  const isBusy = loading || localSubmitting;

  const trimmedText = values.text.trim();
  const trimmedArticleTitle = values.articleTitle.trim();
  const trimmedArticleUrl = values.articleUrl.trim();
  const trimmedArticleDescription = values.articleDescription.trim();

  const canPublish = useMemo(() => {
    if (values.mode === "feed") return Boolean(trimmedText);
    return Boolean(trimmedArticleTitle && trimmedArticleUrl);
  }, [trimmedArticleTitle, trimmedArticleUrl, trimmedText, values.mode]);

  const publishLabel = values.mode === "article" ? "Publicar artigo" : "Publicar no feed";
  const textPlaceholder =
    values.mode === "article"
      ? "Escreva um texto de apoio para acompanhar o artigo (opcional)."
      : "Escreva o texto que será publicado no feed.";

  const handlePublishClick = async () => {
    if (!canPublish || isBusy) return;

    const payload: LinkedInPublishPayload =
      values.mode === "article"
        ? {
            mode: "article",
            text: trimmedText,
            article: {
              title: trimmedArticleTitle,
              url: trimmedArticleUrl,
              ...(trimmedArticleDescription ? { description: trimmedArticleDescription } : {}),
            },
          }
        : {
            mode: "feed",
            text: trimmedText,
          };

    setLocalSubmitting(true);
    try {
      await Promise.resolve(onPublish(payload));
    } finally {
      setLocalSubmitting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 sm:p-6 lg:p-8 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200 sm:h-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2] shadow-sm">
              <Linkedin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Publicar no LinkedIn</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Escolha se o conteúdo vai para o feed ou como artigo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
            disabled={isBusy}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid flex-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValues((prev) => ({ ...prev, mode: "feed" }))}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  values.mode === "feed"
                    ? "border-[#0A66C2] bg-[#0A66C2]/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-sm font-semibold">Feed</div>
                <div className="mt-1 text-xs">Publicação normal do LinkedIn.</div>
              </button>

              <button
                type="button"
                onClick={() => setValues((prev) => ({ ...prev, mode: "article" }))}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  values.mode === "article"
                    ? "border-[#0A66C2] bg-[#0A66C2]/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-sm font-semibold">Artigo</div>
                <div className="mt-1 text-xs">Post com link, título e resumo.</div>
              </button>
            </div>

            {values.mode === "article" ? (
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Título do artigo</label>
                  <input
                    value={values.articleTitle}
                    onChange={(e) => setValues((prev) => ({ ...prev, articleTitle: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-[#0A66C2]"
                    placeholder="Ex.: Guia prático para..."
                    maxLength={400}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">URL do artigo</label>
                  <input
                    value={values.articleUrl}
                    onChange={(e) => setValues((prev) => ({ ...prev, articleUrl: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-[#0A66C2]"
                    placeholder="https://..."
                    inputMode="url"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Resumo</label>
                  <textarea
                    value={values.articleDescription}
                    onChange={(e) => setValues((prev) => ({ ...prev, articleDescription: e.target.value }))}
                    className="min-h-[112px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-[#0A66C2]"
                    placeholder="Resumo curto para o card do artigo."
                    maxLength={4086}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-background/70 p-3 text-sm text-muted-foreground">
                O feed usa somente o texto da publicação.
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col bg-muted/30 p-4 sm:p-6">
            <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-md">
              <div className="flex items-center gap-4 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white shadow-inner">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-tight text-foreground">
                    {displayName}
                  </div>
                  <div className="mt-1 text-sm leading-tight text-muted-foreground">
                    Agora <span className="mx-1">•</span>
                    <Globe2 className="inline h-3.5 w-3.5" />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
                <div className="space-y-4">
                  <textarea
                    value={values.text}
                    onChange={(e) => setValues((prev) => ({ ...prev, text: e.target.value }))}
                    className="min-h-[220px] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none"
                    placeholder={textPlaceholder}
                  />

                  {values.mode === "article" && (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {trimmedArticleTitle || "Título do artigo"}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {trimmedArticleUrl || "https://seu-artigo.com"}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {trimmedArticleDescription || "O resumo do artigo aparecerá aqui na prévia."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {values.mode === "article"
                  ? "Artigo publicado com link, título e resumo."
                  : "Publicação simples no feed do LinkedIn."}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/10 p-4 shrink-0">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={isBusy} className="rounded-xl text-base">
            Cancelar
          </Button>
          <Button
            size="lg"
            onClick={handlePublishClick}
            disabled={isBusy || !canPublish}
            className="rounded-xl bg-[#0A66C2] px-8 text-base text-white shadow-md hover:bg-[#004182]"
          >
            {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            {isBusy ? "Publicando..." : publishLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
