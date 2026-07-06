import { useMutation } from "@tanstack/react-query"
import api from "@/lib/api"
import type { CompetitorRequest, CompetitorsResponse } from "@/types/api"

export function useCompetitors() {
  return useMutation({
    mutationFn: async (data: CompetitorRequest) => {
      const res = await api.post<CompetitorsResponse>("/competitors", data)
      return res.data
    },
  })
}
