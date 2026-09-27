import { useQuery } from '@tanstack/react-query'
import { getVm } from '../api/resources/vms'
import { useSettings } from '../settings/SettingsProvider'
import { vmKeys } from './useVms'

export function useVm(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: vmKeys.detail(id),
    queryFn: () => getVm(id),
    refetchInterval: refreshIntervalMs,
  })
}
