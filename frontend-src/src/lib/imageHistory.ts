import { http } from "@/services/http";

export type ImageHistoryMode = "generated" | "edited";

export type ImageHistoryItem = {
  id: string;
  type: ImageHistoryMode;
  url: string;
  thumbnailUrl?: string;
  motor: string;
  engine_id: string;
  format: string;
  quality: string;
  createdAt: string;
  width?: number;
  height?: number;
  prompt?: string;
  improvedPrompt?: string;
};

type ImageHistoryPayloadItem = Omit<ImageHistoryItem, "id" | "createdAt">;

type ImageHistoryListResponse = {
  items: ImageHistoryItem[];
};

export async function readImageHistory(): Promise<ImageHistoryItem[]> {
  try {
    const response = await http<ImageHistoryListResponse>("/api/image-engine/history");
    return Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    console.warn("Falha ao ler o histórico do image engine:", error);
    return [];
  }
}

export async function writeImageHistory(items: ImageHistoryItem[]) {
  try {
    if (!items.length) {
      await http<{ ok: true }>("/api/image-engine/history", { method: "DELETE" });
      return;
    }

    await http<{ ok: true }>("/api/image-engine/history", { method: "DELETE" });
    await http<ImageHistoryListResponse>("/api/image-engine/history", {
      method: "POST",
      json: {
        items: items.map(({ type, url, thumbnailUrl, motor, engine_id, format, quality, width, height, prompt, improvedPrompt }) => ({
          type,
          url,
          thumbnailUrl,
          motor,
          engine_id,
          format,
          quality,
          width,
          height,
          prompt,
          improvedPrompt,
        })),
      },
    });
  } catch (error) {
    console.warn("Falha ao gravar o histórico do image engine:", error);
  }
}

export async function appendImageHistory(items: ImageHistoryPayloadItem[]) {
  if (!items.length) return;
  try {
    await http<ImageHistoryListResponse>("/api/image-engine/history", {
      method: "POST",
      json: { items },
    });
  } catch (error) {
    console.warn("Falha ao adicionar item ao histórico do image engine:", error);
  }
}

export async function downloadImage(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatHistoryMode(type: ImageHistoryMode) {
  return type === "generated" ? "Gerada do zero" : "Editada por referência";
}

export function formatLabel(value: string, map: Record<string, string>) {
  return map[value] || value;
}
