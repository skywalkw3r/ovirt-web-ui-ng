import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  Skeleton,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addUserEventSubscription,
  listUserEventSubscriptions,
  removeUserEventSubscription,
} from '../../api/resources/users'
import { useCapabilities } from '../../auth/capabilities'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useNotify } from '../../notifications/context'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'

// The subscribable-event catalog, grouped for the Add modal's multi-select.
// PROVENANCE: the NotifiableEvent enum in the api-model, transcribed verbatim
// (lowercased to the wire form the REST API serializes) from
// https://github.com/oVirt/ovirt-engine-api-model
//   src/main/java/types/NotifiableEvent.java (master, 158 constants, @since
//   4.4.0 — no additions through 4.5). The engine has no REST endpoint that
// lists this catalog (webadmin compiles it statically too), hence the static
// list; regenerate against the source when bumping the supported engine.
// Grouping is ours (by subsystem prefix) — the enum itself is flat.
interface NotifiableEventGroup {
  labelId: MessageId
  events: string[]
}

const NOTIFIABLE_EVENT_GROUPS: NotifiableEventGroup[] = [
  {
    labelId: 'eventSub.group.engine',
    events: [
      'engine_stop',
      'engine_backup_started',
      'engine_backup_completed',
      'engine_backup_failed',
      'engine_ca_certification_is_about_to_expire',
      'engine_ca_certification_has_expired',
      'engine_certification_is_about_to_expire',
      'engine_certification_has_expired',
      'dwh_stopped',
      'dwh_error',
    ],
  },
  {
    labelId: 'eventSub.group.hosts',
    events: [
      'host_failure',
      'host_updates_are_available',
      'host_updates_are_available_with_packages',
      'user_host_maintenance',
      'user_host_maintenance_manual_ha',
      'user_host_maintenance_migration_failed',
      'host_activate_manual_ha',
      'host_activate_failed',
      'host_recover_failed',
      'host_approve_failed',
      'host_install_failed',
      'host_time_drift_alert',
      'host_set_nonoperational',
      'host_set_nonoperational_iface_down',
      'host_low_mem',
      'host_high_mem_use',
      'host_interface_high_network_use',
      'host_high_cpu_use',
      'host_high_swap_use',
      'host_low_swap',
      'host_interface_state_down',
      'host_bond_slave_state_down',
      'host_certification_is_about_to_expire',
      'host_certification_has_expired',
      'host_certificate_has_invalid_san',
      'host_set_nonoperational_domain',
      'host_untrusted',
      'faulty_multipaths_on_host',
      'no_faulty_multipaths_on_host',
      'multipath_devices_without_valid_paths_on_host',
    ],
  },
  {
    labelId: 'eventSub.group.vms',
    events: [
      'vm_failure',
      'vm_migration_start',
      'vm_migration_failed',
      'vm_migration_to_server_failed',
      'vm_not_responding',
      'vm_status_restored',
      'ha_vm_restart_failed',
      'ha_vm_failed',
      'vm_console_connected',
      'vm_console_disconnected',
      'vm_set_ticket',
      'vm_down_error',
      'host_initiated_run_vm_failed',
      'vm_paused',
      'vm_paused_eio',
      'vm_paused_enospc',
      'vm_paused_eperm',
      'vm_paused_error',
      'vm_recovered_from_pause_error',
      'mac_address_is_external',
      'user_update_vm_from_trusted_to_untrusted',
      'user_update_vm_from_untrusted_to_trusted',
      'importexport_import_vm_from_trusted_to_untrusted',
      'importexport_import_vm_from_untrusted_to_trusted',
      'user_add_vm_from_trusted_to_untrusted',
      'user_add_vm_from_untrusted_to_trusted',
      'importexport_import_template_from_trusted_to_untrusted',
      'importexport_import_template_from_untrusted_to_trusted',
      'user_add_vm_template_from_trusted_to_untrusted',
      'user_add_vm_template_from_untrusted_to_trusted',
      'user_update_vm_template_from_trusted_to_untrusted',
      'user_update_vm_template_from_untrusted_to_trusted',
    ],
  },
  {
    labelId: 'eventSub.group.storage',
    events: [
      'system_change_storage_pool_status_no_host_for_spm',
      'system_deactivated_storage_domain',
      'host_slow_storage_response_time',
      'irs_failure',
      'irs_disk_space_low',
      'irs_confirmed_disk_space_low',
      'irs_disk_space_low_error',
      'number_of_lvs_on_storage_domain_exceeded_threshold',
    ],
  },
  {
    labelId: 'eventSub.group.clusterNetwork',
    events: [
      'cluster_alert_ha_reservation',
      'network_update_display_for_cluster_with_active_vm',
      'cluster_alert_ha_reservation_down',
      'network_update_display_for_host_with_active_vm',
    ],
  },
  {
    labelId: 'eventSub.group.gluster',
    events: [
      'gluster_volume_create',
      'gluster_volume_create_failed',
      'gluster_volume_option_added',
      'gluster_volume_option_modified',
      'gluster_volume_option_set_failed',
      'gluster_volume_start',
      'gluster_volume_start_failed',
      'gluster_volume_stop',
      'gluster_volume_stop_failed',
      'gluster_volume_options_reset',
      'gluster_volume_options_reset_all',
      'gluster_volume_options_reset_failed',
      'gluster_volume_delete',
      'gluster_volume_delete_failed',
      'gluster_volume_add_brick',
      'gluster_volume_add_brick_failed',
      'gluster_volume_remove_bricks',
      'gluster_volume_remove_bricks_failed',
      'start_removing_gluster_volume_bricks',
      'start_removing_gluster_volume_bricks_failed',
      'gluster_volume_remove_bricks_stop',
      'gluster_volume_remove_bricks_stop_failed',
      'gluster_volume_rebalance_start',
      'gluster_volume_rebalance_start_failed',
      'gluster_volume_rebalance_stop',
      'gluster_volume_rebalance_stop_failed',
      'gluster_volume_replace_brick_failed',
      'gluster_volume_replace_brick_start',
      'gluster_volume_replace_brick_start_failed',
      'gluster_volume_brick_replaced',
      'gluster_volume_rebalance_start_detected_from_cli',
      'start_removing_gluster_volume_bricks_detected_from_cli',
      'gluster_volume_rebalance_not_found_from_cli',
      'remove_gluster_volume_bricks_not_found_from_cli',
      'gluster_volume_snapshot_created',
      'gluster_volume_snapshot_create_failed',
      'gluster_server_add_failed',
      'gluster_server_remove',
      'gluster_server_remove_failed',
      'gluster_volume_profile_start',
      'gluster_volume_profile_start_failed',
      'gluster_volume_profile_stop',
      'gluster_volume_profile_stop_failed',
      'gluster_hook_enable',
      'gluster_hook_enable_failed',
      'gluster_hook_disable',
      'gluster_hook_disable_failed',
      'gluster_hook_detected_new',
      'gluster_hook_conflict_detected',
      'gluster_hook_detected_delete',
      'gluster_hook_added',
      'gluster_hook_add_failed',
      'gluster_hook_removed',
      'gluster_hook_remove_failed',
      'gluster_service_started',
      'gluster_service_start_failed',
      'gluster_service_stopped',
      'gluster_service_stop_failed',
      'gluster_service_restarted',
      'gluster_service_restart_failed',
      'gluster_brick_status_changed',
      'gluster_volume_snapshot_deleted',
      'gluster_volume_snapshot_delete_failed',
      'gluster_volume_all_snapshots_deleted',
      'gluster_volume_all_snapshots_delete_failed',
      'gluster_volume_snapshot_activated',
      'gluster_volume_snapshot_activate_failed',
      'gluster_volume_snapshot_deactivated',
      'gluster_volume_snapshot_deactivate_failed',
      'gluster_volume_snapshot_restored',
      'gluster_volume_snapshot_restore_failed',
      'gluster_volume_confirmed_space_low',
      'gluster_volume_rebalance_finished',
      'gluster_volume_migrate_brick_data_finished',
    ],
  },
]

