# oVirt Single-Node Lab — Automated Setup (Self-Hosted Engine)

Stand up a one-box oVirt 4.5 lab: the physical (or nested-virt) node runs the
hypervisor, an NFS server exported to itself, and the oVirt Engine as a VM on
top of that same node ("self-hosted engine"). Target audience: frontend
development against the oVirt REST API — not production.

```
┌─────────────────────────────────────────────────────┐
│  node.lab.local  (CentOS Stream 9, bare metal or    │
│                   VM with nested virt)              │
│                                                     │
│  ┌───────────────────────────┐   ┌───────────────┐  │
│  │ HostedEngine VM           │   │ NFS server    │  │
│  │ engine.lab.local          │◄──│ /exports/he   │  │
│  │ ovirt-engine + REST API   │   │ /exports/data │  │
│  │ https://engine.lab.local  │   │ /exports/iso  │  │
│  └───────────────────────────┘   └───────────────┘  │
│            KVM / vdsm / ovirt-ha-agent              │
└─────────────────────────────────────────────────────┘
```

---

## Automated path: Proxmox + Ansible (recommended) → [`lab/ansible/README.md`](../lab/ansible/README.md)

If your lab host is Proxmox, everything from Phase 0 through Phase 3 below is
one unattended pipeline (`lab/ansible/site.yml`):

1. `cd lab/ansible && cp vars.example.yml vars.yml` — Proxmox API endpoint,
   VM sizing, the two IPs/FQDNs. `cp inventory.example.ini inventory.ini`.
2. `export PROXMOX_TOKEN_SECRET=… HE_ADMIN_PASSWORD=… HE_ROOT_PASSWORD=…`
   — secrets stay in the environment, never in files.
3. `ansible-playbook -i inventory.ini site.yml -e @vars.yml` runs four plays:
   **provision** (CentOS Stream 9 cloud-image VM on Proxmox, `cpu: host` for
   nested virt) → **bootstrap** (hostname, `/etc/hosts`, oVirt 4.5 repos,
   packages, NFS exports) → **engine** (headless `hosted_engine_setup`) →
   **post** (data storage domain + sanity checks). ~60–90 min nested.

Prerequisites, per-phase tags, teardown and troubleshooting live in
[`lab/ansible/README.md`](../lab/ansible/README.md). Everything below is the
**manual / reference path**: read it to understand what the playbooks do, or
follow it on non-Proxmox hardware.

---

## 1. Requirements

| Resource | Minimum | Comfortable |
|---|---|---|
| CPU | 4 cores with VT-x/AMD-V | 8+ cores |
| RAM | 16 GB (engine VM takes 4 GB) | 32 GB |
| Disk | 120 GB free | 250 GB+ SSD |
| OS | CentOS Stream 9 (fewest repo headaches for oVirt 4.5) | — |
| Network | 1 static IP, 2 resolvable FQDNs | — |

Notes:

- **Nested virt works.** If the "node" is itself a VM (VMware Fusion/Workstation,
  ESXi, KVM), enable nested virtualization (`vmx`/`svm` exposed to the guest).
  Deployment is slower (~60–90 min instead of ~35) but fine for a dev lab.
  Verify inside the node: `grep -cE 'vmx|svm' /proc/cpuinfo` must be ≥ 1.
- **Two FQDNs are mandatory** and must resolve *before* you start:
  `node.lab.local` → the node's IP, `engine.lab.local` → a second free IP on
  the same subnet (the engine VM claims it via DHCP-less static config).
  No DNS server? `/etc/hosts` on the node + your workstation is enough
  (the setup script below handles the node side).
- Rocky/Alma 9 mostly work but CentOS Stream 9 is what oVirt CI tests against.

---

## 2. Phase 0 — Node OS prep (once, manual or kickstart)

> Automated by `lab/ansible/01-provision-proxmox-vm.yml` +
> `02-bootstrap-node.yml` (`--tags provision,bootstrap`).

Install CentOS Stream 9 "Server" (no GUI). Then:

```bash
# --- edit these ----------------------------------------------------------
export NODE_FQDN=node.lab.local
export ENGINE_FQDN=engine.lab.local
export NODE_IP=192.168.1.50
export ENGINE_IP=192.168.1.51
# -------------------------------------------------------------------------

hostnamectl set-hostname "$NODE_FQDN"
cat >> /etc/hosts <<EOF
$NODE_IP   $NODE_FQDN node
$ENGINE_IP $ENGINE_FQDN engine
EOF

timedatectl set-ntp true          # engine setup fails on clock skew
dnf -y update && reboot
```

