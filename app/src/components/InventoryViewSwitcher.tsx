import { Tooltip } from '@patternfly/react-core'
import { InfrastructureIcon, VirtualMachineIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'

// Icon switcher between the two inventory surfaces (VMs & Templates, Hosts &
// Clusters). Rendered as a real <nav> of links, not PF Tabs: each item
// navigates to a different route, so there is no on-page tabpanel for a
// tablist to control — links keep the markup accessible (and open-in-new-tab
// working) while borrowed PF classes carry the look. Admin-only; a user-tier
// session has one surface, so it renders nothing.
//
// Two looks, because the switcher lives in two places:
//   'tabs'    — pinned above the tree, where an icon-tab strip is the right
//               read (`fill` spans it across the tree panel header).
//   'toolbar' — inline in InventoryToolbar once the tree is collapsed. A tab
//               strip there would sit directly above the pane's OWN tab strip
//               (two stacked strips, the top one controlling nothing on the
//               page) and its baseline would fight the 2.25rem toolbar
//               controls, so it wears toggle-group classes instead: a compact
//               segmented control that reads as a toolbar widget.
export function InventoryViewSwitcher({
  active,
  fill = false,
  variant = 'tabs',
}: {
  active: 'inventory' | 'infra'
  fill?: boolean
  variant?: 'tabs' | 'toolbar'
}) {
  const { isAdmin } = useCapabilities()
  const t = useT()
  if (!isAdmin) return null
  const views = [
    {
      key: 'inventory' as const,
      to: '/vms-templates' as const,
      label: t('nav.vmsTemplates'),
      icon: <VirtualMachineIcon />,
    },
    {
      key: 'infra' as const,
      to: '/hosts-clusters' as const,
      label: t('nav.hostsClusters'),
      icon: <InfrastructureIcon />,
    },
  ]
  if (variant === 'toolbar') {
    return (
      <nav
        className="pf-v6-c-toggle-group pf-m-compact app-view-switcher"
        aria-label={t('inventory.title')}
      >
        {views.map((view) => (
          <div className="pf-v6-c-toggle-group__item" key={view.key}>
            <Tooltip content={view.label}>
              <Link
                to={view.to}
                className={`pf-v6-c-toggle-group__button${
                  view.key === active ? ' pf-m-selected' : ''
                }`}
                aria-label={view.label}
                aria-current={view.key === active ? 'page' : undefined}
              >
                <span className="pf-v6-c-toggle-group__icon" aria-hidden>
                  {view.icon}
                </span>
              </Link>
            </Tooltip>
          </div>
        ))}
      </nav>
    )
  }

  return (
    <nav className={`pf-v6-c-tabs${fill ? ' pf-m-fill' : ''}`} aria-label={t('inventory.title')}>
      <ul className="pf-v6-c-tabs__list">
        {views.map((view) => (
          <li
            key={view.key}
            className={`pf-v6-c-tabs__item${view.key === active ? ' pf-m-current' : ''}`}
          >
            <Tooltip content={view.label}>
              <Link
                to={view.to}
                className="pf-v6-c-tabs__link"
                aria-label={view.label}
                aria-current={view.key === active ? 'page' : undefined}
              >
                <span className="pf-v6-c-tabs__item-icon" aria-hidden>
                  {view.icon}
                </span>
              </Link>
            </Tooltip>
          </li>
        ))}
      </ul>
    </nav>
  )
}
