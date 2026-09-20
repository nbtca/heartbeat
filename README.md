# heartbeat

Status page and uptime monitor for NBTCA services, served at <https://status.nbtca.space>.

- Every service is checked once a minute from two vantage points: Cloudflare's edge (`global`) and a probe inside the China cluster (`cn`).
- A check has to fail twice in a row before a service is marked down. A probe that stops reporting is shown as offline and ignored, so a dead probe never looks like an outage.
- The page shows 90 days of uptime per service, a live 60-minute trace, latency per region, TLS expiry, and incidents written as Markdown.
- Partial and major outages, recoveries, and probe dropouts are pushed to notification-center.

## How it works

```
Cloudflare Worker, cron every minute          China probe, k8s node with location=china
  checks from the edge                          checks from inside China
        │                                               │
        ▼                                               ▼
  D1: ticks, days, events  ◀──── POST /api/ingest (Bearer PROBE_TOKEN)
        │
        ├─ state changes ──▶ notification-center (NOTIFY_URL)
        └─ /  /c/:id  /i/:id  /history  /feed.xml  /api/status
```

| Table | Contents | Retention |
|---|---|---|
| `ticks` | one row per region per minute with every result | 30 days |
| `days` | per-day minutes in each state plus latency histograms | forever |
| `events` | state transitions, used for alerts and history | forever |

States: operational, degraded (slower than `slowMs` or flapping), partial (fails from one region), major (fails from every reporting region), maintenance. Uptime counts major minutes fully and partial minutes at 0.3, the same weighting Atlassian Statuspage uses. Maintenance and minutes without data are excluded.

## Adding a service

Edit [`monitors.ts`](monitors.ts). Both probes pick up the change on the next deploy.

Services are grouped, and a group marked `infra: true` moves out of the main panel into a collapsed "开发与基础设施" section, which opens by itself when something in it is wrong. The headline, the 60-minute trace, and `state` in `/api/status` cover the main panel only, so an internal tool going down does not tell a visitor the site is broken. Infrastructure is still checked and still alerts.

| Field | Meaning |
|---|---|
| `id` | stable identifier used in URLs, incidents, and stored data |
| `name` | label shown on the page |
| `http` | URL to request; any status below 400 counts as up |
| `tcp` | `host:port` to open a connection to, instead of `http` |
| `status` | exact status code to expect, e.g. `401` for a registry's `/v2/` |
| `expect` | substring the response body must contain |
| `slowMs` | latency above which the check counts as slow (default 3000) |
| `regions` | limit to `['cn']` or `['global']` |

## Writing an incident

Add `incidents/<slug>.md`; merging to `main` publishes it. Times are China time.

```md
---
title: 维修预约无法提交
impact: major
components: repair, api
---

## identified 2026-09-10 21:43
数据库连接池耗尽，正在扩容。

## resolved 2026-09-10 23:24
已扩容，服务恢复。
```

`impact` is `minor`, `major`, or `critical`, and raises the listed components to degraded, partial, or major while the incident is open. Update statuses are `investigating`, `identified`, `monitoring`, `resolved`. The incident closes at its `resolved` update.

Scheduled maintenance declares its window and puts the components into maintenance for that time:

```md
---
title: 机房电路改造
impact: maintenance
components: mc
start: 2026-09-20 08:00
end: 2026-09-20 12:00
---

周六上午停电维护，Minecraft 服务器暂停开放。
```

Add a `## completed <time>` update to end it early. Bodies support paragraphs, `- ` lists, `` `code` ``, and `[links](https://…)`. The build fails on unknown components or malformed files.

## Setup

1. Create the database and put its id into `wrangler.jsonc`:
   ```sh
   npx wrangler d1 create heartbeat
   ```
2. Set the secrets:
   ```sh
   npx wrangler secret put PROBE_TOKEN
   npx wrangler secret put NOTIFY_TOKEN
   ```
   `NOTIFY_TOKEN` must match the `heartbeat` key in notification-center's `auth` config.
3. Add the `CLOUDFLARE_API_TOKEN` repository secret and the `CLOUDFLARE_ACCOUNT_ID` repository variable. Until the variable is set, CI skips the deploy job; afterwards every push to `main` migrates D1 and deploys the Worker. The probe image `ghcr.io/nbtca/heartbeat-probe` is published on every push to `main` regardless.
4. Run the probe in the cluster:
   ```sh
   kubectl create secret generic heartbeat-probe --from-literal=token=<PROBE_TOKEN>
   kubectl apply -f probe/deploy.yaml
   ```

## Development

```sh
npm ci
npm test
npm run check
echo 'PROBE_TOKEN=dev' > .dev.vars
npx wrangler d1 migrations apply heartbeat --local
npm run dev
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
HEARTBEAT_URL=http://localhost:8787 PROBE_TOKEN=dev npm run probe
```

The probe runs TypeScript directly on Node 24 and imports the same check code as the Worker.

## API

`GET /api/status` returns the current state of every service:

```json
{
  "state": "operational",
  "updated": 1757550000,
  "probes": { "cn": 1757550000, "global": 1757550000 },
  "groups": [{ "name": "维修服务", "infra": false, "components": [{ "id": "api", "name": "维修 API", "state": "operational", "since": 1757000000, "failed": [], "error": null }] }],
  "incidents": []
}
```

Alerts are posted to `NOTIFY_URL` as `{ "source": "heartbeat", "text", "url", "monitor", "state", "previous", "ts" }`.
