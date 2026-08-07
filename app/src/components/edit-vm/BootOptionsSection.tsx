import { useEffect } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { useIsoImages, useVmCdrom } from '../../hooks/useVmCd'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { BOOT_DEVICE_OPTIONS, type EditVmDraft } from './editVmDraft'

// Presentational "Boot Options" section of the Edit Virtual Machine modal. Most
// controls are draft-backed (first/second boot device drive vm.os.boot.devices;
// the boot-menu switch toggles vm.bios.boot_menu; kernel/initrd/cmdline drive
// os.*). The Attach CD picker is the exception: the current tray isn't on the vm
// read, so it fetches the ISO catalog + the persisted CD (read-only reuse of the
// Change CD hooks) and seeds the draft once.
export function BootOptionsSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()
  const isos = useIsoImages(true)
  // current=false → the persisted next-boot CD (Edit VM persists for next boot),
  // matching Change CD's stopped-VM path.
  const currentCd = useVmCdrom(draft.id, false, draft.id !== '')

  // Seed the picker from the persisted tray exactly once — only while the user
  // hasn't touched it (cdTouched), so switching away and back to the Boot tab
  // (sections unmount on switch) never clobbers a pending choice. Idempotent:
  // once the draft already matches the tray this is a no-op.
  useEffect(() => {
    if (!draft.cdTouched && currentCd.isSuccess) {
      const current = currentCd.data ?? ''
      if (draft.attachedCdId !== current) set('attachedCdId', current)
    }
  }, [draft.cdTouched, draft.attachedCdId, currentCd.isSuccess, currentCd.data, set])

  const changeCd = (fileId: string) => {
    set('attachedCdId', fileId)
    set('cdTouched', true)
  }

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup
        label={t('vm.edit.boot.firstDevice')}
        fieldId="boot-first-device"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.boot.firstDevice')}
            content={t('fieldHelp.vm.bootFirstDevice')}
          />
        }
      >
        <FormSelect
          id="boot-first-device"
          aria-label={t('vm.edit.boot.firstDevice')}
          value={draft.firstBootDevice}
          onChange={(_event, value) => set('firstBootDevice', value)}
        >
          {BOOT_DEVICE_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label={t('vm.edit.boot.secondDevice')} fieldId="boot-second-device">
        <FormSelect
          id="boot-second-device"
          aria-label={t('vm.edit.boot.secondDevice')}
          value={draft.secondBootDevice}
          onChange={(_event, value) => set('secondBootDevice', value)}
        >
          {BOOT_DEVICE_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={t(option.labelId)} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('vm.edit.boot.bootMenu')}
        fieldId="boot-menu-enabled"
        labelHelp={
          <FieldHelp field={t('vm.edit.boot.bootMenu')} content={t('fieldHelp.vm.bootMenu')} />
        }
      >
        <Switch
          id="boot-menu-enabled"
          aria-label={t('vm.edit.boot.bootMenu')}
          isChecked={draft.bootMenuEnabled}
          onChange={(_event, checked) => set('bootMenuEnabled', checked)}
        />
      </FormGroup>

      <FormGroup label={t('vm.edit.boot.attachCd')} fieldId="boot-attach-cd">
        <FormSelect
          id="boot-attach-cd"
          aria-label={t('vm.edit.boot.attachCd')}
          value={draft.attachedCdId}
          isDisabled={isos.isPending || isos.isError}
          onChange={(_event, value) => changeCd(value)}
        >
          <FormSelectOption value="" label={t('vm.edit.boot.attachCd.none')} />
          {isos.data?.map((iso) => (
            <FormSelectOption key={iso.id} value={iso.id} label={iso.name} />
          ))}
        </FormSelect>
        {isos.isError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {t('vm.edit.boot.attachCd.error')}{' '}
                <Button variant="link" isInline onClick={() => void isos.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
        {isos.isSuccess && isos.data.length === 0 && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">{t('vm.edit.boot.attachCd.empty')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label={t('vm.edit.boot.kernelPath')}
        fieldId="boot-kernel-path"
        labelHelp={
          <FieldHelp field={t('vm.edit.boot.kernelPath')} content={t('fieldHelp.vm.kernelPath')} />
        }
      >
        <TextInput
          id="boot-kernel-path"
          aria-label={t('vm.edit.boot.kernelPath')}
          value={draft.kernelPath}
          onChange={(_event, value) => set('kernelPath', value)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.boot.initrdPath')}
        fieldId="boot-initrd-path"
        labelHelp={
          <FieldHelp field={t('vm.edit.boot.initrdPath')} content={t('fieldHelp.vm.initrdPath')} />
        }
      >
        <TextInput
          id="boot-initrd-path"
          aria-label={t('vm.edit.boot.initrdPath')}
          value={draft.initrdPath}
          onChange={(_event, value) => set('initrdPath', value)}
        />
      </FormGroup>

      <FormGroup
        label={t('vm.edit.boot.kernelParams')}
        fieldId="boot-kernel-params"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.boot.kernelParams')}
            content={t('fieldHelp.vm.kernelParams')}
          />
        }
      >
        <TextInput
          id="boot-kernel-params"
          aria-label={t('vm.edit.boot.kernelParams')}
          value={draft.kernelParams}
          onChange={(_event, value) => set('kernelParams', value)}
        />
      </FormGroup>
    </Form>
  )
}
