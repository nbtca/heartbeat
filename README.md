# heartbeat

Status page for NBTCA services at <https://status.nbtca.space>, English by default with Chinese at `/zh`.

Every service is checked once a minute from two vantage points: Cloudflare's edge (`global`) and a probe inside the China cluster (`cn`). A check has to fail twice in a row before a service is marked down, and a probe that stops reporting is shown as offline and ignored, so a dead probe never looks like an outage. Uptime counts major minutes fully and partial minutes at 0.3, the weighting Atlassian Statuspage uses; maintenance and minutes without data are excluded.

## Adding a service

Edit [`monitors.ts`](monitors.ts); both probes pick it up on the next deploy.

| Field | Meaning |
|---|---|
| `id` | stable identifier used in URLs, incidents, and stored data |
| `name` | English label |
| `zh` | Chinese label for `/zh`; falls back to `name` |
| `http` | URL to request; any status below 400 counts as up |
| `tcp` | `host:port` to connect to, instead of `http` |
| `status` | exact status code to expect, e.g. `401` for a registry's `/v2/` |
| `expect` | substring the response body must contain |
| `slowMs` | latency above which the check counts as slow (default 3000) |
| `regions` | limit to `['cn']` or `['global']` |

A group marked `infra: true` collapses into a section below the main panel. The headline, the 60-minute trace and `state` in `/api/status` cover the main panel only, so an internal tool going down does not tell a visitor the site is broken; infrastructure is still checked and still alerts.

Page copy lives in [`src/text.ts`](src/text.ts), where both languages must define the same keys or the build fails.

## Writing an incident

Add `incidents/<slug>.md`; merging to `main` publishes it. Incidents are English only. Times are China time.

```md
---
title: Repair bookings could not be submitted
impact: major
components: repair, api
---

## identified 2026-09-10 21:43
The database connection pool was exhausted. Scaling it up.

## resolved 2026-09-10 23:24
Pool resized, the service is back.
```

`impact` is `minor`, `major` or `critical`, and raises the listed components to degraded, partial or major while the incident is open. Update statuses are `investigating`, `identified`, `monitoring`, `resolved`; the incident closes at `resolved`.

`impact: maintenance` takes `start` and `end` instead, and puts the components into maintenance for that window until a `## completed <time>` update ends it. Bodies support paragraphs, `- ` lists, `` `code` `` and `[links](https://…)`. The build fails on unknown components or malformed files.

## Setup

```sh
npx wrangler d1 create heartbeat          # put the id into wrangler.jsonc
npx wrangler secret put PROBE_TOKEN
npx wrangler secret put NOTIFY_TOKEN      # matches the heartbeat key in notification-center
kubectl create secret generic heartbeat-probe --from-literal=token=<PROBE_TOKEN>
kubectl apply -f probe/deploy.yaml
```

Pushing to `main` deploys once the `CLOUDFLARE_API_TOKEN` secret and `CLOUDFLARE_ACCOUNT_ID` variable exist; until then CI skips the deploy job.

## Development

```sh
npm ci && npm test && npm run check
echo 'PROBE_TOKEN=dev' > .dev.vars
npx wrangler d1 migrations apply heartbeat --local
npm run dev
curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
HEARTBEAT_URL=http://localhost:8787 PROBE_TOKEN=dev npm run probe
```

## API

`GET /api/status`:

```json
{
  "state": "operational",
  "updated": 1757550000,
  "probes": { "cn": 1757550000, "global": 1757550000 },
  "groups": [{ "name": "Repair service", "infra": false, "components": [{ "id": "api", "name": "Repair API", "state": "operational", "since": 1757000000, "failed": [], "error": null }] }],
  "incidents": []
}
```

Alerts go to `NOTIFY_URL` as `{ "source": "heartbeat", "text", "url", "monitor", "state", "previous", "ts" }`.

[`src/logo.svg`](src/logo.svg) is the association's seal from the `NBTCA - LOGO` master, recoloured through `currentColor` and otherwise untouched. The `favicon.svg` on nbtca.space is Astro's default, not the association's mark.
