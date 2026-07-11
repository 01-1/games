# Games workspace

This repository tracks workspace-level files. Each top-level game directory is
an independent Git repository and is ignored by this parent repository.

The shared hosting configuration is the exception: `server/` belongs to this
root repository. Build every hosted frontend or start the server-backed games
from the workspace root:

```sh
npm ci
npm run build
npm start
```

The root package is an npm workspace containing every game with a
`package.json`. `npm ci` uses the root `package-lock.json` and hoists compatible
dependencies into the root `node_modules/`; npm keeps only packages that cannot
be safely flattened inside individual workspaces. Each game retains its own
manifest and can still be installed independently from its repository.

## Shared OpenRouter models

Server-backed games read `OPENROUTER_API_KEY` from the workspace-root `.env`.
Their selectable model catalog is shared through
`openrouter-models.config.json`: `freeModelRefreshIntervalMs` controls how often
the root server queries OpenRouter for currently free models, `paidModels` is the
explicit paid-model allowlist, and `defaultModel` selects the initial browser
choice. `fallbackFreeModels` keeps games usable when discovery is unavailable.
Model entries may be plain OpenRouter IDs or `{ "id": "provider/model", "name":
"Display name" }` objects. Paid models are never discovered automatically; adding
one to `paidModels` is the explicit opt-in to paid usage.

The root server refreshes the disk cache automatically. To force a refresh from
the server shell, run:

```sh
npm run models:refresh
```

There is intentionally no HTTP refresh endpoint. Browsers can select from the
published allowlist but cannot mutate or refresh it.

Caddy configuration and deployment examples live in `server/README.md`.

`games.tsv` lists repositories managed by the workspace. Its optional fourth
column records a public game slug. Run:

```sh
./sync-games.sh
```

Missing games are cloned. Existing games are fetched and fast-forwarded to the
latest commit on their configured branch. Before processing the manifest, the
script also checks out and fast-forwards this root repository's `main` branch.
It stops rather than changing an unexpected remote or creating a merge commit.

`still-there` currently has no `origin`, so it is local-only and is not listed
in the manifest. Add it to `games.tsv` after configuring its remote.
