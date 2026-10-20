import { ServerIcon } from '@patternfly/react-icons'
import { hostStatusColor, hostStatusIcon } from '../../components/hostStatus'
import type { StatusBadgeColor } from '../../components/StatusBadge'
import { statusText } from '../../lib/format'

// icon-color token per status color, for the small corner badge on the tree
// server icon
const STATUS_ICON_COLOR: Record<StatusBadgeColor, string> = {
  green: 'var(--pf-t--global--icon--color--status--success--default)',
  red: 'var(--pf-t--global--icon--color--status--danger--default)',
  yellow: 'var(--pf-t--global--icon--color--status--warning--default)',
  orange: 'var(--pf-t--global--icon--color--status--warning--default)',
  blue: 'var(--pf-t--global--icon--color--status--info--default)',
  teal: 'var(--pf-t--global--icon--color--status--info--default)',
  purple: 'var(--pf-t--global--icon--color--status--info--default)',
  grey: 'var(--pf-t--global--icon--color--subtle)',
}

// Host tree node icon: the server icon carrying a small status badge in the
// corner — green check = up, red = failure, yellow wrench = maintenance, blue
// = the transitional walk — so status reads at a glance in the navigator
// without losing the host identity, alongside the HE crown beside the name.
// The status word rides as the hover title; the content pane's HostStatusCell
// carries it accessibly. Falls back to a plain server icon when the engine
// hasn't reported a status yet.
export function HostTreeIcon({ status }: { status: string | undefined }) {
  if (!status) return <ServerIcon />
  const normalized = status.toLowerCase()
  const Glyph = hostStatusIcon(normalized)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} title={statusText(status)}>
      <ServerIcon />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '-3px',
          insetInlineEnd: '-4px',
          display: 'inline-flex',
          lineHeight: 0,
          fontSize: '0.7em',
          color: STATUS_ICON_COLOR[hostStatusColor(normalized)],
          background: 'var(--pf-t--global--background--color--primary--default)',
          borderRadius: '50%',
        }}
      >
        <Glyph />
      </span>
    </span>
  )
}
