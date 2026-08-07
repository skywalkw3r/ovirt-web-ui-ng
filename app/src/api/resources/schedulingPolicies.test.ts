import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPolicyFilter,
  buildPolicyPayload,
  diffUnitAssignments,
  FILTER_POSITION_VALUE,
  filterPositionOf,
  groupPolicyUnits,
  isEmptyAssignmentDiff,
  isLockedPolicy,
  isPropertyFilled,
  listPolicyFilters,
  listSchedulingPolicies,
  listSchedulingPolicyUnits,
  type CurrentAssignments,
  type SchedulingPolicyDraft,
  type SchedulingPolicyUnit,
} from './schedulingPolicies'
import { clearSessionToken, setSessionToken } from '../session'

// A submittable editor draft: a named policy with a property, a positioned
// filter, a weight, and a balancer. Tests override single fields from here so
// each case reads as "this draft except …" (mirror roles.test.ts).
function draft(overrides: Partial<SchedulingPolicyDraft> = {}): SchedulingPolicyDraft {
  return {
    name: 'lab_power_saving',
    description: 'consolidate lab VMs',
    properties: [{ key: 'HighUtilization', value: '80' }],
    filters: [{ unitId: 'unit-f1', position: 'first' }],
    weights: [{ unitId: 'unit-w1', factor: 2 }],
    balancerUnitId: 'unit-b1',
    ...overrides,
  }
}

describe('buildPolicyPayload', () => {
  it('emits name, description, and the nested properties.property[] map', () => {
    const body = buildPolicyPayload(draft())
    expect(body).toEqual({
      name: 'lab_power_saving',
      description: 'consolidate lab VMs',
      properties: { property: [{ name: 'HighUtilization', value: '80' }] },
    })
  })

  it('never inlines filters/weights/balances (they are @Link — sub-collections only)', () => {
    const body = buildPolicyPayload(draft())
    expect(body).not.toHaveProperty('filters')
    expect(body).not.toHaveProperty('weights')
    expect(body).not.toHaveProperty('balances')
  })

  it('trims the name, description, and each property side', () => {
    const body = buildPolicyPayload(
      draft({
        name: '  lab_power_saving  ',
        description: '  spaced  ',
        properties: [{ key: '  HighUtilization ', value: ' 80  ' }],
      }),
    )
    expect(body.name).toBe('lab_power_saving')
    expect(body.description).toBe('spaced')
    expect(body.properties).toEqual({ property: [{ name: 'HighUtilization', value: '80' }] })
  })

  it('drops fully blank property rows (editor scaffolding) and keeps half-filled ones', () => {
    const body = buildPolicyPayload(
      draft({
        properties: [
          { key: 'HighUtilization', value: '80' },
          { key: '', value: '' },
          { key: '  ', value: '' },
          { key: 'LowUtilization', value: '' },
        ],
      }),
    )
    expect(body.properties).toEqual({
      property: [
        { name: 'HighUtilization', value: '80' },
        { name: 'LowUtilization', value: '' },
      ],
    })
  })

  it('emits an empty property block when no rows have content', () => {
    const body = buildPolicyPayload(draft({ properties: [] }))
    expect(body.properties).toEqual({ property: [] })
  })
})

describe('isPropertyFilled', () => {
  it('is false only for a fully blank / whitespace-only row', () => {
    expect(isPropertyFilled({ key: '', value: '' })).toBe(false)
    expect(isPropertyFilled({ key: '  ', value: ' ' })).toBe(false)
    expect(isPropertyFilled({ key: 'HighUtilization', value: '' })).toBe(true)
    expect(isPropertyFilled({ key: '', value: '80' })).toBe(true)
  })
})

describe('filter position mapping', () => {
  it('maps first/last/none to the webadmin wire integers (-1 / 1 / 0)', () => {
    expect(FILTER_POSITION_VALUE.first).toBe(-1)
    expect(FILTER_POSITION_VALUE.last).toBe(1)
    expect(FILTER_POSITION_VALUE.none).toBe(0)
  })

  it('reads any negative as first and any positive as last (webadmin posture)', () => {
    expect(filterPositionOf(-1)).toBe('first')
    expect(filterPositionOf(1)).toBe('last')
    expect(filterPositionOf(0)).toBe('none')
    expect(filterPositionOf(undefined)).toBe('none')
  })
})

