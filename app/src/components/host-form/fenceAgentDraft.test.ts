import { describe, expect, it } from 'vitest'
import { buildFenceAgentPayload } from '../../api/resources/hosts'
import type { FenceAgent } from '../../api/schemas/fence-agent'
import {
  blankFenceAgentDraft,
  draftToFenceAgentSpec,
  fenceAgentToDraft,
  type FenceAgentDraft,
} from './fenceAgentDraft'

// The load-bearing security rule lives in this seam: draftToFenceAgentSpec turns
// a blank password into an UNDEFINED spec.password, and buildFenceAgentPayload
// then omits the key entirely — so a blank-on-edit save preserves the engine's
// stored secret and never transmits anything. These tests pin that behavior.

describe('fence-agent payload building', () => {
  it('blank draft seeds ipmilan/order-1 with an empty password', () => {
    const draft = blankFenceAgentDraft()
    expect(draft.type).toBe('ipmilan')
    expect(draft.order).toBe('1')
    expect(draft.password).toBe('')
  })

  it('a typed password rides the create body (write-side)', () => {
    const draft: FenceAgentDraft = {
      ...blankFenceAgentDraft(),
      address: '10.0.0.1',
      username: 'root',
      password: 'hunter2',
    }
    const body = buildFenceAgentPayload(draftToFenceAgentSpec(draft))
    expect(body).toHaveProperty('password', 'hunter2')
    expect(body.address).toBe('10.0.0.1')
  })

  it('a BLANK password is omitted from the body (preserve-on-edit / nothing-to-send)', () => {
    const draft: FenceAgentDraft = {
      ...blankFenceAgentDraft(),
      address: '10.0.0.1',
      username: 'root',
      password: '',
    }
    const spec = draftToFenceAgentSpec(draft)
    // spec carries undefined, not '' — the builder then drops the key
    expect(spec.password).toBeUndefined()
    const body = buildFenceAgentPayload(spec)
    expect(body).not.toHaveProperty('password')
  })

  it('coerces numeric strings and omits a blank port', () => {
    const withPort = buildFenceAgentPayload(
      draftToFenceAgentSpec({ ...blankFenceAgentDraft(), address: 'a', order: '4', port: '623' }),
    )
    expect(withPort.order).toBe(4)
    expect(withPort.port).toBe(623)

    const noPort = buildFenceAgentPayload(
      draftToFenceAgentSpec({ ...blankFenceAgentDraft(), address: 'a', port: '' }),
    )
    expect(noPort).not.toHaveProperty('port')
  })

  it('drops blank option rows and always sends an options collection', () => {
    const body = buildFenceAgentPayload(
      draftToFenceAgentSpec({
        ...blankFenceAgentDraft(),
        address: 'a',
        options: [
          { id: 'o1', name: 'lanplus', value: '1' },
          { id: 'o2', name: '', value: 'ignored' },
        ],
      }),
    )
    expect(body.options).toEqual({ option: [{ name: 'lanplus', value: '1' }] })
  })

  it('sends switch booleans through', () => {
    const body = buildFenceAgentPayload(
      draftToFenceAgentSpec({
        ...blankFenceAgentDraft(),
        address: 'a',
        encryptOptions: true,
        concurrent: true,
      }),
    )
    expect(body.encrypt_options).toBe(true)
    expect(body.concurrent).toBe(true)
  })

  it('fenceAgentToDraft never seeds a password from the read model', () => {
    // the read model has no password; even a hostile extra key must not leak in
    const agent = {
      id: 'a1',
      type: 'drac7',
      address: '10.0.0.9',
      username: 'admin',
      order: 2,
      port: 443,
      encrypt_options: true,
      options: { option: [{ name: 'ssl', value: '1' }] },
    } as FenceAgent
    const draft = fenceAgentToDraft(agent)
    expect(draft.password).toBe('')
    expect(draft.type).toBe('drac7')
    expect(draft.order).toBe('2')
    expect(draft.port).toBe('443')
    expect(draft.encryptOptions).toBe(true)
    expect(draft.options).toEqual([{ id: expect.any(String), name: 'ssl', value: '1' }])
  })
})
