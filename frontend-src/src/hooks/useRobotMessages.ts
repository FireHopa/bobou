import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/services/robots";
import { queryClient } from "@/state/queryClient";
import type { ChatIn, MessageUpdateIn } from "@/types/api";
import { qk } from "@/constants/queryKeys";
import { toastApiError, toastSuccess } from "@/lib/toast";

export function useRobotMessages(publicId: string) {
  return useQuery({
    queryKey: qk.robots.messages(publicId),
    queryFn: () => api.robots.messages.list(publicId),
    enabled: Boolean(publicId),
    staleTime: 5_000,
  });
}

export function useClearRobotMessages(publicId: string) {
  return useMutation({
    mutationFn: () => api.robots.messages.clear(publicId),
    onSuccess: async () => {
      toastSuccess("Histórico limpo.");
      await queryClient.invalidateQueries({ queryKey: qk.robots.messages(publicId) });
    },
    onError: (e) => toastApiError(e, "Falha ao limpar histórico"),
  });
}

export function useUpdateRobotMessage(publicId: string) {
  return useMutation({
    mutationFn: (args: { messageId: number; body: MessageUpdateIn }) =>
      api.robots.messages.update(publicId, args.messageId, args.body),
    onSuccess: async () => {
      toastSuccess("Mensagem atualizada.");
      await queryClient.invalidateQueries({ queryKey: qk.robots.messages(publicId) });
    },
    onError: (e) => toastApiError(e, "Falha ao atualizar mensagem"),
  });
}

export function useRobotChat(publicId: string) {
  return useMutation({
    mutationFn: (body: ChatIn) => api.robots.chat(publicId, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: qk.robots.messages(publicId) });

      const prev = queryClient.getQueryData<any[]>(qk.robots.messages(publicId));

      const optimistic = {
        id: -Date.now(),
        role: "user",
        content: body.message,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<any[]>(qk.robots.messages(publicId), (old) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimistic];
      });

      return { prev };
    },
    onError: (e, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.robots.messages(publicId), ctx.prev);
      toastApiError(e, "Falha ao enviar mensagem");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.robots.messages(publicId) });
    },
  });
}

export function useRobotAudioChat(publicId: string) {
  return useMutation({
    mutationFn: (file: File) => api.robots.audio(publicId, file),
    onMutate: async (file) => {
      await queryClient.cancelQueries({ queryKey: qk.robots.messages(publicId) });

      const prev = queryClient.getQueryData<any[]>(qk.robots.messages(publicId));

      const optimistic = {
        id: -Date.now(),
        role: "user",
        content: `🎙️ Áudio enviado: ${file.name}`,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<any[]>(qk.robots.messages(publicId), (old) => {
        const arr = Array.isArray(old) ? old : [];
        return [...arr, optimistic];
      });

      return { prev };
    },
    onError: (e, _file, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.robots.messages(publicId), ctx.prev);
      toastApiError(e, "Falha ao enviar áudio");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.robots.messages(publicId) });
    },
  });
}