describe('isLockedPolicy', () => {
  it('treats both boolean and string true as locked', () => {
    expect(isLockedPolicy({ id: 'p', locked: true })).toBe(true)
    expect(isLockedPolicy({ id: 'p', locked: 'true' })).toBe(true)
    expect(isLockedPolicy({ id: 'p', locked: 'false' })).toBe(false)
    expect(isLockedPolicy({ id: 'p', locked: false })).toBe(false)
    expect(isLockedPolicy({ id: 'p' })).toBe(false)
  })
})

describe('groupPolicyUnits', () => {
  const units: SchedulingPolicyUnit[] = [
    { id: 'u1', name: 'PinToHost', type: 'filter' },
    { id: 'u2', name: 'Memory', type: 'filter' },
    { id: 'u3', name: 'OptimalForEvenDistribution', type: 'weight' },
    { id: 'u4', name: 'OptimalForEvenGuestDistribution', type: 'WEIGHT' },
    { id: 'u5', name: 'OptimalForPowerSaving', type: 'load_balancing' },
    { id: 'u6', name: 'FutureUnit', type: 'quantum_annealing' },
  ]

  it('groups by unit type case-insensitively, sorted by name', () => {
    const grouped = groupPolicyUnits(units)
    expect(grouped.filters.map((u) => u.name)).toEqual(['Memory', 'PinToHost'])
    expect(grouped.weights.map((u) => u.name)).toEqual([
      'OptimalForEvenDistribution',
      'OptimalForEvenGuestDistribution',
    ])
    expect(grouped.balancers.map((u) => u.name)).toEqual(['OptimalForPowerSaving'])
  })

  it('drops units with an unknown type (nowhere to assign them)', () => {
    const grouped = groupPolicyUnits(units)
    const all = [...grouped.filters, ...grouped.weights, ...grouped.balancers]
    expect(all.find((u) => u.id === 'u6')).toBeUndefined()
  })
})

describe('diffUnitAssignments', () => {
  const current: CurrentAssignments = {
    filters: [
      { id: 'unit-f1', position: -1, scheduling_policy_unit: { id: 'unit-f1' } },
      { id: 'unit-f2', position: 0, scheduling_policy_unit: { id: 'unit-f2' } },
    ],
    weights: [{ id: 'unit-w1', factor: 2, scheduling_policy_unit: { id: 'unit-w1' } }],
    balances: [{ id: 'unit-b1', scheduling_policy_unit: { id: 'unit-b1' } }],
  }

  it('is a no-op when the draft matches the current assignments', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [
          { unitId: 'unit-f1', position: 'first' },
          { unitId: 'unit-f2', position: 'none' },
        ],
        weights: [{ unitId: 'unit-w1', factor: 2 }],
        balancerUnitId: 'unit-b1',
      }),
    )
    expect(isEmptyAssignmentDiff(diff)).toBe(true)
  })

  it('adds newly checked units and removes unchecked ones', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [{ unitId: 'unit-f1', position: 'first' }], // f2 dropped
        weights: [
          { unitId: 'unit-w1', factor: 2 },
          { unitId: 'unit-w2', factor: 1 }, // w2 added
        ],
        balancerUnitId: 'unit-b1',
      }),
    )
    expect(diff.filterIdsToRemove).toEqual(['unit-f2'])
    expect(diff.filtersToAdd).toEqual([])
    expect(diff.weightsToAdd).toEqual([{ unitId: 'unit-w2', factor: 1 }])
    expect(diff.weightIdsToRemove).toEqual([])
  })

  it('re-adds a filter whose position changed (no PUT on the sub-resource)', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [
          { unitId: 'unit-f1', position: 'none' }, // was first
          { unitId: 'unit-f2', position: 'none' },
        ],
        weights: [{ unitId: 'unit-w1', factor: 2 }],
        balancerUnitId: 'unit-b1',
      }),
    )
    expect(diff.filterIdsToRemove).toEqual(['unit-f1'])
    expect(diff.filtersToAdd).toEqual([{ unitId: 'unit-f1', position: 'none' }])
  })

  it('re-adds a weight whose factor changed', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [
          { unitId: 'unit-f1', position: 'first' },
          { unitId: 'unit-f2', position: 'none' },
        ],
        weights: [{ unitId: 'unit-w1', factor: 5 }],
        balancerUnitId: 'unit-b1',
      }),
    )
    expect(diff.weightIdsToRemove).toEqual(['unit-w1'])
    expect(diff.weightsToAdd).toEqual([{ unitId: 'unit-w1', factor: 5 }])
  })

  it('replaces the balancer by removing the old row and adding the new unit', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [
          { unitId: 'unit-f1', position: 'first' },
          { unitId: 'unit-f2', position: 'none' },
        ],
        weights: [{ unitId: 'unit-w1', factor: 2 }],
        balancerUnitId: 'unit-b2',
      }),
    )
    expect(diff.balanceIdsToRemove).toEqual(['unit-b1'])
    expect(diff.balanceUnitIdsToAdd).toEqual(['unit-b2'])
  })

  it('clears the balancer when the draft selects none', () => {
    const diff = diffUnitAssignments(
      current,
      draft({
        filters: [
          { unitId: 'unit-f1', position: 'first' },
          { unitId: 'unit-f2', position: 'none' },
        ],
        weights: [{ unitId: 'unit-w1', factor: 2 }],
        balancerUnitId: null,
      }),
    )
    expect(diff.balanceIdsToRemove).toEqual(['unit-b1'])
    expect(diff.balanceUnitIdsToAdd).toEqual([])
  })

  it('adds everything against an empty baseline (the create path)', () => {
    const diff = diffUnitAssignments({ filters: [], weights: [], balances: [] }, draft())
    expect(diff.filtersToAdd).toEqual([{ unitId: 'unit-f1', position: 'first' }])
    expect(diff.weightsToAdd).toEqual([{ unitId: 'unit-w1', factor: 2 }])
    expect(diff.balanceUnitIdsToAdd).toEqual(['unit-b1'])
    expect(diff.filterIdsToRemove).toEqual([])
    expect(diff.weightIdsToRemove).toEqual([])
    expect(diff.balanceIdsToRemove).toEqual([])
  })
})

