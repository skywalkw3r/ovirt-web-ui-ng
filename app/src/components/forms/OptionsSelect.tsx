import type { ReactNode } from 'react'
import {
  Button,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import { optionsStatus, type OptionsQuery } from './optionsStatus'

export type { OptionsQuery, OptionsStatus } from './optionsStatus'

export interface OptionsHelperProps<T> {
  query: OptionsQuery<T>
  /** Loading hint; defaults to the generic catalog "Loading". */
  loadingLabel?: string
  /**
   * The field the list feeds, prefixed to every line ("Cluster: Loading").
   * Needed when the helper cannot sit inside the field's own FormGroup — the
   * select is rendered by a presentational section that takes a plain array —
   * so the reader can still tell which list the line is about.
   */
  label?: string
}

/**
 * The helper line under an option-list select: a loading hint while the query
 * is pending, an error line plus an inline Retry (`query.refetch`) when it
 * failed, an empty hint on a successful read that returned no rows, and
 * nothing once options are available. Use it directly when the select itself
 * is rendered elsewhere (a presentational section that takes a plain array);
 * `OptionsSelect` composes it with the select for the common case.
 */
export function OptionsHelper<T>({ query, loadingLabel, label }: OptionsHelperProps<T>) {
  const t = useT()
  const status = optionsStatus(query)
  if (status === 'ready') return null
  const prefix = label !== undefined ? `${label}: ` : ''
  if (status === 'error') {
    // ApiError.message carries the engine fault detail verbatim
    const detail =
      query.error instanceof Error && query.error.message ? `: ${query.error.message}` : ''
    return (
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant="error">
            {prefix}
            {t('viewState.error')}
            {detail}{' '}
            <Button variant="link" isInline onClick={() => void query.refetch()}>
              {t('action.retry')}
            </Button>
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    )
  }
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant={status === 'loading' ? 'indeterminate' : 'default'}>
          {prefix}
          {status === 'loading' ? (loadingLabel ?? t('viewState.loading')) : t('viewState.empty')}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

export interface OptionsSelectProps<T> {
  id: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  query: OptionsQuery<T>
  /**
   * The options for the loaded rows. Called only once the read has settled
   * successfully, so a failed read renders the error line — never a select
   * that merely looks empty.
   */
  children: (items: T[]) => ReactNode
  /**
   * A leading '' option rendered in every state: a pure placeholder ("Select a
   * cluster", `isDisabled`) or a real '' choice ("Inherit", "Cluster default").
   */
  placeholder?: { label: string; isDisabled?: boolean }
  /** Loading hint; defaults to the generic catalog "Loading". */
  loadingLabel?: string
  isDisabled?: boolean
}

/**
 * A `FormSelect` fed by a query, with the query's four states designed in:
 * disabled with a loading hint while pending, disabled + `validated="error"`
 * with an error line and Retry when the read failed, an empty hint when the
 * catalog is genuinely empty, and the caller's options once loaded. Drop it
 * where a bare `<FormSelect>{(query.data ?? []).map(…)}</FormSelect>` used to
 * hide a failed catalog read behind an empty dropdown.
 */
export function OptionsSelect<T>({
  id,
  ariaLabel,
  value,
  onChange,
  query,
  children,
  placeholder,
  loadingLabel,
  isDisabled,
}: OptionsSelectProps<T>) {
  const status = optionsStatus(query)
  const settled = status === 'ready' || status === 'empty'
  return (
    <>
      <FormSelect
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(_event, next) => onChange(next)}
        isDisabled={isDisabled || !settled}
        validated={status === 'error' ? 'error' : 'default'}
      >
        {placeholder && (
          <FormSelectOption
            value=""
            label={placeholder.label}
            isDisabled={placeholder.isDisabled}
          />
        )}
        {settled && children(query.data ?? [])}
      </FormSelect>
      <OptionsHelper query={query} loadingLabel={loadingLabel} />
    </>
  )
}
