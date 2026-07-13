import { FormGroupLabelHelp, Popover } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useT } from '../../i18n/useT'

export interface FieldHelpProps {
  /**
   * Human-readable field name, interpolated into the trigger button's
   * accessible name. Pass an already-translated string in i18n'd forms, or
   * the plain English label in hardcoded forms.
   */
  field: string
  /** Popover body explaining what the field means and how to set it. */
  content: ReactNode
  /** Optional heading rendered above the body content. */
  header?: ReactNode
}

/**
 * Field-level help trigger for a FormGroup's `labelHelp` slot: a small help
 * button that opens a Popover explaining a non-obvious field. Drop the rendered
 * element straight into `<FormGroup labelHelp={<FieldHelp … />}>`.
 *
 * The accessible-name PREFIX resolves through the catalog (I18nProvider wraps
 * the whole tree, so this works in hardcoded-English forms too); only the
 * field noun is caller-supplied.
 */
export function FieldHelp({ field, content, header }: FieldHelpProps) {
  const t = useT()
  return (
    <Popover headerContent={header} bodyContent={content}>
      <FormGroupLabelHelp aria-label={t('fieldHelp.moreInfo', { field })} />
    </Popover>
  )
}
