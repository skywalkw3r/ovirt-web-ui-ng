import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme, type ThemeContextValue } from './context'

const STORAGE_KEY = 'console-theme'

// Read once at init: dark is the default (docs/COMPONENTS.md ground rule 2),
// and anything unrecognized in storage falls back to it. The class is applied
// here too — during the useState initializer, i.e. before the first paint —
// so a dark default never flashes light frames. Idempotent, so StrictMode's
// double initializer invocation is harmless.
function initialTheme(): Theme {
  const theme: Theme = localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  document.documentElement.classList.toggle('pf-v6-theme-dark', theme === 'dark')
  return theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // PF theming is class-driven: dark is opt-in via pf-v6-theme-dark on
  // <html>, light is the bare default. After initialTheme's pre-paint
  // application, this effect owns the class (main.tsx must not touch it).
  useEffect(() => {
    document.documentElement.classList.toggle('pf-v6-theme-dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggle }), [theme, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
