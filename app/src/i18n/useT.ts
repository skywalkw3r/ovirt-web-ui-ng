import { useCallback } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from './messages/en'

// Typed wrapper over useIntl().formatMessage: ids autocomplete from the en
// catalog (MessageId) and typos fail typecheck at the call site. Prefer
// <FormattedMessage id="…" /> for element text; reach for t() when a plain
// string is required — aria-label, title, placeholder, toasts, document
// titles. ICU values (interpolation/plurals) go in the second argument, e.g.
// t('vm.count', { count }) against '{count, plural, one {# VM} other {# VMs}}'.
export function useT() {
  const intl = useIntl()
  return useCallback(
    (id: MessageId, values?: Record<string, string | number>): string =>
      intl.formatMessage({ id }, values),
    [intl],
  )
}
