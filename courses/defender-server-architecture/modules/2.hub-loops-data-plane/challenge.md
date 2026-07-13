Without re-reading, explain the `diffPeers` algorithm to a colleague:

1. What are its two inputs and what does it return?
2. Give a concrete example: desired = `[{A, 10.20.0.2/32}, {B, 10.20.0.3/32}]`, live = `[{A, 10.20.0.2/32}, {C, 10.20.0.4/32}]`. What does `diffPeers` produce?
3. Why is it important that all changes go out in one batched `IpcSet` rather than one call per change?

Then explain: a colleague says "spoke-to-spoke traffic is end-to-end encrypted because WireGuard encrypts everything." What would you tell them?
