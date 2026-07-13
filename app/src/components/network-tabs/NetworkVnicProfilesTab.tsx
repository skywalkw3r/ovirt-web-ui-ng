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

// The network's vNIC profiles with full CRUD: a New button (network pre-bound)
// plus an Edit/Remove kebab per row, all reusing VnicProfileFormModal and the
// existing /vnicprofiles mutations. Admin-gated the NetworkLabelsTab way —
// hidden (not disabled) below admin tier; the engine enforces server-side too.
export function NetworkVnicProfilesTab({ networkId }: { networkId: string }) {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const queryClient = useQueryClient()
  const profiles = useNetworkVnicProfiles(networkId)

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

  return (
    <>
      {canManage && (
        <Toolbar aria-label={t('networkVnic.table.ariaLabel')}>
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="secondary" onClick={() => setCreating(true)}>
                New vNIC profile
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
          <Button variant="primary" onClick={() => void profiles.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length === 0 && (
        <EmptyState titleText={t('networkVnic.empty.title')}>
          <EmptyStateBody>{t('networkVnic.empty.body')}</EmptyStateBody>
          {canManage && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New vNIC profile
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
              <Th>{t('common.field.name')}</Th>
              <Th>{t('networkVnic.column.passThrough')}</Th>
              <Th>{t('networkVnic.column.portMirroring')}</Th>
              <Th>{t('common.field.description')}</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {profiles.data.map((profile) => (
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
          title={`Remove vNIC profile ${removing.name}?`}
          body="A profile still used by any VM or template vNIC cannot be removed — the engine rejects it."
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
