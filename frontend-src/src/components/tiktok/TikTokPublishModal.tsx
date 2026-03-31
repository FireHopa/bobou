import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Globe2, Loader2, MessageCircleOff, Music2, Sparkles, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/state/authStore";
import type { TikTokPrivacyLevel } from "@/services/tiktok";

export type TikTokPublishValues = {
  caption: string;
  privacyLevel: TikTokPrivacyLevel;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  isAigc: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  videoCoverTimestampMs: number;
  videoFile: File | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialCaption: string;
  onPublish: (values: TikTokPublishValues) => void | Promise<void>;
  loading?: boolean;
  privacyOptions?: TikTokPrivacyLevel[];
  privacyLabels?: Record<string, string>;
  maxDurationSeconds?: number;
};

const buildDefaultValues = (initialCaption: string, privacyOptions: TikTokPrivacyLevel[]): TikTokPublishValues => ({
  caption: initialCaption,
  privacyLevel: privacyOptions[0] || "SELF_ONLY",
  disableComment: false,
  disableDuet: false,
  disableStitch: false,
  isAigc: false,
  brandContentToggle: false,
  brandOrganicToggle: false,
  videoCoverTimestampMs: 1000,
  videoFile: null,
});

export function TikTokPublishModal({
  isOpen,
  onClose,
  initialCaption,
  onPublish,
  loading,
  privacyOptions = ["SELF_ONLY"],
  privacyLabels = {},
  maxDurationSeconds = 600,
}: Props) {
  const { user } = useAuthStore();
  const [values, setValues] = useState<TikTokPublishValues>(() => buildDefaultValues(initialCaption, privacyOptions));

  useEffect(() => {
    if (isOpen) {
      setValues(buildDefaultValues(initialCaption, privacyOptions));
    }
  }, [isOpen, initialCaption, privacyOptions.join(",")]);

  const previewUrl = useMemo(() => {
    if (!values.videoFile) return "";
    return URL.createObjectURL(values.videoFile);
  }, [values.videoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const displayName = user?.tiktok_display_name || (user?.tiktok_username ? `@${user.tiktok_username}` : "Sua conta");
  const canPublish = Boolean(values.videoFile);
  const isBusy = Boolean(loading);

  const handlePublish = async () => {
    if (!canPublish || isBusy) return;
    await onPublish(values);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b14] shadow-[0_30px_80px_rgba(0,0,0,0.45)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">TikTok</div>
            <h3 className="text-xl font-semibold text-white">Pré-visualização do vídeo</h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 p-2 text-white/70 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-0 overflow-auto md:grid-cols-[420px,minmax(0,1fr)]">
          <div className="border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,0,128,0.12),_transparent_45%),radial-gradient(circle_at_bottom,_rgba(0,220,255,0.12),_transparent_40%)] p-6">
            <div className="mx-auto max-w-[300px] rounded-[34px] border border-white/10 bg-black/40 p-3 shadow-2xl">
              <div className="overflow-hidden rounded-[28px] bg-[#0f0f18]">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                    <Music2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                    <div className="truncate text-xs text-white/55">Vídeo curto com autoridade e narrativa rápida</div>
                  </div>
                </div>
                <div className="aspect-[9/16] w-full bg-black">
                  {previewUrl ? (
                    <video src={previewUrl} controls className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/55">
                      <Video className="h-10 w-10" />
                      <p className="max-w-[220px] text-sm">Selecione um vídeo para visualizar o preview da postagem.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-white/90">
                    {values.caption?.trim() || "Sua legenda vai aparecer aqui."}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
                      {privacyLabels[values.privacyLevel] || values.privacyLevel}
                    </span>
                    {values.isAigc ? <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-fuchsia-200">AIGC</span> : null}
                    {values.brandContentToggle ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200">Conteúdo de marca</span> : null}
                    {values.disableComment ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Comentários off</span> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6 text-white">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-semibold text-white">Legenda</label>
                <textarea
                  value={values.caption}
                  onChange={(e) => setValues((prev) => ({ ...prev, caption: e.target.value.slice(0, 2200) }))}
                  className="min-h-[130px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-white/35 focus:border-fuchsia-400/50"
                  placeholder="Escreva a legenda do TikTok. Você pode usar hashtags e menções."
                />
                <div className="text-xs text-white/45">{values.caption.length}/2200 caracteres</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">Vídeo</label>
                <label className="flex min-h-[128px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-center">
                  <Video className="h-6 w-6 text-fuchsia-300" />
                  <span className="text-sm text-white">Clique para escolher o vídeo</span>
                  <span className="text-xs text-white/50">MP4, WebM ou MOV</span>
                  <input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="hidden" onChange={(e) => setValues((prev) => ({ ...prev, videoFile: e.target.files?.[0] || null }))} />
                </label>
                <div className="truncate text-xs text-white/50">{values.videoFile?.name || "Nenhum vídeo selecionado."}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">Privacidade</label>
                <div className="relative">
                  <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                  <select
                    value={values.privacyLevel}
                    onChange={(e) => setValues((prev) => ({ ...prev, privacyLevel: e.target.value as TikTokPrivacyLevel }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-fuchsia-400/50"
                  >
                    {privacyOptions.map((option) => (
                      <option key={option} value={option} className="bg-[#10101a]">
                        {privacyLabels[option] || option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/55">
                  Limite atual informado pelo TikTok: até {maxDurationSeconds} segundos por vídeo para esta conta.
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.disableComment} onChange={(e) => setValues((prev) => ({ ...prev, disableComment: e.target.checked }))} />
                <MessageCircleOff className="h-4 w-4 text-white/60" />
                Desativar comentários
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.disableDuet} onChange={(e) => setValues((prev) => ({ ...prev, disableDuet: e.target.checked }))} />
                <Sparkles className="h-4 w-4 text-white/60" />
                Desativar duet
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.disableStitch} onChange={(e) => setValues((prev) => ({ ...prev, disableStitch: e.target.checked }))} />
                <BadgeCheck className="h-4 w-4 text-white/60" />
                Desativar stitch
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.isAigc} onChange={(e) => setValues((prev) => ({ ...prev, isAigc: e.target.checked }))} />
                Marcar como conteúdo gerado com IA
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.brandContentToggle} onChange={(e) => setValues((prev) => ({ ...prev, brandContentToggle: e.target.checked }))} />
                Indicar conteúdo de marca / parceria
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                <input type="checkbox" checked={values.brandOrganicToggle} onChange={(e) => setValues((prev) => ({ ...prev, brandOrganicToggle: e.target.checked }))} />
                Indicar promoção orgânica da própria marca
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Frame de capa</label>
              <input
                type="number"
                min={0}
                step={100}
                value={values.videoCoverTimestampMs}
                onChange={(e) => setValues((prev) => ({ ...prev, videoCoverTimestampMs: Number(e.target.value || 0) }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-400/50"
              />
              <p className="text-xs text-white/45">Defina em milissegundos o frame usado como capa sugerida.</p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-5">
              <Button type="button" variant="outline" className="rounded-xl border-white/15 bg-transparent text-white hover:bg-white/10" onClick={onClose} disabled={isBusy}>
                Cancelar
              </Button>
              <Button type="button" className="rounded-xl bg-black text-white hover:bg-black/90" onClick={() => void handlePublish()} disabled={!canPublish || isBusy}>
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music2 className="mr-2 h-4 w-4" />}
                Publicar no TikTok
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
