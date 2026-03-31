import { API_BASE_URL } from "@/constants/app";
import { syncCreditsFromResponse } from "@/lib/credits";

export class HttpError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

type RequestInitWithJson = RequestInit & { json?: unknown };

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function http<T>(path: string, init: RequestInitWithJson = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers);

  // --- NOVA LÓGICA DE AUTENTICAÇÃO ---
  // Pega o token salvo no localStorage silenciosamente e anexa no cabeçalho
  const authStorageStr = localStorage.getItem("auth-store");
  if (authStorageStr) {
    try {
      const authData = JSON.parse(authStorageStr);
      const token = authData?.state?.token;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch (e) {
      console.error("Erro ao ler token", e);
    }
  }
  // -----------------------------------

  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  syncCreditsFromResponse(res);

  if (!res.ok) {
    const payload = await parseJsonSafe(res);
    
    // --- INTERCEPTA ERRO 401 (NÃO AUTORIZADO) ---
    // Se a rota exigia login e não passou, limpa o token falso/velho e expulsa pro login
    if (res.status === 401) {
      localStorage.removeItem("auth-store");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.location.href = "/login";
      }
    }
    // ---------------------------------------------

    const message =
      (payload && typeof payload === "object" && "detail" in payload && String((payload as any).detail)) ||
      `HTTP ${res.status}`;
    throw new HttpError(message, res.status, payload);
  }

  const payload = await parseJsonSafe(res);
  return payload as T;
}