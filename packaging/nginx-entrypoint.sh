#!/bin/sh
# nginx-entrypoint.sh -- render the config templates, then exec nginx.
#
# Everything rendered at start goes under /tmp/nginx, never into the image's
# own filesystem, so the container runs with a READ-ONLY ROOT
# (`readOnlyRootFilesystem: true` on OpenShift, `podman run --read-only
# --tmpfs /tmp` elsewhere): /tmp is the only writable path the image needs --
# the rendered configs here, nginx's pid and temp files per nginx.conf.template.
#
# Two substitutions, both via envsubst with an explicit variable list so nginx
# runtime vars ($host, $uri, $http_upgrade, ...) survive untouched:
#   1. ${RESOLVER} in the main config, derived from the pod's DNS (for the
#      multi-engine proxy's dynamic upstreams).
#   2. ${ENGINE_ORIGIN} / ${CSP_CONNECT_EXTRA} in the single-engine server
#      block -- SKIPPED when a deployer has mounted its own default.conf at
#      /etc/nginx/conf.d (the multi-engine proxy shape), which the main config
#      includes as-is.
set -eu

RUNTIME_DIR=/tmp/nginx
mkdir -p "$RUNTIME_DIR/conf.d"

# --- main config: DNS resolver ---------------------------------------------
# First nameserver from resolv.conf (OpenShift cluster DNS); fall back to the
# common in-cluster DNS service IP if resolv.conf has none.
RESOLVER="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)"
[ -n "${RESOLVER:-}" ] || RESOLVER='172.30.0.10'
export RESOLVER
envsubst '${RESOLVER}' \
    < /etc/nginx/nginx.conf.template \
    > "$RUNTIME_DIR/nginx.conf"

# --- server block: single-engine template, unless one is mounted -----------
# The image ships no /etc/nginx/conf.d/default.conf of its own (the stock one
# is removed at build), so one being there means a deployer mounted it. It is
# used untouched -- never overwritten, even when the mount is writable.
if [ ! -e /etc/nginx/conf.d/default.conf ]; then
    export ENGINE_ORIGIN CSP_CONNECT_EXTRA
    envsubst '${ENGINE_ORIGIN} ${CSP_CONNECT_EXTRA}' \
        < /etc/nginx/templates/default.conf.template \
        > "$RUNTIME_DIR/conf.d/default.conf"
fi

# -e stderr: nginx opens its compiled-in /var/log/nginx/error.log before it
# has read `error_log` from the config -- a write into the read-only root
# otherwise (an alert, not a failure, but noise on every start).
exec nginx -c "$RUNTIME_DIR/nginx.conf" -e stderr -g 'daemon off;'
