import { useQuery } from '@tanstack/react-query'
import { listVmDisks } from '../api/resources/disks'
import { listVmNics } from '../api/resources/nics'
import { useSettings } from '../settings/SettingsProvider'

export function useVmDisks(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmId, 'disks'],
    queryFn: () => listVmDisks(vmId),
    refetchInterval: refreshIntervalMs,
  })
}

export function useVmNics(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmId, 'nics'],
    queryFn: () => listVmNics(vmId),
    refetchInterval: refreshIntervalMs,
  })
}
