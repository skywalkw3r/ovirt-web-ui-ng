import { useEffect, useRef, useState } from 'react'
import {
  ActionGroup,
  Alert,
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  PageSection,
  Radio,
  Skeleton,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { UploadIcon } from '@patternfly/react-icons'
import { FormattedMessage, useIntl } from 'react-intl'
import {
  DEFAULT_PRODUCT_NAME,
  LOGO_MIME_TYPES,
  MAX_LOGIN_NOTICE_CHARS,
  MAX_LOGO_BYTES,
  MAX_MOTD_MESSAGE_CHARS,
  MAX_MOTD_TITLE_CHARS,
  MAX_PRODUCT_NAME_CHARS,
  MAX_SUPPORT_URL_CHARS,
  MOTD_SEVERITIES,
  motdWindowState,
  safeHttpUrl,
  type MotdSeverity,
  type PlatformSettings,
} from '../api/schemas/platform-settings'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { FieldHelp } from '../components/forms/FieldHelp'
import { useNow } from '../hooks/useNow'
import { usePlatformSettings, useSavePlatformSettings } from '../hooks/usePlatformSettings'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import ovirtLogo from '../assets/ovirt-logo.svg'

// Severity → the i18n id of its radio label; keys mirror MOTD_SEVERITIES.
const SEVERITY_LABEL_IDS: Record<MotdSeverity, MessageId> = {
  info: 'platform.severity.info',
  warning: 'platform.severity.warning',
  danger: 'platform.severity.danger',
}

const MAX_LOGO_KB = Math.floor(MAX_LOGO_BYTES / 1024)

// The stored schedule bounds are UTC ISO instants; <input type="datetime-local">
// speaks zoneless local-time strings. These two convert at the edge, so the
// admin edits wall-clock time while every client compares the same instant.
function isoToLocalInput(iso: string): string {
  if (iso === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToIso(value: string): string {
  if (value === '') return ''
  // the Date constructor reads datetime-local values as local wall-clock time
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

// Global, admin-only console settings. Everything on this page is stored on
// the engine in the reserved 'ui.platform' tag cluster (api/schemas/
// platform-settings.ts documents the format and its engine-side limits), so
// every user of every browser resolves the same announcement, logo and
// branding. Unlike the per-user Preferences modal (write-through), this form
// stages changes locally and commits on Save — a platform-wide banner should
// not go live keystroke by keystroke.
export function PlatformSettingsPage() {
  const { loaded, isAdmin } = useCapabilities()
  const t = useT()
  const intl = useIntl()
  const { settings, isLive, isError, error, refetch } = usePlatformSettings()
  const save = useSavePlatformSettings()
  // Drives the schedule status line ("goes live …" / "expired …") so it flips
  // on its own while the page sits open, same tick the banner itself uses.
  const now = useNow(30_000)

  // saved = last persisted resolution (the dirty-check baseline);
  // form = the working copy. Both seed from the first LIVE resolution —
  // mirror/default stand-ins never seed a form that Save would then write.
  const [saved, setSaved] = useState<PlatformSettings | null>(null)
  const [form, setForm] = useState<PlatformSettings | null>(null)
  useEffect(() => {
    if (isLive && form === null) {
      setSaved(settings)
      setForm(settings)
    }
  }, [isLive, settings, form])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<'tooLarge' | 'badType' | null>(null)

  // The nav already hides Platform Settings from user-tier accounts; this
  // covers deep links typed straight into the address bar.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('platform.notPermitted.what')} />
      </PageSection>
    )
  }

  const patch = (changes: Partial<PlatformSettings>) =>
    setForm((current) => (current === null ? current : { ...current, ...changes }))
  const patchMotd = (changes: Partial<PlatformSettings['motd']>) =>
    setForm((current) =>
      current === null ? current : { ...current, motd: { ...current.motd, ...changes } },
    )

  const onLogoChosen = (file: File | undefined) => {
    if (file === undefined) return
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setLogoError('badType')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('tooLarge')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL yields data:<mime>;base64,… — exactly the stored shape
      if (typeof reader.result === 'string') {
        setLogoError(null)
        setForm((current) =>
          current === null ? current : { ...current, logoDataUri: reader.result as string },
        )
      }
    }
    reader.readAsDataURL(file)
  }

  const dirty = form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(saved)
  const motdMessageMissing = form !== null && form.motd.enabled && form.motd.message.trim() === ''
  // A window that ends before (or exactly when) it starts could never be live.
  const scheduleInvalid =
    form !== null &&
    form.motd.startsAt !== '' &&
    form.motd.endsAt !== '' &&
    Date.parse(form.motd.endsAt) <= Date.parse(form.motd.startsAt)
  const supportUrlInvalid =
    form !== null && form.supportUrl.trim() !== '' && safeHttpUrl(form.supportUrl) === null
  const canSave =
    dirty && !motdMessageMissing && !scheduleInvalid && !supportUrlInvalid && !save.isPending

  // Status line under the schedule fields: with a message staged and the
  // banner enabled, say outright whether it is visible right now and, if not,
  // when that changes — the answer to "why isn't my banner showing".
  const windowState = form !== null ? motdWindowState(form.motd, now) : 'live'
  const formatInstant = (iso: string) =>
    intl.formatDate(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })

  const onSave = () => {
    if (form === null || !canSave) return
    save.mutate(form, { onSuccess: () => setSaved(form) })
  }

  return (
    <PageSection>
      <ListPageHeader title={t('platform.title')} />
      <Content component="p" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--lg)' }}>
        <FormattedMessage id="platform.intro" />
      </Content>

      {/* Loading: the capability profile or the first live settings read is
          still in flight. */}
      {form === null && !isError && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} width="40%" />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('platform.loading')} />
        </>
      )}

      {/* Error: the tags listing (the settings carrier) failed. */}
      {form === null && isError && (
        <EmptyState titleText={t('platform.loadError')} status="danger">
          <EmptyStateBody>
            {error instanceof Error ? error.message : t('viewState.error')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => refetch()}>
                <FormattedMessage id="common.action.retry" />
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {form !== null && (
        <Form
          isWidthLimited
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <FormSection title={t('platform.section.motd')} titleElement="h2">
            <FormGroup
              fieldId="platform-motd-enabled"
              label={t('platform.motd.enable')}
              labelHelp={
                <FieldHelp
                  field={t('platform.motd.enable')}
                  content={t('platform.motd.enableHelp')}
                />
              }
            >
              <Switch
                id="platform-motd-enabled"
                aria-label={t('platform.motd.enable')}
                isChecked={form.motd.enabled}
                onChange={(_event, checked) => patchMotd({ enabled: checked })}
              />
            </FormGroup>
            <FormGroup
              role="radiogroup"
              isInline
              fieldId="platform-motd-severity"
              label={t('platform.motd.severity')}
            >
              {MOTD_SEVERITIES.map((severity) => (
                <Radio
                  key={severity}
                  id={`platform-motd-severity-${severity}`}
                  name="platform-motd-severity"
                  label={t(SEVERITY_LABEL_IDS[severity])}
                  isChecked={form.motd.severity === severity}
                  onChange={() => patchMotd({ severity })}
                />
              ))}
            </FormGroup>
            <FormGroup fieldId="platform-motd-title" label={t('platform.motd.titleField')}>
              <TextInput
                id="platform-motd-title"
                value={form.motd.title}
                maxLength={MAX_MOTD_TITLE_CHARS}
                onChange={(_event, value) => patchMotd({ title: value })}
              />
            </FormGroup>
            <FormGroup
              fieldId="platform-motd-message"
              label={t('platform.motd.message')}
              isRequired={form.motd.enabled}
            >
              <TextArea
                id="platform-motd-message"
                value={form.motd.message}
                maxLength={MAX_MOTD_MESSAGE_CHARS}
                resizeOrientation="vertical"
                validated={motdMessageMissing ? 'error' : 'default'}
                onChange={(_event, value) => patchMotd({ message: value })}
                aria-label={t('platform.motd.message')}
              />
              {motdMessageMissing && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      <FormattedMessage id="platform.motd.messageRequired" />
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <FormGroup
              fieldId="platform-motd-starts-at"
              label={t('platform.motd.startsAt')}
              labelHelp={
                <FieldHelp
                  field={t('platform.motd.startsAt')}
                  content={t('platform.motd.scheduleHelp')}
                />
              }
            >
              <TextInput
                id="platform-motd-starts-at"
                type="datetime-local"
                value={isoToLocalInput(form.motd.startsAt)}
                onChange={(_event, value) => patchMotd({ startsAt: localInputToIso(value) })}
              />
            </FormGroup>
            <FormGroup
              fieldId="platform-motd-ends-at"
              label={t('platform.motd.endsAt')}
              labelHelp={
                <FieldHelp
                  field={t('platform.motd.endsAt')}
                  content={t('platform.motd.scheduleHelp')}
                />
              }
            >
              <TextInput
                id="platform-motd-ends-at"
                type="datetime-local"
                validated={scheduleInvalid ? 'error' : 'default'}
                value={isoToLocalInput(form.motd.endsAt)}
                onChange={(_event, value) => patchMotd({ endsAt: localInputToIso(value) })}
              />
              {scheduleInvalid && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      <FormattedMessage id="platform.motd.endBeforeStart" />
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
              {!scheduleInvalid && form.motd.enabled && form.motd.message.trim() !== '' && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem
                      variant={
                        windowState === 'live'
                          ? 'success'
                          : windowState === 'expired'
                            ? 'warning'
                            : 'indeterminate'
                      }
                    >
                      {windowState === 'live' && t('platform.motd.status.live')}
                      {windowState === 'scheduled' &&
                        t('platform.motd.status.scheduled', {
                          when: formatInstant(form.motd.startsAt),
                        })}
                      {windowState === 'expired' &&
                        t('platform.motd.status.expired', {
                          when: formatInstant(form.motd.endsAt),
                        })}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            {form.motd.message.trim() !== '' && (
              <FormGroup fieldId="platform-motd-preview" label={t('platform.motd.preview')}>
                {/* Exactly what MotdBanner will pin above page content — minus
                    the close action, which the preview doesn't need. */}
                <Alert
                  variant={form.motd.severity}
                  isInline
                  title={form.motd.title.trim() !== '' ? form.motd.title : form.motd.message}
                >
                  {form.motd.title.trim() !== '' ? form.motd.message : undefined}
                </Alert>
              </FormGroup>
            )}
          </FormSection>

          <FormSection title={t('platform.section.branding')} titleElement="h2">
            <FormGroup
              fieldId="platform-logo"
              label={t('platform.branding.logo')}
              labelHelp={
                <FieldHelp
                  field={t('platform.branding.logo')}
                  content={t('platform.branding.logoHelp', { maxKb: MAX_LOGO_KB })}
                />
              }
            >
              {/* Previewed on a dark swatch because the masthead is dark in
                  both themes — see .app-logo-preview in brand-tokens.css. */}
              <div className="app-logo-preview">
                <img
                  src={form.logoDataUri ?? ovirtLogo}
                  alt={t('platform.branding.logoPreviewAlt')}
                  style={{ height: '32px', maxWidth: '100%' }}
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_MIME_TYPES.join(',')}
                aria-label={t('platform.branding.upload')}
                style={{ display: 'none' }}
                onChange={(event) => {
                  onLogoChosen(event.currentTarget.files?.[0])
                  // reset so re-picking the same file still fires onChange
                  event.currentTarget.value = ''
                }}
              />
              <div style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }}>
                <Button
                  variant="secondary"
                  icon={<UploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FormattedMessage id="platform.branding.upload" />
                </Button>{' '}
                {form.logoDataUri !== null && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setLogoError(null)
                      patch({ logoDataUri: null })
                    }}
                  >
                    <FormattedMessage id="platform.branding.reset" />
                  </Button>
                )}
              </div>
              {logoError !== null && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {logoError === 'tooLarge'
                        ? t('platform.branding.logoTooLarge', { maxKb: MAX_LOGO_KB })
                        : t('platform.branding.logoBadType')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <FormGroup
              fieldId="platform-product-name"
              label={t('platform.branding.productName')}
              labelHelp={
                <FieldHelp
                  field={t('platform.branding.productName')}
                  content={t('platform.branding.productNameHelp', {
                    defaultName: DEFAULT_PRODUCT_NAME,
                  })}
                />
              }
            >
              <TextInput
                id="platform-product-name"
                value={form.productName}
                maxLength={MAX_PRODUCT_NAME_CHARS}
                placeholder={DEFAULT_PRODUCT_NAME}
                onChange={(_event, value) => patch({ productName: value })}
              />
            </FormGroup>
          </FormSection>

          <FormSection title={t('platform.section.loginScreen')} titleElement="h2">
            <FormGroup
              fieldId="platform-login-notice"
              label={t('platform.login.notice')}
              labelHelp={
                <FieldHelp
                  field={t('platform.login.notice')}
                  content={t('platform.login.noticeHelp')}
                />
              }
            >
              <TextArea
                id="platform-login-notice"
                value={form.loginNotice}
                maxLength={MAX_LOGIN_NOTICE_CHARS}
                resizeOrientation="vertical"
                onChange={(_event, value) => patch({ loginNotice: value })}
                aria-label={t('platform.login.notice')}
              />
            </FormGroup>
          </FormSection>

          <FormSection title={t('platform.section.support')} titleElement="h2">
            <FormGroup
              fieldId="platform-support-url"
              label={t('platform.support.url')}
              labelHelp={
                <FieldHelp
                  field={t('platform.support.url')}
                  content={t('platform.support.urlHelp')}
                />
              }
            >
              <TextInput
                id="platform-support-url"
                type="url"
                value={form.supportUrl}
                maxLength={MAX_SUPPORT_URL_CHARS}
                placeholder="https://support.example.com"
                validated={supportUrlInvalid ? 'error' : 'default'}
                onChange={(_event, value) => patch({ supportUrl: value })}
              />
              {supportUrlInvalid && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      <FormattedMessage id="platform.support.invalidUrl" />
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </FormSection>

          <ActionGroup>
            <Button
              type="submit"
              variant="primary"
              isDisabled={!canSave}
              isLoading={save.isPending}
            >
              <FormattedMessage id="common.action.save" />
            </Button>
            <Button
              variant="link"
              isDisabled={!dirty || save.isPending}
              onClick={() => {
                setLogoError(null)
                setForm(saved)
              }}
            >
              <FormattedMessage id="platform.action.discard" />
            </Button>
          </ActionGroup>
        </Form>
      )}
    </PageSection>
  )
}