// Transport-level checks: stub global fetch (same posture as roles.test.ts /
// vnicProfiles.test.ts) to verify wire shapes and coercion — never the mock
// engine.
function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('resource functions over the transport', () => {
  beforeEach(() => {
    setSessionToken('tok-123')
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('listSchedulingPolicies coerces string/bool locked flags and inline properties', async () => {
    mockFetch(200, {
      scheduling_policy: [
        {
          id: 'sp-02',
          name: 'power_saving',
          locked: 'true',
          default_policy: false,
          properties: { property: [{ name: 'HighUtilization', value: 80 }] },
        },
        { id: 'sp-99', name: 'lab_custom', locked: false },
      ],
    })
    const policies = await listSchedulingPolicies()
    expect(policies).toHaveLength(2)
    expect(isLockedPolicy(policies[0])).toBe(true)
    expect(isLockedPolicy(policies[1])).toBe(false)
    // numeric property values coerce to string for a uniform read model
    expect(policies[0].properties?.property?.[0].value).toBe('80')
  })

  it('listSchedulingPolicyUnits parses the scheduling_policy_unit collection key', async () => {
    mockFetch(200, {
      scheduling_policy_unit: [
        { id: 'u1', name: 'PinToHost', type: 'filter', internal: 'true', enabled: true },
      ],
    })
    const units = await listSchedulingPolicyUnits()
    expect(units.map((u) => u.name)).toEqual(['PinToHost'])
  })

  it('listPolicyFilters treats a 404 on the sub-collection as empty, not an error', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listPolicyFilters('sp-99')).resolves.toEqual([])
  })

  it('addPolicyFilter posts the unit link with the position only when non-zero', async () => {
    const fetchFn = mockFetch(200, {
      id: 'unit-f1',
      position: -1,
      scheduling_policy_unit: { id: 'unit-f1' },
    })
    await addPolicyFilter('sp-99', { unitId: 'unit-f1', position: 'first' })
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/schedulingpolicies/sp-99/filters')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      scheduling_policy_unit: { id: 'unit-f1' },
      position: -1,
    })

    mockFetch(200, { id: 'unit-f2', scheduling_policy_unit: { id: 'unit-f2' } })
    await addPolicyFilter('sp-99', { unitId: 'unit-f2', position: 'none' })
    const [, unpositionedInit] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(unpositionedInit.body as string)).toEqual({
      scheduling_policy_unit: { id: 'unit-f2' },
    })
  })
})
