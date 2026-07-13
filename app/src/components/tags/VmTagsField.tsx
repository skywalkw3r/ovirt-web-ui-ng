import { useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  Label,
  LabelGroup,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  SearchInput,
  Skeleton,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { FolderIcon, PlusCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useQueryClient } from '@tanstack/react-query'
import type { Tag } from '../../api/schemas/tag'
import type { Vm } from '../../api/schemas/vm'
import { useCapabilities } from '../../auth/capabilities'
import {
  folderPathOf,
  followedTagsOf,
  isFolderTag,
  labelTagsOf,
  tagColor,
  useAssignTag,
  useCreateTag,
  useTags,
  useUnassignTag,
  useVmTags,
} from '../../hooks/useTags'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { LABEL_PALETTE, pfLabelColor } from './label-palette'

// New-from-typing labels get a deterministic palette color (same name → same
// color everywhere, and adjacent names spread across the palette) so they
// look intentional immediately; recolor later in the Tag manager. Grey (the
// palette's no-hex default) is skipped — it reads as "never colored".
function hashColorHex(name: string): string | undefined {
  const colored = LABEL_PALETTE.filter((entry) => entry.hex !== undefined)
  if (colored.length === 0) return undefined
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return colored[hash % colored.length].hex
}

// The VM General About card's Tags row: the VM's label tags, editable in
// place — the app's quick label-assignment surface (the Tag manager owns
// rename/recolor/delete; folder membership is navigation and lives in its
// own About row + the inventory tree, never here).
//
// Chips carry an admin-only × that unassigns immediately (re-assigning is
// one click, so no confirm). The trailing ⊕ opens a search-first menu:
// before typing it suggests the top five most-used unassigned labels
// (usage counted client-side over the cached VM list), typing filters the
// whole vocabulary, and a name that matches nothing offers create-and-assign
// in one click. User tier sees read-only chips.
export function VmTagsField({ vmId, vmName }: { vmId: string; vmName: string }) {
  const vmTags = useVmTags(vmId)
  const allTags = useTags()
  const queryClient = useQueryClient()
  const { isAdmin } = useCapabilities()
  const assign = useAssignTag()
  const unassign = useUnassignTag()
  // silent: the assign toast announces the combined create-and-assign outcome
  const create = useCreateTag({ silent: true })
  const t = useT()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  // the chip whose × was clicked, awaiting the ConfirmModal's verdict
  const [removing, setRemoving] = useState<Tag | null>(null)

  if (allTags.isPending || vmTags.isPending) {
    return <Skeleton width="8rem" screenreaderText={t('tags.labels.loading')} />
  }

  if (allTags.isError || vmTags.isError) {
    return (
      <Label isCompact color="red" variant="outline">
        <FormattedMessage id="tags.labels.unavailable" />
      </Label>
    )
  }

  const all = allTags.data ?? []
  const assigned = vmTags.data ?? []
  const labels = labelTagsOf(assigned, all)
  const assignedIds = new Set(assigned.map((tag) => tag.id))
  const availableLabels = labelTagsOf(all, all).filter((tag) => !assignedIds.has(tag.id))

  // Top-5 by how many VMs carry the label, read PASSIVELY from the cached
  // unsearched VM list (the list read embeds tags via ?follow=tags) — no
  // subscription, no extra fetch from a detail page. A cold cache just means
  // all-zero counts, i.e. an alphabetical five; ties break alphabetically.
  const usage = new Map<string, number>()
  for (const vm of queryClient.getQueryData<Vm[]>(['vms', '']) ?? []) {
    for (const tag of followedTagsOf(vm) ?? []) usage.set(tag.id, (usage.get(tag.id) ?? 0) + 1)
  }
  const popular = [...availableLabels]
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 5)

  const trimmed = search.trim()
  const needle = trimmed.toLowerCase()
  const filtered = availableLabels.filter((tag) => tag.name.toLowerCase().includes(needle))

  // Create only when the engine would actually accept it — otherwise the
  // menu explains WHY instead (a raw engine fault toast is the backstop for
  // races, never the expected path):
  // - engine tag names are restricted to letters/digits/-/_ (the
  //   "Invalid tag name" fault), and
  // - names are GLOBALLY unique across the whole tag tree, so a folder named
  //   'Graylog' blocks a label 'graylog' — the collision scan covers every
  //   tag (folders, reserved roots), not just the label vocabulary.
  const VALID_TAG_NAME = /^[0-9A-Za-z_-]+$/
  const collision = needle === '' ? undefined : all.find((tag) => tag.name.toLowerCase() === needle)
  const collisionIsFolder = collision !== undefined && isFolderTag(collision, all)
  const collisionIsAssigned = collision !== undefined && assignedIds.has(collision.id)
  // an unassigned label collision is already visible as an assign item in
  // `filtered`, so it needs no explanation row
  const collisionIsOfferedLabel =
    collision !== undefined && !collisionIsAssigned && labelTagsOf([collision], all).length > 0
  const canCreate = needle !== '' && collision === undefined && VALID_TAG_NAME.test(trimmed)

  const closeAdd = () => {
    setIsAddOpen(false)
    setSearch('')
  }

  const createAndAssign = async (name: string) => {
    const hex = hashColorHex(name)
    try {
      // top-level (parentless) tag = a label; the color rides the description
      await create.mutateAsync({
        name,
        description: hex !== undefined ? JSON.stringify({ color: hex }) : undefined,
      })
    } catch {
      return // useCreateTag already toasted the failure
    }
    assign.mutate({ vmId, tagName: name })
  }

  const assignItem = (tag: Tag) => (
    <DropdownItem key={tag.id} onClick={() => assign.mutate({ vmId, tagName: tag.name })}>
      <Label isCompact color={pfLabelColor(tagColor(tag))}>
        {tag.name}
      </Label>
    </DropdownItem>
  )

  const addControl = isAdmin ? (
    <Dropdown
      isOpen={isAddOpen}
      onOpenChange={(open) => (open ? setIsAddOpen(true) : closeAdd())}
      onSelect={closeAdd}
      popperProps={{ enableFlip: true }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          size="sm"
          isDisabled={assign.isPending || create.isPending}
          aria-label={t('tags.assign.add')}
          icon={<PlusCircleIcon />}
          onClick={() => (isAddOpen ? closeAdd() : setIsAddOpen(true))}
          isExpanded={isAddOpen}
        />
      )}
    >
      <MenuSearch>
        <MenuSearchInput>
          <SearchInput
            value={search}
            onChange={(_event, value) => setSearch(value)}
            placeholder={t('tags.assign.search')}
            aria-label={t('tags.assign.search')}
          />
        </MenuSearchInput>
      </MenuSearch>
      <Divider />
      {needle === '' ? (
        popular.length > 0 ? (
          <DropdownGroup label={t('tags.assign.popular')}>
            <DropdownList>{popular.map(assignItem)}</DropdownList>
          </DropdownGroup>
        ) : (
          <DropdownList>
            <DropdownItem isDisabled>
              <FormattedMessage id="tags.assign.none" />
            </DropdownItem>
          </DropdownList>
        )
      ) : (
        <DropdownList>
          {filtered.map(assignItem)}
          {canCreate && (
            <DropdownItem icon={<PlusCircleIcon />} onClick={() => void createAndAssign(trimmed)}>
              {t('tags.assign.create', { name: trimmed })}
            </DropdownItem>
          )}
          {/* the no-create explanations, most specific first */}
          {collisionIsFolder && (
            <DropdownItem isDisabled icon={<FolderIcon />}>
              {t('tags.assign.inFolderUse', {
                name:
                  folderPathOf(all, collision.id)
                    .map((folder) => folder.name)
                    .join(' / ') || collision.name,
              })}
            </DropdownItem>
          )}
          {collision !== undefined && !collisionIsFolder && collisionIsAssigned && (
            <DropdownItem isDisabled>
              <FormattedMessage id="tags.assign.alreadyAssigned" />
            </DropdownItem>
          )}
          {collision !== undefined &&
            !collisionIsFolder &&
            !collisionIsAssigned &&
            !collisionIsOfferedLabel && (
              <DropdownItem isDisabled>
                <FormattedMessage id="tags.assign.nameTaken" />
              </DropdownItem>
            )}
          {collision === undefined && !canCreate && (
            <DropdownItem isDisabled>
              <FormattedMessage id="tags.assign.invalidName" />
            </DropdownItem>
          )}
        </DropdownList>
      )}
    </Dropdown>
  ) : undefined

  // user tier with nothing assigned: the em dash, same as the read-only chips
  if (labels.length === 0 && addControl === undefined) return <>—</>

  return (
    <>
      <LabelGroup numLabels={6} isCompact addLabelControl={addControl}>
        {labels.map((tag) => (
          <Label
            key={tag.id}
            isCompact
            color={pfLabelColor(tagColor(tag))}
            onClose={isAdmin ? () => setRemoving(tag) : undefined}
            closeBtnAriaLabel={t('tags.assign.remove', { name: tag.name })}
          >
            {tag.name}
          </Label>
        ))}
      </LabelGroup>
      {/* destructive-action gate (ground rules): the × asks before
          unassigning; the body spells out this is per-VM, not a delete */}
      {removing !== null && (
        <ConfirmModal
          isOpen
          title={t('tags.unassign.title', { name: removing.name })}
          body={t('tags.unassign.body', { vm: vmName })}
          confirmLabel={t('tags.unassign.confirm')}
          onConfirm={() => {
            unassign.mutate({ vmId, tag: removing })
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
