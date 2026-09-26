# 10: Refuse what an account type may not do

**What to build:** Being signed in is not the same as being permitted. Each
account type carries a defined set of abilities, and endpoints enforce them on
the server. An end user who opens the browser console and calls an
administrative endpoint directly is refused, and gets a clear "not permitted"
answer rather than a broken page. This is the third security property: it is the
one that stops the user interface from being the only thing between a person and
data they should not see.

**Blocked by:** 07 (staff sign-in)

**Status:** ready-for-agent

- [ ] An end user is refused entry to the worker and administrator applications
- [ ] A worker is refused entry to the administrator application
- [ ] An administrator is refused the functions that belong to a super administrator
- [ ] Calling an administrative endpoint directly, without the interface, is refused
- [ ] A refusal is a clear response, not a broken page or an unhandled error
- [ ] An administrator cannot reach another administrator's records by guessing an identifier
- [ ] Signing in with an account of the wrong type is refused at the door with a message saying so
- [ ] A token cannot be used to perform an action its abilities do not cover, even if it is otherwise valid
- [ ] Every refusal is covered by a feature test
