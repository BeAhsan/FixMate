# @fixmate/api-client

The single place that knows how to talk to the FixMate back end. All four
applications import from here and from nowhere else.

## What is generated and what is written

| Path | Committed? | What it is |
|---|---|---|
| `src/generated/**` | **No** | Produced by `php artisan api-client:generate` from this repository's routes. Gitignored. |
| `contract.json` | Yes | The front ends' recorded expectation of the API: one entry per operation, naming the route, the verb and the URL. |
| `src/operations.ts` | Yes | Binds each generated route function to a request shape and a response shape. |
| `src/http.ts` | Yes | The fetch wrapper: base URL, token attachment, JSON handling, response validation, error normalisation. |
| `src/errors.ts` | Yes | `ApiError` and the one status-to-kind mapping. |
| `src/schema.ts` | Yes | A small runtime schema used to check responses. |

Wayfinder generates route **functions** — URL and verb. It generates nothing for
a request or a response body, because it reads routes, not payloads. So the
shapes in `operations.ts` are hand-written, and that is the only hand-written
part of the contract.

## Working on it

The generated directory is not committed, so it has to exist before anything else
works. From the repository root:

```sh
php artisan api-client:generate   # writes src/generated
npm install                       # once, from the root: npm workspaces
npm run typecheck --workspace=@fixmate/api-client
npm test --workspace=@fixmate/api-client
```

## Changing an endpoint

Changing a route means changing three things together, and
`php artisan api-client:check` fails until all three agree:

1. `routes/api.php` on the back end.
2. `contract.json` here — the new URL.
3. `operations.ts` here — the new response shape, if it changed.

Step 2 is a deliberate duplicate of something the back end already knows. A
drift check cannot detect a change it has no independent record of.

## The drift check

```sh
php artisan api-client:check
```

Regenerates the client from the back end's actual routes and fails if the result
no longer matches `contract.json`. It fails in both directions — a moved route
and a newly added one — because both break a front end.

Generation is isolated in `app/Console/Commands/GenerateApiClient.php`, the only
file in the repository that knows Wayfinder's command line. Wayfinder is in
public beta; when its interface changes, the fix is there.
