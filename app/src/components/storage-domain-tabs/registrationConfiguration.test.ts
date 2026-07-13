import { describe, expect, it } from 'vitest'
import { buildRegistrationBody } from './registrationConfiguration'

// Pure builder — assert the exact registration_configuration wire shape against
// the api-model (types/RegistrationConfiguration + Registration*Mapping): each
// collection is a { plural: { registration_*_mapping: [{ from, to }] } } wrapper,
// and reassign_bad_macs rides at the top level, never inside the config.

describe('buildRegistrationBody', () => {
  it('returns {} for an empty draft so the simple register path sends nothing extra', () => {
    expect(buildRegistrationBody({})).toEqual({})
    expect(
      buildRegistrationBody({
        clusterMappings: [],
        roleMappings: [],
        vnicProfileMappings: [],
        reassignBadMacs: false,
      }),
    ).toEqual({})
  })

  it('wraps cluster mappings with the singular element name and a { from, to }', () => {
    expect(
      buildRegistrationBody({
        clusterMappings: [{ fromName: 'oldcluster', target: { id: 'c-1' } }],
      }),
    ).toEqual({
      registration_configuration: {
        cluster_mappings: {
          registration_cluster_mapping: [{ from: { name: 'oldcluster' }, to: { id: 'c-1' } }],
        },
      },
    })
  })

  it('maps roles by target name when no id is set', () => {
    expect(
      buildRegistrationBody({
        roleMappings: [{ fromName: 'SuperUser', target: { name: 'UserVmRunTimeManager' } }],
      }),
    ).toEqual({
      registration_configuration: {
        role_mappings: {
          registration_role_mapping: [
            { from: { name: 'SuperUser' }, to: { name: 'UserVmRunTimeManager' } },
          ],
        },
      },
    })
  })

  it('prefers target id over name when both are set', () => {
    const body = buildRegistrationBody({
      clusterMappings: [{ fromName: 'old', target: { id: 'c-9', name: 'ignored' } }],
    })
    expect(
      (body.registration_configuration as Record<string, Record<string, unknown[]>>)
        .cluster_mappings.registration_cluster_mapping[0],
    ).toEqual({ from: { name: 'old' }, to: { id: 'c-9' } })
  })

  it('builds domain and affinity mappings under their own wrappers', () => {
    expect(
      buildRegistrationBody({
        domainMappings: [{ fromName: 'redhat', target: { name: 'internal' } }],
        affinityGroupMappings: [{ fromName: 'ag-src', target: { name: 'ag-dst' } }],
        affinityLabelMappings: [{ fromName: 'al-src', target: { name: 'al-dst' } }],
      }),
    ).toEqual({
      registration_configuration: {
        domain_mappings: {
          registration_domain_mapping: [{ from: { name: 'redhat' }, to: { name: 'internal' } }],
        },
        affinity_group_mappings: {
          registration_affinity_group_mapping: [
            { from: { name: 'ag-src' }, to: { name: 'ag-dst' } },
          ],
        },
        affinity_label_mappings: {
          registration_affinity_label_mapping: [
            { from: { name: 'al-src' }, to: { name: 'al-dst' } },
          ],
        },
      },
    })
  })

  it('carries the external network + profile names on a vNIC mapping from, target by id', () => {
    expect(
      buildRegistrationBody({
        vnicProfileMappings: [
          { sourceNetworkName: 'red', sourceProfileName: 'gold', target: { id: 'vp-1' } },
        ],
      }),
    ).toEqual({
      registration_configuration: {
        vnic_profile_mappings: {
          registration_vnic_profile_mapping: [
            { from: { name: 'gold', network: { name: 'red' } }, to: { id: 'vp-1' } },
          ],
        },
      },
    })
  })

  it('emits a vNIC mapping with only `from` when the target is unset (map to empty profile)', () => {
    const body = buildRegistrationBody({
      vnicProfileMappings: [{ sourceNetworkName: 'red', sourceProfileName: 'gold', target: {} }],
    })
    expect(
      (body.registration_configuration as Record<string, Record<string, unknown[]>>)
        .vnic_profile_mappings.registration_vnic_profile_mapping[0],
    ).toEqual({ from: { name: 'gold', network: { name: 'red' } } })
  })

  it('drops incomplete rows: blank source, unresolved target, or a partial vNIC source', () => {
    expect(
      buildRegistrationBody({
        clusterMappings: [
          { fromName: '  ', target: { id: 'c-1' } }, // blank source
          { fromName: 'old', target: { id: '  ' } }, // unresolved target
        ],
        vnicProfileMappings: [
          { sourceNetworkName: 'red', sourceProfileName: '', target: { id: 'vp-1' } }, // no profile name
          { sourceNetworkName: '', sourceProfileName: 'gold', target: { id: 'vp-1' } }, // no network name
        ],
      }),
    ).toEqual({})
  })

  it('trims surrounding whitespace on names before sending', () => {
    expect(
      buildRegistrationBody({
        clusterMappings: [{ fromName: '  old  ', target: { name: '  new  ' } }],
      }),
    ).toEqual({
      registration_configuration: {
        cluster_mappings: {
          registration_cluster_mapping: [{ from: { name: 'old' }, to: { name: 'new' } }],
        },
      },
    })
  })

  it('puts reassign_bad_macs at the top level, beside (not inside) registration_configuration', () => {
    expect(
      buildRegistrationBody({
        reassignBadMacs: true,
        clusterMappings: [{ fromName: 'old', target: { id: 'c-1' } }],
      }),
    ).toEqual({
      reassign_bad_macs: true,
      registration_configuration: {
        cluster_mappings: {
          registration_cluster_mapping: [{ from: { name: 'old' }, to: { id: 'c-1' } }],
        },
      },
    })
  })

  it('sends reassign_bad_macs alone when no mappings are set', () => {
    expect(buildRegistrationBody({ reassignBadMacs: true })).toEqual({ reassign_bad_macs: true })
  })
})
