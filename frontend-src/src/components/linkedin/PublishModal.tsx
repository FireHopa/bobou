import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Globe2, Linkedin, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";
import type { LinkedInPublishPayload } from "@/services/linkedin";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  onPublish: (payload: LinkedInPublishPayload) => void | Promise<void>;
  loading: boolean;
};

type FormValues = {
  text: string;
};

function buildInitialValues(initialText: string): FormValues {
  return {
    text: initialText,
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
  const canPublish = useMemo(() => Boolean(trimmedText), [trimmedText]);

  const handlePublishClick = async () => {
    if (!canPublish || isBusy) return;

    const payload: LinkedInPublishPayload = {
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
              <p className="mt-0.5 text-sm text-muted-foreground">Publicação simples no feed do LinkedIn.</p>
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
            <div className="rounded-xl border border-[#0A66C2]/30 bg-[#0A66C2]/10 p-4 text-sm text-foreground">
              <div className="font-semibold">Feed</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Esta tela envia somente texto para o feed do LinkedIn.</div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-muted/30 p-4 sm:p-6">
            <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-md">
              <div className="flex items-center gap-4 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white shadow-inner">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-tight text-foreground">{displayName}</div>
                  <div className="mt-1 text-sm leading-tight text-muted-foreground">
                    Agora <span className="mx-1">•</span>
                    <Globe2 className="inline h-3.5 w-3.5" />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
                <textarea
                  value={values.text}
                  onChange={(e) => setValues((prev) => ({ ...prev, text: e.target.value }))}
                  className="min-h-[320px] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none"
                  placeholder="Escreva o texto que será publicado no feed."
                />
              </div>

              <div className="mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground">
                Publicação simples no feed do LinkedIn.
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
            {isBusy ? "Publicando..." : "Publicar no feed"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
