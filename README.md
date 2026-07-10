# Games workspace

This repository tracks workspace-level files. Each top-level game directory is
an independent Git repository and is ignored by this parent repository.

The shared hosting configuration is the exception: `server/` belongs to this
root repository. Build every hosted frontend or start the server-backed games
from the workspace root:

```sh
npm run build
npm start
```

Caddy configuration and deployment examples live in `server/README.md`.

`games.tsv` lists repositories managed by the workspace. Its optional fourth
column records a public game slug. Run:

```sh
./sync-games.sh
```

Missing games are cloned. Existing games are fetched and fast-forwarded to the
latest commit on their configured branch. The script stops rather than changing
an unexpected remote or creating a merge commit.

`still-there` currently has no `origin`, so it is local-only and is not listed
in the manifest. Add it to `games.tsv` after configuring its remote.
