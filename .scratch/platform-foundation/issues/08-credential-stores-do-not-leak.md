# 08: Prove the four credential stores do not leak into each other

**What to build:** A hard guarantee, asserted from outside, that the four
credential stores are genuinely separate now that all four exist. A valid
credential from one store is refused by the other three, and no endpoint reveals
whether an address exists in a different store. This is invisible from the inside
of the code, and a refactor that quietly made one endpoint fall back to another
table would fail no other test — so it gets its own ticket and its own tests.

**Blocked by:** 06 (worker sign-in), 07 (staff sign-in)

**Status:** ready-for-agent

- [ ] For each of the four applications, a valid credential from each of the other three stores is refused
- [ ] An address that exists in one store but not another produces an indistinguishable response at the store where it is absent
- [ ] Throttling one endpoint does not lock the same address out of the other three
- [ ] No endpoint's response body, status, or timing reveals the existence of an account in another store
- [ ] Signing in to one application is not affected by an account of the same person in another store
- [ ] Every case above is asserted through HTTP, not by reaching past the HTTP layer
