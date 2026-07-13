import type { ReactNode } from 'react'
import { Flex, FlexItem, SearchInput as PfSearchInput, Tooltip } from '@patternfly/react-core'

// Controlled engine-DSL search box shared by the list pages (VMs today,
// Events and the admin lists as they gain search parity). Purely
// presentational: the caller owns the draft value and decides what "commit"
// means — usually publishing the query to the URL, useVmSearch-style.
// The DSL example rides as a hover/focus Tooltip instead of placeholder
// text, so resting toolbars stay quiet (user decision).
//
// No submit arrow: passing onSearch makes PF render an external submit
// button, so commit is wired through the input's own Enter key instead
// (user decision — Enter is the gesture). `trailing` sits just to the right
// of the box (small-gap flex) for the save/bookmark controls.
export function SearchInput({
  value,
  onChange,
  onCommit,
  hint,
  ariaLabel,
  trailing,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  hint?: string
  ariaLabel: string
  trailing?: ReactNode
}) {
  const input = (
    <PfSearchInput
      aria-label={ariaLabel}
      value={value}
      onChange={(_event, next) => onChange(next)}
      inputProps={{
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit()
          }
        },
      }}
      // clear empties then commits in one gesture; onCommit lands after
      // onChange(''), so callers should commit the cleared draft, not a
      // value closed over before the change
      onClear={() => {
        onChange('')
        onCommit()
      }}
    />
  )

  // plain-div anchor: PF's SearchInput doesn't forward a DOM ref, so the
  // Tooltip has nothing to bind its hover/focus listeners to without one
  const withHint = hint ? (
    <Tooltip content={hint} position="bottom" entryDelay={300}>
      <div>{input}</div>
    </Tooltip>
  ) : (
    input
  )

  if (!trailing) return withHint
  return (
    <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem grow={{ default: 'grow' }}>{withHint}</FlexItem>
      <FlexItem>{trailing}</FlexItem>
    </Flex>
  )
}