// 'host_high_cpu_use' → 'Host high cpu use' — the wire value is the enum name,
// which is self-describing enough that a 158-entry hand-written label map is
// not worth its maintenance drag.
function humanizeEvent(event: string): string {
  const spaced = event.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const SUBSCRIPTIONS_QUERY_KEY = (userId: string) => ['user', userId, 'eventSubscriptions']

// Add-subscriptions modal: a searchable, grouped multi-select over the static
// NotifiableEvent catalog plus one optional address applied to every selected
// event. The REST surface is one subscription per POST, so saving fans out one
// request per checked event; per-event failures (409 already-subscribed /
// conflicting address) surface as danger toasts while the successes stick —
// the modal closes only when everything landed, keeping the failed selection
// in place for a retry.
function AddEventSubscriptionsModal({
  userId,
  subscribedEvents,
  onClose,
}: {
  userId: string
  subscribedEvents: Set<string>
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState('')
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Already-subscribed events drop out of the picker entirely — the engine
  // would 409 them anyway.
  const visibleGroups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return NOTIFIABLE_EVENT_GROUPS.map((group) => ({
      labelId: group.labelId,
      events: group.events.filter(
        (event) => !subscribedEvents.has(event) && (needle === '' || event.includes(needle)),
      ),
    })).filter((group) => group.events.length > 0)
  }, [filter, subscribedEvents])

  const toggle = (event: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(event)
      else next.delete(event)
      return next
    })
  }

  // The POSTs run sequentially so engine faults attribute cleanly; the
  // mutationFn never throws — partial failure is a result, not an error.
  const add = useMutation({
    mutationFn: async (events: string[]) => {
      const failures: { event: string; message: string }[] = []
      const succeeded: string[] = []
      for (const event of events) {
        try {
          await addUserEventSubscription(userId, {
            event,
            address: address.trim() === '' ? undefined : address.trim(),
          })
          succeeded.push(event)
        } catch (error) {
          failures.push({
            event,
            message: error instanceof Error ? error.message : 'Subscription failed',
          })
        }
      }
      return { succeeded, failures }
    },
    onSuccess: ({ succeeded, failures }) => {
      if (succeeded.length > 0) {
        notify({
          title:
            succeeded.length === 1
              ? `Subscribed to ${humanizeEvent(succeeded[0] ?? '')}`
              : `Subscribed to ${succeeded.length} events`,
          variant: 'success',
        })
      }
      for (const failure of failures.slice(0, 3)) {
        notify({ title: `${humanizeEvent(failure.event)}: ${failure.message}`, variant: 'danger' })
      }
      if (failures.length === 0) {
        onClose()
      } else {
        // keep only the failed events selected so a corrected retry is one click
        setSelected(new Set(failures.map((failure) => failure.event)))
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY(userId) })
    },
  })

  return (
    <Modal
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="add-event-subscription-title"
      aria-describedby="add-event-subscription-body"
    >
      <ModalHeader title={t('eventSub.add.title')} labelId="add-event-subscription-title" />
      <ModalBody id="add-event-subscription-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup
            label={t('eventSub.add.address.label')}
            fieldId="event-subscription-address"
            labelHelp={
              <FieldHelp
                field={t('eventSub.add.address.label')}
                content={t('eventSub.add.address.help')}
              />
            }
          >
            <TextInput
              id="event-subscription-address"
              type="email"
              value={address}
              onChange={(_event, value) => setAddress(value)}
              placeholder={t('eventSub.add.address.placeholder')}
              aria-label={t('eventSub.add.address.label')}
            />
          </FormGroup>

          <FormGroup label={t('events.title')} fieldId="event-subscription-filter">
            <SearchInput
              id="event-subscription-filter"
              aria-label={t('eventSub.add.filter')}
              placeholder={t('eventSub.add.filter')}
              value={filter}
              onChange={(_event, value) => setFilter(value)}
              onClear={() => setFilter('')}
            />
            <div
              role="group"
              aria-label={t('eventSub.add.notifiableEvents')}
              style={{
                maxHeight: '18rem',
                overflowY: 'auto',
                marginTop: 'var(--pf-t--global--spacer--sm)',
              }}
            >
              {visibleGroups.length === 0 && (
                <Content component="p">{t('eventSub.add.noMatch')}</Content>
              )}
              {visibleGroups.map((group) => (
                <div
                  key={group.labelId}
                  style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
                >
                  <Content component="h4">{t(group.labelId)}</Content>
                  {group.events.map((event) => (
                    <Checkbox
                      key={event}
                      id={`event-subscription-${event}`}
                      label={humanizeEvent(event)}
                      isChecked={selected.has(event)}
                      onChange={(_changeEvent, checked) => toggle(event, checked)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isLoading={add.isPending}
          isDisabled={add.isPending || selected.size === 0}
          onClick={() => add.mutate([...selected])}
        >
          {selected.size > 0
            ? t('eventSub.add.submitCount', { size: selected.size })
            : t('common.action.add')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={add.isPending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// The user's Event Notifier tab — webadmin parity for its user-detail
// subtab (UserEventNotifierListModel): which engine events email this user.
// Backed by GET/POST /users/{id}/eventsubscriptions and DELETE .../{event}
// (see api/resources/users.ts for the api-model verification and the
// event-name-is-the-id quirk). Remove confirms via the shared danger
// ConfirmModal. Four-state table per the house convention.
export function UserEventSubscriptionsTab({ userId }: { userId: string }) {
  const t = useT()
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const subscriptions = useQuery({
    queryKey: SUBSCRIPTIONS_QUERY_KEY(userId),
    queryFn: () => listUserEventSubscriptions(userId),
    refetchInterval,
    enabled: isAdmin,
  })

  const remove = useMutation({
    mutationFn: (event: string) => removeUserEventSubscription(userId, event),
    onSuccess: (_data, event) => {
      notify({ title: `Notification for ${humanizeEvent(event)} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY(userId) })
    },
  })

  const subscribedEvents = new Set(
    (subscriptions.data ?? [])
      .map((subscription) => subscription.event ?? subscription.id)
      .filter((event): event is string => event !== undefined),
  )

  return (
    <>
      {subscriptions.isSuccess && subscriptions.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  {t('common.action.add')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {subscriptions.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('eventSub.loading')} />
        </>
      )}

      {subscriptions.isError && (
        <EmptyState titleText={t('eventSub.error.title')} status="danger">
          <EmptyStateBody>
            {subscriptions.error instanceof Error
              ? subscriptions.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void subscriptions.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {subscriptions.isSuccess && subscriptions.data.length === 0 && (
        <EmptyState titleText={t('eventSub.empty.title')}>
          <EmptyStateBody>{t('eventSub.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAdding(true)}>
                {t('common.action.add')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {subscriptions.isSuccess && subscriptions.data.length > 0 && (
        <Table aria-label={t('eventSub.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('eventSub.column.event')}</Th>
              <Th>{t('eventSub.column.method')}</Th>
              <Th>{t('eventSub.column.address')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {subscriptions.data.map((subscription, index) => {
              const event = subscription.event ?? subscription.id
              return (
                <Tr key={event ?? index}>
                  <Td dataLabel={t('eventSub.column.event')} modifier="truncate" title={event}>
                    {event !== undefined ? humanizeEvent(event) : '—'}
                  </Td>
                  <Td dataLabel={t('eventSub.column.method')}>
                    <Label isCompact>
                      {(subscription.notification_method ?? 'smtp').toUpperCase()}
                    </Label>
                  </Td>
                  <Td dataLabel={t('eventSub.column.address')}>
                    {subscription.address || t('eventSub.addressFallback')}
                  </Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending || event === undefined}
                      items={[
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          onClick: () => {
                            if (event !== undefined) setRemoving(event)
                          },
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {adding && (
        <AddEventSubscriptionsModal
          userId={userId}
          subscribedEvents={subscribedEvents}
          onClose={() => setAdding(false)}
        />
      )}

      {removing !== null && (
        <ConfirmModal
          isOpen
          title={t('eventSub.remove.confirm.title', { removing: humanizeEvent(removing) })}
          body={t('eventSub.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const event = removing
            setRemoving(null)
            remove.mutate(event)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
