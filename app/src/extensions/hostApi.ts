import { useCallback } from 'react'
import { useIntl } from 'react-intl'
import { request } from '../api/transport'
import { APP_VERSION } from '../lib/version'
import {
  EXTENSION_API_VERSION,
  type ActionContribution,
  type ActionPlacement,
  type DashboardCardContribution,
  type EngineMethod,
  type EngineRequestOptions,
  type EntityActionKind,
  type EntityTabContribution,
  type EntityTabKind,
  type ExtensionApi,
  type ExtensionSession,
  type ExtensionText,
  type MessageRef,
  type NavPageContribution,
} from './api'
import { currentEngineName, getBridge, sessionFrom } from './bridge'
import {
  getExtensionSnapshot,
  mergeCatalogs,
  useExtensionSnapshot,
  type ContributionBatch,
} from './registry'
import { formatPluginMessage } from './text'
import { isSafeAppPath, isSafeEnginePath } from './urls'

// Builds the ExtensionApi object handed to one plugin's activate(). Every
// method checks its arguments at run time: plugins are plain JavaScript, so
// the TypeScript types in api.ts are a promise, not a guarantee.

export const ENTITY_TAB_KINDS: readonly EntityTabKind[] = [
  'vm',
  'host',
  'cluster',
  'storageDomain',
  'network',
  'dataCenter',
  'template',
  'disk',
]
export const ENTITY_ACTION_KINDS: readonly EntityActionKind[] = ['vm', 'host']
const PLACEMENTS: readonly ActionPlacement[] = ['kebab', 'header']
const METHODS: readonly EngineMethod[] = ['GET', 'POST', 'PUT', 'DELETE']
const DASHBOARD_SIZES = ['small', 'medium', 'large'] as const

const CONTRIBUTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

// Thrown for a call the API refuses before it reaches the engine.
export class ExtensionApiError extends Error {
  readonly status = 0
  constructor(message: string) {
    super(message)
    this.name = 'ExtensionApiError'
  }
}

function isComponent(value: unknown): boolean {
  // function components, classes, and the objects memo()/forwardRef() return
  return typeof value === 'function' || (typeof value === 'object' && value !== null)
}

function isText(value: unknown): value is ExtensionText {
  if (typeof value === 'string') return true
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { messageId?: unknown }).messageId === 'string'
  )
}

function isOptionalFunction(value: unknown): boolean {
  return value === undefined || typeof value === 'function'
}

// Where registrations go. Before activate() returns they are buffered
// (`pending`); the loader commits the buffer on success or drops it on a
// throw. After that, `live` is set and later registrations commit at once.
export interface RegistrationSink {
  pending: Required<ContributionBatch>
  live: ((batch: ContributionBatch) => void) | null
}

export function newSink(): RegistrationSink {
  return {
    pending: { navPages: [], entityTabs: [], actions: [], dashboardCards: [] },
    live: null,
  }
}

