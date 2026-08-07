import type {
  ExternalVmImportSpec,
  ExternalVmProvider,
} from '../../api/resources/externalVmImports'
import type { ExportDomainVmImportBody } from '../../api/resources/storageDomains'

// The import wizard's source branches. 'exportDomain' is the legacy
// export-domain copy (POST /storagedomains/{id}/vms/{vmId}/import); the other
// three ride POST /externalvmimports (virt-v2v). OVA is deliberately absent:
// the api-model's ExternalVmProviderType is exactly KVM | XEN | VMWARE and no
// OVA-import REST endpoint exists (webadmin's OVA leg is an internal GWT
// query the REST API never grew) — see resources/externalVmImports.ts.
export type ImportSourceKind = 'exportDomain' | ExternalVmProvider

export const IMPORT_SOURCE_KINDS: ImportSourceKind[] = ['exportDomain', 'vmware', 'kvm', 'xen']

export function isExternalSource(source: ImportSourceKind): source is ExternalVmProvider {
  return source !== 'exportDomain'
}

// The flat, always-defined draft the wizard owns (networkDraft's posture:
// optional wire scalars collapse to ''/false so every input stays controlled).
// Selected export-domain VMs live in wizard state, not here — the draft only
// carries what the payload builders and validators read.
export interface ImportVmDraft {
  source: ImportSourceKind
  // — export-domain leg —
  exportDomainId: string
  clone: boolean
  collapseSnapshots: boolean
  // — VMware connection (composed into a vpx:// URL) —
  vmwareVcenter: string
  vmwareDataCenter: string
  // ESXi cluster path segment; optional — vpx URLs work as DC/host too
  vmwareCluster: string
  vmwareEsxi: string
  vmwareVerify: boolean
  // — KVM/Xen connection —
  libvirtUri: string
  // — shared external fields —
  username: string
  password: string
  proxyHostId: string
  sourceVmName: string
  targetVmName: string
  sparse: boolean
  // — shared target —
  clusterId: string
  storageDomainId: string
}

// Blank wizard defaults: export domain first (the only source that needs no
// typing), thin-provisioned disks (webadmin's default), TLS verification off
// (the ubiquitous self-signed-vCenter case — mirrors webadmin always
// appending no_verify=1).
export function blankImportDraft(): ImportVmDraft {
  return {
    source: 'exportDomain',
    exportDomainId: '',
    clone: false,
    collapseSnapshots: false,
    vmwareVcenter: '',
    vmwareDataCenter: '',
    vmwareCluster: '',
    vmwareEsxi: '',
    vmwareVerify: false,
    libvirtUri: '',
    username: '',
    password: '',
    proxyHostId: '',
    sourceVmName: '',
    targetVmName: '',
    sparse: true,
    clusterId: '',
    storageDomainId: '',
  }
}

// Compose the vpx:// URL virt-v2v dials for a VMware import, the way webadmin
// does (api-model example: vpx://user@vcenter-host/DataCenter/Cluster/esxi-host
// ?no_verify=1). The username is percent-encoded into the authority (an AD
// user@domain would otherwise break the URL) and ALSO rides as a separate
// body field; the cluster path segment is optional (vCenter resolves
// DataCenter/host paths without one); no_verify=1 is appended unless the user
// asked to verify TLS. The data-center segment may itself contain '/' (vCenter
// folder paths) and is passed through verbatim.
export function buildVpxUrl(draft: ImportVmDraft): string {
  const auth = draft.username.trim() === '' ? '' : `${encodeURIComponent(draft.username.trim())}@`
  const segments = [
    draft.vmwareDataCenter.trim(),
    draft.vmwareCluster.trim(),
    draft.vmwareEsxi.trim(),
  ]
    .filter((segment) => segment !== '')
    .join('/')
  const verify = draft.vmwareVerify ? '' : '?no_verify=1'
  return `vpx://${auth}${draft.vmwareVcenter.trim()}/${segments}${verify}`
}

// The URL the external import sends: composed for VMware, typed verbatim for
// KVM/Xen. Empty string for the export-domain branch (which has no URL).
export function sourceUrl(draft: ImportVmDraft): string {
  if (draft.source === 'vmware') return buildVpxUrl(draft)
  if (isExternalSource(draft.source)) return draft.libvirtUri.trim()
  return ''
}

// Step-1 gate. Export domain: a domain must be picked. VMware: every URL
// piece plus credentials (vCenter rejects anonymous SOAP logins, so the
// wizard requires them up front rather than letting the job fail minutes in).
// KVM/Xen: a libvirt URI; credentials stay optional (qemu+ssh URIs carry
// their auth in-band). External sources also need the source-side VM name —
// it is the lookup key virt-v2v imports by.
export function sourceStepValid(draft: ImportVmDraft): boolean {
  if (draft.source === 'exportDomain') return draft.exportDomainId !== ''
  if (draft.sourceVmName.trim() === '') return false
  if (draft.source === 'vmware') {
    return (
      draft.vmwareVcenter.trim() !== '' &&
      draft.vmwareDataCenter.trim() !== '' &&
      draft.vmwareEsxi.trim() !== '' &&
      draft.username.trim() !== '' &&
      draft.password !== ''
    )
  }
  return draft.libvirtUri.trim() !== ''
}

// Step-3 gate: both target references are mandatory on both wire paths, and
// the external path also needs the created VM's name (vm.name is what the
// engine names the result).
export function targetStepValid(draft: ImportVmDraft): boolean {
  if (draft.clusterId === '' || draft.storageDomainId === '') return false
  if (isExternalSource(draft.source)) return draft.targetVmName.trim() !== ''
  return true
}

// Draft → the export-domain import action body (one POST per selected VM; the
// VM ids ride in the URL, so the body is shared).
export function exportDomainImportBody(draft: ImportVmDraft): ExportDomainVmImportBody {
  return {
    clusterId: draft.clusterId,
    storageDomainId: draft.storageDomainId,
    clone: draft.clone || undefined,
    collapseSnapshots: draft.collapseSnapshots || undefined,
  }
}

// Draft → the POST /externalvmimports spec. Callers must only invoke this on
// an external-source draft (the wizard's step gating guarantees it); the
// export-domain branch throws to make a future misuse loud rather than
// sending a nonsense body.
export function externalImportSpec(draft: ImportVmDraft): ExternalVmImportSpec {
  if (!isExternalSource(draft.source)) {
    throw new Error('externalImportSpec called on an export-domain draft')
  }
  return {
    provider: draft.source,
    url: sourceUrl(draft),
    name: draft.sourceVmName.trim(),
    targetName: draft.targetVmName.trim(),
    clusterId: draft.clusterId,
    storageDomainId: draft.storageDomainId,
    sparse: draft.sparse,
    username: draft.username.trim() === '' ? undefined : draft.username.trim(),
    password: draft.password === '' ? undefined : draft.password,
    hostId: draft.proxyHostId === '' ? undefined : draft.proxyHostId,
  }
}
