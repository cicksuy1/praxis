Without re-reading, explain in plain prose (3–5 sentences) to a teammate who knows networking but has never seen this codebase:

1. Why the control plane never sends requests to the hub.
2. What happens to VPN traffic for an existing spoke during the 10-second window after an admin revokes it.
3. Which process writes to the database and which process reads from it, and why.

Then predict: if the control plane goes down for 60 seconds, does the hub stop passing VPN traffic for already-enrolled spokes? Why or why not?
