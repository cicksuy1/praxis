## The three layers at a glance

| Layer | Where | Primitives | What it protects |
|---|---|---|---|
| 1 — Transport | `server.go` | TLS 1.2+, X.509 | Control-plane HTTP in transit |
| 2 — App-layer auth | `auth.go`, `server.go`, `spoke_config.go` | HMAC-SHA256 · SHA-256 · Ed25519 | Who may call which API endpoint |
| 3 — Data plane | `wireguard-go` (UAPI only) | Curve25519 · ChaCha20-Poly1305 · BLAKE2s · (opt) PSK | The VPN traffic itself |

## Layer 1 — TLS

The control plane serves HTTPS via `http.Server.ListenAndServeTLS` in `pkg/controlplane/server.go`, loading cert and key from `DEFENDER_TLS_CERT` / `DEFENDER_TLS_KEY`. This wraps everything — JSON bodies, bearer tokens, enrollment tokens — in TLS.

`DEFENDER_TLS_DISABLE=1` drops to plain HTTP for local dev. The CP logs a loud warning because **the HMAC bearer token then travels in cleartext**. The hub's HTTP client uses standard TLS verification (no skip-verify) when `DEFENDER_CP_URL` is `https://`.

## Layer 2 — App-layer authentication (three schemes)

Authentication is decoupled from transport. Even over TLS, every privileged call must prove who is calling.

**HMAC-SHA256 bearer** (`pkg/controlplane/auth.go`) guards **all `/hub/*` and `/admin/*`** routes:
```
token = hex( HMAC-SHA256( DEFENDER_HMAC_SECRET, "defender-control-plane-v0" ) )
```
The secret never crosses the wire — only its MAC does. Comparison uses `crypto/subtle.ConstantTimeCompare` (timing-attack resistant). Any mismatch returns a bare `401` with no detail.

**One-time enrollment tokens** (`pkg/controlplane/server.go`). `POST /enroll` is *not* behind the bearer wrapper — its credential is the token in the request body:
- Generated with **256 bits** from `crypto/rand`, hex-encoded.
- Only the **SHA-256 hash** is stored — the plaintext is never persisted.
- Consumed exactly once: `used_at` is set under a `FOR UPDATE` row lock inside a **serializable** transaction so concurrent callers can't race a token.
- TTL: **24h** for new enrollments, **15m** for re-roll tokens (key rotation is more sensitive).

**Ed25519 signed spoke-config** (`pkg/controlplane/spoke_config.go`). `GET /spoke/config` authenticates by signature:
```
message = "defender-spoke-config-v1" \n <wg-pubkey-base64> \n <unix-timestamp>
```
Passed via `X-Defender-Pubkey`, `X-Defender-Timestamp`, `X-Defender-Signature` headers. The server verifies with `ed25519.Verify` against the `device_pubkey` stored at enrollment, rejecting anything outside **±5 minutes** (replay protection).

*Why a separate Ed25519 key?* WireGuard keys are **X25519** — they do Diffie-Hellman key agreement, not signatures. To sign a config poll, enrollment optionally registers a dedicated Ed25519 device key alongside the WireGuard key.

## Layer 3 — WireGuard / Noise data-plane encryption

The VPN construction is:
```
Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s
```
(defined in `third_party/wireguard-go/device/noise-protocol.go:50`)

- **Handshake — Noise IKpsk2, 1-RTT.** `IK` = initiator already knows responder's static public key. `psk2` = optional pre-shared key mixed in at position 2.
- **Key agreement — Curve25519 (X25519) ECDH.** Ephemeral + static DH provides forward secrecy: even if the static key is later compromised, past sessions can't be decrypted.
- **KDF + transcript hash — BLAKE2s.** HKDF-style `KDF1/2/3` derive session keys from chaining keys. A rolling BLAKE2s hash binds the entire handshake transcript — any tampering breaks verification.
- **Optional PSK.** A 32-byte pre-shared key folded via `KDF3` at psk2 adds a post-quantum-ish symmetric hedge on top of the ECDH. **Currently plumbed but not used in V0**: the DB has no PSK column, `store.ActivePeers` returns an empty PSK, so every peer today runs with an all-zero PSK (equivalent to plain `IK`).
- **Transport — ChaCha20-Poly1305 AEAD.** Every data packet sealed with a 256-bit session key and 64-bit counter nonce; Poly1305 tags provide 16-byte authentication. A per-session **replay filter** rejects repeated or old counters.
- **Rekey / rotation.** Sessions rotate to fresh keypairs periodically; the previous keypair is briefly retained to decrypt in-flight packets.

The hub writes **no custom crypto** — all of this runs inside the vendored `wireguard-go` submodule, driven only by UAPI strings.

## 🧠 Active recall

1. What are the three cryptographic layers, what primitive does each use, and what does each protect? Answer from memory.
2. How is the HMAC bearer token derived, what message is MAC'd, and why does the secret itself never cross the wire?
3. What is the Noise construction used by WireGuard, and what roles do Curve25519, BLAKE2s, and ChaCha20-Poly1305 each play within it?
