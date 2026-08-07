import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
} from '@patternfly/react-core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { migrateVm } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useHosts } from '../hooks/useHosts'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'

// Migrate is not a lifecycle action (different endpoint, carries the
// destination choice), so it gets its own mutation instead of extending
// useVmAction — same reasoning as useRemoveVm.
function useMigrateVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vm, hostId }: { vm: Vm; hostId?: string }) => migrateVm(vm.id, { hostId }),
    onSuccess: (_data, { vm }) => {
      notify({ title: `Migration requested for ${vm.name}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { vm }) => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
      void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
    },
  })
}

// Hidden (not disabled) unless the session is admin — GET /hosts needs an
// admin session, and user-tier accounts cannot migrate anyway — and the VM is
// plainly up, mirroring the engine's migrate precondition.
export function MigrateVmButton({ vm }: { vm: Vm }) {
  const { isAdmin } = useCapabilities()
  const [isOpen, setIsOpen] = useState(false)
  const mutation = useMigrateVm()
  const t = useT()

  if (!isAdmin || vm.status !== 'up') return null

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)} isDisabled={mutation.isPending}>
        {t('migrate.action')}
      </Button>

      {isOpen && (
        <MigrateModal
          vm={vm}
          onMigrate={(hostId) => {
            setIsOpen(false)
            mutation.mutate({ vm, hostId })
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

// Controlled modal-only variant for surfaces that own the trigger themselves —
// the VM kebab mounts this as a sibling of its Dropdown, so closing the menu
// never unmounts the dialog. It owns the migrate mutation exactly like
// MigrateVmButton; the caller only toggles it open and supplies onClose. Gate
// the trigger the same way MigrateVmButton gates itself (admin + running).
export function MigrateVmModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const mutation = useMigrateVm()
  return (
    <MigrateModal
      vm={vm}
      onMigrate={(hostId) => {
        onClose()
        mutation.mutate({ vm, hostId })
      }}
      onClose={onClose}
    />
  )
}

function MigrateModal({
  vm,
  onMigrate,
  onClose,
}: {
  vm: Vm
  // hostId undefined = let the engine's scheduler pick (empty action body)
  onMigrate: (hostId?: string) => void
  onClose: () => void
}) {
  const hosts = useHosts()
  const t = useT()
  const [pinHost, setPinHost] = useState(false)
  const [hostId, setHostId] = useState('')

  // A VM only migrates WITHIN its own cluster (the engine rejects a
  // cross-cluster destination), and never onto the host it already runs on.
  // Only 'up' hosts can receive it — maintenance/non_responsive are rejected
  // too. So restrict the picker to up hosts in the VM's cluster, minus the
  // current one.
  const targets = (hosts.data ?? []).filter(
    (host) =>
      host.status === 'up' && host.cluster?.id === vm.cluster?.id && host.id !== vm.host?.id,
  )

  const submit = () => {
    if (pinHost && !hostId) return
    onMigrate(pinHost ? hostId : undefined)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="migrate-vm-title"
      aria-describedby="migrate-vm-body"
    >
      <ModalHeader title={t('migrate.title', { name: vm.name })} labelId="migrate-vm-title" />
      <ModalBody id="migrate-vm-body">
        <Form
          id="migrate-vm-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup
            label={t('migrate.destination')}
            role="radiogroup"
            isStack
            fieldId="migrate-destination"
          >
            <Radio
              id="migrate-destination-auto"
              name="migrate-destination"
              label={t('migrate.auto.label')}
              description={t('migrate.auto.description')}
              isChecked={!pinHost}
              onChange={() => setPinHost(false)}
            />
            <Radio
              id="migrate-destination-pinned"
              name="migrate-destination"
              label={t('migrate.pinned.label')}
              isChecked={pinHost}
              onChange={() => setPinHost(true)}
            />
          </FormGroup>

          {pinHost && (
            <FormGroup label={t('migrate.host.label')} isRequired fieldId="migrate-host">
              {hosts.isPending && (
                <Skeleton height="2.25rem" screenreaderText={t('migrate.host.loading')} />
              )}
              {hosts.isError && (
                <>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('migrate.host.error', {
                        message:
                          hosts.error instanceof Error
                            ? hosts.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                  <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </>
              )}
              {hosts.isSuccess && (
                <FormSelect
                  id="migrate-host"
                  aria-label={t('migrate.host.label')}
                  value={hostId}
                  onChange={(_event, value) => setHostId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={targets.length === 0 ? t('migrate.host.none') : t('migrate.host.select')}
                    isPlaceholder
                    isDisabled
                  />
                  {targets.map((host) => (
                    <FormSelectOption key={host.id} value={host.id} label={host.name} />
                  ))}
                </FormSelect>
              )}
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="migrate-vm-form"
          isDisabled={pinHost && !hostId}
        >
          {t('migrate.action')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
