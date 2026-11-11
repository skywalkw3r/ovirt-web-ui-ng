import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../../transport'
import { mockRequest, resetMockVms, setMockUsername } from '../handlers'
import { mockUserIdFor, mockUserOptions, resetUserOptionRouteMocks } from './user-options'

describe('mock /users/{id}/options', () => {
  beforeEach(() => {
    resetMockVms()
    resetUserOptionRouteMocks()
    setMockUsername('admin@internal')
  })

  it('derives authenticated_user.id from the signed-in mock username', async () => {
    setMockUsername('roaming@internal')
    const root = (await mockRequest('')) as { authenticated_user: { id: string } }
    expect(root.authenticated_user.id).toBe(mockUserIdFor('roaming@internal'))
  })

  it('serves the seeded roaming profile, including another client’s key', async () => {
    const list = (await mockRequest(`/users/${mockUserIdFor('roaming@internal')}/options`)) as {
      user_option: { name: string; content: string }[]
    }
    expect(list.user_option.map((o) => o.name)).toEqual(['webUiNg.settings', 'vmPortal.locale'])
    expect(JSON.parse(list.user_option[0]?.content ?? '')).toMatchObject({
      refreshIntervalMs: 60_000,
      preferredConsole: 'spice',
    })
  })

  it('omits the key on an empty profile', async () => {
    await expect(mockRequest('/users/someone/options')).resolves.toEqual({})
  })

  it('adds, rejects a duplicate name, gets and removes', async () => {
    const created = (await mockRequest('/users/u1/options', {
      method: 'POST',
      body: { name: 'webUiNg.settings', content: '{"a":1}' },
    })) as { id: string }
    expect(created.id).toBe('uo-new-1')
    await expect(
      mockRequest('/users/u1/options', {
        method: 'POST',
        body: { name: 'webUiNg.settings', content: '{}' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(mockRequest(`/users/u1/options/${created.id}`)).resolves.toMatchObject({
      name: 'webUiNg.settings',
    })
    await mockRequest(`/users/u1/options/${created.id}`, { method: 'DELETE' })
    expect(mockUserOptions('u1')).toEqual([])
    await expect(
      mockRequest(`/users/u1/options/${created.id}`, { method: 'DELETE' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects content that is not JSON', async () => {
    await expect(
      mockRequest('/users/u1/options', { method: 'POST', body: { name: 'x', content: '{oops' } }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('answers 403 for the noprofile identities', async () => {
    await expect(
      mockRequest(`/users/${mockUserIdFor('noprofile@internal')}/options`),
    ).rejects.toMatchObject({ status: 403 })
  })
})
