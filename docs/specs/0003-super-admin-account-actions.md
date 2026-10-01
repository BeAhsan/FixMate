# Spec: Super administrator account actions — suspend and promote administrators

## Problem Statement

Spec 0002 delivers the account directory — the read half of the account-management
surface. This spec is the write half: story 39 (suspend an administrator without
deleting them), story 41 (promote an administrator, with a warning when the role
is held by more than a couple of people), and story 42 (nobody suspends or deletes
their own account).

Like the directory, the back end exists and is covered:
`POST /api/v1/identity/admins/{admin}/suspend` and
`POST /api/v1/identity/admins/{admin}/promote`, each guarded by its own ability
(`accounts:suspend` and `accounts:promote`), with the promote use case refusing a
self-promotion and warning when more than a couple of super administrators would
result. The contract and client definitions carry both operations. What does not
exist is any way to reach them from the super administrator application, and the
directory table has no actions column.

## Solution

The directory table gains a column that exists only on administrator rows:
**Suspend** on every administrator other than the signed-in caller, and
**Promote** on the same rows, each a confirmed, single-purpose action that
reports its outcome in place and refreshes the row from the response the back
end returns.

Two actions rather than one control, because the back end guards them with two
different abilities on purpose: withdrawing access and handing out the wildcard
are different powers, and sharing an ability would mean granting one granted the
other.

## User Stories

1. As a super administrator, I want to suspend an administrator from their row in
   the directory, so that removing access does not require a second screen.
2. As a super administrator, I want to confirm before a suspension takes effect,
   so that a mis-click does not withdraw somebody's access.
3. As a super administrator, I want the suspended row to show its new status
   immediately, so that the screen agrees with the back end without a reload.
4. As a super administrator, I want to promote an administrator and be warned
   when the role would be held by more than a couple of people, so that the
   most powerful account type stays narrow and deliberate.
5. As a super administrator trying to suspend or promote myself, I want a clear
   refusal rather than a mystery 409, so that I understand the rule that stopped
   me.
6. As a super administrator acting on an account another super administrator has
   just changed, I want the conflict told plainly and my row refreshed, so that
   I am not acting on a stale screen.
7. As a super administrator without the suspend or promote ability, I want no
   action offered on any row, so that the interface never offers what the server
   would refuse.

## Implementation Decisions

- The actions column renders only for rows whose `type` is `admins`; other types
  carry no actions, and no control is invented for them.
- Buttons are gated on the session's abilities (`accounts:suspend`,
  `accounts:promote`), so a super administrator whose token lacks one — the
  hypothetical future narrow token — is not offered the action either.
- Both actions confirm before acting. The exact mechanism (inline confirm state
  on the button, or a dialog) is an implementation choice for the build, not a
  decision this spec needs to settle; the requirement is that no single click
  suspends anybody.
- The response of each action is an `AdminAccount` — the back end returns the
  fresh record — so the row is updated from the response rather than guessed,
  and a second listing request is not spent.
- The promote warning travels in the response body (`warning`), not as a
  separate request, and is rendered beside the promoted row.
- A 409 (self-suspend, self-promote, or an account already in the target state)
  and a 404 (the account was deleted upstream, though this surface never
  deletes) are both surfaced as messages on the row, and the directory is
  refreshed rather than trusted.
- Spec 0002's `AccountSummary` rows are extended client-side with the actions
  column only; the directory response shape itself is unchanged, so no contract
  change is needed here either.

## Testing Decisions

- Backend: no new tests. `SuperAdministerAccountsTest` already covers both
  actions over HTTP, including self-suspension and self-promotion refusals and
  the warning's presence.
- Client: the same three seams as 0002 — real-client tests for both operations,
  per-application binding assertions, and markup tests for the actions column,
  its ability gating, the confirm state, and the in-place row update.
- A markup test asserts an end-user row renders no actions column content at
  all, since the column's very existence is conditional on the row type.

## Out of Scope

- Suspending or promoting users, workers or super administrators. The back end
  refuses these by design; no contract is invented.
- Reinstatement. Restoring a suspended administrator is a status change back,
  and the back end has no route for it yet; when it is wanted it is its own
  contract change and its own spec.
- An audit trail of who suspended or promoted whom. Spec 0001 places this out of
  scope and nothing here changes that.

## Further Notes

Builds directly on 0002's page, table and states; the two specs are sequenced so
that the read surface proves itself before the write surface hangs off it. The
operations this spec presents already exist in `@fixmate/api-client`'s
definitions exactly as `listAccounts` did — the implementation work is the same
three-layer shape: expose in the client, bind per application, render.
