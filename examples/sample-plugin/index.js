// Sample ovirt-web-ui-ng UI plugin (extension API v1). See docs/PLUGINS.md.
//
// A plain ES module with no build step, so it doubles as a readable
// reference: it takes React and PatternFly from the console's shared-module
// table instead of bundling them. A real plugin would normally be written in
// TSX and built with the SDK's Vite preset (app/extension-sdk/), which
// rewrites `import ... from 'react'` onto this same table.
//
// It contributes one of each extension point:
//   - a "Sample facts" subtab on the host detail page, which reads the host
//     from the engine through api.engine.request (the console's transport),
//   - a "Ping (sample)" host action in the kebab and the detail header,
//   - a "Sample page" in the sidebar's Extensions group,
//   - a "Sample card" on the dashboard.

const shared = globalThis.ovirtWebUiNgShared
const { useEffect, useState } = shared.react
const { jsx, jsxs } = shared['react/jsx-runtime']
const {
  Alert,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Skeleton,
  Content,
} = shared['@patternfly/react-core']

export function activate(api) {
  api.i18n.registerMessages({
    en: {
      'facts.tab': 'Sample facts',
      'facts.address': 'Address',
      'facts.status': 'Status reported by the engine',
      'facts.error': 'Could not read the host: {message}',
      'ping.label': 'Ping (sample)',
      'ping.done': 'Pinged {name}',
      'page.title': 'Sample page',
      'page.body': 'Hello from the sample plugin, {user}.',
      'card.title': 'Sample card',
      'card.body': 'This card comes from the sample plugin.',
    },
    de: {
      'facts.tab': 'Beispieldaten',
      'facts.address': 'Adresse',
      'facts.status': 'Von der Engine gemeldeter Status',
      'facts.error': 'Der Host konnte nicht gelesen werden: {message}',
      'ping.label': 'Ping (Beispiel)',
      'ping.done': '{name} angepingt',
      'page.title': 'Beispielseite',
      'page.body': 'Hallo vom Beispiel-Plugin, {user}.',
      'card.title': 'Beispielkarte',
      'card.body': 'Diese Karte stammt aus dem Beispiel-Plugin.',
    },
  })

  // Four states, like every console view: loading, error, (empty), data.
  function HostFacts({ entity }) {
    const t = api.i18n.useFormat()
    const [state, setState] = useState({ status: 'loading' })
    useEffect(() => {
      const controller = new AbortController()
      api.engine
        .request(`/hosts/${encodeURIComponent(entity.id)}`, { signal: controller.signal })
        .then((host) => setState({ status: 'ok', host }))
        .catch((error) => {
          if (!controller.signal.aborted) setState({ status: 'error', error })
        })
      return () => controller.abort()
    }, [entity.id])

    if (state.status === 'loading') return jsx(Skeleton, { screenreaderText: 'Loading' })
    if (state.status === 'error') {
      return jsx(Alert, {
        variant: 'danger',
        isInline: true,
        title: t('facts.error', { message: state.error.message }),
      })
    }
    return jsxs(DescriptionList, {
      isHorizontal: true,
      children: [
        jsxs(DescriptionListGroup, {
          children: [
            jsx(DescriptionListTerm, { children: t('facts.address') }),
            jsx(DescriptionListDescription, { children: String(state.host.address ?? '') }),
          ],
        }),
        jsxs(DescriptionListGroup, {
          children: [
            jsx(DescriptionListTerm, { children: t('facts.status') }),
            jsx(DescriptionListDescription, { children: String(state.host.status ?? '') }),
          ],
        }),
      ],
    })
  }

  api.registerEntityTab({
    entity: 'host',
    id: 'facts',
    title: api.i18n.message('facts.tab'),
    component: HostFacts,
  })

  api.registerAction({
    entity: 'host',
    id: 'ping',
    label: api.i18n.message('ping.label'),
    placement: ['kebab', 'header'],
    run: ({ entity }) => api.notify.success(api.i18n.format('ping.done', { name: entity.name })),
  })

  function SamplePage() {
    const t = api.i18n.useFormat()
    return jsx(Content, {
      component: 'p',
      children: t('page.body', { user: api.session.userName ?? '' }),
    })
  }

  api.registerNavPage({ id: 'page', title: api.i18n.message('page.title'), component: SamplePage })

  function SampleCard() {
    const t = api.i18n.useFormat()
    return jsx(Content, { component: 'p', children: t('card.body') })
  }

  api.registerDashboardCard({
    id: 'card',
    title: api.i18n.message('card.title'),
    component: SampleCard,
    size: 'small',
  })
}
