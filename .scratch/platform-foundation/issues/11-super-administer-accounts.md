# 11: Manage accounts across the whole platform

**What to build:** A super administrator can see every account in the system,
across all four account types, in one place with each one's status, and can
suspend an account or promote an administrator. Access is withdrawn by suspending
a record rather than deleting it, so the record of what that person did survives.
Two deliberate guard rails apply: an administrator cannot suspend or delete their
own account, and the super administrator role is kept narrow.

**Blocked by:** 10 (ability-scoped authorisation)

**Status:** ready-for-agent

- [ ] A super administrator can list every account across all four account types, with each one's status
- [ ] A super administrator can suspend an administrator account without deleting the record
- [ ] A suspended account is signed out immediately, so a change in access takes effect at once rather than at next sign-in
- [ ] A super administrator can promote an administrator, and promotion is warned about when the role is held by more than a couple of people
- [ ] An administrator cannot suspend or delete their own account
- [ ] Each account type sees a different representation of the same person, so one type's view cannot leak another's fields
- [ ] Suspending is recorded on the account rather than removing it
- [ ] Every action is covered by a feature test
