import { Tooltip } from '@patternfly/react-core'
import { ExclamationIcon } from '@patternfly/react-icons'
import type { Vm } from '../api/schemas/vm'
import { useT } from '../i18n/useT'
import { vmWarningIds } from '../lib/vmWarnings'

// The orange "!" marker beside the VM status (see lib/vmWarnings for what
// qualifies): nothing when the VM is clean, an exclamation with a tooltip
// listing every warning otherwise. The span carries the joined text as its
// accessible name (the icon is aria-hidden) and is focusable so the tooltip
// opens on keyboard focus too.
export function VmWarnings({ vm }: { vm: Vm }) {
  const t = useT()
  const ids = vmWarningIds(vm)
  if (ids.length === 0) return null
  return (
    <Tooltip
      content={
        <>
          {ids.map((id) => (
            <div key={id}>{t(id)}</div>
          ))}
        </>
      }
    >
      <span
        role="img"
        aria-label={ids.map((id) => t(id)).join(' ')}
        tabIndex={0}
        style={{
          color: 'var(--pf-t--global--icon--color--status--warning--default)',
          marginInlineStart: 'var(--pf-t--global--spacer--xs)',
          display: 'inline-flex',
          verticalAlign: 'middle',
        }}
      >
        <ExclamationIcon />
      </span>
    </Tooltip>
  )
}
