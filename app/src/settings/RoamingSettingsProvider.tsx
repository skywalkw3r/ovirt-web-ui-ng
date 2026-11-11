import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addUserOption,
  fetchAuthenticatedUserId,
  listUserOptions,
  removeUserOption,
} from '../api/resources/userOptions'
import { useAuth } from '../auth/context'
import { useTheme } from '../theme/context'
import { useSettings } from './context'
import {
  startRoamingSync,
  type RoamedValues,
  type RoamingStatus,
  type RoamingSync,
} from './roaming'

interface RoamingContextValue {
  status: RoamingStatus
  // writes a pending (debounced) change now; the Settings modal calls it on
  // close so a change followed by a quick sign-out still reaches the engine
  flush: () => void
}

const RoamingContext = createContext<RoamingContextValue>({ status: 'pending', flush: () => {} })

// Where the preferences live right now, for the Settings modal's note. Outside
// the provider (unit-test harnesses) it reads 'pending', which shows no note.
// oxlint-disable-next-line react/only-export-components -- the hook belongs with its provider
export function useRoaming(): RoamingContextValue {
  return useContext(RoamingContext)
}

// Roams SettingsProvider's preferences and ThemeProvider's theme through the
// engine's per-user options (settings/roaming.ts holds the protocol and the
// merge rule). Mounted inside AuthProvider: one sync session per signed-in
// user, started when the username appears and stopped at sign-out. The
// providers above keep localStorage as the first paint and the fallback.
export function RoamingSettingsProvider({ children }: { children: ReactNode }) {
  const { username } = useAuth()
  const settings = useSettings()
  const { theme, setTheme } = useTheme()
  const [status, setStatus] = useState<RoamingStatus>('pending')
  const syncRef = useRef<RoamingSync | null>(null)

  const { refreshIntervalMs, preferredConsole, locale, sessionTimeoutMinutes, replaceSettings } =
    settings
  const values = useMemo<RoamedValues>(
    () => ({ refreshIntervalMs, preferredConsole, locale, sessionTimeoutMinutes, theme }),
    [refreshIntervalMs, preferredConsole, locale, sessionTimeoutMinutes, theme],
  )
  // Read by the sync at write time. apply() also sets it synchronously, so a
  // write queued right after a merge sees the merged values before React has
  // re-rendered with them.
  const valuesRef = useRef(values)
  const applyRef = useRef({ replaceSettings, setTheme })
  useEffect(() => {
    applyRef.current = { replaceSettings, setTheme }
  }, [replaceSettings, setTheme])

  useEffect(() => {
    valuesRef.current = values
    syncRef.current?.notifyChange()
  }, [values])

  useEffect(() => {
    if (username === null) return
    const sync = startRoamingSync({
      fetchUserId: fetchAuthenticatedUserId,
      list: listUserOptions,
      add: addUserOption,
      remove: removeUserOption,
      getValues: () => valuesRef.current,
      apply: (next) => {
        valuesRef.current = next
        const { theme: nextTheme, ...nextSettings } = next
        applyRef.current.replaceSettings(nextSettings)
        applyRef.current.setTheme(nextTheme)
      },
      onStatus: setStatus,
    })
    syncRef.current = sync
    // A tab being hidden may be a tab being closed: write a pending change
    // now rather than lose it to the debounce.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void sync.flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      sync.stop()
      if (syncRef.current === sync) syncRef.current = null
      setStatus('pending')
    }
  }, [username])

  const value = useMemo<RoamingContextValue>(
    () => ({ status, flush: () => void syncRef.current?.flush() }),
    [status],
  )

  return <RoamingContext.Provider value={value}>{children}</RoamingContext.Provider>
}
