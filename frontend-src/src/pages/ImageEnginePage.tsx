import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Clock3, ImagePlus, Layers3, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ImageGenerationFromScratch from "@/components/image-engine/ImageGenerationFromScratch";
import ImageEditReferenceView from "@/components/image-engine/ImageEditReferenceView";
import ImageHistoryView from "@/components/image-engine/ImageHistoryView";

type Mode = "select" | "generate" | "edit" | "history";

export default function ImageEnginePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = useMemo<Mode>(() => {
    const rawMode = searchParams.get("mode");
    if (rawMode === "generate") return "generate";
    if (rawMode === "history") return "history";
    if (rawMode === "edit-reference") return "edit";
    return "select";
  }, [searchParams]);

  const openMode = (nextMode: Mode) => {
    if (nextMode === "select") {
      setSearchParams({}, { replace: false });
      return;
    }

    setSearchParams(
      { mode: nextMode === "edit" ? "edit-reference" : nextMode },
      { replace: false }
    );
  };

  const handleBack = () => openMode("select");

  if (mode === "generate") {
    return <ImageGenerationFromScratch onBack={handleBack} />;
  }

  if (mode === "edit") {
    return <ImageEditReferenceView onBack={handleBack} />;
  }

  if (mode === "history") {
    return <ImageHistoryView onBack={handleBack} />;
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(2,6,23,0.98)_60%,rgba(7,12,22,1)_100%)] shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="p-6 md:p-8 lg:p-10 space-y-8">
          <div className="space-y-4 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300">
              <Wand2 className="w-4 h-4" />
              Inteligência Artificial para Criativos
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
                Motor de Imagem
              </h1>
              <p className="text-base md:text-lg text-slate-300">
                Escolha como você quer trabalhar com a IA. Você pode criar um criativo do zero, editar uma imagem já existente a partir de uma referência ou revisar todo o histórico das peças produzidas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <Card className="group border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.22)] overflow-hidden">
              <CardContent className="p-6 md:p-8 h-full flex flex-col">
                <div className="space-y-5 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/10 bg-blue-500/10 text-blue-300">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modo 01</div>
                      <div className="text-2xl font-bold text-white">Gerar imagem do zero</div>
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    Use o fluxo atual já pronto para montar briefing, ajustar paleta, definir formato e gerar múltiplas variações com prompts otimizados automaticamente.
                  </p>

                  <div className="space-y-2 text-sm text-slate-400">
                    <div>• Mantém exatamente o fluxo atual da geração.</div>
                    <div>• Ideal para criativos novos, campanhas e testes visuais.</div>
                    <div>• Gera variações prontas para anúncio, feed, stories e banners.</div>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="mt-8 w-full font-semibold gap-2 rounded-xl h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={() => openMode("generate")}
                >
                  Abrir geração do zero
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="group border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96)_0%,rgba(6,10,18,0.98)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.22)] overflow-hidden">
              <CardContent className="p-6 md:p-8 h-full flex flex-col">
                <div className="space-y-5 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-400/10 bg-purple-500/10 text-purple-300">
                      <Layers3 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Modo 02</div>
                      <div className="text-2xl font-bold text-white">Editar imagem por referência</div>
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    Envie uma imagem base, diga o que precisa mudar e deixe a IA refinar o prompt antes de gerar a nova versão editada com foco comercial.
                  </p>

                  <div className="space-y-2 text-sm text-slate-400">
                    <div>• Upload de imagem de referência.</div>
                    <div>• Prompt melhorado pela IA antes da edição.</div>
                    <div>• Resultado final com comparação entre original e editada.</div>
                  </div>
                </div>

                <Button
                  size="lg"
                  variant="outline"
                  className="mt-8 w-full font-semibold gap-2 rounded-xl h-12 px-6 border-purple-400/20 bg-purple-500/10 text-purple-200 hover:bg-purple-500/15 hover:text-white"
                  onClick={() => openMode("edit")}
                >
                  Abrir edição por referência
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center">
            <Button
              size="lg"
              variant="outline"
              className="min-w-[260px] rounded-2xl h-12 px-8 border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
              onClick={() => openMode("history")}
            >
              <Clock3 className="w-4 h-4 mr-2" />
              Histórico
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