export function createExtensionApi(pluginName: string, sink: RegistrationSink): ExtensionApi {
  const ids = new Set<string>()

  const claim = (kind: string, id: unknown): string => {
    if (typeof id !== 'string' || !CONTRIBUTION_ID.test(id)) {
      throw new ExtensionApiError(`${kind}: id must match ${CONTRIBUTION_ID}`)
    }
    const key = `${pluginName}:${id}`
    // one namespace per plugin across every contribution kind, so a nav page
    // and a tab cannot share an id (keys double as React keys and tab keys)
    if (ids.has(id)) throw new ExtensionApiError(`${kind}: id "${id}" is already registered`)
    ids.add(id)
    return key
  }

  const add = <K extends keyof ContributionBatch>(
    kind: K,
    item: NonNullable<ContributionBatch[K]>[number],
  ) => {
    if (sink.live) {
      sink.live({ [kind]: [item] } as ContributionBatch)
    } else {
      ;(sink.pending[kind] as unknown[]).push(item)
    }
  }

  const format = (id: string, values?: Readonly<Record<string, string | number>>) =>
    formatPluginMessage(
      getExtensionSnapshot().catalogs[pluginName],
      getBridge().locale,
      String(id),
      values,
    )

  // A hook (named use* for the rules-of-hooks lint): plugin components call it
  // while rendering inside the console's tree, so the console's IntlProvider
  // and registry store are in scope.
  function useFormat() {
    const { locale } = useIntl()
    const catalogs = useExtensionSnapshot().catalogs[pluginName]
    return useCallback(
      (id: string, values?: Readonly<Record<string, string | number>>) =>
        formatPluginMessage(catalogs, locale, String(id), values),
      [catalogs, locale],
    )
  }

  const api: ExtensionApi = {
    version: Object.freeze({ api: EXTENSION_API_VERSION, app: APP_VERSION }),
    pluginName,

    engine: Object.freeze({
      // Through the app's transport only (ADR-0001 §4): the transport adds
      // the bearer token and the Filter header after any caller input and
      // pins the request to the session's engine (getRequestBase). Only
      // method, body and signal are forwarded: a plugin cannot set headers.
      request(path: string, options: EngineRequestOptions = {}): Promise<unknown> {
        if (!isSafeEnginePath(path)) {
          return Promise.reject(
            new ExtensionApiError(`engine.request: refused path ${String(path)}`),
          )
        }
        const method = options.method ?? 'GET'
        if (!METHODS.includes(method)) {
          return Promise.reject(new ExtensionApiError(`engine.request: refused method ${method}`))
        }
        return request(path, { method, body: options.body, signal: options.signal })
      },
    }),

    i18n: Object.freeze({
      get locale() {
        return getBridge().locale
      },
      registerMessages(catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>) {
        if (typeof catalogs !== 'object' || catalogs === null) {
          throw new ExtensionApiError('i18n.registerMessages: expected { locale: { id: text } }')
        }
        const clean: Record<string, Record<string, string>> = {}
        for (const [locale, messages] of Object.entries(catalogs)) {
          if (typeof messages !== 'object' || messages === null) continue
          clean[locale] = Object.fromEntries(
            Object.entries(messages).filter(([, text]) => typeof text === 'string'),
          )
        }
        mergeCatalogs(pluginName, clean)
      },
      message(id: string, values?: Readonly<Record<string, string | number>>): MessageRef {
        return Object.freeze(values === undefined ? { messageId: id } : { messageId: id, values })
      },
      format,
      useFormat,
    }),

    notify: Object.freeze({
      success: (title: string) => getBridge().notify(String(title), 'success'),
      info: (title: string) => getBridge().notify(String(title), 'info'),
      warning: (title: string) => getBridge().notify(String(title), 'warning'),
      danger: (title: string) => getBridge().notify(String(title), 'danger'),
    }),

    navigate(path: string) {
      if (!isSafeAppPath(path))
        throw new ExtensionApiError(`navigate: refused path ${String(path)}`)
      getBridge().navigate(path)
    },

    navPagePath(pageId: string) {
      return `/extensions/${pluginName}/${encodeURIComponent(pageId)}`
    },

    get session(): ExtensionSession {
      const { userName, isAdmin } = getBridge()
      return sessionFrom(userName, isAdmin, currentEngineName())
    },

    registerNavPage(contribution: NavPageContribution) {
      const key = claim('registerNavPage', contribution?.id)
      if (!isText(contribution.title) || !isComponent(contribution.component)) {
        throw new ExtensionApiError('registerNavPage: title and component are required')
      }
      if (!isOptionalFunction(contribution.isVisible)) {
        throw new ExtensionApiError('registerNavPage: isVisible must be a function')
      }
      add('navPages', { plugin: pluginName, key, contribution: { ...contribution } })
    },

    registerEntityTab<K extends EntityTabKind>(contribution: EntityTabContribution<K>) {
      const key = claim('registerEntityTab', contribution?.id)
      if (!ENTITY_TAB_KINDS.includes(contribution.entity)) {
        throw new ExtensionApiError(
          `registerEntityTab: entity must be one of ${ENTITY_TAB_KINDS.join(', ')}`,
        )
      }
      if (!isText(contribution.title) || !isComponent(contribution.component)) {
        throw new ExtensionApiError('registerEntityTab: title and component are required')
      }
      if (!isOptionalFunction(contribution.isVisible)) {
        throw new ExtensionApiError('registerEntityTab: isVisible must be a function')
      }
      add('entityTabs', {
        plugin: pluginName,
        key,
        contribution: { ...contribution } as unknown as EntityTabContribution<EntityTabKind>,
      })
    },

    registerAction<K extends EntityActionKind>(contribution: ActionContribution<K>) {
      const key = claim('registerAction', contribution?.id)
      if (!ENTITY_ACTION_KINDS.includes(contribution.entity)) {
        throw new ExtensionApiError(
          `registerAction: entity must be one of ${ENTITY_ACTION_KINDS.join(', ')}`,
        )
      }
      if (!isText(contribution.label) || typeof contribution.run !== 'function') {
        throw new ExtensionApiError('registerAction: label and run are required')
      }
      if (
        !isOptionalFunction(contribution.isVisible) ||
        !isOptionalFunction(contribution.isDisabled)
      ) {
        throw new ExtensionApiError('registerAction: isVisible and isDisabled must be functions')
      }
      const placement = contribution.placement ?? ['kebab']
      if (
        !Array.isArray(placement) ||
        placement.length === 0 ||
        !placement.every((where) => PLACEMENTS.includes(where))
      ) {
        throw new ExtensionApiError(`registerAction: placement must list ${PLACEMENTS.join(', ')}`)
      }
      add('actions', {
        plugin: pluginName,
        key,
        contribution: {
          ...contribution,
          placement: [...placement],
        } as unknown as ActionContribution<EntityActionKind>,
      })
    },

    registerDashboardCard(contribution: DashboardCardContribution) {
      const key = claim('registerDashboardCard', contribution?.id)
      if (!isText(contribution.title) || !isComponent(contribution.component)) {
        throw new ExtensionApiError('registerDashboardCard: title and component are required')
      }
      if (contribution.size !== undefined && !DASHBOARD_SIZES.includes(contribution.size)) {
        throw new ExtensionApiError('registerDashboardCard: size must be small, medium or large')
      }
      if (!isOptionalFunction(contribution.isVisible)) {
        throw new ExtensionApiError('registerDashboardCard: isVisible must be a function')
      }
      add('dashboardCards', { plugin: pluginName, key, contribution: { ...contribution } })
    },
  }
  return Object.freeze(api)
}
