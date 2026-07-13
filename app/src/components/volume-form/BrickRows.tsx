import {
  Button,
  FormSelect,
  FormSelectOption,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import type { Host } from '../../api/schemas/host'
import type { BrickDraft } from '../../api/resources/volumes'
import { useT } from '../../i18n/useT'

// The brick editor shared by the create-volume modal and the add-bricks flow: a
// row per brick pairing a server (a host of the volume's cluster) with the export
// directory on it. Rows are added/removed here; validation (each row filled, a
// minimum count) lives in the parent so it can gate its own Save. The server
// picker is fed the caller's already-cluster-filtered hosts.
export function BrickRows({
  hosts,
  hostsLoading,
  bricks,
  onChange,
  idPrefix,
}: {
  hosts: Host[]
  hostsLoading: boolean
  bricks: BrickDraft[]
  onChange: (bricks: BrickDraft[]) => void
  idPrefix: string
}) {
  const t = useT()
  const setRow = (index: number, patch: Partial<BrickDraft>) => {
    onChange(bricks.map((brick, i) => (i === index ? { ...brick, ...patch } : brick)))
  }
  const addRow = () => onChange([...bricks, { serverId: '', brickDir: '' }])
  const removeRow = (index: number) => onChange(bricks.filter((_, i) => i !== index))

  const serverPlaceholder = hostsLoading
    ? t('volumes.brick.hostsLoading')
    : hosts.length === 0
      ? t('volumes.brick.hostsNone')
      : t('volumes.brick.hostSelect')

  return (
    <Stack hasGutter>
      {bricks.map((brick, index) => (
        <StackItem key={index}>
          <Split hasGutter>
            <SplitItem style={{ minWidth: '12rem' }}>
              <FormSelect
                id={`${idPrefix}-server-${index}`}
                aria-label={t('volumes.brick.aria.server', { n: index + 1 })}
                value={brick.serverId}
                isDisabled={hostsLoading || hosts.length === 0}
                onChange={(_event, value) => setRow(index, { serverId: value })}
              >
                <FormSelectOption value="" label={serverPlaceholder} isDisabled />
                {hosts.map((host) => (
                  <FormSelectOption key={host.id} value={host.id} label={host.name} />
                ))}
              </FormSelect>
            </SplitItem>
            <SplitItem isFilled>
              <TextInput
                id={`${idPrefix}-dir-${index}`}
                aria-label={t('volumes.brick.aria.directory', { n: index + 1 })}
                placeholder={t('volumes.brick.dirPlaceholder')}
                value={brick.brickDir}
                onChange={(_event, value) => setRow(index, { brickDir: value })}
              />
            </SplitItem>
            <SplitItem>
              <Button
                variant="plain"
                aria-label={t('volumes.brick.aria.remove', { n: index + 1 })}
                icon={<MinusCircleIcon />}
                isDisabled={bricks.length <= 1}
                onClick={() => removeRow(index)}
              />
            </SplitItem>
          </Split>
        </StackItem>
      ))}
      <StackItem>
        <Button variant="link" icon={<PlusCircleIcon />} isInline onClick={addRow}>
          {t('volumes.brick.addBrick')}
        </Button>
      </StackItem>
    </Stack>
  )
}
