import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Upload, Video, X, Youtube, Image as ImageIcon, Tag, Globe2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";

export type YouTubePublishValues = {
  title: string;
  description: string;
  privacyStatus: "private" | "public" | "unlisted";
  madeForKids: boolean;
  tags: string;
  categoryId: string;
  videoFile: File | null;
  thumbnailFile: File | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTitle: string;
  initialDescription: string;
  onPublish: (values: YouTubePublishValues) => void | Promise<void>;
  loading: boolean;
};

const defaultValues = (initialTitle: string, initialDescription: string): YouTubePublishValues => ({
  title: initialTitle,
  description: initialDescription,
  privacyStatus: "private",
  madeForKids: false,
  tags: "",
  categoryId: "22",
  videoFile: null,
  thumbnailFile: null,
});

export function YouTubePublishModal({ isOpen, onClose, initialTitle, initialDescription, onPublish, loading }: Props) {
  const { user } = useAuthStore();
  const [values, setValues] = useState<YouTubePublishValues>(defaultValues(initialTitle, initialDescription));
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(defaultValues(initialTitle, initialDescription));
    setLocalSubmitting(false);
  }, [isOpen, initialTitle, initialDescription]);

  const videoUrl = useMemo(() => (values.videoFile ? URL.createObjectURL(values.videoFile) : ""), [values.videoFile]);
  const thumbnailUrl = useMemo(() => (values.thumbnailFile ? URL.createObjectURL(values.thumbnailFile) : ""), [values.thumbnailFile]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl, videoUrl]);

  const isBusy = loading || localSubmitting;
  const canPublish = Boolean(values.title.trim() && values.videoFile);
  const channelTitle = user?.youtube_channel_title || user?.youtube_channel_handle || "Seu canal";

  const handlePublish = async () => {
    if (isBusy || !canPublish) return;
    setLocalSubmitting(true);
    try {
      await Promise.resolve(onPublish(values));
    } finally {
      setLocalSubmitting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={isBusy ? undefined : onClose}>
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-border bg-muted/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF0033] shadow-sm">
              <Youtube className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Pré-visualização do vídeo no YouTube</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Escolha o vídeo, thumbnail e ajuste os dados antes de publicar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isBusy} className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-[420px] bg-[#0b0b0d] p-6 md:p-8 flex items-center justify-center">
            <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#18181b] shadow-2xl">
              <div className="aspect-video overflow-hidden bg-black flex items-center justify-center">
                {videoUrl ? (
                  <video src={videoUrl} controls className="h-full w-full bg-black" />
                ) : thumbnailUrl ? (
                  <img src={thumbnailUrl} alt="Thumbnail" className="h-full w-full object-cover" />
                ) : (
                  <div className="px-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
                    <Video className="h-10 w-10" />
                    <p className="text-sm">Selecione o arquivo do vídeo para visualizar a prévia do player.</p>
                  </div>
                )}
              </div>

              <div className="space-y-4 p-5 text-white">
                <div className="text-lg font-semibold leading-snug">{values.title || "Seu título aparecerá aqui"}</div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF0033] text-sm font-bold text-white">
                    {(channelTitle || "C").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{channelTitle}</div>
                    <div className="text-xs text-zinc-400">{values.privacyStatus === "public" ? "Público" : values.privacyStatus === "unlisted" ? "Não listado" : "Privado"}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-300 whitespace-pre-wrap min-h-[140px]">
                  {values.description || "A descrição do vídeo aparecerá aqui."}
                </div>
                {(values.tags.trim() || thumbnailUrl) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Tags</div>
                      {values.tags.trim() || "Nenhuma tag informada"}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Thumbnail</div>
                      {thumbnailUrl ? <img src={thumbnailUrl} alt="Thumbnail" className="h-24 w-full rounded-xl object-cover" /> : "Nenhuma thumbnail selecionada"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5 overflow-y-auto bg-background p-5 md:p-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Título do vídeo</label>
              <input value={values.title} onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/30" placeholder="Título do vídeo" maxLength={100} />
              <div className="text-right text-xs text-muted-foreground">{values.title.length}/100</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Descrição</label>
              <textarea value={values.description} onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))} className="min-h-[180px] w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/30" placeholder="Descrição do vídeo..." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Arquivo de vídeo</label>
                <label className="flex min-h-[126px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-5 text-center">
                  <Upload className="h-6 w-6 text-red-500" />
                  <span className="text-sm text-foreground">Clique para escolher o vídeo</span>
                  <span className="text-xs text-muted-foreground">Aceita os formatos suportados pelo YouTube</span>
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => setValues((prev) => ({ ...prev, videoFile: e.target.files?.[0] || null }))} />
                </label>
                <div className="text-xs text-muted-foreground truncate">{values.videoFile?.name || "Nenhum vídeo selecionado."}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Thumbnail opcional</label>
                <label className="flex min-h-[126px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-5 text-center">
                  <ImageIcon className="h-6 w-6 text-red-500" />
                  <span className="text-sm text-foreground">Clique para escolher a thumbnail</span>
                  <span className="text-xs text-muted-foreground">PNG, JPG ou imagem compatível</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setValues((prev) => ({ ...prev, thumbnailFile: e.target.files?.[0] || null }))} />
                </label>
                <div className="text-xs text-muted-foreground truncate">{values.thumbnailFile?.name || "Nenhuma thumbnail selecionada."}</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Privacidade</label>
                <div className="relative">
                  <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select value={values.privacyStatus} onChange={(e) => setValues((prev) => ({ ...prev, privacyStatus: e.target.value as YouTubePublishValues['privacyStatus'] }))} className="w-full rounded-2xl border border-border bg-card pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/30">
                    <option value="private">Privado</option>
                    <option value="unlisted">Não listado</option>
                    <option value="public">Público</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Categoria</label>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={values.categoryId} onChange={(e) => setValues((prev) => ({ ...prev, categoryId: e.target.value }))} className="w-full rounded-2xl border border-border bg-card pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/30" placeholder="22" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Tags</label>
              <div className="relative">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={values.tags} onChange={(e) => setValues((prev) => ({ ...prev, tags: e.target.value }))} className="w-full rounded-2xl border border-border bg-card pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/30" placeholder="google ads, inteligencia artificial, marketing" />
              </div>
              <p className="text-xs text-muted-foreground">Separe as tags por vírgula.</p>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground">
              <input type="checkbox" checked={values.madeForKids} onChange={(e) => setValues((prev) => ({ ...prev, madeForKids: e.target.checked }))} />
              Este conteúdo é destinado para crianças
            </label>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={isBusy}>Cancelar</Button>
              <Button type="button" className="rounded-xl bg-[#FF0033] hover:bg-[#e0002d]" onClick={() => void handlePublish()} disabled={!canPublish || isBusy}>
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
                Publicar no YouTube
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
