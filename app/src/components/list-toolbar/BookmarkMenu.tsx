import { useMemo, useState, type Ref } from 'react'
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  MenuItemAction,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { BookmarkIcon, SaveIcon, TrashIcon } from '@patternfly/react-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import {
  createBookmark as createServerBookmark,
  listBookmarks as listServerBookmarks,
  removeBookmark as removeServerBookmark,
  updateBookmark as updateServerBookmark,
  type Bookmark as ServerBookmark,
} from '../../api/resources/bookmarks'
import {
  listBookmarks as listLocalBookmarks,
  removeBookmark as removeLocalBookmark,
  saveBookmark as saveLocalBookmark,
} from '../../bookmarks/bookmarks'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { ConfirmModal } from '../ConfirmModal'

// Webadmin's Bookmarks pane, scoped per list page: a star button saves the
// committed query under a name, a dropdown re-applies or deletes saved
// searches. Bookmarks roam server-side through the engine's /bookmarks
// collection (one shared TanStack Query cache entry feeds every area's menu),
// degrading to the per-area localStorage store when the engine 403/404s the
// collection — the menu never fails, it just stops roaming.

// The engine Bookmark model is flat ({ id, name, value }) with no area
// concept, so the per-area label is folded into the name-space as
// `<area>/<name>`; this pair encodes/decodes that mapping.
interface AreaBookmark {
  // server bookmark id, present only on engine-backed entries (the fallback
  // localStorage store keys by name alone)
  id?: string
  name: string
  query: string
}

const AREA_SEP = '/'

function encodeName(area: string, name: string): string {
  return `${area}${AREA_SEP}${name}`
}

// Narrow the flat server list to one area, stripping the prefix back off the
// display name. Entries missing a name/value or belonging to another area drop.
function bookmarksForArea(server: ServerBookmark[], area: string): AreaBookmark[] {
  const prefix = `${area}${AREA_SEP}`
  return server
    .filter((bookmark) => (bookmark.name ?? '').startsWith(prefix) && bookmark.value !== undefined)
    .map((bookmark) => ({
      id: bookmark.id,
      name: (bookmark.name ?? '').slice(prefix.length),
      query: bookmark.value ?? '',
    }))
}

// Server-backed bookmarks with a localStorage fallback, exposed to the menu
// as one uniform list + save/remove pair regardless of which backend answers.
function useAreaBookmarks(area: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  // retry:false so a 403/404 (non-admin, or an engine that hides the
  // collection) surfaces as isError at once and we fall back rather than spin.
  const serverQuery = useQuery({
    queryKey: ['bookmarks'],
    queryFn: listServerBookmarks,
    retry: false,
  })
  const degraded = serverQuery.isError

  // localStorage mirror, consulted only while degraded. Component state so a
  // local save/remove re-renders without a (doomed) server round-trip.
  const [localBookmarks, setLocalBookmarks] = useState<AreaBookmark[]>(() =>
    listLocalBookmarks(area),
  )

  const serverBookmarks = useMemo(
    () => bookmarksForArea(serverQuery.data ?? [], area),
    [serverQuery.data, area],
  )

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['bookmarks'] })

  const saveMutation = useMutation({
    // upsert by encoded name: an existing area bookmark is re-queried in place
    // (PUT), a new one is created (POST)
    mutationFn: ({ name, query }: { name: string; query: string }) => {
      const existing = serverBookmarks.find((bookmark) => bookmark.name === name)
      return existing?.id !== undefined
        ? updateServerBookmark(existing.id, { value: query })
        : createServerBookmark(encodeName(area, name), query)
    },
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (bookmark: AreaBookmark) => removeServerBookmark(bookmark.id ?? ''),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidate,
  })

  const save = (name: string, query: string) => {
    if (degraded) setLocalBookmarks(saveLocalBookmark(area, { name, query }))
    else saveMutation.mutate({ name, query })
  }

  const remove = (bookmark: AreaBookmark) => {
    if (degraded) setLocalBookmarks(removeLocalBookmark(area, bookmark.name))
    else removeMutation.mutate(bookmark)
  }

  return {
    bookmarks: degraded ? localBookmarks : serverBookmarks,
    // only the first server load shows the loading item; the fallback is
    // synchronous so it never reads as pending
    isLoading: serverQuery.isPending && !degraded,
    isBusy: saveMutation.isPending || removeMutation.isPending,
    save,
    remove,
  }
}

