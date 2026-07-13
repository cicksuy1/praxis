# Defender — Spoke-to-Spoke Routing

This guide explains how to let two spokes reach **each other through the hub**
(for example `RM-WIN-1 ↔ hub ↔ RM-WIN-2`), and why it takes a few extra steps.

If you are setting the server up for the first time, read [`INSTALL.md`](INSTALL.md)
first. For the full environment-variable and authentication reference, see
[`SETUP.md`](SETUP.md).

---

## What you get by default, and what this changes

By default Defender is a **pure star**: **each spoke gets a tunnel to the hub and
nothing else.** A spoke can talk to the hub, but two spokes **cannot** talk to each
other — even though they share the `10.20.0.0/24` overlay. This isolation is
intentional (see `AGENTS.md`).

Spoke-to-spoke is therefore an **opt-in**. This guide turns it on. If you do *not*
want spokes to reach each other, do nothing — skip to the last section.

---

## Why it isn't automatic

A common assumption is that because all spokes have addresses in `10.20.0.0/24`,
they are "on the same network" and can reach each other like machines on an office
LAN. **That is not how WireGuard works.** There is no shared switch, no broadcast,
no direct link between spokes. The `10.20.0.0/24` range is just an addressing
scheme. The **only** path from spoke A to spoke B runs through the hub, and the hub
has to be told to relay it.

Here is what happens when spoke A sends a packet to spoke B:

1. **A → hub.** A encrypts the packet using its tunnel to the hub and sends it.
2. **Hub decrypts.** The hub decrypts the packet. It now holds a plain packet whose
   destination is B's address — which is **not the hub's own** address.
3. **Hub forwards.** By default a Linux machine drops any packet that isn't
   addressed to itself. To make the hub pass it along, the kernel must be allowed
   to act as a **router** (`ip_forward`), and the firewall must allow the packet to
   go back out the same VPN interface it came in on.
4. **Hub → B.** On the way out, WireGuard re-encrypts the packet using the hub's
   tunnel to B (it knows to use B's tunnel because B's address is in B's allowed
   IPs) and sends it to B.

Two important consequences:

- **The traffic is encrypted on each leg (A↔hub, then hub↔B), but the hub sees it
  in plaintext in between.** This is *not* end-to-end encryption — the hub is a
  trusted middle-man that decrypts and re-encrypts. That is the trade-off for a
  star topology: one central point that can see and control all traffic.
- **You only ever control "who can be reached" through public keys and allowed
  IPs**, which the control plane manages during enrollment and the hub applies
  automatically (`pkg/hubserver/reconcile.go`). The encryption algorithm itself is
  fixed by WireGuard and is not something you configure.

---

## The three things you must enable

| # | Where | What to set | Why it's needed |
|---|-------|-------------|-----------------|
| 1 | Hub host | `net.ipv4.ip_forward=1` | Allows the hub's kernel to forward (route) packets that aren't addressed to itself |
| 2 | Hub host | A firewall rule allowing the VPN interface to forward to itself | Docker sets the forwarding firewall policy to **DROP**, so the relay is blocked without an explicit allow |
| 3 | Each spoke | A local firewall rule (e.g. Windows Firewall) | The receiving spoke's own operating system must accept the incoming traffic (ping, a TCP port, etc.) |

You do **not** need to change anything on the spoke's tunnel routing: the Defender
client already routes the whole subnet into the tunnel
(`AllowedIPs = 10.20.0.0/24`, set in `client/pkg/spokeagent/agent.go`), so a spoke
already sends traffic for *other* spokes toward the hub.

---

## Setup (hub host) — the one-command path

On the **Linux** hub host, run:

```sh
task hub:setup
```

This is the recommended way to apply the two host-level changes (Steps 1–3
below). It is **idempotent and safe to re-run**: it enables and persists IP
forwarding, installs the WireGuard hairpin iptables rule, and saves the rule via
`netfilter-persistent` when that tool is available (otherwise it prints how to
persist it manually). It honours `DEFENDER_TUN_NAME` (default `wg-defender`).

The sections below explain **what `task hub:setup` does under the hood**, and give
the manual equivalent commands if you prefer to run them by hand or need to adapt
them (for example on a `ufw` host). Step 4 (per-spoke firewall, Windows) is **not**
covered by `task hub:setup` and must still be done on each receiving spoke.

## Step 1 — Enable IP forwarding on the hub host

The hub runs with **host networking**, so settings applied to the host apply to the
hub. Its VPN interface is named `wg-defender` (the default `DEFENDER_TUN_NAME`).

```sh
# turn it on now
sudo sysctl -w net.ipv4.ip_forward=1

# keep it on after a reboot
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-defender.conf
sudo sysctl --system

# confirm it reads 1
sysctl net.ipv4.ip_forward
```

The hub tries to set this itself at startup, but inside a container `/proc/sys` is
read-only, so it logs a warning (`could not enable IP forwarding …`) and you set it
on the host instead. With host networking the host value is the one that counts.

