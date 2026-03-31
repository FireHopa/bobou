import React, { useMemo, useState } from 'react';
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { appendImageHistory } from "@/lib/imageHistory";
import { extractResponseErrorMessage, syncCreditsFromResponse } from "@/lib/credits";
import { API_BASE_URL } from "@/constants/app";
import {
  Wand2,
  Sparkles,
  Smartphone,
  Monitor,
  Square,
  Gauge,
  Target,
  Palette,
  Image as ImageIcon,
  Loader2,
  Check,
  LayoutTemplate,
  Rocket,
  Brush,
  ArrowUpRight,
  ScanSearch,
  Zap,
} from "lucide-react";

type ImageResult = {
  engine_id: string;
  motor: string;
  url: string;
};

type FormatOption = {
  value: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
};

type PaletteOption = {
  value: string;
  label: string;
  colors: string[];
};


const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "quadrado_1_1",
    label: "Quadrado 1:1",
    hint: "Ideal para feed estático e criativos versáteis.",
    icon: <Square className="w-5 h-5" />,
  },
  {
    value: "vertical_9_16",
    label: "Vertical 9:16",
    hint: "Stories, Reels, Shorts e Status.",
    icon: <Smartphone className="w-5 h-5" />,
  },
  {
    value: "horizontal_16_9",
    label: "Horizontal 16:9",
    hint: "Thumbnails, banners e áreas amplas.",
    icon: <Monitor className="w-5 h-5" />,
  },
];


const PALETTE_OPTIONS: PaletteOption[] = [
  { value: "google", label: "Google Tech", colors: ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] },
  { value: "premium_blue", label: "Azul Premium", colors: ["#0F172A", "#1D4ED8", "#60A5FA", "#E2E8F0"] },
  { value: "dark_luxury", label: "Dark Luxury", colors: ["#0B0B0B", "#1F2937", "#D4AF37", "#F9FAFB"] },
  { value: "clean_neutral", label: "Clean Neutral", colors: ["#111827", "#6B7280", "#F3F4F6", "#FFFFFF"] },
  { value: "custom", label: "Personalizada", colors: [] },
];

const QUALITY_OPTIONS = [
  {
    value: "baixa",
    label: "Rascunho",
    hint: "Testes rápidos e validação de direção.",
    icon: <Gauge className="w-5 h-5" />,
  },
  {
    value: "media",
    label: "Equilibrada",
    hint: "Boa definição com custo-benefício.",
    icon: <Target className="w-5 h-5" />,
  },
  {
    value: "alta",
    label: "Premium",
    hint: "Maior nível de detalhe e refinamento.",
    icon: <Sparkles className="w-5 h-5" />,
  },
];


function getAspectClass(formato: string) {
  if (formato === "vertical_9_16") return "aspect-[9/16]";
  if (formato === "horizontal_16_9") return "aspect-video";
  return "aspect-square";
}

function getPreviewAspectRatio(formato: string, width?: number | null, height?: number | null) {
  if (width && height) return `${width} / ${height}`;
  if (formato === "vertical_9_16") return "9 / 16";
  if (formato === "horizontal_16_9") return "16 / 9";
  return "1 / 1";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  onBack?: () => void;
};

