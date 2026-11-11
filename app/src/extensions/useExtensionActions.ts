import { useCallback, useMemo } from 'react'
import { useIntl } from 'react-intl'
import { useNotify } from '../notifications/context'
import type { ActionPlacement, EntityActionKind, EntityContext, VisibilityContext } from './api'
import { getPluginState, useExtensionSnapshot } from './registry'
import { resolveText } from './text'
import { pluginApplies, safePredicate, toEntityContext, useExtensionSession } from './visibility'

export interface ResolvedExtensionAction {
  key: string
  plugin: string
  label: string
  isDisabled: boolean
  run: () => void
}

// The plugin actions for one entity in one placement, resolved for display:
// visibility and disabled state evaluated (a throwing predicate hides or
// disables just that action), labels in the active locale, and `run`
// wrapped so a throw or rejection becomes an error toast naming the plugin
// (ADR-0001 §5) instead of an unhandled rejection.
export function useExtensionActions<K extends EntityActionKind>(
  kind: K,
  data: ({ id: string; name?: string | null } & object) | undefined,
  placement: ActionPlacement,
): ResolvedExtensionAction[] {
  const snapshot = useExtensionSnapshot()
  const session = useExtensionSession()
  const { locale } = useIntl()
  const { notify } = useNotify()

  const runSafely = useCallback(
    (plugin: string, run: () => void | Promise<void>) => {
      const fail = (error: unknown) => {
        console.error(`[plugins] "${plugin}" action failed`, error)
        const name = getPluginState(plugin)?.displayName ?? plugin
        const detail = error instanceof Error ? error.message : String(error)
        // toasts are hardcoded English by convention (CONTRIBUTING.md UI rules)
        notify({ title: `${name}: ${detail || 'the action failed'}`, variant: 'danger' })
      }
      try {
        void Promise.resolve(run()).catch(fail)
      } catch (error) {
        fail(error)
      }
    },
    [notify],
  )

  return useMemo(() => {
    if (data === undefined) return []
    const entity = toEntityContext(kind, data)
    const context: VisibilityContext<EntityContext<K>> = { session, entity }
    return snapshot.actions
      .filter(
        ({ plugin, contribution }) =>
          contribution.entity === kind &&
          (contribution.placement ?? ['kebab']).includes(placement) &&
          pluginApplies(plugin),
      )
      .filter(({ plugin, contribution }) =>
        safePredicate(plugin, contribution.isVisible as never, context, true),
      )
      .map(({ plugin, key, contribution }) => ({
        key,
        plugin,
        label: resolveText(contribution.label, snapshot.catalogs[plugin], locale),
        // a throwing isDisabled reads as disabled: fail closed
        isDisabled:
          contribution.isDisabled !== undefined &&
          safePredicate(plugin, contribution.isDisabled as never, context, true),
        run: () => runSafely(plugin, () => contribution.run(context as never)),
      }))
  }, [data, kind, locale, placement, runSafely, session, snapshot])
}
