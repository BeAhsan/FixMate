# 07: Sign in as an administrator or super administrator

**What to build:** The two staff account types sign in at their own
applications, each checked only against its own table. Administrators and super
administrators are deliberately separate stores rather than one staff table with
a flag, so that promoting someone moves a record instead of setting a flag, and
so the most powerful account type stays narrow and countable. Together with the
worker and end user, this completes the four doors.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] An administrator signs in at the administrator application's own address, checked against the admins table only
- [ ] A super administrator signs in at the super administrator application's own address, checked against the super admins table only
- [ ] Neither staff sign-in path can resolve a credential from a customer or worker table
- [ ] A super administrator's abilities are strictly broader than an administrator's
- [ ] Promotion is a record moving between stores, not a flag changing on one record
- [ ] Both paths are covered by feature tests asserting observable behaviour from outside
