# Games Server

Shared build, process, and Caddy configuration for the sibling game repositories.
It does not merge their Git histories. A shared landing page in `server/site/` is
served at the base prefix and links to the independently hosted games.

## Build and run

```sh
cd /absolute/path/to/games
npm run build
npm start
```

`npm start` runs the four server-backed games on loopback. Caddy serves the static
games and proxies the server-backed games. The supplied standalone configuration
uses local defaults and requires no environment variables:

```sh
cd /absolute/path/to/games
caddy run --config ./server/Caddyfile
```

That serves the landing page at `https://localhost/games/`. The standalone file
imports `games.routes.caddy` with two arguments: the public URL prefix and the
workspace root.

To mount beneath an existing domain, import the route file with the values that
apply on that server:

```caddyfile
meowc.at {
    # Existing site directives can remain here.
    import /absolute/path/to/games/server/games.routes.caddy /games /absolute/path/to/games
}
```

That serves the landing page at `https://meowc.at/games/` and produces game URLs
such as `https://meowc.at/games/inverse/`. Requests to `/games` redirect to the
trailing-slash URL so relative site assets resolve beneath the prefix.

For a dedicated games subdomain, pass an empty quoted prefix:

```caddyfile
games.meowc.at {
    import /absolute/path/to/games/server/games.routes.caddy "" /absolute/path/to/games
}
```

The imported route file has no catch-all, so unrelated routes in an existing site
remain untouched. It claims only the base prefix, the landing page's
`styles.css` and `app.js`, and the game routes. The standalone example
`Caddyfile` returns 404 for all unknown routes.

## Routes

- `/` (shared game index, relative to the first import argument)
- `alignment-interview-sleeper/`
- `checkpoint/`
- `inverse/`
- `tragistea/` (The Money Game; legacy `money-game/` URLs redirect here)
- `scratchpad/`
- `the-colluders/`
- `the-debate/`
- `turnover/`
- `weak-supervisor/`

With the standalone `Caddyfile`, unknown routes return 404.

## Ports

The Caddy routes proxy the backends on the launcher's default ports 7410-7413.
If those ports are changed in the process environment, update the corresponding
`reverse_proxy` addresses in `games.routes.caddy` as well.
