import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import type { VnicProfile } from '../../api/schemas/vnic-profile'
import { useCapabilities } from '../../auth/capabilities'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useNetworkVnicProfiles } from '../../hooks/useNetworkDetail'
import { useDeleteVnicProfile } from '../../hooks/useVnicProfileMutations'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { VnicProfileFormModal } from '../vnic-profile-form/VnicProfileFormModal'

// pass_through.mode is 'enabled' | 'disabled'; the engine omits the block on
// profiles that predate SR-IOV support, and the default is disabled either way.
function isPassThrough(profile: VnicProfile): boolean {
  return profile.pass_through?.mode === 'enabled'
}

// The engine serializes `port_mirroring` as a JSON string, so the schema
// coerces it to a boolean — treat only an explicit true as mirrored.
function isPortMirrored(profile: VnicProfile): boolean {
  return profile.port_mirroring === true
}

// Every data column in visual order so each Th's index matches its position
// (the trailing actions cell is screen-reader-only and admin-only). Both
// booleans are profile CONFIGURATION rather than runtime state — grouping the
// SR-IOV / mirrored profiles is a real scan — so unlike a status chip they
// sort, on the same predicates the cells render (cf. MacPoolsPage's
// allow_duplicates).
const NETWORK_VNIC_KEYS = ['name', 'passThrough', 'portMirroring', 'description'] as const

// The network's vNIC profiles with full CRUD: a New button (network pre-bound)
// plus an Edit/Remove kebab per row, all reusing VnicProfileFormModal and the
// existing /vnicprofiles mutations. Admin-gated the NetworkLabelsTab way —
// hidden (not disabled) below admin tier; the engine enforces server-side too.
export function NetworkVnicProfilesTab({ networkId }: { networkId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const queryClient = useQueryClient()
  const profiles = useNetworkVnicProfiles(networkId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<VnicProfile | null>(null)
  // non-null while the remove confirm is up
  const [removing, setRemoving] = useState<VnicProfile | null>(null)
  const deleteMutation = useDeleteVnicProfile()

  // The delete/create/edit mutations invalidate only the global ['vnicprofiles']
  // list; this tab reads the network-scoped ['network', id, 'vnicProfiles'] key,
  // so refresh it explicitly whenever a mutation lands.
  const invalidateProfiles = () =>
    void queryClient.invalidateQueries({ queryKey: ['network', networkId, 'vnicProfiles'] })

  const canManage = loaded && isAdmin

  // a blank description sorts as absent, so those rows sink instead of leading
  // with em dashes
  const sortedProfiles = sortRows(profiles.data ?? [], sort, (profile, key) =>
    key === 'name'
      ? profile.name
      : key === 'passThrough'
        ? isPassThrough(profile)
          ? 1
          : 0
        : key === 'portMirroring'
          ? isPortMirrored(profile)
            ? 1
            : 0
          : profile.description || undefined,
  )

  return (
    <>
      {canManage && (
        <Toolbar aria-label={t('networkVnic.table.ariaLabel')}>
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="secondary" onClick={() => setCreating(true)}>
                {t('networkVnic.new')}
              </Button>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      )}

      {profiles.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('networkVnic.loading')} />
        </>
      )}

      {profiles.isError && (
        <EmptyState titleText={t('networkVnic.error.title')} status="danger">
          <EmptyStateBody>
            {profiles.error instanceof Error ? profiles.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void profiles.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length === 0 && (
        <EmptyState titleText={t('networkVnic.empty.title')}>
          <EmptyStateBody>{t('networkVnic.empty.body')}</EmptyStateBody>
          {canManage && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('networkVnic.new')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length > 0 && (
        <Table aria-label={t('networkVnic.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(NETWORK_VNIC_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(NETWORK_VNIC_KEYS, 1)}>{t('networkVnic.column.passThrough')}</Th>
              <Th sort={thSort(NETWORK_VNIC_KEYS, 2)}>{t('networkVnic.column.portMirroring')}</Th>
              <Th sort={thSort(NETWORK_VNIC_KEYS, 3)}>{t('common.field.description')}</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {sortedProfiles.map((profile) => (
              <Tr key={profile.id}>
                <Td dataLabel={t('common.field.name')}>{profile.name}</Td>
                <Td dataLabel={t('networkVnic.column.passThrough')}>
                  {isPassThrough(profile) ? t('common.enabled') : t('common.disabled')}
                </Td>
                <Td dataLabel={t('networkVnic.column.portMirroring')}>
                  {isPortMirrored(profile) ? (
                    <Label isCompact color="purple">
                      {t('common.yes')}
                    </Label>
                  ) : (
                    <Label isCompact color="grey">
                      {t('common.no')}
                    </Label>
                  )}
                </Td>
                <Td dataLabel={t('common.field.description')}>{profile.description || '—'}</Td>
                {canManage && (
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={deleteMutation.isPending}
                      items={[
                        {
                          title: t('common.action.edit'),
                          onClick: () => setEditing(profile),
                        },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          onClick: () => setRemoving(profile),
                        },
                      ]}
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && (
        <VnicProfileFormModal
          isOpen
          presetNetworkId={networkId}
          onClose={() => setCreating(false)}
          onSaved={invalidateProfiles}
        />
      )}
      {editing !== null && (
        <VnicProfileFormModal
          isOpen
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={invalidateProfiles}
        />
      )}

      {removing !== null && (
        <ConfirmModal
          isOpen
          title={t('networkVnic.remove.confirm.title', { name: removing.name })}
          body={t('networkVnic.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          onConfirm={() => {
            deleteMutation.mutate(
              { id: removing.id, name: removing.name },
              { onSettled: invalidateProfiles },
            )
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
