import { useQuery } from '@tanstack/react-query'
import { listVmDisks } from '../api/resources/disks'
import { listVmNics } from '../api/resources/nics'
import { useSettings } from '../settings/SettingsProvider'
import { vmKeys } from './useVms'

export function useVmDisks(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: vmKeys.disks(vmId),
    queryFn: () => listVmDisks(vmId),
    refetchInterval: refreshIntervalMs,
  })
}

export function useVmNics(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: vmKeys.nics(vmId),
    queryFn: () => listVmNics(vmId),
    refetchInterval: refreshIntervalMs,
  })
}
