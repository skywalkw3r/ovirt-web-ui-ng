# oVirt Single-Node Lab on Proxmox — Ansible Automation

Fully automated build of a one-box oVirt 4.5 lab for frontend development:
a nested-virt CentOS Stream 9 VM on Proxmox becomes the oVirt node, exports
NFS to itself, and runs the engine as a self-hosted-engine VM on top of it.

This automates the Phase 0–3 steps of [`docs/LAB-SETUP.md`](../../docs/LAB-SETUP.md);
that document remains the reference explanation of *what* these playbooks do
and the fallback for non-Proxmox hardware.

```
Proxmox host (PVE 9.x, nested virt enabled)
└── ovirt-node VM  (CentOS Stream 9, cpu=host → vmx/svm exposed)
    ├── NFS server        /exports/{he,data,iso}   (exported to itself)
    └── HostedEngine VM   engine.lab.local — oVirt Engine + REST API
```

## Pipeline

| Play | File | Runs against | Tag |
|---|---|---|---|
| 1 | `01-provision-proxmox-vm.yml` | Proxmox API + PVE host over SSH | `provision` |
| 2 | `02-bootstrap-node.yml` | the lab VM (`node_ip`) | `bootstrap` |
| 3 | `03-deploy-hosted-engine.yml` | the lab VM | `engine` |
| 4 | `04-post-deploy.yml` | the lab VM → engine API | `post` |

`site.yml` imports all four in order.

## Prerequisites

### 1. Proxmox VE 8.x with nested virtualization

The lab VM must be able to run KVM guests itself. On the **PVE host**:

```bash
cat /sys/module/kvm_intel/parameters/nested   # want: Y   (AMD: kvm_amd → 1)
```

Modern PVE kernels enable it by default. If not, enable it persistently
(all VMs must be stopped to reload the module):

```bash
echo 'options kvm-intel nested=Y' > /etc/modprobe.d/kvm-intel.conf   # AMD: kvm-amd nested=1
modprobe -r kvm_intel && modprobe kvm_intel
```

Play 1 verifies this too (it deliberately does **not** enable it — reloading
the KVM module requires every VM on the host to be off; see the comment in
the playbook), so knowing up front saves a failed run.
Note: VMs with `vmx`/`svm` exposed cannot be live-migrated.

### 2. A Proxmox API token

```bash
# On the PVE host (simplest lab setup — token on root@pam, no privilege separation):
pveum user token add root@pam ansible --privsep 0
# → copy the printed secret; it is shown ONCE.
```

In `vars.yml`: `proxmox_api_user: root@pam`, `proxmox_api_token_id: ansible`
(the token **name only** — not `root@pam!ansible`). The secret never goes in
a file: `export PROXMOX_TOKEN_SECRET='…'`.

If you use a dedicated user with a privilege-separated token instead, it
needs at least `PVEVMAdmin` on `/vms` and `PVEDatastoreAdmin` on the storage
paths used for the image and disks.

### 3. SSH root access to the PVE host

