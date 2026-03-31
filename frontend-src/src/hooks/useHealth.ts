import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/robots";
import { qk } from "@/constants/queryKeys";

export function useHealth() {
  return useQuery({
    queryKey: qk.health(),
    queryFn: api.health,
  });
}
