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
      <div className="theme-surface overflow-hidden rounded-3xl">
        <div className="p-6 md:p-8 lg:p-10 space-y-8">
          <div className="space-y-4 text-center max-w-3xl mx-auto">
            <div className="theme-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
              <Wand2 className="w-4 h-4" />
              Inteligência Artificial para Criativos
            </div>

            <div className="space-y-3">
              <h1 className="theme-title text-4xl md:text-5xl font-extrabold tracking-tight">
                Motor de Imagem
              </h1>
              <p className="theme-copy text-base md:text-lg">
                Escolha como você quer trabalhar com a IA. Você pode criar um criativo do zero, editar uma imagem já existente a partir de uma referência ou revisar todo o histórico das peças produzidas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <Card className="theme-card group overflow-hidden rounded-3xl">
              <CardContent className="p-6 md:p-8 h-full flex flex-col">
                <div className="space-y-5 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="theme-icon-box flex h-12 w-12 items-center justify-center rounded-2xl">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="theme-subtle text-xs uppercase tracking-[0.2em]">Modo 01</div>
                      <div className="theme-title text-2xl font-bold">Gerar imagem do zero</div>
                    </div>
                  </div>

                  <p className="theme-copy leading-relaxed">
                    Use o fluxo atual já pronto para montar briefing, ajustar paleta, definir formato e gerar múltiplas variações com prompts otimizados automaticamente.
                  </p>

                  <div className="theme-subtle space-y-2 text-sm">
                    <div>• Mantém exatamente o fluxo atual da geração.</div>
                    <div>• Ideal para criativos novos, campanhas e testes visuais.</div>
                    <div>• Gera variações prontas para anúncio, feed, stories e banners.</div>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="theme-primary-button text-on-blue mt-8 w-full font-semibold gap-2 rounded-xl h-12 px-6"
                  onClick={() => openMode("generate")}
                >
                  Abrir geração do zero
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="theme-card group overflow-hidden rounded-3xl">
              <CardContent className="p-6 md:p-8 h-full flex flex-col">
                <div className="space-y-5 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="theme-icon-box flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Layers3 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="theme-subtle text-xs uppercase tracking-[0.2em]">Modo 02</div>
                      <div className="theme-title text-2xl font-bold">Editar imagem por referência</div>
                    </div>
                  </div>

                  <p className="theme-copy leading-relaxed">
                    Envie uma imagem base, diga o que precisa mudar e deixe a IA refinar o prompt antes de gerar a nova versão editada com foco comercial.
                  </p>

                  <div className="theme-subtle space-y-2 text-sm">
                    <div>• Upload de imagem de referência.</div>
                    <div>• Prompt melhorado pela IA antes da edição.</div>
                    <div>• Resultado final com comparação entre original e editada.</div>
                  </div>
                </div>

                <Button
                  size="lg"
                  variant="outline"
                  className="theme-outline-button mt-8 w-full font-semibold gap-2 rounded-xl h-12 px-6"
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
              className="theme-outline-button min-w-[260px] rounded-2xl h-12 px-8"
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