Play 1 uses the API for VM creation/config, but downloads the cloud image
onto the PVE host and imports it as the boot disk over **SSH**
(`qm set … import-from=…`). Why: the Proxmox API rejects absolute-path disk
imports for API tokens (403 "Only root can pass arbitrary filesystem
paths"), while the `qm` CLI has no such restriction and works on every
PVE ≥ 7.2. Set up key auth from your control node before the first run:

```bash
ssh-copy-id root@<pve-host>       # or add your key to /root/.ssh/authorized_keys
ssh root@<pve-host> true          # must succeed without a password prompt
```

Host keys: the example inventory sets
`StrictHostKeyChecking=accept-new` for both the PVE host and the lab VM, so
first contact is accepted automatically while *changed* keys still fail
(and play 1 clears stale node keys on re-provision). If your copied
`inventory.ini` predates that setting, either add it or trust the host once:
`ssh-keyscan -H <pve-host> >> ~/.ssh/known_hosts`.

<details>
<summary>Password auth instead of keys</summary>

Ansible needs `sshpass` for SSH password prompts (`brew install sshpass`).
Then either prompt per run:

```bash
ansible-playbook -i inventory.ini site.yml -e @vars.yml -k     # + -K for a non-root sudo user
```

…or keep it in the environment like the other secrets — in `inventory.ini`
under `[pve:vars]`:

```ini
ansible_password={{ lookup('env', 'PVE_SSH_PASSWORD') }}
```

The node VM is unaffected either way — cloud-init installs
`lab_ssh_public_key` on it, so it always uses key auth.
</details>

### 4. Control node — Python venv (recommended)

The Proxmox modules run on `localhost`, so their Python deps (`proxmoxer`)
must be importable by the exact interpreter that runs Ansible. A project
venv guarantees that and keeps everything off your system/homebrew Python:

```bash
cd lab/ansible
python3 -m venv .venv
source .venv/bin/activate               # bash/zsh; fish: source .venv/bin/activate.fish
python -m pip install --upgrade pip
pip install "ansible-core>=2.17,<2.19" "proxmoxer>=2.3.0" requests ansible-lint
ansible-galaxy collection install -r requirements.yml
```

venv notes:

- **Re-activate in every new shell** before running plays
  (`source lab/ansible/.venv/bin/activate`); confirm with
  `which ansible-playbook` → should point into `.venv/bin`. `deactivate`
  to leave.
- Collections install to `~/.ansible/collections` regardless of the venv
  (per-user, shared by `ansible-playbook` and `ansible-lint`); only the
  Python packages live in `.venv`.
- No oVirt SDK is needed here — the `ovirt.ovirt` modules execute on the
  node, where the bootstrap play installs the SDK RPM (see below).
- The pin is deliberate on BOTH ends: `community.proxmox` needs >= 2.17,
  while `ovirt.ovirt` 3.2.2 predates the ansible-core 2.19 templating
  rewrite — on 2.21 the hosted-engine role trips undefined-variable bugs
  (one is worked around in 03-deploy) and warns about
  `INJECT_FACTS_AS_VARS`, which is removed outright in core 2.24. Stay
  < 2.19 until upstream catches up. Already on 2.21? Rebuild:
  `pip install --force-reinstall "ansible-core>=2.17,<2.19"`.
- `.venv/` is git-ignored.

<details>
<summary>Alternative: homebrew ansible (no venv)</summary>

Works, but `pip install proxmoxer requests` must target ansible's own
interpreter, not your shell's default Python:

```bash
$(brew --prefix ansible)/libexec/bin/pip install "proxmoxer>=2.3.0" requests
ansible-galaxy collection install -r requirements.yml
```
</details>

Collections pinned in `requirements.yml`:

  - `community.proxmox` — `proxmox_kvm`, `proxmox_disk`, `proxmox_vm_info`
    (these moved out of `community.general`; the old
    `community.general.proxmox_*` names are deprecated redirects)
  - `ovirt.ovirt` — the `hosted_engine_setup` role (play 3) and the
    `ovirt_auth` / `ovirt_storage_domain` modules (play 4). The oVirt
    modules execute on the node itself, where the bootstrap play already
    installed the Python SDK RPM — no oVirt SDK needed on your laptop.
  - `ansible.posix` — firewalld/mount handling in the bootstrap play

### 5. Network plan

Two free static IPs on the bridge network (`lab_vm_bridge`), and two FQDNs:
`node_fqdn` → `node_ip`, `engine_fqdn` → `engine_ip`. No DNS server is
required — the playbooks maintain `/etc/hosts` on the node and inside the
engine VM (`he_vm_etc_hosts`) — but add both entries to your **workstation's**
`/etc/hosts` so you can reach the UI/API afterwards.

## Quickstart

```bash
cd lab/ansible
source .venv/bin/activate               # see "Control node" above

cp vars.example.yml vars.yml            # fill in Proxmox API, VM sizing, IPs/FQDNs
cp inventory.example.ini inventory.ini  # set the PVE host and node addresses

# Secrets live in the environment only — never in vars files:
export PROXMOX_TOKEN_SECRET='<token secret from pveum>'
export HE_ADMIN_PASSWORD='<oVirt admin@ovirt portal password>'
export HE_ROOT_PASSWORD='<engine VM root password>'

ansible-playbook -i inventory.ini site.yml -e @vars.yml
```

When it finishes:

| What | URL (`engine_fqdn` from your vars.yml) |
|---|---|
| Admin Portal | `https://<engine_fqdn>/ovirt-engine/webadmin/` |
| VM Portal | `https://<engine_fqdn>/ovirt-engine/web-ui/` |
| REST API | `https://<engine_fqdn>/ovirt-engine/api` |

Login: `admin@ovirt` (Keycloak profile: `admin@ovirt@internalsso`) with
`HE_ADMIN_PASSWORD`. Then wire up the frontend dev loop per
[`docs/LAB-SETUP.md`](../../docs/LAB-SETUP.md) §6.

## Running individual phases

Each phase is a tag on `site.yml` (or run the numbered playbook directly):

```bash
# Only (re)create the Proxmox VM:
ansible-playbook -i inventory.ini site.yml -e @vars.yml --tags provision

# Node prep only (repos, packages, NFS) — e.g. after tweaking exports:
ansible-playbook -i inventory.ini site.yml -e @vars.yml --tags bootstrap

# Redeploy the engine + storage domains after a cleanup:
ansible-playbook -i inventory.ini site.yml -e @vars.yml --tags engine,post
```

All plays are idempotent — re-running the full `site.yml` on an existing lab
is safe and fast (unchanged phases no-op). Note that even skipped plays may
still gather facts against their hosts, so keep the inventory reachable or
add `--limit` when a host is intentionally down.

## Expected runtime

Nested virtualization roughly doubles the deploy time vs bare metal.

| Phase | Typical (nested) | Dominated by |
|---|---|---|
| provision | 5–10 min | cloud-image download to the PVE host (first run) |
| bootstrap | 10–20 min | oVirt repos + ~2 GB `ovirt-engine-appliance` |
| engine | 40–70 min | `hosted_engine_setup` (bootstrap VM → NFS move) |
| post | ~2 min | storage domain activation |
| **Total** | **~60–90 min** | |

The engine phase looks stuck at times (long silent tasks like "Wait for the
host to be up") — that's normal. Logs stream to
`/var/log/ovirt-hosted-engine-setup/` on the node.

## Teardown / rebuild

**Redeploy just the engine** (keep the VM, OS, repos, NFS) — the fast loop:

```bash
ssh root@<node_ip> 'ovirt-hosted-engine-cleanup && rm -rf /exports/he/* /exports/data/*'
ansible-playbook -i inventory.ini site.yml -e @vars.yml --tags engine,post
```

**Full teardown** — delete the Proxmox VM and start over:

```bash
ssh root@<proxmox_api_host> "qm stop <lab_vm_id> ; qm destroy <lab_vm_id> --purge"
ansible-playbook -i inventory.ini site.yml -e @vars.yml     # rebuild from nothing
```

(Equivalent API route: `community.proxmox.proxmox_kvm` with `state: absent`,
`force: true`.)

Tip: take a Proxmox snapshot of the node VM right after the `bootstrap`
phase. Rebuild then becomes "rollback snapshot + `--tags engine,post`" —
the fastest path by far.

## Troubleshooting the classics

**VM won't boot: "BdsDxe: No bootable option or device was found"**
OVMF (UEFI) found no EFI bootloader on the disk — you imported the BIOS-only
cloud image. CentOS publishes two near-identical CS9 variants:
`GenericCloud-9-*` (BIOS only) and `GenericCloud-x86_64-9-*` (hybrid
BIOS+UEFI). Fix `lab_cloud_image_url` in vars.yml to the `x86_64-9` variant
and re-provision, or flip the existing VM to BIOS:
`qm stop <vmid> && qm set <vmid> --bios seabios --delete efidisk0 && qm start <vmid>`.

**Deploy hangs at "Wait for the host to be up" — DNS/FQDN**
Almost always name resolution. `engine_fqdn` and `node_fqdn` must be two
*different* names resolving to two *different* IPs, forward and reverse, and
must resolve *from inside the engine VM too*. The playbooks handle the node
and engine `/etc/hosts`; if you changed IPs mid-flight, re-run `bootstrap`
first. `engine_fqdn` must never resolve to the node's IP.

**NFS: storage domain creation fails with a permission error**
The exports must be owned `36:36` (vdsm:kvm), mode `0755`, and exported with
`anonuid=36,anongid=36,all_squash`. Check on the node:
`ls -ln /exports && showmount -e localhost`. Also: the storage address the
deploy uses is the node's routable IP/FQDN — never `localhost`/`127.0.0.1`
(the address is stored in the storage domain and mounted over the
`ovirtmgmt` bridge).

**"Hardware virtualization not available" — nested virt missing**
Inside the node, `grep -cE 'vmx|svm' /proc/cpuinfo` must be ≥ 1. If it's 0:
the VM wasn't created with `cpu: host` (re-run `provision` and cold-boot the
VM — a reboot is not enough after a CPU-type change), or the PVE host has
nested disabled (see Prerequisites §1). Fix it on the Proxmox side; nothing
inside the node can help.

**Memory floor**
The hosted-engine role refuses to deploy the engine VM with less than
4096 MB (`he_minimal_mem_size_MB`), and the host additionally reserves
~700 MB for itself. With the defaults (32 GB node, 4 GB engine) you're fine;
if you shrank `lab_vm_memory_mb`, keep it ≥ 16384 and don't raise
`he_mem_size_MB` past what's actually free.

**Proxmox API: TLS certificate verification failed**
`community.proxmox` ≥ 2.0.0 validates certs by default. For a self-signed
lab PVE either set `validate_certs: false` where the vars file provides for
it, or point `ca_path` at the PVE CA.

**Engine deploy fails late — where are the logs?**
`/var/log/ovirt-hosted-engine-setup/` on the node;
`/var/log/ovirt-engine/` inside the engine VM (`hosted-engine --console`).
Also verify ≥ 5 GB free in `/var/tmp` on the node — the bootstrap engine VM
is built there before moving to NFS.

**Health check at any time**

```bash
ssh root@<node_ip> hosted-engine --vm-status   # want: Engine status "up", score 3400
```
