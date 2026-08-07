import type { ReactNode } from 'react'
import { Title } from '@patternfly/react-core'

/**
 * The one page-heading block every list and detail page hangs its title,
 * status, breadcrumb and page-level actions on. It owns exactly one <h1> and
 * four load-bearing class hooks (.app-page-header plus __meta/__crumb/__actions)
 * that brand-tokens.css lays out — no inline styles and no margins live here, so
 * the header reads the same everywhere. `breadcrumb` renders as its own muted
 * line ABOVE the title row (the PF convention — locate first, then identify);
 * `title` is already-localized text (callers pass t('…') / <FormattedMessage/>);
 * `meta` sits inline after it (a StatusBadge, tag chips on detail pages); and
 * `actions` right-aligns (creation buttons, kebab menus). Each optional slot
 * collapses entirely when its prop is null. `icon` is the entity-kind glyph
 * leading the name inside the <h1> (VM monitor / template layers — the same
 * glyphs the inventory list's Name cells carry); PF icons render aria-hidden,
 * so the heading's accessible name stays the bare title.
 */
export function ListPageHeader({
  title,
  meta,
  breadcrumb,
  actions,
  icon,
}: {
  title: ReactNode
  meta?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <>
      {breadcrumb != null && <div className="app-page-header__crumb">{breadcrumb}</div>}
      <div className="app-page-header">
        <Title headingLevel="h1">
          {icon != null && <span className="app-page-header__icon">{icon}</span>}
          {title}
        </Title>
        {meta != null && <div className="app-page-header__meta">{meta}</div>}
        {actions != null && <div className="app-page-header__actions">{actions}</div>}
      </div>
    </>
  )
}
