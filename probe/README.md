# China probe: Docker Compose operations

Production uses Docker Compose, not Kubernetes. Run exactly one `cn` reporter:
multiple reporters overwrite the same `(ts, region)` rows. Keep bot monitors
assigned to `cn`.

## Production topology

Verified on 2026-11-03 over SSH alias `yunacelisse` (`100.66.88.34`):

| Component | Configuration | Endpoint |
| --- | --- | --- |
| QQ bot | `/home/yunacelisse/stacks/huajibot/compose.yaml` | `100.66.88.34:8787/healthz` |
| Telegram bot | `/home/yunacelisse/stacks/huajibot-tg/compose.yaml` | `100.66.88.34:8788/healthz` |
| Traefik | `/home/yunacelisse/traefik/compose.yaml` | `:24444/{qq,tg}/healthz` |
| Dedicated tunnel | `frpc-bot.service`, `/etc/frp/frpc-bot.toml` | `38.92.9.143:9007` |
| Status backend | Cloudflare Worker `heartbeat`, D1 `heartbeat` | `https://status.nbtca.space` |

Both bots use host networking, user `1000:1000`, their project directory mounted
at `/app/data`, and image `ghcr.io/nbtca/huaji-bot-dotnet:sha-4e477fa19dc97e3071e9015698c3a788f1d9c9b8`.
Traefik also uses host networking. Its dynamic routes are in
`~/traefik/data/dynamic/bot-health.yaml` and `huaji-rules.yaml`.

```text
Compose probe -> GET status.nbtca.space/api/config (Bearer PROBE_TOKEN)
              -> GET 38.92.9.143:9007/{qq,tg}/healthz
                 -> HK frps -> frpc-bot -> 127.0.0.1:24444
                 -> Traefik -> 100.66.88.34:{8787,8788}/healthz
              -> POST status.nbtca.space/api/ingest (Bearer PROBE_TOKEN)
                 -> D1 -> /api/status
```

Keep the external relay targets to test the tunnel as well as the bot. Hosting
the probe beside the bots shares a host failure domain; the Worker must report
probe loss independently. Telegram health currently reflects startup GetMe
success and does not establish ongoing polling health.

All six health endpoints returned 200 during inspection, but `probes.cn` was
null. No probe was found in readable Compose, systemd, or user cron definitions.
The SSH user could not list Docker containers or use passwordless sudo, so this
is not proof that no probe exists anywhere. Confirm with Docker access before
starting a reporter. No production deployment is claimed by this document.

## Credentials

The Worker has a `PROBE_TOKEN` secret. GitHub Actions has a separate
`CLOUDFLARE_API_TOKEN` for Worker deployment and a `CLOUDFLARE_ACCOUNT_ID` variable.
The Cloudflare API token is not the probe token. Neither GitHub Actions secrets
nor Worker secrets expose their stored values through their listing APIs.

From an authenticated checkout, `npx wrangler secret list` verifies secret names
without printing values. This machine's Wrangler session could list the Worker
secret during inspection; authorization must be checked again before a change.
No usable probe token value was found in the checkout or bot deployment files.

Use the existing probe token if available from its owner. Otherwise coordinate a
rotation: store a newly generated random token in the server's private `.env`,
then set the same value using `npx wrangler secret put PROBE_TOKEN` for the
`heartbeat` Worker. Provision before starting the container, and validate config
authorization afterwards. Rotation invalidates any other reporter using the old
value; first check for one. Never put tokens in Git, PRs, shell arguments, logs,
or `docker compose config` output (use `config --quiet`). Keep `.env` mode 600.
Do not rotate bot, frp, or Cloudflare API credentials for this deployment.

## Install on the bot host

Use `/home/yunacelisse/stacks/heartbeat-probe` as a separate Compose project.
It needs Docker Compose v2 and permission to access Docker. This is independent
of the bot projects; do not restart them or shared `frpc`/`frpc-cloud` services.
The host's Node 12 is irrelevant: the probe image supplies Node 24.

