import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  DropdownItem,
  EmptyState,
  EmptyStateBody,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { TagIcon } from '@patternfly/react-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import { assignTag, listVmTags, unassignTag } from '../../api/resources/tags'
import type { Tag } from '../../api/schemas/tag'
import type { Vm } from '../../api/schemas/vm'
import { labelTagsOf, tagColor, useTags } from '../../hooks/useTags'
import { useNotify } from '../../notifications/context'
import { pfLabelColor } from './label-palette'

const MODAL_CLASS = 'assign-vm-tags-modal'

// The kebab/context Dropdown closes on any window-level click landing outside
// its menu, and closing unmounts its items — including the item that renders
// this modal, and the modal with it. The modal portals to document.body (so
// it IS outside the dropdown), which means every click inside it would
// otherwise kill it mid-interaction. While it is open, stop those clicks at
// the document level: React's own listeners attach lower (app + portal
// roots), so the modal keeps working and the event never reaches the
// dropdown's window listener. Backdrop clicks stay unshielded — they dismiss
// menu and modal together, the usual "click away to cancel". (Same fix as
// MoveToFolderModal / RunOnceModal / CloneVmModal.)
function useMenuClickShield() {
  useEffect(() => {
    const shield = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${MODAL_CLASS}`)) {
        event.stopPropagation()
      }
    }
    document.addEventListener('click', shield)
    return () => document.removeEventListener('click', shield)
  }, [])
}

// The VM twin of AssignTagsModal (host/user), generalized to a SELECTION:
// right-clicking one VM tags that VM; right-clicking a row inside a
// multi-select tags every selected VM in one pass. Pre-checked = attached to
// ALL targets; a tag on only some targets shows unchecked with an
// "On n of N" hint, and checking it attaches it to the ones missing it.
// Saving diffs the selection per VM — newly checked tags attach (by name)
// where absent, unchecked-but-common tags detach everywhere. Strings are
// hardcoded English like the sibling modal (menu item stays localized).
export function AssignVmTagsModal({ vms, onClose }: { vms: readonly Vm[]; onClose: () => void }) {
  useMenuClickShield()
  const allTags = useTags()
  const current = useQuery({
    queryKey: ['vm-tags-assign', vms.map((vm) => vm.id).sort()],
    queryFn: async () => Promise.all(vms.map((vm) => listVmTags(vm.id))),
  })
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  // null = untouched (the effective selection falls back to the all-targets
  // set); a Set = the user has toggled at least one box.
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const perVm = current.data ?? []
  // tag id → how many targets carry it
  const counts = new Map<string, number>()
  const byId = new Map<string, Tag>()
  for (const tags of perVm) {
    for (const tag of tags) {
      counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1)
      byId.set(tag.id, tag)
    }
  }
  const commonIds = new Set(
    [...counts.entries()].filter(([, n]) => n === vms.length).map(([id]) => id),
  )
  // the label vocabulary plus any attached tag outside it (out-of-band tags
  // stay removable), deduped and name-sorted
  for (const tag of labelTagsOf(allTags.data ?? [])) byId.set(tag.id, tag)
  const checklist = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))

  const effectiveSelected = selected ?? commonIds

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(effectiveSelected)
    if (checked) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const toAttach = checklist.filter(
    (tag) => effectiveSelected.has(tag.id) && (counts.get(tag.id) ?? 0) < vms.length,
  )
  const toDetach = checklist.filter(
    (tag) => !effectiveSelected.has(tag.id) && (counts.get(tag.id) ?? 0) > 0,
  )
  const isDirty = toAttach.length > 0 || toDetach.length > 0

  const save = useMutation({
    mutationFn: async () => {
      // Sequential per target so one engine 409 surfaces cleanly; detach
      // before attach, mirroring the sibling modal.
      for (const [index, vm] of vms.entries()) {
        const attached = new Set((perVm[index] ?? []).map((tag) => tag.id))
        for (const tag of toDetach) if (attached.has(tag.id)) await unassignTag(vm.id, tag.id)
        for (const tag of toAttach) if (!attached.has(tag.id)) await assignTag(vm.id, tag.name)
      }
    },
    onSuccess: () => {
      notify({
        title:
          vms.length === 1
            ? `Tags updated for ${vms[0].name}`
            : `Tags updated for ${vms.length} VMs`,
        variant: 'success',
      })
      onClose()
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      // list rows embed tags (?follow=tags), so the VM collections refresh too
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
      for (const vm of vms) {
        void queryClient.invalidateQueries({ queryKey: ['vm', vm.id, 'tags'] })
      }
    },
  })

  return (
    <Modal
      variant="small"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="assign-vm-tags-title"
      aria-describedby="assign-vm-tags-body"
    >
      <ModalHeader
        title={vms.length === 1 ? `Add tags to ${vms[0].name}` : `Add tags to ${vms.length} VMs`}
        labelId="assign-vm-tags-title"
      />
      <ModalBody id="assign-vm-tags-body">
        {(allTags.isPending || current.isPending) && (
          <>
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" screenreaderText="Loading tags" />
          </>
        )}

        {(allTags.isError || current.isError) && (
          <EmptyState variant="sm" titleText="Could not load tags" status="danger">
            <EmptyStateBody>
              {(allTags.error ?? current.error) instanceof Error
                ? (allTags.error ?? current.error)!.message
                : 'Unknown error'}
            </EmptyStateBody>
            <Button
              variant="primary"
              onClick={() => {
                void allTags.refetch()
                void current.refetch()
              }}
            >
              Retry
            </Button>
          </EmptyState>
        )}

        {allTags.isSuccess && current.isSuccess && checklist.length === 0 && (
          <EmptyState variant="sm" titleText="No tags defined">
            <EmptyStateBody>
              Create tags in the Tag Manager on the Virtual Machines list, then assign them here.
            </EmptyStateBody>
          </EmptyState>
        )}

        {allTags.isSuccess && current.isSuccess && checklist.length > 0 && (
          <Stack hasGutter>
            {checklist.map((tag) => {
              const attachedTo = counts.get(tag.id) ?? 0
              const partial = attachedTo > 0 && attachedTo < vms.length
              return (
                <StackItem key={tag.id}>
                  <Checkbox
                    id={`assign-vm-tag-${tag.id}`}
                    isChecked={effectiveSelected.has(tag.id)}
                    onChange={(_event, checked) => toggle(tag.id, checked)}
                    label={
                      <Label isCompact color={pfLabelColor(tagColor(tag))}>
                        {tag.name}
                      </Label>
                    }
                    description={partial ? `On ${attachedTo} of ${vms.length}` : undefined}
                  />
                </StackItem>
              )
            })}
          </Stack>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isDisabled={!isDirty || save.isPending || !current.isSuccess}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// Kebab/context-menu item wrapper — the dropdown must stay open while the
// modal is up (same pattern as MoveToFolderModalItem). `vms` is the clicked
// row alone, or the whole multi-selection when the row was part of one.
export function AssignVmTagsModalItem({ vms }: { vms: readonly Vm[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <DropdownItem icon={<TagIcon />} onClick={() => setIsOpen(true)}>
        <FormattedMessage id="tags.assign.add" />
      </DropdownItem>
      {isOpen && <AssignVmTagsModal vms={vms} onClose={() => setIsOpen(false)} />}
    </>
  )
}
