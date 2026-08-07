import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  assignTag,
  assignTemplateTag,
  listTags,
  listTemplateTags,
  listVmTags,
  unassignTag,
  unassignTemplateTag,
} from '../api/resources/tags'
import type { Tag } from '../api/schemas/tag'
import type { Template } from '../api/schemas/template'
import type { Vm } from '../api/schemas/vm'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'
import { TAG_STALE_MS, folderTagsOf } from './useTags'

// MOVE SEMANTICS: an entity lives in at most one folder (docs/COMPONENTS.md
// folder model), but nothing engine-side enforces that — a move therefore
// unassigns EVERY folder tag the entity holds except the target, then assigns
// the target if it is missing. Label tags are untouched. Pure and exported
// for unit tests; target null = "No folder".
export function planFolderMove(
  vmTags: Tag[],
  allTags: Tag[],
  target: Tag | null,
): { unassign: Tag[]; assign: Tag | null } {
  const current = folderTagsOf(vmTags, allTags)
  return {
    unassign: current.filter((tag) => tag.id !== target?.id),
    assign: target !== null && !current.some((tag) => tag.id === target.id) ? target : null,
  }
}

// VMs and templates share identical move semantics over AssignedTagsService;
// only the endpoints, cache keys and batch toast copy differ. (The single-
// entity toasts are name-based and kind-agnostic.)
interface MoveKindSpec {
  listEntityTags: (id: string) => Promise<Tag[]>
  assign: (id: string, tagName: string) => Promise<void>
  unassign: (id: string, tagId: string) => Promise<void>
  entityKey: 'vm' | 'template'
  listKey: 'vms' | 'templates'
  movedMany: MessageId
  removedMany: MessageId
  partial: MessageId
}

const MOVE_KINDS: Record<'vm' | 'template', MoveKindSpec> = {
  vm: {
    listEntityTags: listVmTags,
    assign: assignTag,
    unassign: unassignTag,
    entityKey: 'vm',
    listKey: 'vms',
    movedMany: 'folders.toast.movedMany',
    removedMany: 'folders.toast.removedMany',
    partial: 'folders.toast.partial',
  },
  template: {
    listEntityTags: listTemplateTags,
    assign: assignTemplateTag,
    unassign: unassignTemplateTag,
    entityKey: 'template',
    listKey: 'templates',
    movedMany: 'folders.toast.movedManyTpl',
    removedMany: 'folders.toast.removedManyTpl',
    partial: 'folders.toast.partialTpl',
  },
}

interface MovableEntity {
  id: string
  name: string
}

function useMoveEntityToFolder(kind: 'vm' | 'template'): {
  move: (entity: MovableEntity, folderId: string | null) => Promise<void>
  moveMany: (entities: MovableEntity[], folderId: string | null) => Promise<void>
} {
  const spec = MOVE_KINDS[kind]
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  const mutation = useMutation({
    mutationFn: async ({
      entities,
      folderId,
    }: {
      entities: MovableEntity[]
      folderId: string | null
    }) => {
      // fetchQuery shares keys and freshness window with useTags/useVmTags,
      // so this reuses whatever the tree and label chips already fetched.
      const allTags = await queryClient.fetchQuery({
        queryKey: ['tags'],
        queryFn: () => listTags(),
        staleTime: TAG_STALE_MS,
      })
      const target = folderId === null ? null : allTags.find((tag) => tag.id === folderId)
      if (target === undefined) {
        // stale drop or picker selection: the folder vanished since it rendered
        throw new Error(t('folders.toast.targetGone'))
      }

      // Per-entity moves run to completion independently (Promise.allSettled,
      // mirroring useBulkVmAction): one failure never blocks the rest.
      const results = await Promise.allSettled(
        entities.map(async (entity) => {
          const entityTags = await queryClient.fetchQuery({
            queryKey: [spec.entityKey, entity.id, 'tags'],
            queryFn: () => spec.listEntityTags(entity.id),
            staleTime: TAG_STALE_MS,
          })
          const plan = planFolderMove(entityTags, allTags, target)
          // Unassign before assign so a mid-flight failure leaves the entity
          // in fewer folders, never in two at once.
          for (const tag of plan.unassign) {
            await spec.unassign(entity.id, tag.id)
          }
          if (plan.assign !== null) {
            await spec.assign(entity.id, plan.assign.name)
          }
          return plan.unassign.length > 0 || plan.assign !== null
        }),
      )
      // A lone entity keeps the original error path (engine fault detail
      // verbatim in the toast); batches summarize instead.
      if (entities.length === 1 && results[0].status === 'rejected') {
        throw results[0].reason as Error
      }
      const failed = entities.filter((_entity, index) => results[index].status === 'rejected')
      const changed = results.some(
        (result) => result.status === 'fulfilled' && result.value === true,
      )
      return { target, changed, failed }
    },
    onSuccess: ({ target, changed, failed }, { entities }) => {
      if (failed.length > 0) {
        notify({
          title: t(spec.partial, {
            succeeded: entities.length - failed.length,
            total: entities.length,
            names: failed.map((entity) => entity.name).join(', '),
          }),
          variant: 'danger',
        })
        return
      }
      // dropping entities onto the folder they are already in is a quiet no-op
      if (!changed) return
      notify({
        title:
          entities.length === 1
            ? target === null
              ? t('folders.toast.removedOne', { name: entities[0].name })
              : t('folders.toast.movedOne', { name: entities[0].name, folder: target.name })
            : target === null
              ? t(spec.removedMany, { count: entities.length })
              : t(spec.movedMany, { count: entities.length, folder: target.name }),
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { entities }) => {
      for (const entity of entities) {
        void queryClient.invalidateQueries({ queryKey: [spec.entityKey, entity.id, 'tags'] })
      }
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
      // List rows embed their tags (the list reads follow tags) — refresh
      // them so the folder filter and counts reflect the move immediately.
      void queryClient.invalidateQueries({ queryKey: [spec.listKey] })
    },
  })

  // Resolves once the move settles either way — failures are already toasted
  // above, so callers can fire-and-forget without unhandled rejections (same
  // pattern as TagManagerModal's submitFolder).
  const run = async (entities: MovableEntity[], folderId: string | null) => {
    try {
      await mutation.mutateAsync({ entities, folderId })
    } catch {
      // onError already notified
    }
  }

  return {
    move: (entity, folderId) => run([entity], folderId),
    moveMany: run,
  }
}

export function useMoveVmToFolder(): {
  move: (vm: Vm, folderId: string | null) => Promise<void>
  moveMany: (vms: Vm[], folderId: string | null) => Promise<void>
} {
  return useMoveEntityToFolder('vm')
}

export function useMoveTemplateToFolder(): {
  move: (template: Template, folderId: string | null) => Promise<void>
  moveMany: (templates: Template[], folderId: string | null) => Promise<void>
} {
  return useMoveEntityToFolder('template')
}
