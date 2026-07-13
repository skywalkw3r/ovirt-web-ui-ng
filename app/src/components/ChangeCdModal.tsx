import { useEffect, useState } from 'react'
import {
  Button,
  DropdownItem,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { CompactDiscIcon } from '@patternfly/react-icons'
import type { Vm } from '../api/schemas/vm'
import { useChangeVmCd, useIsoImages, useVmCdrom } from '../hooks/useVmCd'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'

// Marker class the click shield uses to recognize its own modal (see
// CloneVmModal for the full rationale — the kebab dropdown closes on any
// outside click and unmounts this item + modal otherwise).
const MODAL_CLASS = 'change-cd-modal'

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

// Change CD applies to a running VM (affects the running guest) or a stopped
// VM (persists for the next boot). Other statuses (transitional, suspended)
// have no meaningful CD change, so the item is disabled with the reason.
function isChangeCdDisabled(status: string | undefined): boolean {
  return status !== 'up' && status !== 'down'
}

// Kebab item owning the Change CD modal (CloneVmModalItem pattern).
export function ChangeCdModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  if (isChangeCdDisabled(vm.status)) {
    return (
      <DropdownItem
        icon={<CompactDiscIcon />}
        isAriaDisabled
        tooltipProps={{
          content: t('changeCd.disabledReason', { status: statusText(vm.status) }),
        }}
      >
        {t('changeCd.item')}
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<CompactDiscIcon />} onClick={() => setIsOpen(true)}>
        {t('changeCd.item')}
      </DropdownItem>
      {isOpen && <ChangeCdModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// The Change CD dialog. A running VM's change hits the live guest (current);
// a stopped VM's change persists for the next boot. The picker preselects the
// ISO currently in the tray and offers an explicit eject option.
function ChangeCdModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  useMenuClickShield()
  const t = useT()
  const running = vm.status === 'up'

  const isos = useIsoImages(true)
  const currentCd = useVmCdrom(vm.id, running, true)
  const change = useChangeVmCd()

  // '' = eject. Seeded from the current tray once it loads; the user can then
  // pick a different ISO or eject.
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (selected === null && currentCd.isSuccess) {
      setSelected(currentCd.data ?? '')
    }
  }, [selected, currentCd.isSuccess, currentCd.data])

  const value = selected ?? ''
  const pending = change.isPending

  const save = () => {
    change.mutate({ vm, fileId: value, current: running }, { onSuccess: onClose })
  }

  return (
    <Modal
      variant="small"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="change-cd-title"
      aria-describedby="change-cd-body"
    >
      <ModalHeader title={t('changeCd.title', { name: vm.name })} labelId="change-cd-title" />
      <ModalBody id="change-cd-body">
        <Form
          id="change-cd-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) save()
          }}
        >
          <FormGroup label={t('changeCd.iso')} fieldId="change-cd-iso">
            <FormSelect
              id="change-cd-iso"
              aria-label={t('changeCd.iso')}
              value={value}
              isDisabled={isos.isPending || isos.isError}
              onChange={(_event, next) => setSelected(next)}
            >
              <FormSelectOption value="" label={t('changeCd.ejectOption')} />
              {isos.data?.map((iso) => (
                <FormSelectOption key={iso.id} value={iso.id} label={iso.name} />
              ))}
            </FormSelect>
            <FormHelperText>
              <HelperText>
                {isos.isError ? (
                  <HelperTextItem variant="error">
                    {t('changeCd.loadError')}{' '}
                    <Button variant="link" isInline onClick={() => void isos.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </HelperTextItem>
                ) : isos.isSuccess && isos.data.length === 0 ? (
                  <HelperTextItem variant="warning">{t('changeCd.empty')}</HelperTextItem>
                ) : (
                  <HelperTextItem>
                    {running ? t('changeCd.helpRunning') : t('changeCd.helpStopped')}
                  </HelperTextItem>
                )}
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="change-cd-form"
          isLoading={pending}
          isDisabled={pending || selected === null}
        >
          {value === '' ? t('changeCd.eject') : t('changeCd.change')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
