import { useMutation } from "@tanstack/react-query"
import api from "@/lib/api"
import type { ScheduleRequest, ScheduleResponse } from "@/types/api"

export function useSchedule() {
  return useMutation({
    mutationFn: async (data: ScheduleRequest) => {
      const res = await api.post<ScheduleResponse>("/scheduler/generate", data)
      return res.data
    },
  })
}
