import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Facebook, ImageIcon, Link2, Loader2, MessageSquare, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type FacebookPage } from "@/services/facebook";

export type FacebookPublishValues = {
  message: string;
  link: string;
  imageUrl: string;
  carouselImages: string[];
  published: boolean;
  scheduledPublishTime: string;
  backdatedTime: string;
  place: string;
  tags: string[];
  selectedPageId: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  loading: boolean;
  pages: FacebookPage[];
  selectedPageId?: string | null;
  onSelectPage?: (pageId: string) => void | Promise<void>;
  onPublish: (values: FacebookPublishValues) => void | Promise<void>;
};

function parseLinesOrComma(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function FacebookPublishModal({ isOpen, onClose, initialText, loading, pages, selectedPageId, onSelectPage, onPublish }: Props) {
  const [values, setValues] = useState<FacebookPublishValues>({
    message: initialText,
    link: "",
    imageUrl: "",
    carouselImages: [],
    published: true,
    scheduledPublishTime: "",
    backdatedTime: "",
    place: "",
    tags: [],
    selectedPageId: selectedPageId || pages[0]?.id || "",
  });
  const [carouselInput, setCarouselInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      message: initialText,
      link: "",
      imageUrl: "",
      carouselImages: [],
      published: true,
      scheduledPublishTime: "",
      backdatedTime: "",
      place: "",
      tags: [],
      selectedPageId: selectedPageId || pages[0]?.id || "",
    });
    setCarouselInput("");
    setTagsInput("");
    setLocalSubmitting(false);
  }, [initialText, isOpen, pages, selectedPageId]);

  const isBusy = loading || localSubmitting;
  const selectedPage = useMemo(() => pages.find((page) => page.id === values.selectedPageId) || pages[0], [pages, values.selectedPageId]);
  const previewImages = useMemo(() => {
    if (values.carouselImages.length > 0) return values.carouselImages;
    if (values.imageUrl.trim()) return [values.imageUrl.trim()];
    return [];
  }, [values.carouselImages, values.imageUrl]);
  const canPublish = Boolean(values.message.trim() || values.link.trim() || previewImages.length > 0);

  const applyCarousel = () => setValues((prev) => ({ ...prev, carouselImages: parseLinesOrComma(carouselInput) }));
  const applyTags = () => setValues((prev) => ({ ...prev, tags: parseLinesOrComma(tagsInput) }));

  const handleChangePage = async (pageId: string) => {
    setValues((prev) => ({ ...prev, selectedPageId: pageId }));
    await Promise.resolve(onSelectPage?.(pageId));
  };

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
        <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1877F2] shadow-sm">
              <Facebook className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Pré-visualização do Post no Facebook</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Texto, link, imagem, carrossel, agendamento e página selecionada.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isBusy} className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-[420px] bg-[#0b1220] p-6 md:p-8 flex items-center justify-center">
            <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl">
              <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-4">
                {selectedPage?.picture_url ? <img src={selectedPage.picture_url} alt={selectedPage.name} className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2] text-lg font-bold text-white">{(selectedPage?.name || "P").charAt(0).toUpperCase()}</div>}
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{selectedPage?.name || "Sua página"}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Agora · Público{selectedPage?.username ? ` · @${selectedPage.username}` : ""}</div>
                </div>
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-800">{values.message || "Seu texto aparecerá aqui."}</div>
                {values.link.trim() && <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"><div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500"><Link2 className="h-3.5 w-3.5" /> Link</div><div className="truncate">{values.link}</div></div>}
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                  {previewImages.length > 0 ? <div className={`grid ${previewImages.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{previewImages.slice(0, 4).map((image, index) => <div key={`${image}-${index}`} className="aspect-square bg-zinc-200"><img src={image} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div> : <div className="flex aspect-[1.3/1] flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500"><ImageIcon className="h-10 w-10" /><p className="text-sm">Adicione imagem principal ou carrossel para ver a mídia do Facebook.</p></div>}
                </div>
                {(values.place.trim() || values.tags.length > 0 || !values.published || values.scheduledPublishTime || values.backdatedTime) && <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{values.place.trim() && <div><span className="font-semibold">Local:</span> {values.place}</div>}{values.tags.length > 0 && <div><span className="font-semibold">Tags:</span> {values.tags.join(", ")}</div>}{!values.published && <div><span className="font-semibold">Status:</span> rascunho/agendado</div>}{values.scheduledPublishTime && <div><span className="font-semibold">Agendamento:</span> {new Date(values.scheduledPublishTime).toLocaleString()}</div>}{values.backdatedTime && <div><span className="font-semibold">Data retroativa:</span> {new Date(values.backdatedTime).toLocaleString()}</div>}</div>}
              </div>

              <div className="flex items-center gap-5 border-t border-zinc-200 px-4 py-3 text-zinc-500"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comentar</div><div className="flex items-center gap-2"><Facebook className="h-4 w-4" /> Compartilhar</div></div>
            </div>
          </div>

          <div className="space-y-5 overflow-y-auto bg-background p-5 md:p-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Página do Facebook</label>
              <select value={values.selectedPageId} onChange={(e) => void handleChangePage(e.target.value)} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30">{pages.map((page) => <option key={page.id} value={page.id}>{page.name}{page.username ? ` · @${page.username}` : ""}</option>)}</select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Texto da publicação</label>
              <textarea value={values.message} onChange={(e) => setValues((prev) => ({ ...prev, message: e.target.value }))} className="min-h-[180px] w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Escreva o texto do post..." />
              <div className="text-right text-xs text-muted-foreground">{values.message.length}/63206</div>
            </div>

            <div className="space-y-2"><label className="text-sm font-semibold text-foreground">Link opcional</label><input value={values.link} onChange={(e) => setValues((prev) => ({ ...prev, link: e.target.value }))} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="https://seusite.com/post" /></div>
            <div className="space-y-2"><label className="text-sm font-semibold text-foreground">Imagem principal</label><input value={values.imageUrl} onChange={(e) => setValues((prev) => ({ ...prev, imageUrl: e.target.value }))} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="https://seusite.com/imagem.jpg" /></div>

            <div className="space-y-2 rounded-2xl border border-border bg-card/60 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ImageIcon className="h-4 w-4 text-blue-500" /> Carrossel de imagens</div><textarea value={carouselInput} onChange={(e) => setCarouselInput(e.target.value)} className="min-h-[110px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="Cole uma URL por linha ou separadas por vírgula." /><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Quando houver mais de uma imagem, será enviado como post com mídias anexadas.</p><Button type="button" variant="outline" className="rounded-xl" onClick={applyCarousel}>Aplicar</Button></div></div>

            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><label className="text-sm font-semibold text-foreground">Local da página</label><input value={values.place} onChange={(e) => setValues((prev) => ({ ...prev, place: e.target.value }))} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="ID do local do Facebook" /></div><div className="space-y-2"><label className="text-sm font-semibold text-foreground">Tags de páginas</label><div className="flex gap-2"><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="IDs separados por vírgula" /><Button type="button" variant="outline" className="rounded-xl shrink-0" onClick={applyTags}><Tag className="h-4 w-4" /></Button></div></div></div>

            <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-4"><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarClock className="h-4 w-4 text-blue-500" /> Publicação imediata, rascunho ou agendada</div><label className="flex items-center gap-3 text-sm text-foreground"><input type="checkbox" checked={values.published} onChange={(e) => setValues((prev) => ({ ...prev, published: e.target.checked, scheduledPublishTime: e.target.checked ? "" : prev.scheduledPublishTime }))} />Publicar imediatamente</label>{!values.published && <div className="space-y-2"><label className="text-sm font-medium text-foreground">Agendar publicação</label><input type="datetime-local" value={values.scheduledPublishTime} onChange={(e) => setValues((prev) => ({ ...prev, scheduledPublishTime: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" /></div>}<div className="space-y-2"><label className="text-sm font-medium text-foreground">Data retroativa opcional</label><input type="datetime-local" value={values.backdatedTime} onChange={(e) => setValues((prev) => ({ ...prev, backdatedTime: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" /></div></div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4"><Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={isBusy}>Cancelar</Button><Button type="button" className="rounded-xl bg-[#1877F2] hover:bg-[#1664d9]" onClick={() => void handlePublish()} disabled={!canPublish || isBusy}>{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Facebook className="mr-2 h-4 w-4" />}{values.published ? "Publicar no Facebook" : "Salvar/agendar no Facebook"}</Button></div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
