#!/bin/sh
# nginx-entrypoint.sh -- render the config templates, then exec nginx.
#
# Two substitutions, both via envsubst with an explicit variable list so nginx
# runtime vars ($host, $uri, $http_upgrade, ...) survive untouched:
#   1. ${RESOLVER} in the main config, derived from the pod's DNS (for the
#      multi-engine proxy's dynamic upstreams).
#   2. ${ENGINE_ORIGIN} / ${CSP_CONNECT_EXTRA} in the single-engine server
#      block -- SKIPPED when a deployer has mounted its own read-only
#      default.conf (the multi-engine proxy shape), which is then used as-is.
set -eu

# --- main config: DNS resolver ---------------------------------------------
# First nameserver from resolv.conf (OpenShift cluster DNS); fall back to the
# common in-cluster DNS service IP if resolv.conf has none.
RESOLVER="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)"
[ -n "${RESOLVER:-}" ] || RESOLVER='172.30.0.10'
export RESOLVER
envsubst '${RESOLVER}' \
    < /etc/nginx/nginx.conf.template \
    > /etc/nginx/nginx.conf

# --- server block: single-engine template, unless one is mounted -----------
CONF=/etc/nginx/conf.d/default.conf
if [ ! -e "$CONF" ] || [ -w "$CONF" ]; then
    export ENGINE_ORIGIN CSP_CONNECT_EXTRA
    envsubst '${ENGINE_ORIGIN} ${CSP_CONNECT_EXTRA}' \
        < /etc/nginx/templates/default.conf.template \
        > "$CONF"
fi

exec nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
