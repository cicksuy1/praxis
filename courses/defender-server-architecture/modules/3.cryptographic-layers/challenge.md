Without re-reading, answer the following:

1. A new engineer asks why there are three separate authentication layers when TLS already encrypts the connection. Write a 3–4 sentence explanation that covers what each layer protects and why the others can't substitute for it.
2. Explain why the enrollment token auth scheme stores a SHA-256 hash rather than the token itself, and why the transaction uses serializable isolation.
3. The PSK field is "plumbed but not used." Trace exactly what would need to change — in the DB, the store, and the control-plane API — to make it active. (No code needed; describe the changes in plain language.)
4. A spoke's WireGuard key is X25519. A colleague suggests reusing it to sign the `/spoke/config` poll. What is wrong with this suggestion?
