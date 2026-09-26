# 09: Recover an account by resetting its password

**What to build:** A person who has forgotten their password can recover the
account themselves, at any of the four applications, without asking an
administrator. The reset link works exactly once, expires, and changes only the
account it was requested for. Because the four stores are separate, this is four
independent flows that share no state — the second of the three security
properties, and the one where a scoping mistake silently changes the wrong
person's password.

**Fortify implementation, concretely (from research):**
- Fortify does **not** ship `ResetUserPassword` or `UpdateUserPassword` classes — it publishes *stubs* implementing `ResetsUserPasswords` and `UpdatesUserPasswords` interfaces
- The published `UpdateUserPassword` stub hardcodes validation rule `current_password:web` — **each account type needs its own implementation** with the correct guard (`current_password:workers`, `current_password:admins`, etc.)
- Four password brokers in `config/auth.php`, each with its own provider (`users`, `workers`, `admins`, `super_admins`) — single shared `password_reset_tokens` table works because provider isolation prevents cross-resolution
- Explicit broker selection in controllers: `Password::broker('workers')->sendResetLink(...)` — no config mutation
- `Features::resetPasswords()` is the only Fortify feature enabled

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
- [ ] Each of the four flows uses its own `ResetsUserPasswords`/`UpdatesUserPasswords` implementation with the correct guard in validation
- [ ] Each of the four flows is covered independently
