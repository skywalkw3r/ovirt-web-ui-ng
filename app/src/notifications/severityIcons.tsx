import type { ReactNode } from 'react'
import { Icon } from '@patternfly/react-core'
import {
  BellIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
} from '@patternfly/react-icons'

// Small status icon for event entries (notification drawer bubbles, the
// dashboard Activity card) — one shared mapping so every feed reads the
// same. Callers fall back to `SEVERITY_ICON.normal` for unknown severities.
export const SEVERITY_ICON: Partial<Record<string, ReactNode>> = {
  normal: (
    <Icon status="info" isInline>
      <InfoCircleIcon />
    </Icon>
  ),
  warning: (
    <Icon status="warning" isInline>
      <ExclamationTriangleIcon />
    </Icon>
  ),
  error: (
    <Icon status="danger" isInline>
      <ExclamationCircleIcon />
    </Icon>
  ),
  alert: (
    <Icon status="danger" isInline>
      <BellIcon />
    </Icon>
  ),
}
