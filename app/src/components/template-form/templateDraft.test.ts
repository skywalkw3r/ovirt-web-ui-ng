import { describe, expect, it } from 'vitest'
import { TemplateSchema } from '../../api/schemas/template'
import { VmSchema } from '../../api/schemas/vm'
import {
  emptyTemplateDraft,
  newTemplatePayload,
  templateEditPayload,
  templateToDraft,
  vmToTemplateDraft,
} from './templateDraft'

const GiB = 1024 * 1024 * 1024

const template = TemplateSchema.parse({
  id: 'tpl-02',
  name: 'win2022-base',
  description: 'base',
  os: { type: 'windows_2022' },
  type: 'desktop',
  stateless: 'false',
  delete_protected: 'true',
  memory: 8 * GiB,
  cpu: { topology: { sockets: 1, cores: '4', threads: 1 } },
  cpu_shares: '1024',
  large_icon: { id: 'icon-windows' },
})

describe('templateToDraft', () => {
  it('seeds the General fields and the shared VmBase slice', () => {
    expect(templateToDraft(template)).toMatchObject({
      name: 'win2022-base',
      description: 'base',
      comment: '',
      osType: 'windows_2022',
      optimizedFor: 'desktop',
      deleteProtected: true,
      memoryMb: 8192,
      coresPerSocket: 4,
      cpuShares: 1024,
      iconId: 'icon-windows',
    })
  })

  it('shows the 4x maximum memory default when the read has none', () => {
    expect(templateToDraft(template).maxMemoryMb).toBe(4 * 8192)
  })
})

describe('templateEditPayload', () => {
  it('is empty for an untouched dialog', () => {
    const baseline = templateToDraft(template)
    expect(templateEditPayload({ ...baseline }, baseline)).toEqual({})
  })

  it('sends only the changed General and VmBase fields', () => {
    const baseline = templateToDraft(template)
    const draft = {
      ...baseline,
      name: 'win2022-v2',
      deleteProtected: false,
      memoryBalloonEnabled: false,
      customProperties: [{ name: 'viodiskcache', value: 'writeback' }],
    }
    expect(templateEditPayload(draft, baseline)).toEqual({
      name: 'win2022-v2',
      delete_protected: false,
      memory_policy: { ballooning: false },
      custom_properties: { custom_property: [{ name: 'viodiskcache', value: 'writeback' }] },
    })
  })
})

describe('create mode', () => {
  const vm = VmSchema.parse({
    id: 'vm-08',
    name: 'legacy-erp',
    status: 'down',
    memory: `${8 * GiB}`,
    os: { type: 'other' },
    delete_protected: 'true',
  })

  it('seeds from the source VM with the Make Template default name', () => {
    expect(vmToTemplateDraft(vm)).toMatchObject({
      name: 'legacy-erp-template',
      description: '',
      osType: 'other',
      deleteProtected: true,
      memoryMb: 8192,
    })
  })

  it('posts the name and VM plus only the overrides of the VM configuration', () => {
    const baseline = vmToTemplateDraft(vm)
    const draft = { ...baseline, comment: 'gold', cpuShares: 2048, iconId: 'icon-linux' }
    expect(newTemplatePayload(draft, baseline, 'vm-08')).toEqual({
      name: 'legacy-erp-template',
      vm: { id: 'vm-08' },
      comment: 'gold',
      cpu_shares: 2048,
      large_icon: { id: 'icon-linux' },
    })
  })

  it('starts empty until a VM is chosen', () => {
    expect(emptyTemplateDraft()).toMatchObject({ name: '', memoryMb: 0, customProperties: [] })
  })
})
