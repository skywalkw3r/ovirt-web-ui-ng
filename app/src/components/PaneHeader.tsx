import { Fragment, type ReactNode } from 'react'
import { Title } from '@patternfly/react-core'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'

/**
 * The identity banner the inventory panes hang the selected entity on — the
 * host / cluster / data center a Hosts & Clusters selection resolves to, and
 * the folder a VMs & Templates selection resolves to. Same primitive shape as
 * ListPageHeader (which owns the page <h1>): the component emits load-bearing
 * class hooks and brand-tokens.css does the layout, so no inline styles or
 * margins live here and every pane reads identically.
 *
 * It renders as a tinted banner rather than a bare title + rule because it is
 * answering "what am I looking at?" for everything below it, and a flat line
 * of text lost that fight against the grid. `icon` sits in its own tile,
 * `badges` ride inline after the name (compat version, live status), `details`
 * is the Open details link, and `actions` right-aligns (the host kebab). The
 * meta line reads "<kind> · <fact> · <fact>", dropping undefined facts, so a
 * caller can pass a fact it may not have resolved yet — the root banner leans
 * on that to hold its VM count back until the VM collection lands rather than
 * claiming zero.
 *
 * `kindId` is optional because the tree ROOTS have no entity kind: "All
 * infrastructure" is an aggregate, and its counts are the whole meta line.
 */

/**
 * A meta-line fact. The object form prefixes a small icon, for facts that name
 * a DIFFERENT kind of entity than the banner itself — a cluster's data center,
 * a host's cluster. Without it "Cluster · Default · Secure Intel…" gives no
 * clue that the first fact is a data center and the second is a CPU type; the
 * icon says which is which without spending words on it.
 *
 * Give the icon a `title` (PF icons render it as an SVG <title>): it is the
 * only thing naming that kind, so a decorative aria-hidden icon would leave
 * the fact ambiguous to a screen reader rather than merely terse.
 */
export type PaneHeaderFact = string | { icon: ReactNode; text: string }

export function PaneHeader({
  icon,
  name,
  kindId,
  facts = [],
  badges,
  details,
  actions,
}: {
  icon: ReactNode
  name: string
  kindId?: MessageId
  facts?: (PaneHeaderFact | undefined)[]
  badges?: ReactNode
  details?: ReactNode
  actions?: ReactNode
}) {
  const t = useT()
  const resolved = facts.filter((fact): fact is PaneHeaderFact => fact !== undefined)
  const separator = t('infra.host.metaSeparator')
  return (
    <div className="app-pane-header">
      <span className="app-pane-header__icon" aria-hidden>
        {icon}
      </span>
      <div className="app-pane-header__body">
        <div className="app-pane-header__identity">
          <Title headingLevel="h2" size="xl">
            {name}
          </Title>
          {badges}
          {details}
        </div>
        {/* "<kind> · <fact> · <fact>" — the separator leads every part except
            the first, so a kindless root banner opens straight on its counts
            instead of a dangling "· ". */}
        <div className="app-pane-header__meta">
          {kindId !== undefined && <span className="app-pane-header__kind">{t(kindId)}</span>}
          {resolved.map((fact, index) => (
            <Fragment key={index}>
              {index === 0 && kindId === undefined ? null : ` ${separator} `}
              {typeof fact === 'string' ? (
                fact
              ) : (
                // one span so the icon and its text never break across lines
                <span className="app-pane-header__fact">
                  {fact.icon}
                  {fact.text}
                </span>
              )}
            </Fragment>
          ))}
        </div>
      </div>
      {actions != null && <div className="app-pane-header__actions">{actions}</div>}
    </div>
  )
}
