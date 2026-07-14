import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ActionGroup,
  Alert,
  Brand,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core'
import { FormattedMessage, useIntl } from 'react-intl'
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { readPlatformMirror } from '../api/resources/platformSettings'
import { readBrandMirror } from '../branding/brand'
import { applyBrandFavicon } from '../branding/favicon'
import { brandAssets } from '../branding/logos'
import { useAuth } from '../auth/context'
import { getActiveBase, getServers, setActiveBase, useActiveBase } from '../servers/registry'
import { getRuntimeConfig } from '../config/runtime'

// The auth guard's Navigate carries the intended destination in a 'redirect'
// search param (built by loginRedirectSearch in auth/capabilities.ts). Only
// follow app-internal paths: absolute ('/...') but not scheme-relative
// ('//evil.example') — anything else falls back home.
function redirectTarget(redirect: unknown): string {
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/'
}

// Mock mode has no SSO profiles — the select is hidden and the username is
// sent as typed, keeping dev/mock/e2e behavior identical.
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

// oVirt SSO principals are user@profile, and the engine resolves the profile
// by splitting on the LAST '@' — so a Keycloak username that itself contains
// '@' (admin@ovirt) still needs the profile suffix. Hand-typing it is the #1
// first-login trap ("No valid profile found in credentials"), so the form
// owns the suffix: pick a profile, we compose the principal on submit.
// 'internalsso' is the bundled-Keycloak profile (oVirt 4.5+); 'internal' is
// the legacy aaa-jdbc profile; LDAP/AD setups use their own profile names.
const CUSTOM_PROFILE = '__custom'

