import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

export function toastApiError(err: unknown, fallback?: string) {
  const msg = getErrorMessage(err);
  toast.error(fallback ? `${fallback}: ${msg}` : msg);
}

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastInfo(message: string) {
  toast(message);
}
