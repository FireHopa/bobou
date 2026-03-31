import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/services/robots";
import { queryClient } from "@/state/queryClient";
import type { BriefingIn, RobotUpdateIn } from "@/types/api";
import { qk } from "@/constants/queryKeys";
import { toastApiError, toastSuccess } from "@/lib/toast";

export function useRobotsList() {
  return useQuery({
    queryKey: qk.robots.list(),
    queryFn: api.robots.list,
  });
}

export function useCreateRobot() {
  return useMutation({
    mutationFn: (brief: BriefingIn) => api.robots.create(brief),
    onSuccess: async (created) => {
      toastSuccess("Robô criado.");
      await queryClient.invalidateQueries({ queryKey: qk.robots.list() });
      await queryClient.prefetchQuery({
        queryKey: qk.robots.detail(created.public_id),
        queryFn: () => api.robots.get(created.public_id),
      });
    },
    onError: (e) => toastApiError(e, "Falha ao criar robô"),
  });
}

export function useRobot(publicId: string) {
  return useQuery({
    queryKey: qk.robots.detail(publicId),
    queryFn: () => api.robots.get(publicId),
    enabled: Boolean(publicId),
  });
}

export function useUpdateRobot(publicId: string) {
  return useMutation({
    mutationFn: (patch: RobotUpdateIn) => api.robots.update(publicId, patch),
    onSuccess: async () => {
      toastSuccess("Robô atualizado.");
      await queryClient.invalidateQueries({ queryKey: qk.robots.detail(publicId) });
      await queryClient.invalidateQueries({ queryKey: qk.robots.list() });
    },
    onError: (e) => toastApiError(e, "Falha ao atualizar robô"),
  });
}

export function useDeleteRobot() {
  return useMutation({
    mutationFn: (publicId: string) => api.robots.remove(publicId),
    onSuccess: async () => {
      toastSuccess("Robô removido.");
      await queryClient.invalidateQueries({ queryKey: qk.robots.list() });
    },
    onError: (e) => toastApiError(e, "Falha ao remover robô"),
  });
}
