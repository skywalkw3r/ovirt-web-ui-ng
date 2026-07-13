import { createContext, useContext } from 'react'

export type NotificationVariant = 'success' | 'danger' | 'info' | 'warning'

export interface Notification {
  title: string
  variant: NotificationVariant
}

export interface NotificationContextValue {
  notify: (n: Notification) => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotify(): NotificationContextValue {
  const value = useContext(NotificationContext)
  if (!value) throw new Error('useNotify must be used inside <NotificationProvider>')
  return value
}
