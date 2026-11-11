import { createContext, useContext } from 'react'

export type Theme = 'dark' | 'light'

export interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  // Direct set, for the engine user-options roaming (settings/roaming.ts).
  setTheme: (theme: Theme) => void
}

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}
