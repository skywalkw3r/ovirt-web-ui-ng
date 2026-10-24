import { describe, expect, it } from 'vitest'
import { consumeSignOutNotice, markSignOutUnconfirmed } from './logoutNotice'

describe('logoutNotice', () => {
  it('is quiet by default', () => {
    expect(consumeSignOutNotice()).toBe(false)
  })

  it('reports an unconfirmed sign-out exactly once', () => {
    markSignOutUnconfirmed()
    expect(consumeSignOutNotice()).toBe(true)
    expect(consumeSignOutNotice()).toBe(false)
  })
})
