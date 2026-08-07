import { useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FormGroup,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError } from '../api/transport'
import { useT } from '../i18n/useT'
import { ConfirmModal } from '../components/ConfirmModal'
import { LayerGroupIcon } from '@patternfly/react-icons'
import { ListPageHeader } from '../components/ListPageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { TemplateExportModal } from '../components/template-form/TemplateExportModal'
import { TemplateFormModal } from '../components/template-form/TemplateFormModal'
import { TemplateDisksTab } from '../components/template-tabs/TemplateDisksTab'
import { TemplateGeneralTab } from '../components/template-tabs/TemplateGeneralTab'
import { TemplateNicsTab } from '../components/template-tabs/TemplateNicsTab'
import { TemplatePermissionsTab } from '../components/template-tabs/TemplatePermissionsTab'
import { TemplateVmsTab } from '../components/template-tabs/TemplateVmsTab'
import { useTemplate } from '../hooks/useTemplateDetail'
import { useDeleteTemplate } from '../hooks/useTemplateMutations'
import { statusText } from '../lib/format'
import { templateDetailRoute } from '../routes/router'

// A template's status is an open string ('ok' | 'locked' | 'illegal'). Only the
// two states that block use get a signal color; a healthy template stays quiet.
function TemplateStatusLabel({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'locked' ? 'blue' : normalized === 'illegal' ? 'red' : 'green'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

export function TemplateDetailPage() {
  const { templateId } = templateDetailRoute.useParams()
  const template = useTemplate(templateId)
  const navigate = useNavigate()
  const t = useT()
  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  const [exporting, setExporting] = useState(false)
  // non-null while the remove confirm is up; holds the typed-name gate
  // (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const deleteMutation = useDeleteTemplate()

  const notFound = template.error instanceof ApiError && template.error.status === 404

  // The Blank template is the engine's built-in system template and cannot be
  // removed. On a live engine it carries the all-zero id; the name check also
  // covers the mock fixture (tpl-00, named 'Blank').
  const isBlankTemplate =
    template.data?.id === '00000000-0000-0000-0000-000000000000' || template.data?.name === 'Blank'

  // Export needs disks and an unlocked template: the Blank template has none,
  // and a locked/illegal one is mid-copy — keep the button discoverable but
  // disabled with the reason, mirroring the Remove guard below.
  const exportReason = isBlankTemplate
    ? t('templates.export.blankReason')
    : template.data?.status === 'locked' || template.data?.status === 'illegal'
      ? t('templates.export.lockedReason', {
          status: statusText(template.data?.status ?? 'unknown'),
        })
      : undefined

  return (
    <PageSection>
      {template.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('templateDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {template.isError && notFound && (
        <EmptyState titleText={t('templateDetail.notFound.title')} status="warning">
          <EmptyStateBody>{t('templateDetail.notFound.body', { id: templateId })}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void navigate({ to: '/templates' })}>
                {t('templateDetail.notFound.back')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {template.isError && !notFound && (
        <EmptyState titleText={t('templateDetail.error.title')} status="danger">
          <EmptyStateBody>
            {template.error instanceof Error ? template.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void template.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {template.isSuccess && (
        <>
          <ListPageHeader
            icon={<LayerGroupIcon />}
            title={template.data.name}
            meta={<TemplateStatusLabel status={template.data.status} />}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/templates" className={className}>
                      {t('templates.title')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{template.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.action.edit')}
                </Button>
                {exportReason !== undefined ? (
                  <Tooltip content={exportReason}>
                    <Button variant="secondary" isAriaDisabled>
                      {t('templates.action.exportOva')}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button variant="secondary" onClick={() => setExporting(true)}>
                    {t('templates.action.exportOva')}
                  </Button>
                )}
                {isBlankTemplate ? (
                  // isAriaDisabled keeps the button hoverable/focusable so the
                  // tooltip explaining why it is disabled can show.
                  <Tooltip content={t('templates.remove.blankReason')}>
                    <Button variant="secondary" isDanger isAriaDisabled>
                      {t('common.action.remove')}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    variant="secondary"
                    isDanger
                    isDisabled={deleteMutation.isPending}
                    onClick={() => setRemoving({ nameInput: '' })}
                  >
                    {t('common.action.remove')}
                  </Button>
                )}
              </>
            }
          />

          <TemplateFormModal
            template={template.data}
            isOpen={editing}
            onClose={() => setEditing(false)}
          />

          {exporting && (
            <TemplateExportModal template={template.data} onClose={() => setExporting(false)} />
          )}

          {removing && (
            <ConfirmModal
              isOpen
              title={t('templates.remove.confirm.title', { name: template.data.name })}
              body={
                <Stack hasGutter>
                  <StackItem>{t('templates.remove.confirm.body')}</StackItem>
                  <StackItem>
                    <FormGroup
                      label={t('templates.remove.confirm.typeLabel', {
                        name: template.data.name,
                      })}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label={t('templates.remove.confirm.inputAria')}
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel={t('common.action.remove')}
              isConfirmDisabled={removing.nameInput !== template.data.name}
              onConfirm={() => {
                setRemoving(null)
                deleteMutation.mutate(
                  { id: templateId, name: template.data.name },
                  { onSuccess: () => void navigate({ to: '/templates' }) },
                )
              }}
              onCancel={() => setRemoving(null)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label={t('templateDetail.tabs.ariaLabel')}
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('templateDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <TemplateGeneralTab template={template.data} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="vms" title={<TabTitleText>{t('templateDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <TemplateVmsTab templateId={templateId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="nics"
              title={<TabTitleText>{t('templateDetail.tab.nics')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <TemplateNicsTab templateId={templateId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="disks"
              title={<TabTitleText>{t('templateDetail.tab.disks')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <TemplateDisksTab templateId={templateId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('templateDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <TemplatePermissionsTab templateId={templateId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
