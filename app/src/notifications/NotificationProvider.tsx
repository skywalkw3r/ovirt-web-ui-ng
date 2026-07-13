import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AlertActionCloseButton, AlertGroup } from '@patternfly/react-core'
import { NotificationContext, type Notification, type NotificationContextValue } from './context'
import './toast-position.css'

const AUTO_DISMISS_MS = 5_000

interface Toast extends Notification {
  key: number
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextKey = useRef(0)

  const notify = useCallback((n: Notification) => {
    nextKey.current += 1
    const key = nextKey.current
    setToasts((current) => [...current, { ...n, key }])
  }, [])

  const dismiss = useCallback((key: number) => {
    setToasts((current) => current.filter((toast) => toast.key !== key))
  }, [])

  const value = useMemo<NotificationContextValue>(() => ({ notify }), [notify])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <AlertGroup isToast isLiveRegion>
        {toasts.map(({ key, title, variant }) => (
          <Alert
            key={key}
            variant={variant}
            title={title}
            timeout={AUTO_DISMISS_MS}
            onTimeout={() => dismiss(key)}
            actionClose={<AlertActionCloseButton onClose={() => dismiss(key)} />}
          />
        ))}
      </AlertGroup>
    </NotificationContext.Provider>
  )
}