export function BookmarkMenu({
  area,
  currentQuery,
  onApply,
}: {
  area: string
  currentQuery: string
  onApply: (query: string) => void
}) {
  const t = useT()
  const { bookmarks, isLoading, isBusy, save, remove } = useAreaBookmarks(area)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [name, setName] = useState('')
  // bookmark pending deletion; non-null while the confirm modal is up
  const [removeTarget, setRemoveTarget] = useState<AreaBookmark | null>(null)

  const closeSave = () => {
    setIsSaveOpen(false)
    setName('')
  }

  const handleSave = () => {
    save(name.trim(), currentQuery)
    closeSave()
  }

  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem>
        <Button
          variant="control"
          aria-label={t('common.bookmark.save.ariaLabel')}
          icon={<SaveIcon />}
          isDisabled={currentQuery.trim() === '' || isBusy}
          onClick={() => setIsSaveOpen(true)}
        />
      </FlexItem>
      <FlexItem>
        <Dropdown
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          toggle={(toggleRef: Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              variant="plain"
              aria-label={t('common.bookmark.menu.ariaLabel')}
              icon={<BookmarkIcon />}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              isExpanded={isMenuOpen}
            />
          )}
        >
          <DropdownList>
            {isLoading && (
              <DropdownItem key="loading" isDisabled>
                <FormattedMessage id="viewState.loading" />
              </DropdownItem>
            )}
            {!isLoading && bookmarks.length === 0 && (
              <DropdownItem key="empty" isDisabled>
                <FormattedMessage id="common.bookmark.empty" />
              </DropdownItem>
            )}
            {!isLoading &&
              bookmarks.map((bookmark) => (
                <DropdownItem
                  key={bookmark.id ?? bookmark.name}
                  description={t('common.bookmark.query', { query: bookmark.query })}
                  onClick={() => {
                    setIsMenuOpen(false)
                    onApply(bookmark.query)
                  }}
                  actions={
                    <MenuItemAction
                      icon={<TrashIcon />}
                      actionId={`remove-${bookmark.name}`}
                      aria-label={t('common.bookmark.remove.ariaLabel', { name: bookmark.name })}
                      // close the menu and confirm before touching the store
                      onClick={() => {
                        setIsMenuOpen(false)
                        setRemoveTarget(bookmark)
                      }}
                    />
                  }
                >
                  {bookmark.name}
                </DropdownItem>
              ))}
          </DropdownList>
        </Dropdown>
      </FlexItem>

      <Modal
        variant="small"
        isOpen={isSaveOpen}
        onClose={closeSave}
        aria-labelledby="bookmark-save-title"
        aria-describedby="bookmark-save-body"
      >
        <ModalHeader title={t('common.bookmark.save.title')} labelId="bookmark-save-title" />
        <ModalBody id="bookmark-save-body">
          <Form
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim() !== '') handleSave()
            }}
          >
            <FormGroup label={t('common.bookmark.name.label')} fieldId="bookmark-name" isRequired>
              <TextInput
                id="bookmark-name"
                aria-label={t('common.bookmark.name.ariaLabel')}
                value={name}
                onChange={(_event, value) => setName(value)}
                isRequired
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" isDisabled={name.trim() === ''} onClick={handleSave}>
            <FormattedMessage id="common.action.save" />
          </Button>
          <Button variant="link" onClick={closeSave}>
            <FormattedMessage id="common.action.cancel" />
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        title={t('common.bookmark.remove.title', { name: removeTarget?.name ?? '' })}
        body={
          <FormattedMessage
            id="common.bookmark.remove.body"
            values={{
              query: removeTarget?.query ?? '',
              strong: (chunks) => <strong>{chunks}</strong>,
            }}
          />
        }
        confirmLabel={t('common.action.remove')}
        isOpen={removeTarget !== null}
        onConfirm={() => {
          if (removeTarget !== null) remove(removeTarget)
          setRemoveTarget(null)
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </Flex>
  )
}
