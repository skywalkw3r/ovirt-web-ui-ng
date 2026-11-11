import type { Vm } from '../../api/schemas/vm'

// Edit VM's Foreman/Satellite section: the external host provider the VM is
// bound to, so the engine can pull the VM's errata from that Foreman/Satellite
// (the Errata tab). Verified against oVirt 4.5 sources:
// - ovirt-engine-api-model types/Vm.java: `@Link ExternalHostProvider
//   externalHostProvider()`, so a plain VM read carries a bare { id } link
//   (no all_content or follow needed).
// - ovirt-engine VmMapper: the read side sets external_host_provider.id from
//   VmStatic.providerId when one is set; the write side copies the id back
//   when the element is present, and an element without an id sets
//   providerId to null. An absent element leaves the binding alone.
// - VmStatic.providerId is @EditableVmField without onStatuses, so the engine
//   applies a change on a running VM at once (no Next-Run detour).
// - UpdateVmCommand rejects an id that is not a FOREMAN (or KubeVirt)
//   provider; /externalhostproviders lists FOREMAN providers only.

// The draft value: the bound provider's id, '' when none.
export function vmExternalHostProviderId(vm: Vm): string {
  return vm.external_host_provider?.id ?? ''
}

// The external_host_provider body for the vm PUT, or undefined when the pick
// did not move (omit-unchanged, so an untouched section never rewrites the
// binding). "No provider" sends a present-but-empty element, which the engine
// maps to providerId = null (the same clearing convention as lease: {}).
export function buildExternalHostProvider(
  draftId: string,
  baselineId: string,
): Record<string, unknown> | undefined {
  if (draftId === baselineId) return undefined
  return draftId === '' ? {} : { id: draftId }
}
