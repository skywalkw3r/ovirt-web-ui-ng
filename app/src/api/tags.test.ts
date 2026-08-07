import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignTag,
  assignTemplateTag,
  createTag,
  deleteTag,
  listTags,
  listTemplateTags,
  listVmTags,
  unassignTag,
  unassignTemplateTag,
  updateTag,
} from './resources/tags'
import { TagListSchema, type Tag } from './schemas/tag'
import { mockRequest, resetMockVms, setMockUsername } from './mock/handlers'
import { ApiError, type RequestOptions } from './transport'
import { clearSessionToken, setSessionToken } from './session'

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

describe('tag resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listTags GETs /tags and parses direct parent links', async () => {
    const fetchMock = mockFetch(200, {
      tag: [
        { id: 't-root', name: 'ui.folders' },
        { id: 't-prod', name: 'prod', parent: { id: 't-root', href: '/tags/t-root' } },
      ],
    })

    const tags = await listTags()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/tags')
    expect(tags).toHaveLength(2)
    expect(tags[0].parent).toBeUndefined()
    expect(tags[1].parent?.id).toBe('t-root')
  })

  it('listTags handles the empty-list quirk (missing "tag" key)', async () => {
    mockFetch(200, {})
    await expect(listTags()).resolves.toEqual([])
  })

  it('createTag POSTs name, description and parent-by-id to /tags', async () => {
    const fetchMock = mockFetch(200, { id: 't-new', name: 'web' })
    await createTag('web', { parentId: 't-prod', description: 'front tier' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/tags')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'web',
      description: 'front tier',
      parent: { id: 't-prod' },
    })
  })

  it('createTag omits parent and description when not given', async () => {
    const fetchMock = mockFetch(200, { id: 't-new', name: 'pci-dss' })
    await createTag('pci-dss')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ name: 'pci-dss' })
  })

  it('updateTag PUTs the changed fields to /tags/{id}', async () => {
    const fetchMock = mockFetch(200, { id: 't-prod', name: 'production' })
    await updateTag('t-prod', { name: 'production', parentId: 't-root' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/tags/t-prod')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'production',
      parent: { id: 't-root' },
    })
  })

  it('updateTag omits the fields that are not changing', async () => {
    const fetchMock = mockFetch(200, { id: 't-staging', name: 'staging' })
    await updateTag('t-staging', { parentId: 't-prod' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ parent: { id: 't-prod' } })
  })

  it('deleteTag sends a bodiless DELETE to /tags/{id}', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(deleteTag('t-legacy')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/tags/t-legacy')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('listVmTags GETs /vms/{id}/tags and handles the empty-list quirk', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listVmTags('vm-01')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/tags')
  })

  it('assignTag POSTs the tag by name to /vms/{id}/tags', async () => {
    const fetchMock = mockFetch(200, { id: 't-1', name: 'backup-daily' })
    await expect(assignTag('vm-01', 'backup-daily')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/tags')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'backup-daily' })
  })

  it('unassignTag sends a bodiless DELETE to /vms/{id}/tags/{tagId}', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(unassignTag('vm-01', 't-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/tags/t-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('template tag operations mirror the VM trio against /templates/{id}/tags', async () => {
    const listMock = mockFetch(200, { tag: [{ id: 't-1', name: 'prod' }] })
    await expect(listTemplateTags('tpl-01')).resolves.toHaveLength(1)
    expect(listMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/templates/tpl-01/tags')

    const assignMock = mockFetch(200, { id: 't-1', name: 'prod' })
    await expect(assignTemplateTag('tpl-01', 'prod')).resolves.toBeUndefined()
    const [assignUrl, assignInit] = assignMock.mock.calls[0] as [string, RequestInit]
    expect(assignUrl).toBe('/ovirt-engine/api/templates/tpl-01/tags')
    expect(assignInit.method).toBe('POST')
    expect(JSON.parse(assignInit.body as string)).toEqual({ name: 'prod' })

    const unassignMock = mockFetch(200, {})
    await expect(unassignTemplateTag('tpl-01', 't-1')).resolves.toBeUndefined()
    const [unassignUrl, unassignInit] = unassignMock.mock.calls[0] as [string, RequestInit]
    expect(unassignUrl).toBe('/ovirt-engine/api/templates/tpl-01/tags/t-1')
    expect(unassignInit.method).toBe('DELETE')
  })
})

// fetchCapabilityProfile has a dedicated, more thorough owner in
// api/capabilities.test.ts (admin fast-path with no second call, the
// real-engine permissions probe, and degrade-on-failure). It was mis-filed in
// this tags suite as a weaker single-payload copy; removed as a duplicate.

describe('mock tag fixtures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the multi-second state-transition timers.
  async function call(path: string, opts?: RequestOptions): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function tagList(path: string): Promise<Tag[]> {
    return TagListSchema.parse(await call(path)).tag ?? []
  }

  it('serves a tag set whose parent links split folders from labels', async () => {
    const tags = await tagList('/tags')
    const byName = new Map(tags.map((t) => [t.name, t]))

    // Folder subtree: web → prod → ui.folders, staging → ui.folders
    const root = byName.get('ui.folders')
    expect(root?.parent).toBeUndefined()
    expect(byName.get('prod')?.parent?.id).toBe(root?.id)
    expect(byName.get('web')?.parent?.id).toBe(byName.get('prod')?.id)
    expect(byName.get('db')?.parent?.id).toBe(byName.get('prod')?.id)
    expect(byName.get('staging')?.parent?.id).toBe(root?.id)

    // Labels sit outside the subtree; colors ride in the description JSON.
    for (const label of ['pci-dss', 'backup-daily', 'legacy']) {
      expect(byName.get(label)?.parent).toBeUndefined()
    }
    expect(JSON.parse(byName.get('pci-dss')?.description ?? '')).toEqual({ color: '#C9190B' })
    expect(JSON.parse(byName.get('backup-daily')?.description ?? '')).toEqual({
      color: '#0066CC',
    })
    expect(byName.get('legacy')?.description).toBeUndefined()
  })

  it('serves per-VM tag assignments', async () => {
    const names = (await tagList('/vms/vm-03/tags')).map((t) => t.name)
    expect(names.sort()).toEqual(['backup-daily', 'db', 'pci-dss'])

    await expect(tagList('/vms/vm-05/tags')).resolves.toEqual([])
  })

  it('attaches a tag by name and 409s when it is already attached', async () => {
    await call('/vms/vm-08/tags', { method: 'POST', body: { name: 'pci-dss' } })
    const names = (await tagList('/vms/vm-08/tags')).map((t) => t.name)
    expect(names.sort()).toEqual(['legacy', 'pci-dss'])

    const again = await call('/vms/vm-08/tags', { method: 'POST', body: { name: 'pci-dss' } })
    expect(again).toBeInstanceOf(ApiError)
    expect((again as ApiError).status).toBe(409)
  })

  it('404s attaching an unknown tag name or onto an unknown VM', async () => {
    const noTag = await call('/vms/vm-01/tags', { method: 'POST', body: { name: 'nope' } })
    expect((noTag as ApiError).status).toBe(404)

    const noVm = await call('/vms/no-such-vm/tags', { method: 'POST', body: { name: 'legacy' } })
    expect((noVm as ApiError).status).toBe(404)
  })

  it('detaches an assigned tag and 404s when it is not assigned', async () => {
    await call('/vms/vm-03/tags/tag-pci-dss', { method: 'DELETE' })
    const names = (await tagList('/vms/vm-03/tags')).map((t) => t.name)
    expect(names.sort()).toEqual(['backup-daily', 'db'])

    const again = await call('/vms/vm-03/tags/tag-pci-dss', { method: 'DELETE' })
    expect(again).toBeInstanceOf(ApiError)
    expect((again as ApiError).status).toBe(404)
  })

  it('creates a tag under a parent and rejects duplicates, missing names, bad parents', async () => {
    const created = (await call('/tags', {
      method: 'POST',
      body: { name: 'qa', parent: { id: 'tag-staging' } },
    })) as Tag
    expect(created.name).toBe('qa')
    expect(created.parent?.id).toBe('tag-staging')

    const tags = await tagList('/tags')
    expect(tags.map((t) => t.name)).toContain('qa')

    const dup = await call('/tags', { method: 'POST', body: { name: 'qa' } })
    expect((dup as ApiError).status).toBe(409)

    const unnamed = await call('/tags', { method: 'POST', body: {} })
    expect((unnamed as ApiError).status).toBe(400)

    const orphan = await call('/tags', {
      method: 'POST',
      body: { name: 'lost', parent: { id: 'no-such-tag' } },
    })
    expect((orphan as ApiError).status).toBe(404)
  })

  it('renames a tag via PUT and reflects it in the tag list', async () => {
    const updated = (await call('/tags/tag-staging', {
      method: 'PUT',
      body: { name: 'qa' },
    })) as Tag
    expect(updated.name).toBe('qa')

    const names = (await tagList('/tags')).map((t) => t.name)
    expect(names).toContain('qa')
    expect(names).not.toContain('staging')
  })

  it('re-parents a tag via PUT', async () => {
    const updated = (await call('/tags/tag-staging', {
      method: 'PUT',
      body: { parent: { id: 'tag-prod' } },
    })) as Tag
    expect(updated.parent?.id).toBe('tag-prod')

    const byName = new Map((await tagList('/tags')).map((t) => [t.name, t]))
    expect(byName.get('staging')?.parent?.id).toBe('tag-prod')
  })

  it('409s renaming to a name already in use', async () => {
    const dup = await call('/tags/tag-staging', { method: 'PUT', body: { name: 'prod' } })
    expect(dup).toBeInstanceOf(ApiError)
    expect((dup as ApiError).status).toBe(409)
  })

  it('409s re-parenting a tag under itself or its own subtree', async () => {
    const ontoDescendant = await call('/tags/tag-prod', {
      method: 'PUT',
      body: { parent: { id: 'tag-web' } },
    })
    expect((ontoDescendant as ApiError).status).toBe(409)

    const ontoSelf = await call('/tags/tag-prod', {
      method: 'PUT',
      body: { parent: { id: 'tag-prod' } },
    })
    expect((ontoSelf as ApiError).status).toBe(409)

    // Guarded updates leave the tree untouched.
    const byName = new Map((await tagList('/tags')).map((t) => [t.name, t]))
    expect(byName.get('prod')?.parent?.id).toBe('tag-ui-folders')
  })

  it('409s any update of the reserved ui.folders root', async () => {
    const error = await call('/tags/tag-ui-folders', { method: 'PUT', body: { name: 'folders' } })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
  })

  it('404s updating an unknown tag or onto an unknown parent, 400s an empty name', async () => {
    const noTag = await call('/tags/no-such-tag', { method: 'PUT', body: { name: 'x' } })
    expect((noTag as ApiError).status).toBe(404)

    const noParent = await call('/tags/tag-staging', {
      method: 'PUT',
      body: { parent: { id: 'no-such-tag' } },
    })
    expect((noParent as ApiError).status).toBe(404)

    const unnamed = await call('/tags/tag-staging', { method: 'PUT', body: { name: '' } })
    expect((unnamed as ApiError).status).toBe(400)
  })

  it('applies nothing when any part of the update is rejected', async () => {
    // A valid rename riding with an invalid re-parent must not half-land.
    const error = await call('/tags/tag-staging', {
      method: 'PUT',
      body: { name: 'qa', parent: { id: 'no-such-tag' } },
    })
    expect((error as ApiError).status).toBe(404)

    const names = (await tagList('/tags')).map((t) => t.name)
    expect(names).toContain('staging')
    expect(names).not.toContain('qa')
  })

  it('deleting a tag cascades unassignment from every VM', async () => {
    await call('/tags/tag-legacy', { method: 'DELETE' })

    expect((await tagList('/tags')).map((t) => t.name)).not.toContain('legacy')
    await expect(tagList('/vms/vm-08/tags')).resolves.toEqual([])
  })

  it('deleting a childless folder works and unassigns its VMs', async () => {
    await call('/tags/tag-staging', { method: 'DELETE' })

    expect((await tagList('/tags')).map((t) => t.name)).not.toContain('staging')
    await expect(tagList('/vms/vm-07/tags')).resolves.toEqual([])
  })

  it('409s deleting the reserved ui.folders root or a folder with children', async () => {
    const root = await call('/tags/tag-ui-folders', { method: 'DELETE' })
    expect(root).toBeInstanceOf(ApiError)
    expect((root as ApiError).status).toBe(409)

    const parent = await call('/tags/tag-prod', { method: 'DELETE' })
    expect(parent).toBeInstanceOf(ApiError)
    expect((parent as ApiError).status).toBe(409)

    // Guarded deletes leave the tree untouched.
    const names = (await tagList('/tags')).map((t) => t.name)
    expect(names).toContain('ui.folders')
    expect(names).toContain('prod')
  })

  it('404s deleting an unknown tag id', async () => {
    const error = await call('/tags/no-such-tag', { method: 'DELETE' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  it('serves per-template tag assignments and embeds them under follow=tags', async () => {
    const names = (await tagList('/templates/tpl-02/tags')).map((t) => t.name)
    expect(names.sort()).toEqual(['legacy', 'staging'])
    await expect(tagList('/templates/tpl-00/tags')).resolves.toEqual([])

    const followed = (await call('/templates?follow=tags')) as {
      template: Array<{ id: string; tags?: { tag?: Array<{ name: string }> } }>
    }
    const byId = new Map(followed.template.map((template) => [template.id, template]))
    expect(byId.get('tpl-01')?.tags?.tag?.map((t) => t.name)).toEqual(['prod'])
    // untagged templates get the wrapper with the inner key omitted
    expect(byId.get('tpl-00')?.tags).toEqual({})

    // without follow, no tags wrapper at all
    const bare = (await call('/templates')) as { template: Array<Record<string, unknown>> }
    expect(bare.template[0]).not.toHaveProperty('tags')
  })

  it('attaches and detaches template tags with the VM-endpoint semantics', async () => {
    await call('/templates/tpl-00/tags', { method: 'POST', body: { name: 'web' } })
    expect((await tagList('/templates/tpl-00/tags')).map((t) => t.name)).toEqual(['web'])

    const dup = await call('/templates/tpl-00/tags', { method: 'POST', body: { name: 'web' } })
    expect((dup as ApiError).status).toBe(409)

    const noTag = await call('/templates/tpl-00/tags', { method: 'POST', body: { name: 'nope' } })
    expect((noTag as ApiError).status).toBe(404)

    const noTpl = await call('/templates/no-such/tags', { method: 'POST', body: { name: 'web' } })
    expect((noTpl as ApiError).status).toBe(404)

    await call('/templates/tpl-00/tags/tag-web', { method: 'DELETE' })
    await expect(tagList('/templates/tpl-00/tags')).resolves.toEqual([])

    const again = await call('/templates/tpl-00/tags/tag-web', { method: 'DELETE' })
    expect((again as ApiError).status).toBe(404)
  })

  it('deleting a tag cascades unassignment from templates too', async () => {
    await call('/tags/tag-legacy', { method: 'DELETE' })

    const names = (await tagList('/templates/tpl-02/tags')).map((t) => t.name)
    expect(names).toEqual(['staging'])
  })

  it('reports the mock identity on the api root, switchable via setMockUsername', async () => {
    const root = (await call('')) as { authenticated_user?: { user_name?: string } }
    expect(root.authenticated_user?.user_name).toBe('admin@internal')

    setMockUsername('lucas@internal')
    const switched = (await call('')) as { authenticated_user?: { user_name?: string } }
    expect(switched.authenticated_user?.user_name).toBe('lucas@internal')
  })
})
