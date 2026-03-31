import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Instagram, MapPin, Users, MessageCircle, Images, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";

export type InstagramPublishValues = {
  caption: string;
  imageUrl: string;
  carouselImages: string[];
  collaborators: string[];
  locationId: string;
  firstComment: string;
  shareToFeed: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialCaption: string;
  onPublish: (values: InstagramPublishValues) => void | Promise<void>;
  loading: boolean;
};

const defaultValues = (initialCaption: string): InstagramPublishValues => ({
  caption: initialCaption,
  imageUrl: "",
  carouselImages: [],
  collaborators: [],
  locationId: "",
  firstComment: "",
  shareToFeed: true,
});

function parseLinesOrComma(value: string): string[] {
  return value
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);
}

export function InstagramPublishModal({ isOpen, onClose, initialCaption, onPublish, loading }: Props) {
  const { user } = useAuthStore();
  const [values, setValues] = useState<InstagramPublishValues>(defaultValues(initialCaption));
  const [carouselInput, setCarouselInput] = useState("");
  const [collaboratorsInput, setCollaboratorsInput] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(defaultValues(initialCaption));
    setCarouselInput("");
    setCollaboratorsInput("");
    setLocalSubmitting(false);
  }, [isOpen, initialCaption]);

  const previewImages = useMemo(() => {
    const images = values.carouselImages.filter(Boolean);
    if (images.length > 0) return images;
    if (values.imageUrl.trim()) return [values.imageUrl.trim()];
    return [];
  }, [values.carouselImages, values.imageUrl]);

  const canPublish = Boolean(values.caption.trim() && previewImages.length > 0);
  const isBusy = loading || localSubmitting;
  const initials = user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "U";
  const displayName = user?.instagram_username ? `@${user.instagram_username}` : "@seuinstagram";

  const applyCarousel = () => {
    const parsed = parseLinesOrComma(carouselInput);
    setValues((prev) => ({
      ...prev,
      carouselImages: parsed,
    }));
  };

  const applyCollaborators = () => {
    const parsed = collaboratorsInput
      .split(",")
      .map((item) => item.trim().replace(/^@/, ""))
      .filter(Boolean);
    setValues((prev) => ({
      ...prev,
      collaborators: parsed,
    }));
  };

  const handlePublishClick = async () => {
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
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={isBusy ? undefined : onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border bg-muted/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 shadow-sm">
              <Instagram className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Pré-visualização do Post no Instagram</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Edite legenda, mídia e opções antes de publicar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isBusy} className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
          <div className="min-h-[420px] bg-[#0d0d12] p-6 md:p-8 flex items-center justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 text-sm font-bold text-white">
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-none text-white">{displayName}</div>
                    <div className="mt-1 text-[11px] text-zinc-400">Agora</div>
                  </div>
                </div>
                <button type="button" className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-500">
                  Visual
                </button>
              </div>

              <div className="relative aspect-square overflow-hidden bg-zinc-900 flex items-center justify-center">
                {previewImages.length > 0 ? (
                  <img src={previewImages[0]} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="px-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
                    <Images className="h-10 w-10" />
                    <p className="text-sm">Cole a URL da imagem principal ou adicione imagens do carrossel para pré-visualizar.</p>
                  </div>
                )}
                {previewImages.length > 1 && (
                  <div className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                    1/{previewImages.length}
                  </div>
                )}
              </div>

              <div className="space-y-3 px-4 py-3 text-white">
                <div className="flex items-center gap-4 text-zinc-200">
                  <Instagram className="h-5 w-5" />
                  <MessageCircle className="h-5 w-5" />
                  <Send className="h-5 w-5" />
                </div>
                <div className="text-xs text-zinc-500">Legenda</div>
                <div className="min-h-[120px] whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                  <span className="mr-2 font-semibold">{displayName}</span>
                  {values.caption || "Sua legenda aparecerá aqui."}
                </div>
                {values.firstComment.trim() && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Primeiro comentário</div>
                    {values.firstComment}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5 overflow-y-auto bg-background p-5 md:p-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Legenda</label>
              <textarea
                value={values.caption}
                onChange={(e) => setValues((prev) => ({ ...prev, caption: e.target.value }))}
                className="min-h-[180px] w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                placeholder="Escreva a legenda do post..."
              />
              <div className="text-right text-xs text-muted-foreground">{values.caption.length}/2200</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Imagem principal</label>
              <input
                value={values.imageUrl}
                onChange={(e) => setValues((prev) => ({ ...prev, imageUrl: e.target.value }))}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                placeholder="https://seusite.com/imagem.jpg"
              />
              <p className="text-xs text-muted-foreground">Use uma URL pública acessível pela internet.</p>
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Images className="h-4 w-4 text-pink-500" /> Carrossel opcional
              </div>
              <textarea
                value={carouselInput}
                onChange={(e) => setCarouselInput(e.target.value)}
                className="min-h-[110px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                placeholder={`Uma URL por linha\nhttps://site.com/1.jpg\nhttps://site.com/2.jpg`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Se preencher duas ou mais imagens, o backend publica como carrossel.</p>
                <Button type="button" variant="outline" className="rounded-xl" onClick={applyCarousel} disabled={isBusy}>
                  Aplicar carrossel
                </Button>
              </div>
              {values.carouselImages.length > 0 && (
                <div className="text-xs text-muted-foreground">{values.carouselImages.length} imagem(ns) pronta(s) para o carrossel.</div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-pink-500" /> Colaboradores
                </label>
                <input
                  value={collaboratorsInput}
                  onChange={(e) => setCollaboratorsInput(e.target.value)}
                  onBlur={applyCollaborators}
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                  placeholder="usuario1, usuario2"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-pink-500" /> Location ID
                </label>
                <input
                  value={values.locationId}
                  onChange={(e) => setValues((prev) => ({ ...prev, locationId: e.target.value }))}
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                  placeholder="Opcional. Ex: 213385402"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageCircle className="h-4 w-4 text-pink-500" /> Primeiro comentário
              </label>
              <textarea
                value={values.firstComment}
                onChange={(e) => setValues((prev) => ({ ...prev, firstComment: e.target.value }))}
                className="min-h-[90px] w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/30"
                placeholder="Opcional. Use isso para hashtags ou CTA extra."
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-muted/10 p-4 flex items-center justify-end gap-3">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={isBusy} className="rounded-xl text-base">
            Voltar a Editar
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handlePublishClick}
            disabled={isBusy || !canPublish}
            className="rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 px-8 text-base text-white shadow-md hover:opacity-95"
          >
            {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Instagram className="mr-2 h-5 w-5" />}
            {isBusy ? "Publicando..." : "Publicar no Instagram"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
