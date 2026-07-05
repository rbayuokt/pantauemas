# Deployment

PantauEmas is one process with one SQLite file. Anything that can run Node
22.5+ or Docker and reach the internet can host it. One hard rule up front:
**never run two instances with the same bot token**. Telegram gives each
update to one poller, so two instances steal messages from each other and
log 409 errors.

## Docker on a VPS (recommended)

Fits next to other dockerized services. Resource cost is an idle Node process,
roughly 50 to 90 MB RAM and ~0% CPU between events.

```sh
git clone <your-repo-url> && cd pantauemas
cp .env.example .env       # paste TELEGRAM_BOT_TOKEN
npm install && npm run backfill    # one-time: seed price history
docker compose up -d --build
```

The compose file mounts `./data` into the container, so the database (users,
targets, history) survives rebuilds, restarts and image upgrades.

Useful commands:

```sh
docker logs -f pantauemas                              # watch it work
docker compose up -d --build                           # after a git pull
docker exec pantauemas npx tsx src/index.ts digest     # force a digest now
docker exec pantauemas npx tsx src/index.ts tick       # force a price check now
```

Careful with `docker exec` for long jobs: it runs inside the same container,
which is fine, but don't start a second `bot` process that way.

## Bare Node + systemd or pm2

Without Docker, the bot still needs to stay alive for polling, so plain cron
is not enough anymore. A minimal systemd unit:

```ini
[Unit]
Description=PantauEmas gold price bot
After=network-online.target

[Service]
WorkingDirectory=/path/to/pantauemas
ExecStart=/usr/bin/npx tsx src/index.ts bot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`tick` and `digest` remain available as one-shot commands for manual runs, but
the schedule lives inside the bot process either way.

## Backing up

Everything worth keeping is one file: `data/pantauemas.db` (plus `-wal`/`-shm`
siblings while running). Copy it anywhere on a schedule:

```cron
15 22 * * * sqlite3 /path/to/pantauemas/data/pantauemas.db ".backup /backups/pantauemas-$(date +\%a).db"
```

`.backup` is the safe way to copy a live SQLite database (plain `cp` can catch
it mid-write). Seven rotating daily backups by weekday name, done. If you
lose the price history it's rebuildable with `backfill`; losing `users` and
`watches` means everyone re-onboards, which is the part worth protecting once
friends are on board.

## Upgrading

```sh
git pull
docker compose up -d --build
```

The schema is created with `IF NOT EXISTS` on boot; additive changes apply
automatically. Anything more invasive will be called out in the commit.
