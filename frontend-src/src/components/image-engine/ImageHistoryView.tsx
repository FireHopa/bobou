import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, Download, Image as ImageIcon, Layers3, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadImage,
  formatHistoryMode,
  formatLabel,
  readImageHistory,
  writeImageHistory,
  type ImageHistoryItem,
} from "@/lib/imageHistory";

const FORMAT_LABELS: Record<string, string> = {
  quadrado_1_1: "Quadrado 1:1",
  vertical_9_16: "Vertical 9:16",
  horizontal_16_9: "Horizontal 16:9",
};

const QUALITY_LABELS: Record<string, string> = {
  baixa: "Rascunho",
  media: "Equilibrada",
  alta: "Premium",
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

type Props = {
  onBack: () => void;
};

export default function ImageHistoryView({ onBack }: Props) {
  const [items, setItems] = useState<ImageHistoryItem[]>([]);
  const [isDownloading, setIsDownloading] = useState<string>("");

  useEffect(() => {
    let active = true;
    void readImageHistory()
      .then((history) => {
        if (active) setItems(history);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const groupedStats = useMemo(() => {
    const generated = items.filter((item) => item.type === "generated").length;
    const edited = items.filter((item) => item.type === "edited").length;
    return { generated, edited, total: items.length };
  }, [items]);

  const handleClear = async () => {
    await writeImageHistory([]);
    setItems([]);
  };

  const handleDownload = async (item: ImageHistoryItem) => {
    try {
      setIsDownloading(item.id);
      await downloadImage(item.url, `imagem-${item.type}-${item.engine_id || item.id}.png`);
    } finally {
      setIsDownloading("");
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-6 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(2,6,23,0.98)_60%,rgba(7,12,22,1)_100%)] p-6 md:p-8 lg:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Button variant="ghost" className="gap-2 px-0 text-slate-300 hover:text-white hover:bg-transparent" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Histórico de imagens</h1>
              <p className="mt-2 max-w-3xl text-slate-400">
                Aqui ficam salvas as imagens que já foram geradas do zero ou editadas por referência, com formato, qualidade e ação rápida para salvar novamente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Total</div>
              <div className="mt-1 text-lg font-semibold text-white">{groupedStats.total}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Geradas</div>
              <div className="mt-1 text-lg font-semibold text-white">{groupedStats.generated}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Editadas</div>
              <div className="mt-1 text-lg font-semibold text-white">{groupedStats.edited}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            className="rounded-xl border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
            onClick={handleClear}
            disabled={!items.length}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar histórico
          </Button>
        </div>

        {items.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.22)] rounded-2xl">
                <div className="relative aspect-square bg-black/30">
                  <img src={item.thumbnailUrl || item.url} alt={item.motor} className="h-full w-full object-contain" loading="lazy" />
                  <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                    {formatHistoryMode(item.type)}
                  </div>
                </div>

                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    {item.type === "generated" ? <Sparkles className="w-4 h-4 text-blue-300" /> : <Layers3 className="w-4 h-4 text-purple-300" />}
                    <span>{item.motor}</span>
                  </div>
                  <CardTitle className="text-lg text-white">{formatHistoryMode(item.type)}</CardTitle>
                  <CardDescription className="text-slate-400 flex items-center gap-2">
                    <Clock3 className="w-4 h-4" />
                    {formatDate(item.createdAt)}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Formato</div>
                      <div className="mt-1 font-medium text-white">{formatLabel(item.format, FORMAT_LABELS)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Qualidade</div>
                      <div className="mt-1 font-medium text-white">{formatLabel(item.quality, QUALITY_LABELS)}</div>
                    </div>
                    {(item.width && item.height) ? (
                      <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Tamanho final</div>
                        <div className="mt-1 font-medium text-white">{item.width}x{item.height}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-3">
                    <a
                      href={item.url || item.thumbnailUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] ${!item.url ? "opacity-40 pointer-events-none" : ""}`}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Abrir
                    </a>
                    <Button
                      className="h-11 flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                      onClick={() => handleDownload(item)}
                      disabled={isDownloading === item.id}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {isDownloading === item.id ? "Salvando..." : "Salvar imagem"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-400/10 bg-blue-500/10 mb-4">
              <Clock3 className="w-8 h-8 text-blue-300" />
            </div>
            <h3 className="text-lg font-semibold text-white">Nenhuma imagem no histórico ainda</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
              Assim que você gerar ou editar imagens, elas aparecem aqui com formato, qualidade e ação rápida para salvar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
