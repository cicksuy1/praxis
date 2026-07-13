## Why split into two processes?

Defender's server is **two independently-deployed binaries** that share exactly two things: a PostgreSQL database and an HMAC secret. Understanding why they're split — and what that split guarantees — is the foundation of the whole architecture.

| Process | Binary | Role | Where it runs |
|---|---|---|
|---|
| **Control plane** | `cmd/controlplane` | HTTPS REST brain: enrollment, peer feed, admin + ACL + network APIs | App tier (Docker Compose, port 8443) |
| **Hub** | `cmd/hub` | Stateless WireGuard concentrator / data plane | Linux VPN gateway host (separate, privileged) |

## The defining invariant

> **The hub holds no desired state.** It polls the control plane on fixed 10-second loops and converges the *live* WireGuard device onto whatever the database says. The control plane never calls the hub — there is **no CP→hub RPC**.

This is not an accident. The hub is a privileged network appliance that needs minimal attack surface and no business logic. The control plane is a database-backed REST service with rich API surface. Coupling them tightly (CP pushing to hub, hub holding state) would mean a hub bug could corrupt desired state, or a CP restart would leave the hub flying blind. The polling model keeps them fully decoupled: every behavioral change is a DB write on the CP side, picked up within ~10 seconds.

## What the hub does with each poll

Each polling round the hub calls one of four endpoints on the control plane, gets JSON back, and acts on it immediately. The control plane is the source of truth; the hub is the enforcer. If the network is partitioned for 30 seconds, the hub keeps running with its last known state — it doesn't fail closed and it doesn't panic.

## The WireGuard interface

The hub owns a single WireGuard TUN device: `wg-defender`, MTU 1420, hub address `10.20.0.1/24`. Every enrolled spoke is one WireGuard **peer** with a single `/32` allowed-IP (e.g. `10.20.0.7/32`). The hub listens on UDP `:51820`.

Keepalives are owned by **spokes** (persistent keepalive ~25s). The hub never initiates — it sets `keepalive=0` for all peers.

## Enrollment: from token to live peer

The full flow, showing which process handles each step:

1. **Admin → CP:** `POST /admin/tokens` — CP generates a token, stores only its SHA-256 hash.
2. **Admin → Spoke:** token delivered out-of-band.
3. **Spoke → CP:** `POST /enroll` with the token — CP allocates a `/32`, returns hub pubkey, hub endpoint, assigned IP.
4. **Hub → CP (next 10s tick):** `GET /hub/peers` — CP returns the new spoke in the desired peer list.
5. **Hub → wireguard-go:** `IpcSet` adds the new peer.
6. **Spoke → Hub:** WireGuard Noise handshake over UDP — first encrypted packet.

The hub learns about the new spoke **at step 4**, up to 10 seconds after enrollment completes. There is no push, no webhook, no callback.

## 🧠 Active recall

1. What is the one invariant that defines the hub's relationship with desired state, and what is its consequence for the control plane?
2. Name the two things the hub and control plane share, and explain why sharing a database directly (hub reading Postgres) was not chosen.
3. An admin edits a spoke's assigned IP at 12:00:00. At what earliest time does the hub enforce the new IP, and through what mechanism?
