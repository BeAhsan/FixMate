# 04: Make sign-in failures indistinguishable

**What to build:** A person who signs in with the wrong details learns nothing
useful from the refusal. An address that has no account and a wrong password
produce the same response, so the endpoint never reveals which addresses have
accounts. A suspended account is told so plainly, because that is a real
condition with a real next step, not a credential problem. This is the first of
three security properties, each of which no other test would catch.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] An unknown address and a wrong password produce an identical response, in body and status
- [ ] The refusal names neither which part was wrong nor whether the address exists
- [ ] A suspended account is refused with a plain explanation that tells the person what to do next
- [ ] A suspended account is not described as a wrong password
- [ ] No credential comparison reveals, through timing or response, whether an address is registered
- [ ] Every case is asserted through HTTP, not by reaching past the HTTP layer