## Step 2 — Allow the relay through the firewall

Docker usually sets the kernel's `FORWARD` policy to DROP. Check it:

```sh
sudo iptables -L FORWARD -n | head -1
# "Chain FORWARD (policy DROP)"   -> you need the rule below
# "Chain FORWARD (policy ACCEPT)" -> you can skip this step
```

If it says DROP, add a rule that allows traffic to come in on `wg-defender` and go
back out `wg-defender` (the spoke-to-spoke "hairpin"). Put it in the `DOCKER-USER`
chain so Docker doesn't override it:

```sh
sudo iptables -I DOCKER-USER -i wg-defender -o wg-defender -j ACCEPT

# confirm the rule exists (it covers both directions: A→B and B→A)
sudo iptables -L DOCKER-USER -n -v | grep wg-defender
```

This single rule allows **all** traffic between spokes (any port, any protocol).
To restrict it later, see "Restricting traffic" below.

> If this host uses **`ufw`** instead of plain iptables, the raw rule above can be
> wiped by ufw. Set `DEFAULT_FORWARD_POLICY="ACCEPT"` in `/etc/default/ufw` (or add
> a scoped `ufw route allow` rule) and reload ufw.

## Step 3 — Make the firewall rule survive reboots

The `sysctl` setting from Step 1 persists; the iptables rule does not on its own:

```sh
sudo apt-get install -y iptables-persistent   # Debian / Ubuntu
sudo netfilter-persistent save
```

## Step 4 — Allow the traffic on each spoke (Windows)

The hub now relays everything, but the **receiving** spoke's own firewall still
decides what to accept. On Windows the WireGuard adapter is often treated as a
"Public" network, which blocks incoming ping and most ports by default.

Run these as Administrator on the spoke that will **receive** the traffic:

```powershell
# allow ping (ICMP echo) so `ping` works
New-NetFirewallRule -DisplayName "Allow ICMPv4-In" -Protocol ICMPv4 -IcmpType 8 `
  -Direction Inbound -Action Allow

# allow a specific service port, limited to the VPN subnet (example: 5173)
New-NetFirewallRule -DisplayName "Allow TCP 5173 from VPN" -Direction Inbound `
  -Protocol TCP -LocalPort 5173 -RemoteAddress 10.20.0.0/24 -Action Allow
```

Add the rules on **both** spokes if you want them to reach each other in both
directions.

> **If you are serving an app** (web server, dev server, etc.), make sure it
> listens on the spoke's VPN address or on `0.0.0.0` — **not** just `localhost`.
> For example Vite listens on `127.0.0.1` by default and must be started with
> `vite --host` (or `server.host: true`). Check with
> `netstat -ano | findstr :5173`: you want to see `0.0.0.0:5173`, not
> `127.0.0.1:5173`.

---

## How to verify it works

1. **Confirm both spokes are connected.** In the hub log, each spoke should show a
   handshake followed by recurring keepalives, and there should be **no**
   `no known endpoint for peer` lines:
   ```sh
   docker compose --profile hub logs hub --tail=40 | grep -E 'Received handshake|keepalive'
   ```

2. **Ping from one spoke to the other**, using the target's overlay address (find
   addresses with `GET /admin/spokes`):
   ```
   ping 10.20.0.3
   ```

3. **Watch the relay counter on the hub** — this is the fastest way to pinpoint a
   problem. The `DOCKER-USER` rule counts every relayed packet:
   ```sh
   sudo iptables -L DOCKER-USER -n -v | grep wg-defender
   ```
   - Counter **goes up by ~2 per ping** (request + reply) → it's working.
   - Counter **goes up by ~1 per ping** (requests only) → the packet reaches the
     other spoke, but it isn't replying → the receiving spoke's firewall (Step 4)
     is blocking it, or the service isn't listening on the VPN address.
   - Counter **stays at 0** → the packet never reaches the relay → a spoke isn't
     connected (check Step's hub log), or the sending side isn't routing into the
     tunnel.

4. **Test a real service.** From the other spoke, open `http://10.20.0.2:5173`
   (substitute the serving spoke's overlay address).

---

## Restricting traffic (optional, future direction)

The rule in Step 2 allows **all** traffic between spokes. To enforce a policy
instead — default-deny with explicit allow rules, like Tailscale ACLs — you would
replace that blanket allow with a default-drop on the VPN hairpin plus specific
`source → destination:port` rules. Because every spoke-to-spoke packet passes
through the hub, all policy can be enforced in that one place. A control-plane–
managed access-control list (stored centrally and applied to the hub's forwarding
rules by the reconcile loop) is the intended long-term home for this. It is not yet
implemented.

---

## If you do NOT want spoke-to-spoke

Leave IP forwarding off and don't add the `DOCKER-USER` rule. The hub stays a pure
star — each spoke reaches the hub only, and spokes cannot reach each other. In that
case the `could not enable IP forwarding` warning in the hub log is expected and
harmless.
