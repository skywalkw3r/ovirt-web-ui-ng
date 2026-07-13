import type { ProviderDraft } from '../../api/resources/providers'
import type { Provider, ProviderType } from '../../api/schemas/provider'

// The persistent provider kinds the New/Edit modal offers, in menu order. Each
// maps to a typed engine collection (see resources/providers.ts). Kept as a
// module constant (not in the component) so the modal file stays component-only
// for React Fast Refresh.
//
// The transient VM-import providers (VMware/Xen/KVM/KubeVirt) are intentionally
// omitted: the engine does not store them as providers — they are supplied
// inline on an import request.
export const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'image', label: 'OpenStack Image (Glance)' },
  { value: 'network', label: 'OpenStack Networking (Neutron)' },
  { value: 'volume', label: 'OpenStack Volume (Cinder)' },
  { value: 'host', label: 'External host provider (Foreman/Katello)' },
]

// The neutron/external classification the network provider carries. 'neutron'
// uses the built-in interface driver; 'external' delegates to a provider that
// implements the Neutron API itself.
export const NETWORK_PROVIDER_TYPES: { value: string; label: string }[] = [
  { value: 'neutron', label: 'Neutron (built-in driver)' },
  { value: 'external', label: 'External (provider-supplied driver)' },
]

// The human label for a provider kind (the list Type cell reuses this).
export function providerTypeLabel(type: ProviderType): string {
  return PROVIDER_TYPES.find((option) => option.value === type)?.label ?? type
}

// Create-mode defaults: the most common kind (Glance image provider), auth off,
// neutron classification pre-selected for when the user switches to Network.
// Keystone auth defaults to Identity API v2.0 (the tenant_name form). SECURITY:
// password starts EMPTY (nothing to seed).
export function blankProviderDraft(): ProviderDraft {
  return {
    type: 'image',
    name: '',
    description: '',
    url: '',
    requiresAuthentication: false,
    username: '',
    password: '',
    authenticationUrl: '',
    authApiVersion: 'v2',
    tenantName: '',
    userDomainName: '',
    projectName: '',
    projectDomainName: '',
    networkType: 'neutron',
    readOnly: false,
  }
}

// Provider read model → fully-populated draft (edit mode seed). The password is
// DELIBERATELY not read (the read model carries none) — the field opens empty,
// and a still-empty password on save preserves the stored secret. The network
// classification defaults to neutron when the record predates the field. The
// Keystone auth version is inferred from which credential fields the record
// carries: any v3 field present ⇒ v3, otherwise v2.0 (the tenant_name form).
export function providerToDraft(provider: Provider): ProviderDraft {
  const hasV3 = Boolean(
    provider.user_domain_name || provider.project_name || provider.project_domain_name,
  )
  return {
    type: provider.providerType,
    name: provider.name ?? '',
    description: provider.description ?? '',
    url: provider.url ?? '',
    requiresAuthentication: provider.requires_authentication === true,
    username: provider.username ?? '',
    password: '',
    authenticationUrl: provider.authentication_url ?? '',
    authApiVersion: hasV3 ? 'v3' : 'v2',
    tenantName: provider.tenant_name ?? '',
    userDomainName: provider.user_domain_name ?? '',
    projectName: provider.project_name ?? '',
    projectDomainName: provider.project_domain_name ?? '',
    networkType: provider.type ?? 'neutron',
    readOnly: provider.read_only === true,
  }
}
