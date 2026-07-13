import { useMemo, useState, type Ref } from 'react'
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  EmptyStateBody,
  MenuToggle,
  type MenuToggleElement,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
} from '@patternfly/react-core'
import type { UseQueryResult } from '@tanstack/react-query'

// A selectable entity — the VM/host pickers only need an id and a display name.
export interface SelectableEntity {
  id: string
  name?: string
}

// Reusable multi-select for the affinity modals: a PF6 checkbox Select fed by a
// query of candidate entities (the cluster's VMs or hosts), with a client-side
// filter box and a running count of the current selection. Selection state is
// owned by the parent (the modal's flat draft) — this only renders the ids it
// is handed and calls back with the toggled id, so an empty array (clear-all)
// and undefined (never touched) stay distinguishable upstream.
//
// Follows the four-state rule for the async candidate list: loading Skeletons,
// an inline error with retry, an empty state, and the populated menu. Scoped to
// the cluster by the caller (it passes a cluster-narrowed query), matching the
// live-engine rule that affinity members must belong to the group's cluster.
export function EntitySelection({
  label,
  ariaLabel,
  candidates,
  selectedIds,
  onToggle,
  emptyText,
  loadingText,
}: {
  label: string
  ariaLabel: string
  candidates: UseQueryResult<SelectableEntity[], Error>
  selectedIds: string[]
  onToggle: (id: string, next: boolean) => void
  emptyText: string
  loadingText: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const selected = new Set(selectedIds)
  // Memoize so the `?? []` fallback doesn't hand a fresh array to the filter
  // memo on every render (candidates.data is already stable from the query
  // cache; this just keeps the empty case stable too).
  const items = useMemo(() => candidates.data ?? [], [candidates.data])

  // Client-side name filter — the candidate lists are cluster-scoped and small,
  // so an in-memory contains match is enough (no server round-trip per keypress).
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle === '') return items
    return items.filter((item) => (item.name ?? item.id).toLowerCase().includes(needle))
  }, [items, filter])

  const nameFor = (id: string) => items.find((item) => item.id === id)?.name ?? id

  if (candidates.isPending) {
    return (
      <>
        <Skeleton height="2.25rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.25rem" screenreaderText={loadingText} />
      </>
    )
  }

  if (candidates.isError) {
    return (
      <EmptyState titleText={`Could not load ${label.toLowerCase()}`} status="danger">
        <EmptyStateBody>
          {candidates.error instanceof Error ? candidates.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="link" isInline onClick={() => void candidates.refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  return (
    <>
      <Select
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        // keep the menu open while ticking checkboxes so several members can be
        // toggled in one visit (mirrors ColumnPicker)
        shouldFocusToggleOnSelect={false}
        selected={selectedIds}
        onSelect={(_event, value) => {
          const id = String(value)
          if (id === '__none__') return
          onToggle(id, !selected.has(id))
        }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            aria-label={ariaLabel}
            isExpanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            isFullWidth
            badge={selectedIds.length > 0 ? <Badge isRead>{selectedIds.length}</Badge> : undefined}
          >
            {selectedIds.length === 0 ? label : `${selectedIds.length} selected`}
          </MenuToggle>
        )}
      >
        <div style={{ padding: 'var(--pf-t--global--spacer--sm)' }}>
          <SearchInput
            value={filter}
            onChange={(_event, value) => setFilter(value)}
            onClear={() => setFilter('')}
            placeholder={`Filter ${label.toLowerCase()}`}
            aria-label={`Filter ${label.toLowerCase()}`}
          />
        </div>
        <Divider />
        {items.length === 0 ? (
          <div style={{ padding: 'var(--pf-t--global--spacer--md)' }}>{emptyText}</div>
        ) : (
          <SelectList style={{ maxHeight: '14rem', overflowY: 'auto' }}>
            {visible.map((item) => (
              <SelectOption
                key={item.id}
                value={item.id}
                hasCheckbox
                isSelected={selected.has(item.id)}
              >
                {item.name ?? item.id}
              </SelectOption>
            ))}
            {visible.length === 0 && (
              <SelectOption isDisabled value="__none__">
                No match
              </SelectOption>
            )}
          </SelectList>
        )}
      </Select>

      {/* The chosen ids, so the selection is legible without opening the menu */}
      {selectedIds.length > 0 && (
        <div
          style={{
            marginTop: 'var(--pf-t--global--spacer--sm)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--pf-t--global--spacer--xs)',
          }}
        >
          {selectedIds.map((id) => (
            <Badge key={id} isRead>
              {nameFor(id)}
            </Badge>
          ))}
        </div>
      )}
    </>
  )
}
