import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVm, performVmAction, runOnceVm } from './vms'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the mockFetch helper in api/vms.test.ts)
// so these cover the wire shape without reaching the mock engine.
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

describe('performVmAction — reset and cancelmigration', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // Both actions share the action-name === URL-segment shape, so they route
  // through performVmAction with an empty body like the other lifecycle verbs.
  it.each(['reset', 'cancelmigration'] as const)(
    'POSTs an empty JSON object to /vms/{id}/%s and resolves void',
    async (action) => {
      const fetchMock = mockFetch(200, { status: 'complete' })
      await expect(performVmAction('vm-01', action)).resolves.toBeUndefined()

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`/ovirt-engine/api/vms/vm-01/${action}`)
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{}')
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    },
  )

  it('surfaces the engine fault as ApiError for a reset the VM refuses', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Cannot reset. VM is not running.' },
    })

    const error = await performVmAction('vm-01', 'reset').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Cannot reset. VM is not running.' })
  })

  it('surfaces the engine fault as ApiError when there is no migration to cancel', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'VM is not migrating.' },
    })

    const error = await performVmAction('vm-01', 'cancelmigration').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM is not migrating.' })
  })
})

// Parse the JSON body the resource fn POSTed to the mocked fetch.
function bodyOf(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

describe('runOnceVm — Initial Run depth', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('emits cloud-init initialization + use_cloud_init and the vm.os depth block', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await runOnceVm('vm-01', {
      bootDevices: ['cdrom', 'hd'],
      kernelPath: '/boot/vmlinuz',
      initrdPath: '/boot/initrd.img',
      kernelParams: 'console=ttyS0',
      customProperties: [
        { name: 'sap_agent', value: 'true' },
        // unnamed row is dropped from the wire
        { name: '', value: 'noise' },
      ],
      initialization: {
        windows: false,
        hostname: 'web-01',
        dnsServers: '8.8.8.8',
        dnsSearch: 'example.com',
        customScript: '#cloud-config',
        nics: [
          { name: 'eth0', address: '10.0.0.5', netmask: '255.255.255.0', gateway: '10.0.0.1' },
        ],
      },
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/start')
    expect(init.method).toBe('POST')

    const body = bodyOf(fetchMock)
    expect(body.use_cloud_init).toBe(true)
    expect(body.use_sysprep).toBeUndefined()
    const vm = body.vm as Record<string, unknown>
    expect(vm.os).toMatchObject({
      boot: { devices: { device: ['cdrom', 'hd'] } },
      kernel: '/boot/vmlinuz',
      initrd: '/boot/initrd.img',
      cmdline: 'console=ttyS0',
    })
    expect(vm.initialization).toMatchObject({
      host_name: 'web-01',
      dns_servers: '8.8.8.8',
      dns_search: 'example.com',
      custom_script: '#cloud-config',
    })
    const nicConfig = (
      vm.initialization as { nic_configurations?: { nic_configuration?: unknown[] } }
    ).nic_configurations
    expect(nicConfig?.nic_configuration).toHaveLength(1)
    expect(vm.custom_properties).toEqual({
      custom_property: [{ name: 'sap_agent', value: 'true' }],
    })
  })

  it('emits sysprep initialization + use_sysprep for a Windows run', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await runOnceVm('vm-02', {
      initialization: {
        windows: true,
        sysprepDomain: 'CORP',
        sysprepAdminPassword: 'secret',
        customScript: '<unattend/>',
      },
    })

    const body = bodyOf(fetchMock)
    expect(body.use_sysprep).toBe(true)
    expect(body.use_cloud_init).toBeUndefined()
    expect((body.vm as Record<string, unknown>).initialization).toEqual({
      domain: 'CORP',
      root_password: 'secret',
      custom_script: '<unattend/>',
    })
  })

  it('omits the initialization flag entirely when no init field carries a value', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await runOnceVm('vm-03', {
      bootDevices: ['hd'],
      initialization: { windows: false },
    })

    const body = bodyOf(fetchMock)
    expect(body.use_cloud_init).toBeUndefined()
    expect((body.vm as Record<string, unknown>).initialization).toBeUndefined()
  })
})

describe('createVm — cloud-init / sysprep initialization', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs a full cloud-init initialization block', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-new-1', name: 'linux-01' })
    await createVm({
      name: 'linux-01',
      templateName: 'Blank',
      clusterName: 'Default',
      memoryBytes: 2 * 1024 ** 3,
      cloudInit: {
        hostName: 'linux-01',
        rootPassword: 'pw',
        sshKey: 'ssh-rsa AAAA',
        dnsServers: '1.1.1.1',
        dnsSearch: 'lan',
        customScript: '#cloud-config',
        regenerateSsh: true,
        nics: [{ name: 'eth0', address: '10.0.0.9' }],
      },
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms')
    expect(init.method).toBe('POST')
    const body = bodyOf(fetchMock)
    expect(body.initialization).toMatchObject({
      host_name: 'linux-01',
      root_password: 'pw',
      authorized_ssh_keys: 'ssh-rsa AAAA',
      dns_servers: '1.1.1.1',
      dns_search: 'lan',
      custom_script: '#cloud-config',
      regenerate_ssh_keys: true,
    })
    const nics = (body.initialization as { nic_configurations?: { nic_configuration?: unknown[] } })
      .nic_configurations
    expect(nics?.nic_configuration).toHaveLength(1)
  })

  it('POSTs a sysprep initialization block for a Windows template', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-new-2', name: 'win-01' })
    await createVm({
      name: 'win-01',
      templateName: 'win2022',
      clusterName: 'Default',
      sysprep: { domain: 'CORP', adminPassword: 'secret', customScript: '<unattend/>' },
    })

    const body = bodyOf(fetchMock)
    expect(body.initialization).toEqual({
      domain: 'CORP',
      root_password: 'secret',
      custom_script: '<unattend/>',
    })
  })

  it('sends no initialization when neither cloud-init nor sysprep carries a value', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-new-3', name: 'plain' })
    await createVm({ name: 'plain', templateName: 'Blank', clusterName: 'Default' })
    const body = bodyOf(fetchMock)
    expect(body.initialization).toBeUndefined()
  })
})
