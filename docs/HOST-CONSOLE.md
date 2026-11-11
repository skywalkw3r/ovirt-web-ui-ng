# Host console (Cockpit)

Every oVirt host runs [Cockpit](https://cockpit-project.org/), a web console
for the host itself: logs, storage, networking, services and a terminal. The
console links to it from three places, all sharing one item:

- the host list kebab and the right-click menu (`Host console`),
- the infrastructure tree and cluster host tables (same menu),
- the `Host console` tab on the host detail page.

The Cockpit console always opens in a **new browser tab**. Nothing is framed
inside this app, so the Content-Security-Policy in
[SECURITY-HEADERS.md](SECURITY-HEADERS.md) is unchanged. The design
background is in [ADR-0001](ADR-0001-UI-EXTENSIONS.md), section 7.

## Two modes

```
 Direct (default)                         SSO (opt-in, legacy engines)

 browser tab ──> https://<host>:9090      browser tab ──> https://<engine>:9986
                 Cockpit login page                       ovirt-cockpit-sso
                 (host account)                             │ checks the token with
                                                            │ the engine, then connects
                                                            v to the host for you
                                                          Cockpit, already signed in
```

| Mode   | When                                            | What the administrator sees                                                                                  |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Direct | Default. Works with every engine release.       | Cockpit's own sign-in page on `https://<host address>:9090`. Sign in with an account on the host.            |
| SSO    | Only when a deployer configures an SSO service. | Cockpit opens already signed in, through the engine-side `ovirt-cockpit-sso` service (oVirt 4.2 and 4.3 era). |

Think of direct mode as walking up to the host's own front door and showing
your host ID, and SSO mode as the engine's reception desk walking you in
because it already knows who you are.

### Direct mode and the certificate warning

In direct mode the browser talks to the host, not to the engine. Cockpit
serves the certificate found in `/etc/cockpit/ws-certs.d/` on the host, which
is self-signed unless someone replaced it. Until the browser trusts that
certificate it shows a warning page before Cockpit loads. The host console
tab says so before the administrator clicks.

To remove the warning, pick one:

1. Install a certificate from a CA your browsers already trust into
   `/etc/cockpit/ws-certs.d/` on each host, then `systemctl restart cockpit`.
2. Import the CA that signed the host certificates into the browsers (or the
   OS trust store) of the administrators.

Also check that the administrator's workstation can reach the host on the
Cockpit port (9090 by default, opened by the `cockpit` firewalld service).
The console uses the host's **address as the engine knows it**, so that name
must resolve from the workstation.

### SSO mode

Older engines (oVirt 4.2 and 4.3) shipped `ovirt-cockpit-sso`, a second
Cockpit web service on the engine machine (port 9986) that accepts an engine
session token and logs the administrator in to the host. Current engine
releases generally no longer ship it, which is why SSO is off by default.

When configured, the console opens:

```
https://<engine-fqdn>:9986/=<host id>/machines#access_token=<session token>
```

Security notes, because this hands over a live credential:

- The token is the signed-in administrator's session token. It is placed in
  the URL **fragment**, which browsers do not send in the HTTP request or in a
  `Referer` header; the SSO page reads it with script.
- It is only ever sent to the origin the deployer configured, and that origin
  must be `https`. A plaintext or malformed value is ignored and the console
  stays in direct mode.
- The URL is built when the administrator clicks, never rendered into the
  page.
- On a multi-engine deployment each engine names its own SSO service. A token
  is never sent to another engine's service.

Only point `ssoUrl` at a service you operate.

## Configuration (`config.js`)

All keys are optional. The annotated reference is in
[`app/public/config.js`](../app/public/config.js).

```js
window.ovirtWebUiConfig = {
  cockpit: {
    enabled: true, // false hides every host console entry point
    port: 9090, // Cockpit port on the hosts
    ssoUrl: 'https://engine.example.com:9986', // omit for direct mode
    ssoPage: 'machines', // Cockpit page the SSO link lands on
  },
}
```

Multi-engine deployments set the SSO service per engine instead:

```js
servers: {
  list: [
    { name: 'HE 1', url: '/e/he1', cockpitSsoUrl: 'https://engine1.example.com:9986' },
    { name: 'HE 2', url: '/e/he2' }, // no SSO here: direct mode
  ],
},
```

| Situation                                        | Result                              |
| ------------------------------------------------ | ----------------------------------- |
| No `cockpit` block                               | Direct mode on port 9090            |
| `enabled: false`                                 | No kebab item, no host detail tab   |
| Host has no address and no SSO is configured     | Entry points hidden for that host   |
| `ssoUrl` set, single engine                      | SSO mode                            |
| Server list configured, engine has `cockpitSsoUrl` | SSO mode for that engine          |
| Server list configured, engine has none          | Direct mode (`cockpit.ssoUrl` is ignored) |
| `ssoUrl` is `http://` or not a plain origin      | Ignored, direct mode                |

## Not included yet

Embedding Cockpit inside a host detail tab is deliberately left out. It would
need a `frame-src` entry in the CSP, host-side changes so Cockpit allows being
framed by the console origin, and a security review. See ADR-0001, section 7.
