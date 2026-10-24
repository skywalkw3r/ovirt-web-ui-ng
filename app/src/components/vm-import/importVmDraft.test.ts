import { describe, expect, it } from 'vitest'
import {
  blankImportDraft,
  buildVpxUrl,
  exportDomainImportBody,
  externalImportSpec,
  isExternalSource,
  sourceStepValid,
  sourceUrl,
  targetStepValid,
  type ImportVmDraft,
} from './importVmDraft'

// Pure branch-logic tests for the import wizard's draft module (the
// networkDraft.test.ts pattern): validation gates per source kind, the vpx
// URL composition, and the two payload builders.

function draft(patch: Partial<ImportVmDraft>): ImportVmDraft {
  return { ...blankImportDraft(), ...patch }
}

describe('importVmDraft', () => {
  // ── source-kind branch logic ───────────────────────────────────────────────

  it('classifies exportDomain as internal and the three providers as external', () => {
    expect(isExternalSource('exportDomain')).toBe(false)
    expect(isExternalSource('vmware')).toBe(true)
    expect(isExternalSource('kvm')).toBe(true)
    expect(isExternalSource('xen')).toBe(true)
  })

  it('blank draft defaults: export-domain source, thin disks, TLS verification off', () => {
    const blank = blankImportDraft()
    expect(blank.source).toBe('exportDomain')
    expect(blank.sparse).toBe(true)
    expect(blank.vmwareVerify).toBe(false)
    expect(blank.clone).toBe(false)
    expect(blank.collapseSnapshots).toBe(false)
  })

  // ── vpx URL composition ────────────────────────────────────────────────────

  it('buildVpxUrl composes user@vcenter/DC/cluster/esxi with no_verify=1 by default', () => {
    const url = buildVpxUrl(
      draft({
        source: 'vmware',
        username: 'vmware_user',
        vmwareVcenter: 'vcenter.lab',
        vmwareDataCenter: 'DC1',
        vmwareCluster: 'Cluster1',
        vmwareEsxi: 'esxi-01.lab',
      }),
    )
    expect(url).toBe('vpx://vmware_user@vcenter.lab/DC1/Cluster1/esxi-01.lab?no_verify=1')
  })

  it('buildVpxUrl drops the cluster segment when blank (DC/host form)', () => {
    const url = buildVpxUrl(
      draft({
        username: 'u',
        vmwareVcenter: 'vc',
        vmwareDataCenter: 'DC1',
        vmwareEsxi: 'esxi-01',
      }),
    )
    expect(url).toBe('vpx://u@vc/DC1/esxi-01?no_verify=1')
  })

  it('buildVpxUrl percent-encodes the username and omits no_verify when verifying TLS', () => {
    const url = buildVpxUrl(
      draft({
        username: 'user@corp.example',
        vmwareVcenter: 'vc',
        vmwareDataCenter: 'DC1',
        vmwareEsxi: 'esxi-01',
        vmwareVerify: true,
      }),
    )
    expect(url).toBe('vpx://user%40corp.example@vc/DC1/esxi-01')
  })

  it('buildVpxUrl passes folder paths in the data-center segment through verbatim', () => {
    const url = buildVpxUrl(
      draft({
        username: 'u',
        vmwareVcenter: 'vc',
        vmwareDataCenter: 'Folder/DC1',
        vmwareEsxi: 'esxi-01',
      }),
    )
    expect(url).toBe('vpx://u@vc/Folder/DC1/esxi-01?no_verify=1')
  })

  it('sourceUrl branches: vpx for vmware, the typed URI for kvm/xen, empty for exportDomain', () => {
    expect(
      sourceUrl(
        draft({
          source: 'vmware',
          username: 'u',
          vmwareVcenter: 'vc',
          vmwareDataCenter: 'DC',
          vmwareEsxi: 'esx',
        }),
      ),
    ).toBe('vpx://u@vc/DC/esx?no_verify=1')
    expect(sourceUrl(draft({ source: 'kvm', libvirtUri: ' qemu+ssh://root@host/system ' }))).toBe(
      'qemu+ssh://root@host/system',
    )
    expect(sourceUrl(draft({ source: 'xen', libvirtUri: 'xen+ssh://root@host' }))).toBe(
      'xen+ssh://root@host',
    )
    expect(sourceUrl(draft({ source: 'exportDomain' }))).toBe('')
  })

  // ── step validation per branch ─────────────────────────────────────────────

  it('export-domain source step needs only the domain pick', () => {
    expect(sourceStepValid(draft({ source: 'exportDomain' }))).toBe(false)
    expect(sourceStepValid(draft({ source: 'exportDomain', exportDomainId: 'sd-04' }))).toBe(true)
  })

  it('vmware source step needs vcenter + DC + esxi + credentials + source VM name', () => {
    const complete = draft({
      source: 'vmware',
      vmwareVcenter: 'vc',
      vmwareDataCenter: 'DC',
      vmwareEsxi: 'esx',
      username: 'u',
      password: 'p',
      sourceVmName: 'legacy-web',
    })
    expect(sourceStepValid(complete)).toBe(true)
    expect(sourceStepValid({ ...complete, vmwareVcenter: ' ' })).toBe(false)
    expect(sourceStepValid({ ...complete, vmwareDataCenter: '' })).toBe(false)
    expect(sourceStepValid({ ...complete, vmwareEsxi: '' })).toBe(false)
    expect(sourceStepValid({ ...complete, username: '' })).toBe(false)
    expect(sourceStepValid({ ...complete, password: '' })).toBe(false)
    expect(sourceStepValid({ ...complete, sourceVmName: '' })).toBe(false)
    // the optional vCenter cluster segment never gates
    expect(sourceStepValid({ ...complete, vmwareCluster: '' })).toBe(true)
  })

  it('kvm/xen source steps need a libvirt URI + source VM name; credentials stay optional', () => {
    const complete = draft({
      source: 'kvm',
      libvirtUri: 'qemu+ssh://root@host/system',
      sourceVmName: 'kvm-guest',
    })
    expect(sourceStepValid(complete)).toBe(true)
    expect(sourceStepValid({ ...complete, username: '', password: '' })).toBe(true)
    expect(sourceStepValid({ ...complete, libvirtUri: '' })).toBe(false)
    expect(sourceStepValid({ ...complete, sourceVmName: ' ' })).toBe(false)
    expect(sourceStepValid({ ...complete, source: 'xen' })).toBe(true)
  })

  it('target step needs cluster + storage domain on both paths, plus a name on the external one', () => {
    const base = draft({ clusterId: 'cl-01', storageDomainId: 'sd-01' })
    expect(targetStepValid(base)).toBe(true)
    expect(targetStepValid({ ...base, clusterId: '' })).toBe(false)
    expect(targetStepValid({ ...base, storageDomainId: '' })).toBe(false)
    // external sources also require the created VM's name
    expect(targetStepValid({ ...base, source: 'kvm' })).toBe(false)
    expect(targetStepValid({ ...base, source: 'kvm', targetVmName: 'imported' })).toBe(true)
  })

  // ── payload builders ───────────────────────────────────────────────────────

  it('exportDomainImportBody carries the targets and drops false toggles', () => {
    expect(exportDomainImportBody(draft({ clusterId: 'cl-01', storageDomainId: 'sd-01' }))).toEqual(
      {
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
        clone: undefined,
        collapseSnapshots: undefined,
      },
    )
    expect(
      exportDomainImportBody(
        draft({
          clusterId: 'cl-01',
          storageDomainId: 'sd-01',
          clone: true,
          collapseSnapshots: true,
        }),
      ),
    ).toEqual({
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      clone: true,
      collapseSnapshots: true,
    })
  })

  it('externalImportSpec builds the full VMware spec with the composed vpx URL', () => {
    const spec = externalImportSpec(
      draft({
        source: 'vmware',
        vmwareVcenter: 'vcenter.lab',
        vmwareDataCenter: 'DC1',
        vmwareCluster: 'Cluster1',
        vmwareEsxi: 'esxi-01.lab',
        username: 'vmware_user',
        password: 's3cret',
        proxyHostId: 'host-01',
        sourceVmName: ' legacy-web ',
        targetVmName: ' imported-web ',
        sparse: false,
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
      }),
    )
    expect(spec).toEqual({
      provider: 'vmware',
      url: 'vpx://vmware_user@vcenter.lab/DC1/Cluster1/esxi-01.lab?no_verify=1',
      name: 'legacy-web',
      targetName: 'imported-web',
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      sparse: false,
      username: 'vmware_user',
      password: 's3cret',
      hostId: 'host-01',
    })
  })

  it('externalImportSpec leaves blank credentials/host undefined for a kvm ssh URI', () => {
    const spec = externalImportSpec(
      draft({
        source: 'kvm',
        libvirtUri: 'qemu+ssh://root@kvm-host/system',
        sourceVmName: 'kvm-guest',
        targetVmName: 'kvm-guest',
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
      }),
    )
    expect(spec.provider).toBe('kvm')
    expect(spec.url).toBe('qemu+ssh://root@kvm-host/system')
    expect(spec.username).toBeUndefined()
    expect(spec.password).toBeUndefined()
    expect(spec.hostId).toBeUndefined()
  })

  it('externalImportSpec throws on an export-domain draft — that branch has its own wire path', () => {
    expect(() => externalImportSpec(draft({ source: 'exportDomain' }))).toThrow(
      /export-domain draft/,
    )
  })
})
