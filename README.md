# Alignment Arcade

Alignment Arcade is a collection of playable experiments about intelligence,
trust, coordination, and what happens when the objective is slightly wrong.
Across the collection, you play both sides: the AI and the overseer, whether
that overseer is a grader, judge, detective, or someone else trying to keep
control.

The games explore alignment through deception, weak supervision, debate,
interpretability, collusion, hidden objectives, trait drift, and shutdown
decisions. They turn those ideas into choices under uncertainty, where evidence
is limited, incentives matter, and the overseer can be wrong too.

Play the collection at [games.meowc.at](https://games.meowc.at/).

## Repository

Each top-level game directory is an independent Git repository with its own
history and remote, and is ignored by this parent repository.

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

## Caddy

The reusable Caddy routes take two import arguments:

1. The public URL prefix, such as `/games`.
2. The absolute path to this workspace on the host.

To mount the arcade beneath an existing site:

```caddyfile
example.com {
    # Existing site directives can remain here.
    import /path/to/alignment-arcade/server/games.routes.caddy /games /path/to/alignment-arcade
}
```

This serves the index at `https://example.com/games/` and each game beneath its
slug. To use a dedicated subdomain with no path prefix, pass an empty quoted
first argument:

```caddyfile
games.example.com {
    import /path/to/alignment-arcade/server/games.routes.caddy "" /path/to/alignment-arcade
}
```

No Caddy environment variables are required. The imported routes do not include
a catch-all, so unrelated routes in an existing site block remain available.
The server-backed games are proxied to the fixed loopback ports `7410` through
`7413`; keep `npm start` running alongside Caddy.

The standalone `server/Caddyfile` provides a local `/games` configuration. More
details and the complete route list are in `server/README.md`.

`games.tsv` lists repositories managed by the workspace. Its optional fourth
column records a public game slug. Run:

```sh
./sync-games.sh
```

Missing games are cloned. Existing games are fetched and fast-forwarded to the
latest commit on their configured branch. Before processing the manifest, the
script also checks out and fast-forwards this root repository's `main` branch.
It stops rather than changing an unexpected remote or creating a merge commit.
