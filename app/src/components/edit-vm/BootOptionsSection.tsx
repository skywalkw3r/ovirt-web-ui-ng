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
import { FieldHelp } from '../forms/FieldHelp'
import { BOOT_DEVICE_OPTIONS, type EditVmDraft } from './editVmDraft'

// Presentational "Boot Options" section of the Edit Virtual Machine modal. Most
// controls are draft-backed (first/second boot device drive vm.os.boot.devices;
// the boot-menu switch toggles vm.bios.boot_menu; kernel/initrd/cmdline drive
// os.*). The Attach CD picker is the exception: the current tray isn't on the vm
// read, so it fetches the ISO catalog + the persisted CD (read-only reuse of the
// Change CD hooks) and seeds the draft once. Hardcoded English — the
// vm.edit.boot.* ids are pre-seeded for a later i18n pass.
export function BootOptionsSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
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
        label="First Device"
        fieldId="boot-first-device"
        labelHelp={
          <FieldHelp
            field="First Device"
            content="The device the VM tries to boot from first; the second device is tried if the first fails. Set the first device to CD or network to boot an installer, then back to disk."
          />
        }
      >
        <FormSelect
          id="boot-first-device"
          aria-label="First Device"
          value={draft.firstBootDevice}
          onChange={(_event, value) => set('firstBootDevice', value)}
        >
          {BOOT_DEVICE_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label="Second Device" fieldId="boot-second-device">
        <FormSelect
          id="boot-second-device"
          aria-label="Second Device"
          value={draft.secondBootDevice}
          onChange={(_event, value) => set('secondBootDevice', value)}
        >
          {BOOT_DEVICE_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Enable Boot Menu"
        fieldId="boot-menu-enabled"
        labelHelp={
          <FieldHelp
            field="Enable Boot Menu"
            content="Show the firmware boot menu at power-on so you can pick a boot device interactively, with a short pause before booting."
          />
        }
      >
        <Switch
          id="boot-menu-enabled"
          aria-label="Enable Boot Menu"
          isChecked={draft.bootMenuEnabled}
          onChange={(_event, checked) => set('bootMenuEnabled', checked)}
        />
      </FormGroup>

      <FormGroup label="Attach CD" fieldId="boot-attach-cd">
        <FormSelect
          id="boot-attach-cd"
          aria-label="Attach CD"
          value={draft.attachedCdId}
          isDisabled={isos.isPending || isos.isError}
          onChange={(_event, value) => changeCd(value)}
        >
          <FormSelectOption value="" label="No CD" />
          {isos.data?.map((iso) => (
            <FormSelectOption key={iso.id} value={iso.id} label={iso.name} />
          ))}
        </FormSelect>
        {isos.isError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                Could not load ISO images.{' '}
                <Button variant="link" isInline onClick={() => void isos.refetch()}>
                  Retry
                </Button>
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
        {isos.isSuccess && isos.data.length === 0 && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="warning">
                No ISO images are available in this data center.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup
        label="Kernel path"
        fieldId="boot-kernel-path"
        labelHelp={
          <FieldHelp
            field="Kernel path"
            content="Direct-kernel boot: an absolute path (on the host or an ISO domain) to a kernel image the VM boots directly, bypassing its own bootloader. Advanced — leave blank normally."
          />
        }
      >
        <TextInput
          id="boot-kernel-path"
          aria-label="Kernel path"
          value={draft.kernelPath}
          onChange={(_event, value) => set('kernelPath', value)}
        />
      </FormGroup>

      <FormGroup
        label="initrd path"
        fieldId="boot-initrd-path"
        labelHelp={
          <FieldHelp
            field="initrd path"
            content="Path to the initial ramdisk that pairs with the direct-boot kernel above. Advanced — leave blank unless doing direct-kernel boot."
          />
        }
      >
        <TextInput
          id="boot-initrd-path"
          aria-label="initrd path"
          value={draft.initrdPath}
          onChange={(_event, value) => set('initrdPath', value)}
        />
      </FormGroup>

      <FormGroup
        label="Kernel command line"
        fieldId="boot-kernel-params"
        labelHelp={
          <FieldHelp
            field="Kernel command line"
            content="Kernel parameters passed to the direct-boot kernel (e.g. for automated or kickstart installs). Only used together with a kernel path above."
          />
        }
      >
        <TextInput
          id="boot-kernel-params"
          aria-label="Kernel command line"
          value={draft.kernelParams}
          onChange={(_event, value) => set('kernelParams', value)}
        />
      </FormGroup>
    </Form>
  )
}
