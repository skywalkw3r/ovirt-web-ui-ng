import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildExternalSubnetPayload,
  buildProviderPayload,
  createProviderSubnet,
  importExternalNetwork,
  importedProviderNetworkNames,
  isOpenStackProviderType,
  listProviderNetworks,
  listProviders,
  type ExternalSubnetDraft,
  type ProviderDraft,
} from './providers'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Routes fetch by collection path so each of the four provider collections can
// answer with its own status/payload — mirrors the per-URL failure modes real
// engines exhibit (OLVM 4.5 answers 500 for the removed Cinder/Glance kinds).
function mockFetchByPath(routes: Record<string, { status: number; payload?: unknown }>) {
  const fn = vi.fn().mockImplementation((url: string) => {
    const route = Object.entries(routes).find(([path]) => url.endsWith(path))?.[1] ?? {
      status: 200,
      payload: {},
    }
    return Promise.resolve({
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: () =>
        route.payload === undefined
          ? Promise.reject(new Error('no body'))
          : Promise.resolve(route.payload),
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('listProviders', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('merges the four typed collections, tagging each entry with its providerType', async () => {
    mockFetchByPath({
      '/externalhostproviders': {
        status: 200,
        payload: { external_host_provider: [{ id: 'h1', name: 'satellite' }] },
      },
      '/openstacknetworkproviders': {
        status: 200,
        payload: { openstack_network_provider: [{ id: 'n1', name: 'ovirt-provider-ovn' }] },
      },
    })
    const providers = await listProviders()
    expect(providers.map((p) => [p.id, p.providerType])).toEqual([
      ['h1', 'host'],
      ['n1', 'network'],
    ])
  })

  // One collection answering 400/404/500 means "this engine has no such kind"
  // (OLVM 4.5 removed Cinder/Glance support) — the other kinds must still load
  // instead of the whole Providers page erroring.
  it.each([400, 404, 500])(
    'tolerates HTTP %i on a single collection and returns the rest',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockFetchByPath({
        '/openstackvolumeproviders': { status, payload: { fault: { reason: 'gone' } } },
        '/openstacknetworkproviders': {
          status: 200,
          payload: { openstack_network_provider: [{ id: 'n1', name: 'ovirt-provider-ovn' }] },
        },
      })
      const providers = await listProviders()
      expect(providers.map((p) => p.id)).toEqual(['n1'])
      expect(warn).toHaveBeenCalledOnce()
      warn.mockRestore()
    },
  )

  it('propagates auth failures (401/403) instead of masking them as empty kinds', async () => {
    mockFetchByPath({
      '/externalhostproviders': { status: 401, payload: { fault: { reason: 'expired' } } },
    })
    await expect(listProviders()).rejects.toBeInstanceOf(ApiError)
  })

  it('throws when EVERY collection fails — a sick engine must not render as an empty list', async () => {
    mockFetchByPath({
      '/externalhostproviders': { status: 500, payload: { fault: { reason: 'boom' } } },
      '/openstackimageproviders': { status: 500, payload: { fault: { reason: 'boom' } } },
      '/openstacknetworkproviders': { status: 500, payload: { fault: { reason: 'boom' } } },
      '/openstackvolumeproviders': { status: 500, payload: { fault: { reason: 'boom' } } },
    })
    await expect(listProviders()).rejects.toBeInstanceOf(ApiError)
  })
})

// A submittable draft: an image (OpenStack) provider with auth on and a
// password entered (the create path). Tests override single fields from here so
// each case reads as "this draft except …".
function draft(overrides: Partial<ProviderDraft> = {}): ProviderDraft {
  return {
    type: 'image',
    name: 'glance.lab.local',
    description: 'image store',
    url: 'https://glance.lab.local:9292',
    requiresAuthentication: true,
    username: 'admin',
    password: 'secret',
    authenticationUrl: 'https://keystone.lab.local:5000/v2.0',
    authApiVersion: 'v2',
    tenantName: 'admin',
    userDomainName: '',
    projectName: '',
    projectDomainName: '',
    networkType: 'neutron',
    readOnly: false,
    ...overrides,
  }
}

describe('isOpenStackProviderType', () => {
  it('is true for the openstack kinds and false for the external host provider', () => {
    expect(isOpenStackProviderType('image')).toBe(true)
    expect(isOpenStackProviderType('network')).toBe(true)
    expect(isOpenStackProviderType('volume')).toBe(true)
    expect(isOpenStackProviderType('host')).toBe(false)
  })
})

describe('buildProviderPayload', () => {
  it('emits name, description, url, requires_authentication, and the full auth block', () => {
    const body = buildProviderPayload(draft())
    expect(body).toEqual({
      name: 'glance.lab.local',
      description: 'image store',
      url: 'https://glance.lab.local:9292',
      requires_authentication: true,
      username: 'admin',
      password: 'secret',
      authentication_url: 'https://keystone.lab.local:5000/v2.0',
      tenant_name: 'admin',
    })
  })

  it('trims name, description, url, username, authentication_url, and tenant_name', () => {
    const body = buildProviderPayload(
      draft({
        name: '  glance  ',
        description: '  store  ',
        url: '  https://g:9292  ',
        username: '  admin  ',
        authenticationUrl: '  https://k:5000  ',
        tenantName: '  admin  ',
      }),
    )
    expect(body.name).toBe('glance')
    expect(body.description).toBe('store')
    expect(body.url).toBe('https://g:9292')
    expect(body.username).toBe('admin')
    expect(body.authentication_url).toBe('https://k:5000')
    expect(body.tenant_name).toBe('admin')
  })

  it('emits the v3 user/project domain trio (not tenant_name) when authApiVersion is v3', () => {
    // The v2 draft defaults ride tenant_name; v3 swaps to the user/project domain
    // trio, each field only when non-empty. This branch had no coverage.
    const body = buildProviderPayload(
      draft({
        authApiVersion: 'v3',
        userDomainName: 'Default',
        projectName: 'admin',
        projectDomainName: 'Default',
      }),
    )
    expect(body.user_domain_name).toBe('Default')
    expect(body.project_name).toBe('admin')
    expect(body.project_domain_name).toBe('Default')
    expect(body).not.toHaveProperty('tenant_name')
  })

  // SECURITY: the load-bearing omit-password-on-blank rule.
  it('OMITS password when the field is left blank (preserve-on-edit / nothing to send)', () => {
    const body = buildProviderPayload(draft({ password: '' }))
    expect(body).not.toHaveProperty('password')
    // the rest of the auth block still rides
    expect(body.username).toBe('admin')
    expect(body.requires_authentication).toBe(true)
  })

  it('includes password only when the user typed one', () => {
    expect(buildProviderPayload(draft({ password: 'typed' }))).toHaveProperty('password', 'typed')
  })

  // SECURITY: unchecking auth sends requires_authentication:false and drops the
  // whole credential block, so the engine clears any stored credentials.
  it('OMITS the entire auth block (username/password/authentication_url/tenant_name) when auth is not required', () => {
    const body = buildProviderPayload(
      draft({ requiresAuthentication: false, password: 'still-here' }),
    )
    expect(body.requires_authentication).toBe(false)
    expect(body).not.toHaveProperty('username')
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('authentication_url')
    expect(body).not.toHaveProperty('tenant_name')
  })

  it('omits the openstack-only auth fields for the external host provider even with auth on', () => {
    const body = buildProviderPayload(
      draft({ type: 'host', authenticationUrl: 'https://k:5000', tenantName: 'admin' }),
    )
    // basic auth still rides for a host provider
    expect(body.username).toBe('admin')
    expect(body.password).toBe('secret')
    // but the OpenStack Keystone/tenant fields do not
    expect(body).not.toHaveProperty('authentication_url')
    expect(body).not.toHaveProperty('tenant_name')
  })

  it('omits tenant_name when it is blank but keeps the other openstack auth fields', () => {
    const body = buildProviderPayload(draft({ tenantName: '   ' }))
    expect(body).not.toHaveProperty('tenant_name')
    expect(body.authentication_url).toBe('https://keystone.lab.local:5000/v2.0')
  })

  it('emits read_only for a network provider (both states) and never for the other kinds', () => {
    // read_only is declared only on OpenStackNetworkProvider, so it rides for the
    // network kind alone — as an explicit boolean, both on and off.
    expect(buildProviderPayload(draft({ type: 'network', readOnly: true }))).toHaveProperty(
      'read_only',
      true,
    )
    expect(buildProviderPayload(draft({ type: 'network', readOnly: false }))).toHaveProperty(
      'read_only',
      false,
    )
    // image/volume/host never carry read_only, even when the draft flag is set
    expect(buildProviderPayload(draft({ type: 'image', readOnly: true }))).not.toHaveProperty(
      'read_only',
    )
    expect(buildProviderPayload(draft({ type: 'volume', readOnly: true }))).not.toHaveProperty(
      'read_only',
    )
    expect(buildProviderPayload(draft({ type: 'host', readOnly: true }))).not.toHaveProperty(
      'read_only',
    )
  })

  it('emits type (neutron/external) for a network provider and never for the others', () => {
    expect(buildProviderPayload(draft({ type: 'network', networkType: 'neutron' }))).toHaveProperty(
      'type',
      'neutron',
    )
    expect(
      buildProviderPayload(draft({ type: 'network', networkType: 'external' })),
    ).toHaveProperty('type', 'external')
    // image/volume/host never carry a network type
    expect(buildProviderPayload(draft({ type: 'image' }))).not.toHaveProperty('type')
    expect(buildProviderPayload(draft({ type: 'volume' }))).not.toHaveProperty('type')
    expect(buildProviderPayload(draft({ type: 'host' }))).not.toHaveProperty('type')
  })
})

// A single-route fetch stub that also captures the request init, so path and
// body assertions can run against exactly what went on the wire.
function mockFetchCapture(payload: unknown, status = 200) {
  const fn = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('listProviderNetworks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs the provider networks subcollection and parses the list', async () => {
    const fetchMock = mockFetchCapture({
      openstack_network: [
        { id: 'ext-1', name: 'ovn-ext', description: 'overlay' },
        { id: 'ext-2' },
      ],
    })
    const networks = await listProviderNetworks('onp-01')
    expect(networks).toEqual([
      { id: 'ext-1', name: 'ovn-ext', description: 'overlay' },
      { id: 'ext-2' },
    ])
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('/ovirt-engine/api/openstacknetworkproviders/onp-01/networks')
  })

  it('treats the omitted list key as an empty provider (engine JSON quirk)', async () => {
    mockFetchCapture({})
    expect(await listProviderNetworks('onp-01')).toEqual([])
  })
})

describe('importedProviderNetworkNames', () => {
  it('collects names of networks bound to THIS provider (external_provider.id match)', () => {
    const names = importedProviderNetworkNames(
      [
        { name: 'ovn-ext', external_provider: { id: 'onp-01' } },
        { name: 'other-ext', external_provider: { id: 'onp-99' } },
        { name: 'internal-vlan' },
      ],
      'onp-01',
    )
    expect([...names]).toEqual(['ovn-ext'])
  })

  it('is an empty set when no engine network references the provider', () => {
    const names = importedProviderNetworkNames(
      [{ name: 'internal-vlan' }, { name: 'ovirtmgmt' }],
      'onp-01',
    )
    expect(names.size).toBe(0)
  })

  it('ignores provider-bound networks with a blank or missing name (unmatchable join key)', () => {
    const names = importedProviderNetworkNames(
      [
        { name: '', external_provider: { id: 'onp-01' } },
        { external_provider: { id: 'onp-01' } },
        { name: 'ovn-ext', external_provider: { id: 'onp-01' } },
      ],
      'onp-01',
    )
    expect([...names]).toEqual(['ovn-ext'])
  })
})

describe('importExternalNetwork', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the import action with the mandatory data_center reference', async () => {
    const fetchMock = mockFetchCapture({ status: 'complete' })
    await importExternalNetwork('onp-01', 'ext-1', 'dc-01')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/openstacknetworkproviders/onp-01/networks/ext-1/import')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ data_center: { id: 'dc-01' } })
  })
})

