import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/services/robots";
import type { AuthorityAgentRunRequest, AuthorityAgentRunResponse } from "@/types/api";

export function useAuthorityAgentCooldown(publicId: string, agentKey: string) {
  return useQuery({
    queryKey: ["robots", publicId, "authorityAgents", "cooldown", agentKey],
    queryFn: () => api.robots.authorityAgents.cooldown(publicId, agentKey),
    enabled: Boolean(publicId) && Boolean(agentKey),
    staleTime: 10_000,
  });
}

export function useRunAuthorityAgent(publicId: string, agentKey: string) {
  return useMutation<AuthorityAgentRunResponse, unknown, AuthorityAgentRunRequest>({
    mutationFn: (body) => api.robots.authorityAgents.run(publicId, body),
  });
}