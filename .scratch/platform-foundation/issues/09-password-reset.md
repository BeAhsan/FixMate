# 09: Recover an account by resetting its password

**What to build:** A person who has forgotten their password can recover the
account themselves, at any of the four applications, without asking an
administrator. The reset link works exactly once, expires, and changes only the
account it was requested for. Because the four stores are separate, this is four
independent flows that share no state — the second of the three security
properties, and the one where a scoping mistake silently changes the wrong
person's password.

**Implementation, concretely (revised — Fortify has since been removed):**
- Four password brokers already exist in `config/auth.php`, one per account type, each with its own provider (`users`, `workers`, `admins`, `super_admins`). Confirm `super_admins` is present; the others are.
- **Each store has its own reset-token table** (`password_reset_tokens`, `worker_password_reset_tokens`, `admin_password_reset_tokens`, and the super-admin equivalent). Isolation comes from the broker's provider, and separate tables make a cross-store token physically impossible rather than merely unlikely.
- Select the broker explicitly: `Password::broker('workers')`. Never mutate `config('auth.passwords')` at runtime.
- Use core Laravel's `Password` broker. There is no Fortify involvement and no `ResetsUserPasswords` interface to implement.
- Delivery is a problem to solve, not skip: there is no mail transport configured. Whatever you choose, a reset link that cannot be delivered in a test is not a demonstrated flow. Say plainly in your report how delivery is faked, and make sure the test does not depend on a real mail server.
- Throttle reset requests per account type, as sign-in is. A reset endpoint that is not throttled is a mail-flooding vector and an enumeration aid.

**Blocked by:** 06 (worker sign-in), 07 (staff sign-in)

**Status:** ready-for-agent

- [ ] A reset link can be requested at each of the four applications
- [ ] The link works exactly once, so a forwarded email cannot be reused
- [ ] The link expires, so an old message in an inbox cannot be used later
- [ ] Only the account the reset was requested for is changed
- [ ] Requesting a reset for an address that does not exist reveals nothing
- [ ] The new password is checked for acceptability before it is accepted
- [ ] Signing in with the new password works, and the old one no longer does
- [ ] A person holding two account types can reset each independently
- [ ] A reset token issued for one store cannot be redeemed against another store
- [ ] Reset requests are throttled per account type
- [ ] Each of the four flows is covered independently
