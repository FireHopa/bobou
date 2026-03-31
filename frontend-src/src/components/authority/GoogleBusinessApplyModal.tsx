import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { googleBusinessProfileService, type GoogleBusinessLocation } from "@/services/googleBusinessProfile";
import { toastApiError } from "@/lib/toast";

type ParsedPreview =
  | { sourceType: "keyword_list"; title: string; items: string[] }
  | { sourceType: "service_cards"; title: string; items: Array<{ nome: string; descricao?: string; palavras_chave?: string[] }> }
  | null;

export function parseGoogleBusinessPreview(raw: string): ParsedPreview {
  try {
    const data = JSON.parse(raw);
    const blocks = Array.isArray(data?.blocos) ? data.blocos : [];
    const keywordBlock = blocks.find((b: any) => b?.tipo === "keyword_list");
    if (keywordBlock?.conteudo?.items && Array.isArray(keywordBlock.conteudo.items)) {
      return {
        sourceType: "keyword_list",
        title: keywordBlock?.conteudo?.titulo || data?.titulo_da_tela || "Prévia de palavras-chave",
        items: keywordBlock.conteudo.items.filter((item: unknown) => typeof item === "string" && item.trim()),
      };
    }
    const serviceBlock = blocks.find((b: any) => b?.tipo === "service_cards");
    if (serviceBlock?.conteudo?.items && Array.isArray(serviceBlock.conteudo.items)) {
      return {
        sourceType: "service_cards",
        title: serviceBlock?.conteudo?.titulo || data?.titulo_da_tela || "Prévia de serviços",
        items: serviceBlock.conteudo.items
          .map((item: any) => ({
            nome: String(item?.nome || "").trim(),
            descricao: String(item?.descricao || "").trim(),
            palavras_chave: Array.isArray(item?.palavras_chave)
              ? item.palavras_chave.filter((kw: unknown) => typeof kw === "string" && kw.trim())
              : [],
          }))
          .filter((item: { nome: string }) => item.nome),
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rawOutput: string;
  loading?: boolean;
  onApplied?: () => void;
}

export function GoogleBusinessApplyModal({ isOpen, onClose, rawOutput, loading, onApplied }: Props) {
  const preview = useMemo(() => parseGoogleBusinessPreview(rawOutput), [rawOutput]);
  const [locations, setLocations] = useState<GoogleBusinessLocation[]>([]);
  const [selectedLocationName, setSelectedLocationName] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const run = async () => {
      setIsFetching(true);
      try {
        const data = await googleBusinessProfileService.listLocations();
        setLocations(data.locations || []);
        setSelectedLocationName(data.selected_location_name || data.locations?.[0]?.name || "");
      } catch (error) {
        toastApiError(error, "Erro ao carregar locais do Perfil de Empresa Google");
      } finally {
        setIsFetching(false);
      }
    };
    void run();
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedLocation = locations.find((location) => location.name === selectedLocationName);
  const canApply = !!preview && !!selectedLocationName && !isFetching && !isApplying && !loading;

  async function handleRefreshLocations() {
    setIsFetching(true);
    try {
      const status = await googleBusinessProfileService.status();
      setLocations(status.locations || []);
      setSelectedLocationName((current) => current || status.location_name || status.locations?.[0]?.name || "");
    } catch (error) {
      toastApiError(error, "Erro ao atualizar os locais do Perfil de Empresa Google");
    } finally {
      setIsFetching(false);
    }
  }

  async function handleApply() {
    if (!preview || !selectedLocationName) return;
    setIsApplying(true);
    try {
      await googleBusinessProfileService.selectLocation(selectedLocationName);
      await googleBusinessProfileService.applyServices({
        location_name: selectedLocationName,
        source_type: preview.sourceType,
        items: preview.items,
        language_code: selectedLocation?.language_code || "pt-BR",
      });
      onApplied?.();
      onClose();
    } catch (error) {
      toastApiError(error, "Erro ao aplicar serviços no Perfil de Empresa Google");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h3 className="text-xl font-bold text-foreground">Prévia para Perfil de Empresa Google</h3>
            <p className="mt-1 text-sm text-muted-foreground">Revise a saída, escolha o local e aprove a atualização via API.</p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>Fechar</Button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[320px,1fr]">
          <div className="space-y-4 rounded-2xl border border-border bg-background/40 p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Local conectado</label>
              <Select value={selectedLocationName} onValueChange={setSelectedLocationName} className="rounded-xl">
                <SelectItem value="" disabled>
                  {isFetching ? "Carregando locais..." : "Selecione um local"}
                </SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.name} value={location.name}>
                    {location.title}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <Button variant="outline" className="w-full rounded-xl" onClick={handleRefreshLocations} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar locais
            </Button>

            {selectedLocation && (
              <div className="space-y-2 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <MapPin className="h-4 w-4 text-blue-500" /> {selectedLocation.title}
                </div>
                {selectedLocation.store_code ? <p className="text-muted-foreground">Store code: {selectedLocation.store_code}</p> : null}
                {selectedLocation.category ? <p className="text-muted-foreground">Categoria: {selectedLocation.category}</p> : null}
              </div>
            )}

            {preview ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-foreground">
                <div className="flex items-center gap-2 font-medium text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> Formato reconhecido
                </div>
                <p className="mt-2 text-muted-foreground">
                  {preview.sourceType === "keyword_list"
                    ? `Lista técnica com ${preview.items.length} itens pronta para cadastro.`
                    : `Catálogo com ${preview.items.length} serviços, descrições e palavras-chave.`}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-foreground">
                A saída atual não está em formato compatível para aplicação automática. Gere novamente usando “SEO Local para Serviços” ou “Serviços + Descrições”.
              </div>
            )}
          </div>

          <div className="max-h-[65vh] overflow-y-auto rounded-2xl border border-border bg-background/30 p-4">
            <h4 className="mb-4 text-lg font-semibold text-foreground">{preview?.title || "Prévia"}</h4>

            {preview?.sourceType === "keyword_list" ? (
              <div className="space-y-3">
                {preview.items.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground shadow-sm">
                    {item}
                  </div>
                ))}
              </div>
            ) : preview?.sourceType === "service_cards" ? (
              <div className="space-y-4">
                {preview.items.map((item, index) => (
                  <div key={`${item.nome}-${index}`} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-base font-semibold text-foreground">{item.nome}</div>
                    {item.descricao ? <p className="mt-2 text-sm text-muted-foreground">{item.descricao}</p> : null}
                    {item.palavras_chave?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.palavras_chave.map((keyword, kwIndex) => (
                          <span key={`${keyword}-${kwIndex}`} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma prévia disponível.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border p-6">
          <p className="text-sm text-muted-foreground">Ao aprovar, o sistema atualiza a lista de serviços do local selecionado pela API do Google.</p>
          <Button className="rounded-xl" onClick={handleApply} disabled={!canApply}>
            {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Aprovar e atualizar no Google
          </Button>
        </div>
      </div>
    </div>
  );
}