> Keep SELinux **enforcing** and firewalld **running** — the installers
> configure both; disabling them causes more problems than it solves.

---

## 3. Phase 1 — Bootstrap script (repos, packages, NFS)

> Automated by `lab/ansible/02-bootstrap-node.yml` (`--tags bootstrap`).

Save as `01-bootstrap.sh` on the node and run as root:

```bash
#!/usr/bin/env bash
set -euxo pipefail

# oVirt 4.5 repos for CentOS Stream 9
dnf -y install centos-release-ovirt45
dnf config-manager --set-enabled crb

# Hosted-engine installer + the engine VM appliance image (~2 GB download)
dnf -y install ovirt-hosted-engine-setup ovirt-engine-appliance

# --- NFS server exporting to ourselves (the "shared storage" trick) -------
dnf -y install nfs-utils
mkdir -p /exports/{he,data,iso}
# vdsm requires uid/gid 36 (vdsm:kvm)
chown 36:36 /exports/{he,data,iso}
chmod 0755 /exports/{he,data,iso}

cat > /etc/exports.d/ovirt.exports <<'EOF'
/exports/he    *(rw,anonuid=36,anongid=36,all_squash)
/exports/data  *(rw,anonuid=36,anongid=36,all_squash)
/exports/iso   *(rw,anonuid=36,anongid=36,all_squash)
EOF

systemctl enable --now nfs-server
firewall-cmd --permanent --add-service={nfs,rpc-bind,mountd}
firewall-cmd --reload
exportfs -rav
showmount -e localhost   # sanity: all three exports listed
```

---

## 4. Phase 2 — Deploy the hosted engine

> Automated by `lab/ansible/03-deploy-hosted-engine.yml` (`--tags engine`),
> which drives Option A below headlessly.

Two options. **Option A (Ansible) is the properly automated one**; Option B is
the pragmatic "one interactive run, then replayable forever" fallback.

### Option A — Fully automated via the `ovirt.ovirt` Ansible collection

The installer itself is Ansible under the hood; this drives it headlessly.
Save as `02-deploy-he.yml`:

```yaml
---
- name: Deploy oVirt self-hosted engine (single node lab)
  hosts: localhost
  connection: local
  vars:
    he_fqdn: engine.lab.local
    he_admin_password: "{{ lookup('env', 'HE_ADMIN_PASSWORD') }}"
    he_appliance_password: "{{ lookup('env', 'HE_ROOT_PASSWORD') }}"

    # network — the NIC the management bridge is built on
    he_bridge_if: eth0                # ip -br link  → pick your uplink NIC
    he_force_ip4: true

    # engine VM sizing (lab-sized; defaults are larger)
    he_mem_size_MB: 4096
    he_vcpus: 2
    he_disk_size_GB: 60

    # storage — the NFS export from Phase 1
    he_domain_type: nfs
    he_storage_domain_addr: node.lab.local
    he_storage_domain_path: /exports/he

    # engine VM static network (must match the /etc/hosts entries)
    he_vm_ip_addr: 192.168.1.51
    he_vm_ip_prefix: 24
    he_gateway: 192.168.1.1
    he_dns_addr: 192.168.1.1
    he_vm_etc_hosts: true             # engine VM gets node's /etc/hosts entries
  roles:
    - ovirt.ovirt.hosted_engine_setup
```

Run:

```bash
dnf -y install ansible-core
ansible-galaxy collection install ovirt.ovirt

export HE_ADMIN_PASSWORD='<engine admin@ovirt password>'
export HE_ROOT_PASSWORD='<engine VM root password>'
ansible-playbook 02-deploy-he.yml
```

> Variable names above are from the collection's `hosted_engine_setup` role —
> if a run fails on an undefined/renamed var, check
> `ansible-galaxy collection list ovirt.ovirt` docs for your installed version:
> https://github.com/oVirt/ovirt-ansible-collection/tree/master/roles/hosted_engine_setup

### Option B — Answers file (one interactive run, then replayable)

```bash
# first run: interactive, ~35-90 min
hosted-engine --deploy --4

# every subsequent rebuild: fully unattended
# (setup writes its answers to /var/lib/ovirt-hosted-engine-setup/answers/)
hosted-engine --deploy --4 \
  --config-append=/var/lib/ovirt-hosted-engine-setup/answers/answers-<timestamp>.conf
```

Interactive prompts → answers: storage type `nfs`, path
`node.lab.local:/exports/he`, engine VM 4096 MB / 2 vCPU, static IP for the
engine, and "add lines to /etc/hosts on the engine VM" → yes. Keep the
generated answers file in this repo (scrub passwords) for reproducible builds.

---

