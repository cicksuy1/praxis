Without re-reading, answer the following:

1. A spoke is revoked at 12:00:00. A new spoke enrolls at 12:00:05 and the control plane assigns it the same IP address. Is this possible? Explain the database mechanism that makes it safe (or unsafe).
2. An admin creates an ACL rule: `src_tag=backend, dst_tag=database, protocol=tcp, port=5432, action=allow`, with `default_action=deny`. There are two backend spokes (10.20.0.2, 10.20.0.3) and one database spoke (10.20.0.4). List every concrete rule in the compiled output from `compileACL`, including the implicit default.
3. An admin calls `PUT /admin/network` with a new subnet while 3 spokes are active and `force` is not set. What happens and why? What would need to be true for the call to succeed?
4. Explain the difference between `revoked_at` soft-delete and a hard `DELETE` in terms of what the partial unique index enables.