export default function ImageGenerationFromScratch({ onBack }: Props) {
  const [formato, setFormato] = useState<string>("quadrado_1_1");
  const [qualidade, setQualidade] = useState<string>("media");
  const [paletaSelecionada, setPaletaSelecionada] = useState<string>("google");
  const [paletaCustom, setPaletaCustom] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [subheadline, setSubheadline] = useState<string>("");
  const [descricaoVisual, setDescricaoVisual] = useState<string>("");
  const [resolutionMode, setResolutionMode] = useState<"preset" | "custom">("preset");
  const [customWidth, setCustomWidth] = useState<string>("1024");
  const [customHeight, setCustomHeight] = useState<string>("1280");

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [improvedPrompt, setImprovedPrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");


  const currentFormat = useMemo(
    () => FORMAT_OPTIONS.find((item) => item.value === formato),
    [formato]
  );

  const currentQuality = useMemo(
    () => QUALITY_OPTIONS.find((item) => item.value === qualidade),
    [qualidade]
  );

  const paletteValue = useMemo(() => {
    if (paletaSelecionada === "custom") return paletaCustom.trim();
    const selected = PALETTE_OPTIONS.find((option) => option.value === paletaSelecionada);
    return selected ? `${selected.label}: ${selected.colors.join(", ")}` : "";
  }, [paletaSelecionada, paletaCustom]);

  const selectedPalette = useMemo(
    () => PALETTE_OPTIONS.find((item) => item.value === paletaSelecionada),
    [paletaSelecionada]
  );

  const parsedCustomWidth = useMemo(() => Number(customWidth), [customWidth]);
  const parsedCustomHeight = useMemo(() => Number(customHeight), [customHeight]);
  const hasValidCustomDimensions =
    Number.isInteger(parsedCustomWidth) &&
    Number.isInteger(parsedCustomHeight) &&
    parsedCustomWidth >= 256 &&
    parsedCustomWidth <= 4096 &&
    parsedCustomHeight >= 256 &&
    parsedCustomHeight <= 4096;
  const previewAspectRatio = getPreviewAspectRatio(
    formato,
    resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomWidth : undefined,
    resolutionMode === "custom" && hasValidCustomDimensions ? parsedCustomHeight : undefined
  );

  const handleApplyRecommendations = () => {
    if (resolutionMode === "preset") {
      setFormato("quadrado_1_1");
    }
    setQualidade("media");
  };

  const handleGenerate = async () => {
    if (!descricaoVisual.trim()) {
      setStatusText("⚠ Preencha a descrição visual da arte.");
      return;
    }

    if (paletaSelecionada === "custom" && !paletaCustom.trim()) {
      setStatusText("⚠ Descreva sua paleta personalizada.");
      return;
    }

    if (resolutionMode === "custom" && !hasValidCustomDimensions) {
      setStatusText("⚠ Informe width e height válidos entre 256 e 4096 pixels.");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setResults([]);
    setImprovedPrompt("");
    setFinalPrompt("");
    setStatusText("Preparando o briefing estruturado...");

    const token = (() => {
      try {
        return JSON.parse(localStorage.getItem("auth-store") || "{}")?.state?.token || "";
      } catch {
        return "";
      }
    })();

    try {
      const response = await fetch(`${API_BASE_URL}/api/image-engine/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formato,
          qualidade,
          paleta_cores: paletteValue,
          headline,
          subheadline,
          descricao_visual: descricaoVisual,
          width: resolutionMode === "custom" ? parsedCustomWidth : null,
          height: resolutionMode === "custom" ? parsedCustomHeight : null,
        }),
      });

      syncCreditsFromResponse(response);

      if (!response.ok) {
        throw new Error(await extractResponseErrorMessage(response));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      if (!reader) throw new Error("Falha ao inicializar o leitor");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(part.substring(6));

            if (data.error) throw new Error(data.error);
            if (data.status) setStatusText(data.status);
            if (typeof data.progress === "number") setProgress(data.progress);
            if (data.improved_prompt) setImprovedPrompt(data.improved_prompt);
            if (data.final_prompt) setFinalPrompt(data.final_prompt);

            if (data.partial_result?.url) {
              setResults((current) =>
                current.some((item) => item.engine_id === data.partial_result.engine_id)
                  ? current
                  : [...current, data.partial_result]
              );
            }

            if (Array.isArray(data.final_results)) {
              setResults(data.final_results);
              appendImageHistory(
                data.final_results.map((item: ImageResult) => ({
                  type: "generated",
                  url: item.url,
                  motor: item.motor,
                  engine_id: item.engine_id,
                  format: formato,
                  quality: qualidade,
                  width: resolutionMode === "custom" ? parsedCustomWidth : undefined,
                  height: resolutionMode === "custom" ? parsedCustomHeight : undefined,
                  prompt: finalPrompt || descricaoVisual,
                  improvedPrompt,
                }))
              );
              setIsGenerating(false);
            }
          } catch (e) {
            console.error("Erro no SSE", e);
          }
        }
      }

      setIsGenerating(false);
    } catch (error: any) {
      setStatusText(`Erro: ${error.message || "Conexão perdida."}`);
      setIsGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(2,6,23,0.98)_60%,rgba(7,12,22,1)_100%)] shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
          <div className="p-6 md:p-8 flex flex-col gap-6">
            {onBack && (
              <div>
                <Button
                  variant="ghost"
                  className="gap-2 px-0 text-slate-300 hover:text-white hover:bg-transparent"
                  onClick={onBack}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </Button>
              </div>
            )}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300">
                  <Wand2 className="w-4 h-4" />
                  Inteligência Artificial para Criativos
                </div>

                <div className="space-y-2">
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
                    Motor de Imagem
                  </h1>
                  <p className="text-base md:text-lg text-slate-300 max-w-3xl">
                    Monte o briefing da peça promocional, ajuste a direção visual e gere
                    múltiplas opções com prompts otimizados automaticamente.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 min-w-full lg:min-w-[560px]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Estratégia
                  </div>
                  <div className="font-semibold text-white">Livre</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Formato
                  </div>
                  <div className="font-semibold text-white">{resolutionMode === "custom" ? "Automático pelo tamanho" : currentFormat?.label}</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Qualidade
                  </div>
                  <div className="font-semibold text-white">{currentQuality?.label}</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Tamanho final
                  </div>
                  <div className="font-semibold text-white">
                    {resolutionMode === "custom" && hasValidCustomDimensions
                      ? `${parsedCustomWidth}x${parsedCustomHeight}`
                      : "Padrão"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 text-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                  <ScanSearch className="w-4 h-4" />
                  Recomendação automática ativa
                </div>

                <div className="text-slate-300">
                  O sistema aplica uma configuração base equilibrada para geração comercial. Você pode ajustar formato, qualidade e tamanho final livremente.
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-xl h-11 px-4 border-blue-400/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15 hover:text-blue-200"
                onClick={handleApplyRecommendations}
                disabled={isGenerating}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Aplicar padrão ideal
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* --- MUDANÇA PRINCIPAL AQUI: flex-col em vez de grid, limitando a largura do formulário para centralizar --- */}
      <div className="flex flex-col gap-12 max-w-5xl mx-auto w-full">
        
        {/* COLUNA 1: FORMULÁRIO */}
        <div className="space-y-6 w-full">
          <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2 text-white">
                <Rocket className="w-5 h-5 text-blue-400" />
                1. Configuração da mídia
              </CardTitle>
              <CardDescription className="text-slate-400">
                Defina formato, qualidade e tamanho final da peça sem depender de canal de publicação.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-3">
                  <label className="text-sm font-semibold flex items-center justify-between text-white">
                    Formato de saída
                    <span className="text-xs font-normal text-slate-400">
                      {resolutionMode === "custom"
                        ? "Automático pelo width e height"
                        : "Selecione o formato que melhor atende a peça"}
                    </span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {FORMAT_OPTIONS.map((option) => {
                      const isSelected = resolutionMode === "preset" && formato === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => {
                            setResolutionMode("preset");
                            setFormato(option.value);
                          }}
                          className={cn(
                            "relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200",
                            isSelected
                              ? "border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                              : "border-white/10 bg-white/[0.03] hover:border-blue-400/30"
                          )}
                        >
                          <div
                            className={cn(
                              "mb-2",
                              isSelected ? "text-blue-300" : "text-slate-400"
                            )}
                          >
                            {option.icon}
                          </div>
                          <span className="font-medium text-sm text-white">{option.label}</span>
                          <span className="text-xs text-slate-400 mt-1 text-center">{option.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold flex items-center justify-between text-white">
                    Qualidade da renderização
                    <span className="text-xs font-normal text-slate-400">
                      Escolha o nível de detalhe desejado
                    </span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {QUALITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setQualidade(option.value)}
                        className={cn(
                          "relative flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 text-left",
                          qualidade === option.value
                            ? "border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                            : "border-white/10 bg-white/[0.03] hover:border-blue-400/30"
                        )}
                      >
                        <div
                          className={cn(
                            "shrink-0",
                            qualidade === option.value ? "text-blue-300" : "text-slate-400"
                          )}
                        >
                          {option.icon}
                        </div>
                        <div>
                          <span className="block font-medium text-sm text-white">{option.label}</span>
                          <span className="block text-xs text-slate-400 mt-0.5">{option.hint}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <label className="text-sm font-semibold text-white">Tamanho final</label>
                      <p className="text-xs text-slate-400 mt-1">
                        Você pode manter o canvas padrão do motor ou pedir width e height exatos.
                      </p>
                    </div>
                    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setResolutionMode("preset")}
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm transition-colors",
                          resolutionMode === "preset" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
                        )}
                      >
                        Padrão do formato
                      </button>
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setResolutionMode("custom")}
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm transition-colors",
                          resolutionMode === "custom" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
                        )}
                      >
                        Customizado
                      </button>
                    </div>
                  </div>

                  {resolutionMode === "custom" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 rounded-xl border border-blue-400/15 bg-blue-500/10 p-3 text-sm text-blue-100">
                        Ao usar tamanho customizado, o formato deixa de ser fixo. O preview e o resultado passam a seguir o width e o height informados.
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Width</label>
                        <Input
                          type="number"
                          min={256}
                          max={4096}
                          step={1}
                          value={customWidth}
                          onChange={(e) => setCustomWidth(e.target.value)}
                          disabled={isGenerating}
                          className="h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                          placeholder="Ex: 1024"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Height</label>
                        <Input
                          type="number"
                          min={256}
                          max={4096}
                          step={1}
                          value={customHeight}
                          onChange={(e) => setCustomHeight(e.target.value)}
                          disabled={isGenerating}
                          className="h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                          placeholder="Ex: 1280"
                        />
                      </div>
                      <div className="md:col-span-2 rounded-xl border border-amber-400/15 bg-amber-500/10 p-3 text-sm text-amber-100">
                        O motor gera no canvas suportado mais próximo e depois faz o pós-processamento para entregar exatamente o tamanho informado.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                      O sistema vai usar o canvas padrão ideal para o formato selecionado.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2 text-white">
                <Brush className="w-5 h-5 text-blue-400" />
                2. Identidade e direção de arte
              </CardTitle>
              <CardDescription className="text-slate-400">
                Defina paleta, texto principal e cenário visual para orientar o motor com mais precisão.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold flex items-center gap-2 text-white">
                  <Palette className="w-4 h-4 text-slate-400" />
                  Paleta de cores
                </label>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {PALETTE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setPaletaSelecionada(option.value)}
                      className={cn(
                        "flex flex-col justify-between p-3 rounded-2xl border transition-all",
                        paletaSelecionada === option.value
                          ? "border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                          : "border-white/10 bg-white/[0.03] hover:border-blue-400/30"
                      )}
                    >
                      <span className="font-medium text-xs truncate w-full text-left mb-3 text-white">
                        {option.label}
                      </span>

                      <div className="flex w-full overflow-hidden rounded-md h-4 ring-1 ring-black/5 dark:ring-white/10">
                        {option.colors.length > 0 ? (
                          option.colors.map((c) => (
                            <div key={c} style={{ backgroundColor: c }} className="h-full flex-1" />
                          ))
                        ) : (
                          <div className="w-full h-full bg-gradient-to-r from-slate-700 to-slate-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {paletaSelecionada === "custom" && (
                  <div className="animate-in slide-in-from-top-2">
                    <Input
                      className="h-11 mt-2 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                      placeholder="Ex: tons pastéis, neon, minimalista clean ou HEX (#FF0000, #111827)..."
                      value={paletaCustom}
                      onChange={(e) => setPaletaCustom(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">Headline</label>
                  <Input
                    className="h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                    placeholder="Ex: Black Friday até 50% OFF"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">Sub-headline</label>
                  <Input
                    className="h-11 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                    placeholder="Ex: Compre agora com condição especial"
                    value={subheadline}
                    onChange={(e) => setSubheadline(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">Descrição visual</label>
                <Textarea
                  className="min-h-[140px] resize-none text-base leading-relaxed border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500"
                  placeholder="Descreva a cena, objetos, ambiente, estilo visual, composição, luz, sensação e os elementos prioritários da arte..."
                  value={descricaoVisual}
                  onChange={(e) => setDescricaoVisual(e.target.value)}
                  disabled={isGenerating}
                />
                <p className="text-xs text-slate-400">
                  Quanto mais específico for o briefing visual, melhor a distribuição dos elementos, o enquadramento e a leitura final da peça.
                </p>
              </div>
            </CardContent>

            <CardFooter className="bg-white/[0.02] pt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between border-t border-white/10">
              <div className="text-sm text-slate-400">
                {selectedPalette?.label ? (
                  <span>
                    Paleta atual: <span className="font-medium text-white">{selectedPalette.label}</span>
                  </span>
                ) : null}
              </div>

              <Button
                size="lg"
                className="w-full sm:w-auto font-semibold gap-2 rounded-xl h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white"
                onClick={handleGenerate}
                disabled={isGenerating || !descricaoVisual.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processando {progress}%
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5" />
                    Gerar criativos
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* COLUNA 2: STATUS E RESULTADOS (AGORA ABAIXO DO FORMULÁRIO) */}
        <div className="space-y-6 w-full">
          {(isGenerating || improvedPrompt || finalPrompt || statusText) && (
            <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-blue-300 flex items-center gap-2">
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      {statusText || (isGenerating ? "Criando variações..." : "Pronto")}
                    </span>

                    <span className="font-mono text-slate-400">{progress}%</span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                        Estratégia
                      </div>
                      <div className="text-sm font-medium text-white">Livre</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                        Formato
                      </div>
                      <div className="text-sm font-medium text-white">{resolutionMode === "custom" ? "Automático pelo tamanho" : currentFormat?.label}</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                        Qualidade
                      </div>
                      <div className="text-sm font-medium text-white">{currentQuality?.label}</div>
                    </div>
                  </div>
                </div>

                {improvedPrompt && (
                  <div className="space-y-2 animate-in fade-in">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Prompt otimizado pela IA
                    </h3>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-slate-200 leading-relaxed italic">
                        “{improvedPrompt}”
                      </p>
                    </div>
                  </div>
                )}

                {finalPrompt && (
                  <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 text-white">
                      Ver prompt final enviado aos motores
                    </summary>
                    <p className="mt-3 text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words">
                      {finalPrompt}
                    </p>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {results.length > 0 ? (
              <div className="grid gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xl flex items-center gap-2 text-white">
                    <Sparkles className="w-6 h-6 text-yellow-400" />
                    Resultados ({results.length}/3)
                  </h3>

                  <div className="text-xs text-slate-400">
                    Variações geradas em múltiplos motores
                  </div>
                </div>

                {/* --- AQUI: A galeria mudou de 2 colunas para 3 colunas em telas médias/grandes (md:grid-cols-3) --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {results.map((result, index) => (
                    <Card
                      key={result.engine_id}
                      className="group overflow-hidden border-white/10 bg-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.22)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.28)] transition-all rounded-2xl"
                    >
                      <div className="relative h-full">
                        <div
                          className={cn("relative overflow-hidden w-full", resolutionMode === "custom" ? undefined : getAspectClass(formato))}
                          style={{ aspectRatio: previewAspectRatio }}
                        >
                          <img
                            src={result.url}
                            alt={result.motor}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>

                        {/* Overlay no Hover com botão de ação rápida */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-9 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/10 shadow-lg"
                          >
                            <ArrowUpRight className="w-4 h-4 mr-1.5" />
                            Ampliar
                          </Button>
                        </div>

                        {/* Tags inferiores mais minimalistas */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                          <div className="rounded-lg bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white uppercase border border-white/10 shadow-sm">
                            {result.motor}
                          </div>
                          <div className="rounded-lg bg-white/10 backdrop-blur-md px-2 py-1 text-[10px] font-medium text-white border border-white/10 shadow-sm">
                            Var {index + 1}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ) : isGenerating ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg text-slate-300">
                  Gerando prévias...
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card
                      key={i}
                      className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] opacity-80 shadow-sm"
                    >
                      <div
                        className={cn(
                          "bg-slate-800 animate-pulse w-full",
                          resolutionMode === "custom" ? undefined : getAspectClass(formato)
                        )}
                        style={{ aspectRatio: previewAspectRatio }}
                      />
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 border border-white/10 rounded-3xl bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)]">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-4 border border-blue-400/10">
                  <ImageIcon className="w-8 h-8 text-blue-300" />
                </div>

                <h3 className="font-semibold text-lg mb-2 text-white">Nenhuma imagem gerada ainda</h3>
                <p className="text-sm text-slate-400 max-w-[320px] leading-relaxed">
                  Preencha o briefing, ajuste formato, qualidade e tamanho final, e clique em <span className="font-medium text-white">Gerar criativos</span> para visualizar as variações logo abaixo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}