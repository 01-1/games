# Games Server

Shared build, process, and Caddy configuration for the sibling game repositories.
It does not merge their Git histories and it intentionally does not serve a page at
the base prefix.

## Build and run

```sh
cd /absolute/path/to/games
npm run build
npm start
```

`npm start` runs the four server-backed games on loopback. Caddy serves the static
games and proxies the server-backed games. Start Caddy separately with the supplied
configuration:

```sh
GAMES_ROOT=/absolute/path/to/games \
GAMES_SITE=games.meowc.at \
GAMES_PREFIX= \
caddy run --config ./server/Caddyfile
```

That produces URLs such as `https://games.meowc.at/inverse/`.

To mount beneath an existing domain instead:

```sh
GAMES_ROOT=/absolute/path/to/games \
GAMES_SITE=meowc.at \
GAMES_PREFIX=/games \
caddy run --config ./server/Caddyfile
```

That produces URLs such as `https://meowc.at/games/inverse/`. Keep
`GAMES_PREFIX` empty or use a leading slash with no trailing slash.

If the domain already has a Caddy site block, import the route file directly:

```caddyfile
meowc.at {
    # Existing site directives can remain here.
    import /absolute/path/to/games/server/games.routes.caddy
}
```

The same `GAMES_ROOT` and `GAMES_PREFIX` environment variables apply.
The imported route file has no catch-all, so unrelated routes in an existing site
remain untouched. The standalone example `Caddyfile` returns 404 for the base
prefix and all unknown routes.

## Routes

- `alignment-interview-sleeper/`
- `checkpoint/`
- `inverse/`
- `money-game/`
- `scratchpad/`
- `the-colluders/`
- `the-debate/`
- `turnover/`
- `weak-supervisor/`

With the standalone `Caddyfile`, the base prefix and unknown routes return 404.

## Ports

The backend ports default to 7410-7413. Override them consistently for the process
launcher and Caddy with `SCRATCHPAD_PORT`, `COLLUDERS_PORT`, `DEBATE_PORT`, and
`TURNOVER_PORT`.
