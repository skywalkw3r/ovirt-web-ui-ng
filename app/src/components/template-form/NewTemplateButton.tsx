import { useState } from 'react'
import { Button, type ButtonProps } from '@patternfly/react-core'
import { PlusCircleIcon } from '@patternfly/react-icons'
import { useT } from '../../i18n/useT'
import { TemplateFormModal } from './TemplateFormModal'

// The list toolbars' "New template": the template dialog in create mode, which
// builds the template from a powered-off source VM picked inside it.
export function NewTemplateButton({ variant = 'secondary' }: { variant?: ButtonProps['variant'] }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  return (
    <>
      <Button variant={variant} icon={<PlusCircleIcon />} onClick={() => setIsOpen(true)}>
        {t('templateForm.newAction')}
      </Button>
      {/* remount per open so a cancelled dialog never leaks its draft into the
          next one (ImportVmButton pattern) */}
      {isOpen && <TemplateFormModal isOpen onClose={() => setIsOpen(false)} />}
    </>
  )
}