// The last-used profile survives across sessions (localStorage, like theme and
// settings — it names an auth DOMAIN, not a credential). LDAP/AD users would
// otherwise re-pick their profile on every single login.
const PROFILE_KEY = 'console-login-profile'
const CUSTOM_PROFILE_KEY = 'console-login-profile-custom'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable (lockdown/private mode) — the select just resets
  }
}

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const intl = useIntl()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: unknown }
  const target = redirectTarget(search.redirect)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // Initial profile: the picked engine's configured default (config.js
  // `servers[].profile`) wins so a fresh visit lands on e.g. ad.example.com;
  // otherwise the browser's last manual pick, else the generic default.
  const [profile, setProfile] = useState(() => {
    if (IS_MOCK) return 'internalsso'
    const server = getServers().find((s) => s.base === getActiveBase())
    return server?.profile ?? readStored(PROFILE_KEY) ?? 'internalsso'
  })
  const [customProfile, setCustomProfile] = useState(() => readStored(CUSTOM_PROFILE_KEY) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Multi-engine (config.js `servers`, see servers/registry.ts): which engine
  // the sign-in goes to. The list is deploy-time-fixed; only the SELECTION is
  // per-browser (last pick remembered, like the profile select). Hidden when
  // no servers are configured — the console then talks same-origin, the
  // pre-feature behavior. Mock mode has no real engines, so no picker.
  // Memoized for a stable reference (config is static per page load) so the
  // snap-to-configured effect below doesn't re-run every render.
  const servers = useMemo(() => (IS_MOCK ? [] : getServers()), [])
  const activeBase = useActiveBase()
  // The active base can legitimately sit outside the configured list ('' —
  // same-origin — after an engine-injected session on a deployment whose list
  // is external-only). The picker offers configured servers only, so snap to
  // the first entry rather than render a select whose value matches no option
  // while sign-in silently goes elsewhere.
  useEffect(() => {
    if (servers.length > 0 && !servers.some((s) => s.base === activeBase)) {
      setActiveBase(servers[0].base)
    }
  }, [servers, activeBase])
  const activeServer = servers.find((s) => s.base === activeBase) ?? null
  // Picking an engine snaps the profile to that engine's configured default,
  // so switching between an AD engine and a DMZ engine (different directories)
  // just works. A manual override afterward sticks — this only fires when the
  // engine (activeBase) changes, not on every profile edit. Engines with no
  // configured profile leave the current selection untouched.
  useEffect(() => {
    const server = servers.find((s) => s.base === activeBase)
    if (server?.profile) setProfile(server.profile)
  }, [servers, activeBase])
  // Pre-auth branding: no token exists yet, so the custom logo / product
  // name / sign-in notice come from this browser's mirrored copy of the
  // platform settings (written on every authenticated visit). A brand-new
  // browser simply shows the stock oVirt branding until its first session.
  const [platform] = useState(() => readPlatformMirror())
  // The engine flavour (oVirt vs OLVM) can't be detected pre-auth either, so it
  // rides the same mirror pattern: useProductBrand writes it on every
  // authenticated visit, and a fresh browser defaults to oVirt until then.
  const [brand] = useState(() => readBrandMirror() ?? 'ovirt')
  const assets = brandAssets(brand)
  const productName =
    platform !== null && platform.productName.trim() !== ''
      ? platform.productName
      : assets.productName
  // A deploy-time config.js notice is truly global (shown pre-auth, same for
  // every user/engine, no cache dependency) and takes precedence; failing
  // that, the per-browser platform-settings mirror (per-engine, populated only
  // after an authenticated visit) still stands in.
  const loginNotice = getRuntimeConfig().login.notice || (platform?.loginNotice.trim() ?? '')
  useEffect(() => {
    document.title = productName
    applyBrandFavicon(brand)
  }, [productName, brand])

  const effectiveProfile = profile === CUSTOM_PROFILE ? customProfile.trim() : profile
  // The composed user@profile principal the SSO grant actually receives.
  const principal = IS_MOCK || !effectiveProfile ? username : `${username}@${effectiveProfile}`
  const profileMissing = !IS_MOCK && profile === CUSTOM_PROFILE && customProfile.trim() === ''

  // href carries the dynamic redirect path; the Navigate component still
  // requires a `to`, which href takes precedence over.
  if (isAuthenticated) return <Navigate to="/" href={target} replace />

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    login(principal, password)
      .then(() => navigate({ href: target, replace: true }))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : intl.formatMessage({ id: 'login.failed' })),
      )
      .finally(() => setPending(false))
  }

  return (
    <Bullseye style={{ height: '100vh' }}>
      <Card style={{ width: '24rem' }}>
        <CardBody style={{ paddingBlockEnd: 0 }}>
          {/* Dark tile: the card is near-white in the light theme, so the
              light-on-transparent mark rides the masthead slate to stay legible
              (see .app-login-logo in brand-tokens.css). */}
          <div className="app-login-logo">
            <Brand
              src={platform?.logoDataUri ?? assets.logo}
              alt={productName}
              heights={{ default: '44px' }}
              style={{ display: 'block' }}
            />
          </div>
          {loginNotice !== '' && (
            <p
              style={{
                marginBlockEnd: 'var(--pf-t--global--spacer--sm)',
                color: 'var(--pf-t--global--text--color--subtle)',
                fontSize: 'var(--pf-t--global--font--size--body--sm)',
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
              }}
            >
              {loginNotice}
            </p>
          )}
        </CardBody>
        <CardTitle>
          <FormattedMessage id="login.title" values={{ productName }} />
        </CardTitle>
        <CardBody>
          <Form onSubmit={onSubmit}>
            {error && <Alert variant="danger" isInline title={error} />}
            {servers.length > 0 && (
              <FormGroup label={intl.formatMessage({ id: 'login.server' })} fieldId="server">
                <FormSelect
                  id="server"
                  value={activeBase}
                  onChange={(_event, value) => setActiveBase(value)}
                  aria-label={intl.formatMessage({ id: 'login.server' })}
                >
                  {servers.map((server) => (
                    <FormSelectOption key={server.base} value={server.base} label={server.name} />
                  ))}
                </FormSelect>
              </FormGroup>
            )}
            <FormGroup
              label={intl.formatMessage({ id: 'login.username' })}
              fieldId="username"
              isRequired
            >
              <TextInput
                id="username"
                value={username}
                onChange={(_event, value) => setUsername(value)}
                placeholder={intl.formatMessage({ id: 'login.usernamePlaceholder' })}
                isRequired
              />
            </FormGroup>
            {!IS_MOCK && (
              <FormGroup label={intl.formatMessage({ id: 'login.profile' })} fieldId="profile">
                <FormSelect
                  id="profile"
                  value={profile}
                  onChange={(_event, value) => {
                    setProfile(value)
                    store(PROFILE_KEY, value)
                  }}
                  aria-label={intl.formatMessage({ id: 'login.profile' })}
                >
                  {/* The picked engine's configured directory profile (e.g.
                      ad.example.com) — the pre-selected default. Shown only
                      when it isn't already one of the built-in options below. */}
                  {activeServer?.profile &&
                    activeServer.profile !== 'internalsso' &&
                    activeServer.profile !== 'internal' && (
                      <FormSelectOption value={activeServer.profile} label={activeServer.profile} />
                    )}
                  <FormSelectOption
                    value="internalsso"
                    label={intl.formatMessage({ id: 'login.profileInternalsso' })}
                  />
                  <FormSelectOption
                    value="internal"
                    label={intl.formatMessage({ id: 'login.profileInternal' })}
                  />
                  <FormSelectOption
                    value={CUSTOM_PROFILE}
                    label={intl.formatMessage({ id: 'login.profileOther' })}
                  />
                </FormSelect>
                {profile === CUSTOM_PROFILE && (
                  /* the gap rides a wrapper div: TextInput spreads style onto
                     the inner <input>, so a margin there lands INSIDE the
                     bordered form-control box and the select/input boxes sit
                     flush against each other */
                  <div style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
                    <TextInput
                      id="custom-profile"
                      value={customProfile}
                      onChange={(_event, value) => {
                        setCustomProfile(value)
                        store(CUSTOM_PROFILE_KEY, value)
                      }}
                      aria-label={intl.formatMessage({ id: 'login.profileCustom' })}
                      placeholder={intl.formatMessage({ id: 'login.profileCustomPlaceholder' })}
                    />
                  </div>
                )}
                {username && !profileMissing && (
                  <HelperText style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
                    <HelperTextItem>
                      {intl.formatMessage({ id: 'login.signingInAs' }, { principal })}
                    </HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
            )}
            <FormGroup
              label={intl.formatMessage({ id: 'login.password' })}
              fieldId="password"
              isRequired
            >
              <TextInput
                id="password"
                type="password"
                value={password}
                onChange={(_event, value) => setPassword(value)}
                isRequired
              />
            </FormGroup>
            <ActionGroup>
              <Button
                type="submit"
                variant="primary"
                isBlock
                isDisabled={pending || !username || !password || profileMissing}
                isLoading={pending}
              >
                <FormattedMessage id="login.submit" />
              </Button>
            </ActionGroup>
          </Form>
        </CardBody>
      </Card>
    </Bullseye>
  )
}
