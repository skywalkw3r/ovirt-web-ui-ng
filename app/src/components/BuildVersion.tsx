import { useT } from '../i18n/useT'
import { APP_COMMIT, APP_COMMIT_SHORT, APP_VERSION } from '../lib/version'

// "Version 0.1.0-beta.1 (8e21c19)": the release from package.json plus the
// short commit the bundle was built from, so two builds of one version can be
// told apart. The full SHA rides the title.
// Without a known commit it reads "Version 0.1.0-beta.1".
export function BuildVersion({ className }: { className?: string }) {
  const t = useT()
  const label =
    APP_COMMIT_SHORT !== ''
      ? t('build.versionWithCommit', { version: APP_VERSION, commit: APP_COMMIT_SHORT })
      : t('build.version', { version: APP_VERSION })
  return (
    <span className={className} title={APP_COMMIT !== '' ? APP_COMMIT : undefined}>
      {label}
    </span>
  )
}
