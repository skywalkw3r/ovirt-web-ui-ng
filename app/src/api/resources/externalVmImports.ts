import { request } from '../transport'

// POST /externalvmimports — import a VM straight off a foreign hypervisor via
// virt-v2v (api-model ExternalVmImportsService.add). The api-model's
// ExternalVmProviderType enum is exactly KVM | XEN | VMWARE; OVA import has NO
// REST surface (webadmin's OVA path rides internal GWT queries, and the
// api-model repo has zero OVA-import hits), so the import wizard deliberately
// offers only these three sources. Lowercase on the wire — the engine's JSON
// enum values serialize lowercase (the SDKs send 'vmware'/'kvm'/'xen').
export type ExternalVmProvider = 'vmware' | 'kvm' | 'xen'

// The wire spec for one external import. Field-for-field the api-model
// ExternalVmImport struct minus the pieces the wizard doesn't author
// (cpu_profile, quota, drivers_iso — all optional server-side):
//   • url — what virt-v2v connects to: a vpx:// URL for VMware (see
//     buildVpxUrl in components/vm-import/importVmDraft.ts), a libvirt URI
//     (qemu+ssh://…, xen+ssh://…) for KVM/Xen.
//   • name — the VM's name AS DEFINED ON THE SOURCE hypervisor.
//   • targetName — the name for the created VM; rides as vm: { name }.
//   • username/password — source-system credentials; VMware requires them,
//     libvirt URIs often carry auth in-band, so both are optional here and
//     omitted from the body when blank.
//   • hostId — the proxy host that runs the virt-v2v conversion; optional
//     (the engine picks one in the target cluster when omitted).
//   • sparse — disk allocation of the result: true thin, false preallocated.
export interface ExternalVmImportSpec {
  provider: ExternalVmProvider
  url: string
  name: string
  targetName: string
  clusterId: string
  storageDomainId: string
  sparse: boolean
  username?: string
  password?: string
  hostId?: string
}

// Kick the import. The engine answers 201 with the ExternalVmImport entity it
// queued (echoing the spec), but the conversion itself is an async job — no
// echoed field feeds the UI, so the promise is settle-only and the caller
// toasts "import started" + invalidates the Tasks feed. Credentials ride only
// when non-blank so a passwordless libvirt URI never sends empty-string auth.
export async function createExternalVmImport(spec: ExternalVmImportSpec): Promise<void> {
  const body: Record<string, unknown> = {
    provider: spec.provider,
    url: spec.url,
    name: spec.name,
    vm: { name: spec.targetName },
    cluster: { id: spec.clusterId },
    storage_domain: { id: spec.storageDomainId },
    sparse: spec.sparse,
  }
  if (spec.username) body.username = spec.username
  if (spec.password) body.password = spec.password
  if (spec.hostId) body.host = { id: spec.hostId }
  await request('/externalvmimports', { method: 'POST', body })
}
