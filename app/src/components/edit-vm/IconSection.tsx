import { useRef, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  Gallery,
  HelperText,
  HelperTextItem,
  Skeleton,
} from '@patternfly/react-core'
import { useQuery } from '@tanstack/react-query'
import {
  getIcon,
  ICON_ALLOWED_MEDIA_TYPES,
  ICON_MAX_BYTES,
  iconDataUrl,
  listIcons,
} from '../../api/resources/icons'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import type { EditVmDraft } from './editVmDraft'

// Read a File into { data (base64, no prefix), mediaType } for the large_icon
// upload. Rejects on a read error; the caller has already gated type + size.
function readIconFile(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve({ data: comma >= 0 ? result.slice(comma + 1) : '', mediaType: file.type })
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

// Icon section of the Edit Virtual Machine modal. Shows the VM's current large
// icon, a pick-from-catalog grid (GET /icons), and a custom PNG/JPEG/GIF upload
// gated at 24 kB (webadmin's VmIconValidator). Every choice writes back through
// `set` into the draft's iconId / iconUpload* fields; the modal turns those into
// the large_icon PUT body (editVmDraft.buildLargeIcon).
export function IconSection({
  draft,
  set,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
}) {
  const t = useT()
  const [uploadError, setUploadError] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const icons = useQuery({ queryKey: ['icons'], queryFn: listIcons })

  const catalog = icons.data ?? []
  const hasUpload = draft.iconUploadData !== ''
  const catalogCurrent = catalog.find((icon) => icon.id === draft.iconId)
  // Fall back to a direct GET /icons/{id} only when the current icon isn't in
  // the catalog list with inline data (e.g. a prior custom upload); the catalog
  // usually carries it, so this rarely fires.
  const needsDirectPreview =
    !hasUpload &&
    draft.iconId !== '' &&
    (icons.isSuccess ? iconDataUrl(catalogCurrent) === undefined : false)
  const currentIcon = useQuery({
    queryKey: ['icon', draft.iconId],
    queryFn: () => getIcon(draft.iconId),
    enabled: needsDirectPreview,
  })

  const previewUrl = hasUpload
    ? `data:${draft.iconUploadMediaType};base64,${draft.iconUploadData}`
    : (iconDataUrl(catalogCurrent) ?? iconDataUrl(currentIcon.data))

  const pickCatalog = (id: string) => {
    setUploadError(undefined)
    set('iconUploadData', '')
    set('iconUploadMediaType', '')
    set('iconId', id)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!ICON_ALLOWED_MEDIA_TYPES.includes(file.type)) {
      setUploadError(t('vm.edit.icon.badType'))
      return
    }
    if (file.size > ICON_MAX_BYTES) {
      setUploadError(t('vm.edit.icon.tooLarge'))
      return
    }
    try {
      const { data, mediaType } = await readIconFile(file)
      setUploadError(undefined)
      set('iconUploadMediaType', mediaType)
      set('iconUploadData', data)
    } catch {
      setUploadError(t('vm.edit.icon.readError'))
    }
  }

  const clearUpload = () => {
    setUploadError(undefined)
    set('iconUploadData', '')
    set('iconUploadMediaType', '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const iconsWithData = catalog.filter((icon) => iconDataUrl(icon) !== undefined && icon.id)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label={t('vm.edit.icon.current')} fieldId="edit-vm-icon-preview">
        {previewUrl ? (
          <img
            id="edit-vm-icon-preview"
            src={previewUrl}
            alt={t('vm.edit.icon.currentAlt')}
            style={{ maxWidth: 150, maxHeight: 120, borderRadius: 4 }}
          />
        ) : (
          <HelperText>
            <HelperTextItem>
              {hasUpload ? t('vm.edit.icon.uploadReady') : t('vm.edit.icon.none')}
            </HelperTextItem>
          </HelperText>
        )}
      </FormGroup>

      <FormGroup
        label={t('vm.edit.icon.upload')}
        fieldId="edit-vm-icon-upload"
        labelHelp={<FieldHelp field={t('vm.edit.icon.upload')} content={t('fieldHelp.vm.icon')} />}
      >
        <input
          ref={fileInputRef}
          id="edit-vm-icon-upload"
          type="file"
          aria-label={t('vm.edit.icon.upload')}
          accept={ICON_ALLOWED_MEDIA_TYPES.join(',')}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        {hasUpload && (
          <Button variant="link" isInline onClick={clearUpload} style={{ marginInlineStart: 8 }}>
            {t('vm.edit.icon.remove')}
          </Button>
        )}
        {uploadError && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{uploadError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('vm.edit.icon.catalog')} fieldId="edit-vm-icon-catalog" role="group">
        {icons.isPending && (
          <Gallery hasGutter aria-label={t('vm.edit.icon.loading')}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Skeleton
                key={n}
                height="48px"
                width="48px"
                screenreaderText={t('vm.edit.icon.loading')}
              />
            ))}
          </Gallery>
        )}

        {icons.isError && (
          <EmptyState titleText={t('vm.edit.icon.error.title')} status="danger" headingLevel="h4">
            <EmptyStateBody>
              {icons.error instanceof Error ? icons.error.message : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => void icons.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}

        {icons.isSuccess && iconsWithData.length === 0 && (
          <HelperText>
            <HelperTextItem>{t('vm.edit.icon.empty')}</HelperTextItem>
          </HelperText>
        )}

        {icons.isSuccess && iconsWithData.length > 0 && (
          <Gallery hasGutter aria-label={t('vm.edit.icon.catalogAria')}>
            {iconsWithData.map((icon) => {
              const selected = !hasUpload && draft.iconId === icon.id
              return (
                <Button
                  key={icon.id}
                  variant="plain"
                  aria-pressed={selected}
                  aria-label={t('vm.edit.icon.use', { name: icon.name ?? icon.id ?? '' })}
                  onClick={() => pickCatalog(icon.id ?? '')}
                  style={{
                    padding: 4,
                    border: selected
                      ? '2px solid var(--pf-t--global--border--color--brand--default)'
                      : '2px solid transparent',
                    borderRadius: 4,
                  }}
                >
                  <img
                    src={iconDataUrl(icon)}
                    alt={icon.name ?? icon.id}
                    style={{ width: 48, height: 48, objectFit: 'contain' }}
                  />
                </Button>
              )
            })}
          </Gallery>
        )}
      </FormGroup>
    </Form>
  )
}
