## The four concurrent loops

All four goroutines start from `cmd/hub/main.go` on 10-second tickers and run concurrently. Every transient error is logged and **non-fatal** — the loops keep running independently of each other.

| Loop | File | What it does |
|---|---|---|
| Reconcile | `pkg/hubserver/reconcile.go` | `GET /hub/peers` → `diffPeers` vs `IpcGet` → batched `IpcSet` |
| Stats | `pkg/hubserver/stats.go` | `IpcGet` counters → `POST /hub/stats` |
| ACL | `pkg/hubserver/acl.go` | `GET /hub/acl` → render `iptables-restore` → apply |
| Hub config | `pkg/hubserver/hubconfig.go` | `GET /hub/config` → re-address TUN if CIDR changed |

Before the loops start, a one-time startup fetch (`fetchTUNAddress`, 15-second timeout) gets the TUN CIDR. If this fails, startup aborts.

## The reconcile loop in depth

`diffPeers` is a **pure function** — unit-tested without a real WireGuard device. It takes two sets of peers (desired from `/hub/peers`, live from `IpcGet`) and returns two lists:

- **Adds/updates:** a peer missing from the live set, *or* one whose allowed-IP set differs (so an admin IP edit is applied immediately on the next tick).
- **Removes:** a peer that is live but no longer in the desired set (revoked spoke).

All changes go out in **one batched `IpcSet`** — there is no partial apply. This is important: a peer's removal and another's add are atomic from wireguard-go's perspective.

## The UAPI seam

The hub writes **no custom crypto**. `pkg/wgconfig/config.go` builds `key=value` UAPI strings — `private_key`, `listen_port`, `public_key`, `allowed_ip`, `preshared_key`, `endpoint`, `persistent_keepalive_interval`, `remove` — and hands them to the vendored `wireguard-go` submodule via `IpcSet`/`IpcGet`. The cryptography is entirely inside `wireguard-go`.

## Spoke-to-spoke routing: why it needs extra work

WireGuard is a **star topology**. Spokes share a `10.20.0.0/24` address range, but there is no shared switch or broadcast domain — the *only* path from spoke A to spoke B runs through the hub.

When A sends a packet to B's overlay address:

1. **A → Hub.** A encrypts and sends over its WireGuard tunnel.
2. **Hub decrypts.** The hub now holds a plaintext packet whose destination is B's `10.20.0.x` — which is *not the hub's own address*.
3. **Hub forwards.** Linux drops packets not destined for itself unless `ip_forward=1` and the firewall allows it.
4. **Hub → B.** WireGuard re-encrypts using B's tunnel and sends to B.

Two host-level prerequisites:
1. **`net.ipv4.ip_forward=1`** on the hub host (the hub tries to set it but `/proc/sys` is read-only inside a container, so it must be set on the host).
2. **A hairpin iptables rule** in the `DOCKER-USER` chain (Docker sets `FORWARD` policy to DROP by default):
   ```
   iptables -I DOCKER-USER -i wg-defender -o wg-defender -j ACCEPT
   ```

`task hub:setup` applies both idempotently.

## The security trade-off

The hub **sees traffic in plaintext** between the two legs (decrypt from A, re-encrypt to B). This is not end-to-end encryption. It is a deliberate trade-off: a star topology with one trusted concentrator means all policy (ACLs, revocation, IP management) can be enforced in one place. Spoke clients already route the whole subnet into their tunnel (`AllowedIPs = 10.20.0.0/24`), so no client-side change is needed to enable spoke-to-spoke — only the hub-host changes above.

## 🧠 Active recall

1. Name the four hub loops, their approximate interval, and the single action each one performs.
2. What is `diffPeers` and what are the two conditions that cause a peer to appear in the 'add/update' list versus the 'remove' list?
3. Why does spoke-to-spoke traffic require `net.ipv4.ip_forward=1` and a hairpin iptables rule, and what security property does this arrangement give up?
