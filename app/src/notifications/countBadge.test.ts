import { describe, expect, it } from 'vitest'
import { createIntl } from 'react-intl'
import { enMessages } from '../i18n/messages/en'
import type { MessageId } from '../i18n/messages/en'
import { BADGE_CAP, badgeAriaLabel, badgeCount } from './countBadge'

const intl = createIntl({ locale: 'en', messages: enMessages })
const t = (id: MessageId, values?: Record<string, string | number>) =>
  intl.formatMessage({ id }, values)

const TASKS = {
  idle: 'tasks.title',
  count: 'tasks.badge.running',
  overCap: 'tasks.badge.overCap',
} as const
const BELL = {
  idle: 'notifications.bell.ariaLabel',
  count: 'notifications.bell.unread',
  overCap: 'notifications.bell.overCap',
} as const

// The labels must restate the count the badge shows (WCAG 2.5.3 label in name).
describe('badgeAriaLabel', () => {
  it('names the tasks toggle for idle, counted and over-cap states', () => {
    expect(badgeAriaLabel(t, 0, TASKS)).toBe('Tasks')
    expect(badgeAriaLabel(t, 3, TASKS)).toBe('Tasks — 3 running')
    expect(badgeAriaLabel(t, BADGE_CAP, TASKS)).toBe('Tasks — 20 running')
    expect(badgeAriaLabel(t, BADGE_CAP + 1, TASKS)).toBe('Tasks — more than 20 running')
  })

  it('names the notification bell for idle, counted and over-cap states', () => {
    expect(badgeAriaLabel(t, 0, BELL)).toBe('Notifications')
    expect(badgeAriaLabel(t, 3, BELL)).toBe('Notifications — 3 unread')
    expect(badgeAriaLabel(t, BADGE_CAP + 1, BELL)).toBe('Notifications — more than 20 unread')
  })
})

describe('badgeCount', () => {
  it('passes counts through up to the cap and reads 20+ past it', () => {
    expect(badgeCount(0)).toBe(0)
    expect(badgeCount(BADGE_CAP)).toBe(BADGE_CAP)
    expect(String(badgeCount(BADGE_CAP + 1))).toBe('20+')
  })
})
