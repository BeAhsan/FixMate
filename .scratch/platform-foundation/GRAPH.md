# Task graph — spec 0001 platform foundation

Spec: `docs/specs/0001-platform-foundation-authentication-and-dashboards.md`
24 tickets under `issues/`, numbered in dependency order. 20 run by agents,
4 by a human.

## The graph

```
01 pure API back end
└─ 02 four credential stores
   └─ 03 sign in as an end user (tracer bullet) ──┬─ 04 indistinguishable failures
                                                   ├─ 05 throttle repeated failures
                                                   ├─ 06 worker sign-in ──┬─ 08 stores do not leak
                                                   │                      └─ 09 password reset
                                                   ├─ 07 staff sign-in ───┬─ 08 stores do not leak
                                                   │                      ├─ 09 password reset
                                                   │                      └─ 10 authorisation ── 11 super-administer
                                                   │
                                                   └─ 12 generated typed client ─┬─ 13 monorepo skeleton
                                                                      │             └─ 14 first app, static export ─┬─ 15 wired to back end ── 16 session layer ─┬─ 18 other three apps ──┐
                                                                      │                                                  └─ 17 shell + UI ────────────────────────┘                            │
                                                                      │                                                                                                                  └─ 19 dashboard data ───┤
                                                                      └─ 20 PR gate                                                                                                                          │
                                                                                                                                                     ▼
                                                            21 compose services  ── 22 set deploy  ── 23 record + roll back  ── 24 pipeline: five images
                                                            ▲                                                                                            ▲
                                                            └──────────────────────── human-run ────┴──────────────────────────────┘
```

## Frontier

| Ticket | Why it is unblocked |
| ------ | ------------------- |
| 01 | Nothing precedes it. The pure-API strip is independent groundwork. |

One ticket wide right now. When 01 lands, 02 opens; when 03 lands the graph fans
into two independent chains — the **account chain** (04/05/06/07 → 08/09/10 → 11)
and the **contract chain** (12 → 13/20 → 14 → 15/17 → 16 → 18/19). That fan-out
is the only place real concurrency exists.

**Depth of the critical path: 13.**
`01 → 02 → 03 → 12 → 13 → 14 → 15 → 16 → 18 → 21 → 22 → 23 → 24`

Everything above 20 is agent work. The last four are human work and form their
own serial chain, because each one is verified against the live server before the
next begins.

## What changed when the graph was split

The first cut was 16 tickets. Three were judged too coarse:

- **The sign-in tracer bullet** became 03 (the thin complete path), 04
  (indistinguishable failures) and 05 (throttling). The tracer bullet stays
  demoable on its own; the two security properties get their own tickets because
  each is a distinct property no other test would catch.
- **Adding an account type** became one ticket per type — 06 worker, 07 staff.
  Each is a genuine vertical slice (a worker can now sign in at the worker app),
  and 06 is where the pattern proves it generalises rather than having been built
  to fit one case.
- **The monorepo** became 13 (workspace resolves and builds), 14 (static export
  survives a container) and 15 (talks to the real back end). Each is separately
  verifiable, and 13 in particular delivers a workspace with no application in
  it — that is deliberate, because a broken workspace is the failure that would
  block every later front-end ticket at once.
- **The deploy work** became 21 to 24, human-run. It is the only work that
  rewrites how a live server runs containers, and it is now split so that each
  step is rehearsable before the next depends on it.

## Ordering rules that matter

- **03 is a tracer bullet, not groundwork.** It ships something a person can
  actually do. 01 and 02 are the only tickets that do not.
- **The three security properties are separate tickets** — 04 credential
  indistinguishability, 08 cross-store isolation, 09 reset scoping, 10
  server-side authorisation. Each is invisible from inside the code, and merging
  them produces one large ticket that is hard to review and hard to land.
- **20 is the last agent ticket.** Everything after it touches the live server.
- **21 to 24 are serial and human-run.** Each is verified against the server
  before the next begins, and 24 is the first point at which the whole set ships
  together.

## Not ticketed

Out of scope in the spec, and deliberately absent rather than deferred:

- A front door with hostnames and TLS, a domain name, and the reverse proxy. The
  interim arrangement is IP and port over plain HTTP on a private network.
- The business domain, roles, bookings, payments.
- Second and subsequent bounded contexts. Identity and Access is the only one.
- Two-factor authentication. Fortify's installer would add three columns for it;
  ticket 02 keeps them out.
