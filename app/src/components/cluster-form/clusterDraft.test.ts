import { describe, expect, it } from 'vitest'
import { ClusterSchema } from '../../api/schemas/cluster'
import { blankDraft, buildSavePayload, clusterToDraft } from './clusterDraft'

// Management network + default network provider are add-only over REST
// (api-model ClustersService.add); these pin the create/edit split.
describe('clusterDraft: create-time networking', () => {
  it('starts blank: no management network or provider in a fresh create body', () => {
    const payload = buildSavePayload({ ...blankDraft(), name: 'c', dataCenterId: 'dc-1' }, false)
    expect(payload.management_network).toBeUndefined()
    expect(payload.external_network_providers).toBeUndefined()
    expect(payload.data_center).toEqual({ id: 'dc-1' })
  })

  it('sends the picked management network and provider (by id) on create', () => {
    const payload = buildSavePayload(
      {
        ...blankDraft(),
        name: 'c',
        dataCenterId: 'dc-1',
        managementNetworkId: 'net-01',
        defaultNetworkProviderId: 'onp-01',
      },
      false,
    )
    expect(payload.management_network).toEqual({ id: 'net-01' })
    expect(payload.external_network_providers).toEqual({
      external_provider: [{ id: 'onp-01' }],
    })
  })

  it('never sends either on edit, even when the draft carries values', () => {
    const cluster = ClusterSchema.parse({
      id: 'c1',
      name: 'prod',
      management_network: { id: 'net-01' },
    })
    const draft = clusterToDraft(cluster)
    expect(draft.managementNetworkId).toBe('net-01')
    const payload = buildSavePayload({ ...draft, defaultNetworkProviderId: 'onp-01' }, true)
    expect(payload.management_network).toBeUndefined()
    expect(payload.external_network_providers).toBeUndefined()
  })
})
