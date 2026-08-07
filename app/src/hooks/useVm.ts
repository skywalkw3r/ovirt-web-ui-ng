import { useQuery } from '@tanstack/react-query'
import { getVm } from '../api/resources/vms'
import { useSettings } from '../settings/SettingsProvider'

export function useVm(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id],
    queryFn: () => getVm(id),
    refetchInterval: refreshIntervalMs,
  })
}
