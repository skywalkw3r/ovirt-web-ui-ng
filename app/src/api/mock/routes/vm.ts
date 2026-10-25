import { ApiError } from '../../transport'
import type { MockRoute } from './types'

// Mock routes for the VM area (watchdogs, vNIC network filter parameters). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.

interface MockWatchdog {
  id: string
  model: string
  action: string
  vm: { id: string }
}

interface MockNetworkFilterParameter {
  id: string
  name: string
  value: string
  nic: { id: string }
}

// vm-02 carries a watchdog so the Edit VM HA tab opens on a populated device;
// every other VM starts without one (the common case, and the add path).
const initialWatchdogs = (): Map<string, MockWatchdog[]> =>
  new Map([
    ['vm-02', [{ id: 'vm-02-watchdog', model: 'i6300esb', action: 'reset', vm: { id: 'vm-02' } }]],
  ])

// Keyed `${vmId}/${nicId}`. vm-03's first NIC carries a clean-traffic style
// pair so the Edit Network Interface dialog opens on populated rows.
const initialFilterParameters = (): Map<string, MockNetworkFilterParameter[]> =>
  new Map([
    [
      'vm-03/vm-03-nic-1',
      [
        { id: 'nfp-01', name: 'IP', value: '10.0.0.13', nic: { id: 'vm-03-nic-1' } },
        { id: 'nfp-02', name: 'CTRL_IP_LEARNING', value: 'none', nic: { id: 'vm-03-nic-1' } },
      ],
    ],
  ])

let watchdogs = initialWatchdogs()
let filterParameters = initialFilterParameters()
let seq = 0

// Restores the pristine fixtures. Tests that mutate these routes call it in
// their own afterEach (test/mockState.ts resets the core handlers only).
export function resetVmRouteMocks(): void {
  watchdogs = initialWatchdogs()
  filterParameters = initialFilterParameters()
  seq = 0
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

// Mirrors the engine's enum validation (api-model WatchdogModel/WatchdogAction).
const WATCHDOG_MODELS = ['i6300esb', 'diag288']
const WATCHDOG_ACTIONS = ['none', 'reset', 'poweroff', 'pause', 'dump']

function checkWatchdogEnums(model: string | undefined, action: string | undefined): void {
  if (model !== undefined && !WATCHDOG_MODELS.includes(model)) {
    throw new ApiError(400, 'Bad Request', `invalid watchdog model ${model}`)
  }
  if (action !== undefined && !WATCHDOG_ACTIONS.includes(action)) {
    throw new ApiError(400, 'Bad Request', `invalid watchdog action ${action}`)
  }
}

function findWatchdog(vmId: string, watchdogId: string): MockWatchdog {
  const found = watchdogs.get(vmId)?.find((watchdog) => watchdog.id === watchdogId)
  if (!found) throw new ApiError(404, 'Not Found', `no watchdog ${watchdogId} on VM ${vmId}`)
  return found
}

function findParameter(key: string, parameterId: string): MockNetworkFilterParameter {
  const found = filterParameters.get(key)?.find((parameter) => parameter.id === parameterId)
  if (!found) throw new ApiError(404, 'Not Found', `no network filter parameter ${parameterId}`)
  return found
}

export const vmRoutes: MockRoute[] = [
  // GET /vms/{id}/watchdogs: the engine omits the "watchdog" key when empty.
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/watchdogs$/,
    handle: ([vmId]) => {
      const list = watchdogs.get(vmId) ?? []
      return list.length > 0 ? { watchdog: list } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/watchdogs$/,
    handle: ([vmId], body) => {
      const spec = asRecord(body)
      const model = optionalString(spec.model)
      const action = optionalString(spec.action)
      // VmWatchdogsService.Add: model and action are both mandatory
      if (model === undefined || action === undefined) {
        throw new ApiError(400, 'Bad Request', 'watchdog model and action are required')
      }
      checkWatchdogEnums(model, action)
      if ((watchdogs.get(vmId) ?? []).length > 0) {
        throw new ApiError(409, 'Conflict', 'Cannot add watchdog. The VM already has one.')
      }
      seq += 1
      const created: MockWatchdog = {
        id: `${vmId}-watchdog-${seq}`,
        model,
        action,
        vm: { id: vmId },
      }
      watchdogs.set(vmId, [created])
      return created
    },
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)\/watchdogs\/([^/]+)$/,
    handle: ([vmId, watchdogId], body) => {
      const found = findWatchdog(vmId, watchdogId)
      const spec = asRecord(body)
      const model = optionalString(spec.model)
      const action = optionalString(spec.action)
      checkWatchdogEnums(model, action)
      const updated = { ...found, model: model ?? found.model, action: action ?? found.action }
      watchdogs.set(vmId, [updated])
      return updated
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/watchdogs\/([^/]+)$/,
    handle: ([vmId, watchdogId]) => {
      findWatchdog(vmId, watchdogId)
      watchdogs.set(
        vmId,
        (watchdogs.get(vmId) ?? []).filter((watchdog) => watchdog.id !== watchdogId),
      )
      return undefined
    },
  },

  // GET /vms/{vm}/nics/{nic}/networkfilterparameters: key omitted when empty.
  {
    method: 'GET',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)\/networkfilterparameters$/,
    handle: ([vmId, nicId]) => {
      const list = filterParameters.get(`${vmId}/${nicId}`) ?? []
      return list.length > 0 ? { network_filter_parameter: list } : {}
    },
  },
  {
    method: 'POST',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)\/networkfilterparameters$/,
    handle: ([vmId, nicId], body) => {
      const spec = asRecord(body)
      const name = optionalString(spec.name)
      if (name === undefined || name.trim() === '') {
        throw new ApiError(400, 'Bad Request', 'network filter parameter name is required')
      }
      seq += 1
      const created: MockNetworkFilterParameter = {
        id: `nfp-new-${seq}`,
        name,
        value: optionalString(spec.value) ?? '',
        nic: { id: nicId },
      }
      const key = `${vmId}/${nicId}`
      filterParameters.set(key, [...(filterParameters.get(key) ?? []), created])
      return created
    },
  },
  {
    method: 'PUT',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)\/networkfilterparameters\/([^/]+)$/,
    handle: ([vmId, nicId, parameterId], body) => {
      const key = `${vmId}/${nicId}`
      const found = findParameter(key, parameterId)
      const spec = asRecord(body)
      const updated = {
        ...found,
        name: optionalString(spec.name) ?? found.name,
        value: optionalString(spec.value) ?? found.value,
      }
      filterParameters.set(
        key,
        (filterParameters.get(key) ?? []).map((parameter) =>
          parameter.id === parameterId ? updated : parameter,
        ),
      )
      return updated
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/vms\/([^/]+)\/nics\/([^/]+)\/networkfilterparameters\/([^/]+)$/,
    handle: ([vmId, nicId, parameterId]) => {
      const key = `${vmId}/${nicId}`
      findParameter(key, parameterId)
      filterParameters.set(
        key,
        (filterParameters.get(key) ?? []).filter((parameter) => parameter.id !== parameterId),
      )
      return undefined
    },
  },
]
