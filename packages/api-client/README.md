# @fixmate/api-client

The single place that knows how to talk to the FixMate back end. All four
applications import from here and from nowhere else.

## What is generated and what is written

| Path | Committed? | What it is |
|---|---|---|
| `src/generated/**` | **No** | Produced by `php artisan api-client:generate` from this repository's routes. Gitignored. |
| `contract.json` | Yes | The front ends' recorded expectation of the API: one entry per operation, naming the route, the verb and the URL. |
| `openapi.json` | Yes | The API described for people and for OpenAPI tooling: schemas, descriptions, security requirements, error responses. |
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

Changing a route means changing four things together, and both checks below fail
until they agree:

1. `routes/api.php` on the back end.
2. `contract.json` here — the new URL.
3. `operations.ts` here — the new response shape, if it changed.
4. `openapi.json` here — the description, and its security requirement.

Step 2 is a deliberate duplicate of something the back end already knows. A
drift check cannot detect a change it has no independent record of. Step 4 is
the same argument about a different reader: the document is committed
independently of the contract, so it can be updated alone and go wrong alone.

## The drift checks

```sh
php artisan api-client:check   # does the generated client still match contract.json?
php artisan api-docs:check     # does openapi.json still describe the API?
```

The first regenerates the client from the back end's actual routes and fails if
the result no longer matches `contract.json`. It fails in both directions — a
moved route and a newly added one — because both break a front end.

The second asks a different question, which is why it is a separate command
rather than another clause in the first. `contract.json` records four fields: a
name, a route, a verb and a URL. It has nowhere to record that a route needs a
token, so nothing in the first check would notice a document describing
`GET /admins/{admin}` as reachable without one. The second check reads the
route's own gathered middleware instead of trusting the sentence, and compares
it against three things the document claims: whether the operation is secured,
which account type it names in `x-required-account-type`, and which ability in
`x-required-ability`. It also follows every `$ref` and fails on one that points
at a schema that is not there.

The two overlap on purpose. Both read the same route table, and both compare a
committed description against it, because the two descriptions are committed
independently and either can be updated alone.

Generation is isolated in `app/Console/Commands/GenerateApiClient.php`, the only
file in the repository that knows Wayfinder's command line. Wayfinder is in
public beta; when its interface changes, the fix is there.
