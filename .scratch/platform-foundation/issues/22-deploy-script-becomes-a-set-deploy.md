# 22: Make the deploy script deploy the set

**Run by:** you, not an agent. This rewrites the deploy path against a live
server. The ordering below is load-bearing — the migration runs against the new
image while the old containers still serve, which is what keeps a failed deploy
recoverable. Do not reorder it to "save time".

**What to build:** The deploy script pulls all five images, migrates, brings all
five up, and then health-checks each one independently, so that one broken front
end is identified rather than reported as a general failure. The existing
single-image behaviour is preserved for the application service; what is new is
that the front ends travel with it.

**Blocked by:** 21 (compose services for four front ends)

**Status:** ready-for-human

- [ ] The script pulls all five images before starting anything
- [ ] The migration runs against the new image while the old containers still serve
- [ ] All five services are brought up together
- [ ] Each component's health is checked independently, and a failure names which component failed
- [ ] A deployment is declared failed if any front end is unreachable from outside the server, not merely from inside it
- [ ] Any failure at any point rolls the whole set back
- [ ] The rule that a database migration is never reverted is preserved
- [ ] The staging form of the sync is preserved: one staging directory, the environment file excluded, and delete applied within each source's own tree
- [ ] The deployment is rehearsed on the target before it is trusted
