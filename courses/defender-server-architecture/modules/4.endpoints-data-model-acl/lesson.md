## Three trust tiers

All routes are wired in `pkg/controlplane/server.go Routes()`. Every endpoint belongs to exactly one tier:

| Tier | Auth | Who uses it |
|---|---|---|
| Spoke-facing | One-time token (body) or Ed25519 signature (headers) | VPN clients |
| Hub-facing | HMAC bearer | Hub's four polling loops |
| Admin-facing | HMAC bearer | React GUI / operators |

**Spoke-facing:**
- `POST /enroll` — one-time token; allocates IP, returns hub pubkey + endpoint
- `GET /spoke/config` — Ed25519 signature; returns current assigned IP, subnet, hub endpoint

**Hub-facing:**
- `GET /hub/peers` — desired peer set (`pubkey`, `allowed_ip`, optional `psk`)
- `POST /hub/stats` — push handshake timestamp + byte counters; returns `204`
- `GET /hub/acl` — compiled concrete IP rules + default action
- `GET /hub/config` — current TUN CIDR (e.g. `10.20.0.1/24`)

**Admin-facing (selected):**
- `POST /admin/tokens` — issue enrollment token (shown once)
- `GET /admin/spokes` — list with live online status + stats
- `DELETE /admin/spokes/{id}` — soft revoke
- `POST /admin/spokes/{id}/reroll` — rotate WireGuard key, keep ID + IP; returns 15m reroll token
- `PUT /admin/spokes/{id}/ip` — reassign overlay IP
- `GET/PUT /admin/network` — read or edit subnet + hub IP
- `GET/PUT /admin/acl/policy` — read or set default action (`allow`/`deny`)
- `GET/POST/DELETE /admin/acl/rules` — manage tag-based ACL rules
- `POST/DELETE /admin/spokes/{id}/tags/{tag}` — manage spoke tags

Common status codes: `400` invalid body, `401` auth failure, `404` not found, `409` conflict (IP in use, pubkey in use, or active-spokes guard on network change), `500` internal.

## The data model

Key design decisions in `pkg/store/`:

**Soft revoke + partial unique indexes.** Revocation sets `revoked_at`; "active" everywhere means `WHERE revoked_at IS NULL`. Partial unique indexes scope `(tenant_id, pubkey)` and `(tenant_id, assigned_ip)` to active rows — so a revoked spoke's key and IP can be immediately reused by a new enrollment.

**Stable identity through key rotation.** `Enroll` with a reroll-bound token rotates `pubkey` (and `device_pubkey`) while preserving the durable `id` and `assigned_ip`. The spoke keeps its overlay identity (`10.20.0.x`) across key rotations. Old stats keyed by the previous pubkey are dropped.

**Serializable mutations.** `Enroll` and `UpdateSpokeIP` run at serializable isolation — concurrent callers cannot pick the same IP. Sentinel errors: `ErrTokenInvalid`, `ErrSpokeNotFound`, `ErrIPConflict`, `ErrIPExhausted`, `ErrPubKeyInUse`, `ErrActiveSpokes`.

**IP allocation.** `nextFreeIP` walks the subnet from `hub.Next()` (the address after the hub IP) and skips three reserved addresses: the hub IP itself, the network address, and the broadcast/last host.

**DB-authoritative network config.** `store.New` seeds `network_settings` from env on first start (`ON CONFLICT DO NOTHING`), then loads the persisted row as the in-memory authority. An admin's subnet edit survives a control-plane restart. `SetNetworkConfig` rejects changes while active spokes exist unless `force=true` (`ErrActiveSpokes`).

**Single-tenant today.** Every table carries `tenant_id DEFAULT 'default'` so multi-tenant can be enabled later without a destructive migration.

## The ACL pipeline

Microsegmentation is tag-based and compiled centrally, enforced concretely on the hub:

```
Admin tags spokes + authors rules (src_tag→dst_tag, proto, ports, allow/deny) + default_action
  ↓
compileACL (acl_compile.go)
  resolve each tag → active spoke IPs
  expand '*' wildcard → all active spoke IPs
  emit one concrete rule per (src_ip, dst_ip) pair, skip self-pairs
  ↓
GET /hub/acl → { default_action, rules: [ {src_ip, dst_ip, protocol, port_start, port_end, action} ] }
  ↓
Hub: RenderACLRestore → iptables-restore payload
  ↓
ApplyACL → dedicated DEFENDER-FWD chain, atomic every 10s via --noflush
```

Key properties:
- The chain is installed **only for spoke-to-spoke traffic** (`-i wg-defender -o wg-defender`), preferring `DOCKER-USER`, falling back to `FORWARD`.
- A `conntrack ESTABLISHED,RELATED → ACCEPT` rule at the top ensures replies bypass per-rule checks.
- Before the first successful apply, the chain is absent → **fail-open**. After that, it's never empty.
- On non-Linux, `ApplyACL` is a no-op.
- The `*` wildcard expands at compile time to concrete IPs — the hub never sees tag names.

## 🧠 Active recall

1. Name the three trust tiers, the auth mechanism for each, and two example endpoints from each tier.
2. What is 'stable identity' in the context of spoke re-roll, and which database fields change versus which stay the same?
3. Trace an ACL rule from admin authoring to iptables enforcement: what transformations happen at each stage, and what does the `*` wildcard mean at compile time versus at enforce time?
