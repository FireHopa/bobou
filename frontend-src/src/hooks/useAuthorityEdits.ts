import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/robots";
import { qkAuthorityEdits } from "@/constants/queryKeys";

export function useAuthorityEdits(publicId: string) {
  return useQuery({
    queryKey: qkAuthorityEdits(publicId),
    queryFn: () => api.robots.authorityEdits(publicId),
    enabled: Boolean(publicId),
  });
}
