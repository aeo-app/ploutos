import { useMutation } from "@tanstack/react-query"
import api from "@/lib/api"
import type { AnalyzeRequest, AnalyzeResponse } from "@/types/api"

export function useAnalyze() {
  return useMutation({
    mutationFn: async (data: AnalyzeRequest) => {
      const res = await api.post<AnalyzeResponse>("/analyze", data)
      return res.data
    },
  })
}