## 5. Phase 3 — Post-deploy automation (data domain + sanity)

> Automated by `lab/ansible/04-post-deploy.yml` (`--tags post`).

The engine is up but the datacenter stays "Uninitialized" until a **data**
storage domain exists. Automate with the same collection —
`03-post-deploy.yml`:

```yaml
---
- name: Post-deploy - attach data storage domain
  hosts: localhost
  connection: local
  vars:
    engine_url: https://engine.lab.local/ovirt-engine/api
    engine_user: admin@ovirt@internalsso    # 4.5 SSO profile; admin@internal on older builds
    engine_password: "{{ lookup('env', 'HE_ADMIN_PASSWORD') }}"
  tasks:
    - name: Obtain SSO token
      ovirt.ovirt.ovirt_auth:
        url: "{{ engine_url }}"
        username: "{{ engine_user }}"
        password: "{{ engine_password }}"
        insecure: true                      # lab: self-signed CA

    - name: Add NFS data domain
      ovirt.ovirt.ovirt_storage_domain:
        auth: "{{ ovirt_auth }}"
        name: data
        host: node.lab.local
        data_center: Default
        nfs:
          address: node.lab.local
          path: /exports/data

    - name: Revoke token
      ovirt.ovirt.ovirt_auth:
        state: absent
        ovirt_auth: "{{ ovirt_auth }}"
```

Verify:

```bash
hosted-engine --vm-status          # "Engine status: up", score 3400
curl -k -u 'admin@ovirt@internalsso:PASSWORD' \
  https://engine.lab.local/ovirt-engine/api | head -30   # XML API root
```

UI entry points:

| What | URL |
|---|---|
| Landing page | `https://engine.lab.local/ovirt-engine/` |
| Admin Portal (the GWT one) | `https://engine.lab.local/ovirt-engine/webadmin/` |
| VM Portal (the React one) | `https://engine.lab.local/ovirt-engine/web-ui/` |
| REST API | `https://engine.lab.local/ovirt-engine/api` |
| API model docs | `https://engine.lab.local/ovirt-engine/apidoc/` |

---

## 6. Phase 4 — Wire the frontend dev loop

From your workstation (add both FQDNs to your workstation's `/etc/hosts`
first), trust the lab CA once so the dev proxy and browser stop complaining:

```bash
curl -k 'https://engine.lab.local/ovirt-engine/services/pki-resource?resource=ca-certificate&format=X509-PEM-CA' \
  -o ovirt-lab-ca.pem
# macOS: add to keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ovirt-lab-ca.pem
```

Then in the `ovirt-web-ui` checkout (`../ovirt-web-ui`), create `.env.lab`:

```
ENGINE_URL=https://engine.lab.local/ovirt-engine
ENGINE_USER=admin@ovirt@internalsso
ENGINE_PASSWORD=<password>
BROWSER=none
KEEP_ALIVE=30
```

```bash
yarn install && ENV=lab yarn start     # dev server proxies to the engine — no CORS setup needed
```

A greenfield app gets the same benefit by pointing its Vite dev proxy at
`https://engine.lab.local/ovirt-engine` and forwarding `/api` + `/sso`.

---

## 7. Teardown / rebuild

```bash
# nuke a failed or dirty deployment and start over (keeps OS + repos + NFS)
ovirt-hosted-engine-cleanup
rm -rf /exports/he/* /exports/data/*   # wipe storage domains
# then rerun Phase 2 with the answers file / playbook → ~35 min to fresh lab
```

If the node is a VM: snapshot it right after Phase 1 (before deploy). Rebuild
then becomes "revert snapshot + replay Phase 2" — the fastest path by far.
(On the automated path: snapshot the Proxmox VM after the `bootstrap` phase,
then rollback + `--tags engine,post`.)

## 8. Troubleshooting quick hits

- **Deploy hangs at "Wait for the host to be up"** — almost always DNS/FQDN:
  both names must resolve *from the engine VM too* (that's what
  `he_vm_etc_hosts: true` is for).
- **NFS mount denied** — ownership must be `36:36` and exports must include
  `anonuid=36,anongid=36,all_squash`. Recheck `showmount -e localhost`.
- **"Hardware virtualization not available"** — nested virt not exposed to the
  node VM; fix in the outer hypervisor, not the node.
- **Engine deploy fails late, want logs** —
  `/var/log/ovirt-hosted-engine-setup/` on the node,
  `/var/log/ovirt-engine/` inside the engine VM
  (`hosted-engine --console` to get in).
- **Low memory** — deploy refuses < ~4 GB free for the engine VM; on a 16 GB
  node close everything else and keep `he_mem_size_MB: 4096`.