describe('createProviderSubnet', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the subnet body to the provider network subnets subcollection', async () => {
    const fetchMock = mockFetchCapture({ id: 'subnet-1' })
    await createProviderSubnet('onp-01', 'ext-1', { name: 's', cidr: '10.0.0.0/24' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/openstacknetworkproviders/onp-01/networks/ext-1/subnets')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 's', cidr: '10.0.0.0/24' })
  })
})

describe('buildExternalSubnetPayload', () => {
  const subnet = (overrides: Partial<ExternalSubnetDraft> = {}): ExternalSubnetDraft => ({
    name: 'app-subnet',
    cidr: '10.10.0.0/24',
    ipVersion: 'v4',
    gateway: '10.10.0.1',
    dnsServers: '8.8.8.8 1.1.1.1',
    ...overrides,
  })

  it('maps the full draft, wrapping dns servers in the engine list shape', () => {
    expect(buildExternalSubnetPayload(subnet())).toEqual({
      name: 'app-subnet',
      cidr: '10.10.0.0/24',
      ip_version: 'v4',
      gateway: '10.10.0.1',
      dns_servers: { dns_server: ['8.8.8.8', '1.1.1.1'] },
    })
  })

  it('splits dns servers on commas, spaces, and mixes of both', () => {
    expect(
      buildExternalSubnetPayload(subnet({ dnsServers: ' 8.8.8.8, 1.1.1.1,,9.9.9.9 ' })).dns_servers,
    ).toEqual({ dns_server: ['8.8.8.8', '1.1.1.1', '9.9.9.9'] })
  })

  it('omits gateway and dns_servers when blank (never sends empty keys)', () => {
    const body = buildExternalSubnetPayload(subnet({ gateway: '  ', dnsServers: '' }))
    expect(body).not.toHaveProperty('gateway')
    expect(body).not.toHaveProperty('dns_servers')
  })

  it('carries the lowercase wire form of the IP version (v4/v6)', () => {
    expect(buildExternalSubnetPayload(subnet()).ip_version).toBe('v4')
    expect(buildExternalSubnetPayload(subnet({ ipVersion: 'v6' })).ip_version).toBe('v6')
  })

  it('trims name and cidr', () => {
    const body = buildExternalSubnetPayload(subnet({ name: '  s  ', cidr: ' 10.0.0.0/24 ' }))
    expect(body.name).toBe('s')
    expect(body.cidr).toBe('10.0.0.0/24')
  })
})