Copy `probe/compose.yaml` and `probe/.env.example` to that directory as
`compose.yaml` and `.env`. Use a protected editor or secret provisioning tool to
fill `PROBE_TOKEN`, and set `PROBE_IMAGE` to a published full commit SHA or digest.
CI publishes images only after merge to main; a PR SHA is not yet published.
The optional local build requires the full checkout with `probe/` and `src/`;
the copied two-file deployment must use `--no-build`.

```sh
cd /home/yunacelisse/stacks/heartbeat-probe
chmod 600 .env
docker compose --env-file .env config --quiet
docker compose --env-file .env pull probe
docker compose --env-file .env up -d --no-build --wait --wait-timeout 300 probe
docker compose ps
docker compose logs --tail=100 probe
```

The default image is GHCR. If unreachable, set `PROBE_IMAGE` to the same published
SHA via `ghcr.mirror.nbtca.space/nbtca/heartbeat-probe:<sha>` after verifying mirror
availability. The container uses bridge networking, no published ports, no host
mounts, a read-only filesystem, resource limits, and bounded logs. It needs
outbound DNS, HTTPS to the Worker, and access to configured monitoring targets.

For a local checkout build, use a distinct local tag in the private `.env`, then
`docker compose --env-file probe/.env -f probe/compose.yaml build probe` and
`docker compose --env-file probe/.env -f probe/compose.yaml up -d --no-build probe`.

## Diagnose and accept

```sh
docker compose exec -T probe node --input-type=module -e '
for (const path of ["qq", "tg"]) {
  const r = await fetch(`http://38.92.9.143:9007/${path}/healthz`, {signal: AbortSignal.timeout(10000)});
  console.log(path, r.status, await r.text());
}
const r = await fetch(`${process.env.HEARTBEAT_URL}/api/config`, {
  headers: {authorization: `Bearer ${process.env.PROBE_TOKEN}`}, signal: AbortSignal.timeout(10000)
});
console.log("config", r.status);
await r.body?.cancel();
console.log("clock", new Date().toISOString());
'
docker compose exec -T probe node -e "fetch('http://127.0.0.1:8080/readyz').then(async r=>console.log(r.status,await r.text()))"
```

Authenticated config should return 200 (unauthenticated 401 is expected). Ingest
rejects clock skew over 300 seconds. Distinguish DNS/connection failures, config
401, ingest 400, and successful ingest containing failing service checks.
On the host, PushPanel binds the Tailscale IP: `127.0.0.1:8787` is not a valid
check. Traefik `127.0.0.1:24444/{qq,tg}/healthz` is valid. Inspect
`systemctl status frpc-bot` and `~/traefik/data/access.log` for the relay hop.

`/healthz` returns 200 if a cycle completed in the last 180 seconds (including
startup grace). `/readyz` requires successful ingest in that time; it starts at
503. Responses contain only live/ready flags, last ingest Unix milliseconds and
consecutive failed cycles. A monitored bot returning 503 still counts as a
healthy probe when its result is successfully uploaded.

Compose health uses `/readyz`. Docker marks it unhealthy on stale reporting;
`restart: unless-stopped` restarts exited containers, not unhealthy containers.
Inspect logs and `/healthz` before recreating a stalled process. Do not assume
Docker automatically restarts it. Worker outages should not create restart loops.

Observe at least five consecutive minutes of ingest success. `/api/status` must
show a recent advancing `probes.cn` timestamp and operational bot monitors while
both bots are connected. Confirm periodic health requests in Traefik access logs.
Record the deployed image SHA, observation time and results in issue #3; code
checks alone do not resolve the production incident.

## Upgrade and rollback

Record the current `PROBE_IMAGE` before changing it. Set the replacement SHA,
then pull and run `up -d --no-build --wait` as above. Compose replaces the single
service rather than scaling reporters; expect a brief observation gap.
To roll back, restore the previous image reference and repeat pull/up. Image
rollback does not restore Worker secrets: preserve coordinated credentials.
`docker compose down` stops only this standalone probe project.

Worker cron emits probe loss/recovery notifications, including an initial loss
when no historical state exists, provided `NOTIFY_URL` and `NOTIFY_TOKEN` work.
Existing nodata events are not re-alerted on deployment of this change. Delivery
failures are not retried by this PR; verify the independent notification channel
when accepting the deployment.
