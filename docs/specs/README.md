# Specs

Design documents for FixMate, one file per spec. Numbered sequentially, matching
the `docs/adr/` convention already used in this repo.

## Why specs live here and not in the issue tracker

Both, for different jobs, and the split is deliberate:

- **A spec file is the source of truth.** It is versioned next to the code it
  describes, so `git log` shows when a design changed and alongside which code
  change. A design document that lives only in a closed issue is hard to find
  later and harder to revise.
- **The issue tracker is the work queue.** It carries the triage state — what is
  being worked on, what is blocked, what is done. A spec issue should link here,
  not duplicate the prose.

So: write the spec here, publish an issue that links to it. Never paste the
whole spec into the issue body — a copy with no owner drifts from the original.

## Index

| # | Spec | Status | Issue | Supersedes |
| - | ---- | ------ | ----- | ---------- |
| [0001](0001-platform-foundation-authentication-and-dashboards.md) | Platform foundation — authentication and dashboard shell for four front-end apps | Draft | _not yet published_ | — |

## Conventions

- **Numbering** is sequential and permanent. A spec's number is never reused and
  never renumbered, even if the spec is withdrawn, so links and issue references
  stay valid.
- **Filenames** are `NNNN-kebab-case-summary.md`. Keep the summary short enough
  to read in a file listing.
- **Status** is one of `Draft`, `Accepted`, `Superseded`, `Withdrawn`. `Draft`
  means still being argued about. `Accepted` means an implementation is building
  from it. Update this index when the status changes.
- **Superseded specs are not deleted.** Set the status, point the `Supersedes`
  and `Superseded by` columns at each other, and leave the file. Knowing what
  was decided, and that it changed, is the point.
- **A spec is immutable once accepted.** Changes after acceptance are a new
  numbered spec that supersedes it, not an edit. The exception is a typo or a
  broken link.

## Relationship to ADRs

Specs and ADRs answer different questions and do not overlap:

- A **spec** says what a body of work is trying to achieve and what it will
  include. It is a statement of intent, written before the work.
- An **ADR** in `docs/adr/` records a decision that was *contested* — a choice
  between real alternatives, where the reasoning matters more than the outcome.
  Most implementation decisions do not deserve one.

A spec that resolves a genuinely hard architectural choice should link to the ADR
rather than restate it. A decision that reverses something an earlier spec
established is a strong candidate for an ADR.
