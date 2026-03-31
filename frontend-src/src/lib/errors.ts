import { HttpError } from "@/services/http";

function normalizeFastApiDetail(detail: unknown): string | null {
  if (!detail) return null;
  // FastAPI 422: { detail: [{ loc: [...], msg: "...", type: "..." }, ...] }
  if (Array.isArray(detail)) {
    const first = detail[0] as any;
    if (first && typeof first === "object") {
      const loc = Array.isArray(first.loc) ? first.loc.join(".") : "";
      const msg = typeof first.msg === "string" ? first.msg : "Dados inválidos";
      return loc ? `${msg} (${loc})` : msg;
    }
    return "Dados inválidos";
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return "Erro inesperado";
  }
}

export function getErrorMessage(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (typeof err === "string") return err;

  if (err instanceof HttpError) {
    const payload = err.payload as any;
    if (payload && typeof payload === "object" && "detail" in payload) {
      const normalized = normalizeFastApiDetail(payload.detail);
      if (normalized) return normalized;
    }
    return err.message || `HTTP ${err.status}`;
  }

  if (err instanceof Error) return err.message || "Erro inesperado";

  try {
    return JSON.stringify(err);
  } catch {
    return "Erro inesperado";
  }
}
