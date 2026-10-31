# China probe operations

Run one probe for `cn` in the China cluster. Keep bot monitors assigned to `cn`.
Running two probes with the same region overwrites the same `(ts, region)` rows.
The Deployment uses `Recreate` so a rollout does not overlap two reporters;
expect a short reporting gap while the replacement starts.

## Connections

```text
China probe -> GET https://status.nbtca.space/api/config (Bearer PROBE_TOKEN)
China probe -> http://38.92.9.143:9007/{qq,tg}/healthz
            -> HK frps -> frpc-bot on yunacelisse -> 127.0.0.1:24444
            -> Traefik -> 100.66.88.34:{8787,8788}/healthz
China probe -> POST https://status.nbtca.space/api/ingest (Bearer PROBE_TOKEN)
            -> D1 -> GET /api/status
```

SSH alias `yunacelisse` connects to `100.66.88.34`, the Linux bot host.
`127.0.0.1:8787` and `:8788` are not bound: use the Tailscale address.
Traefik runs through Docker Compose with host networking, not a systemd unit.
Its files are `~/traefik/data/traefik.yaml`, `dynamic/bot-health.yaml`, and
`dynamic/huaji-rules.yaml`. The dedicated tunnel is `frpc-bot.service` using
`/etc/frp/frpc-bot.toml`. Do not restart shared `frpc` or `frpc-cloud` services.

## Read-only diagnosis

Select the intended cluster context before running these commands. The manifest
uses namespace `default`, node label `location=china`, and Secret
`heartbeat-probe` with key `token`.

```sh
kubectl config current-context
kubectl get nodes -l location=china -o wide
kubectl -n default get deploy,pods -l app=heartbeat-probe -o wide
kubectl -n default describe pod -l app=heartbeat-probe
kubectl -n default logs deploy/heartbeat-probe --tail=200
kubectl -n default get secret heartbeat-probe -o name
kubectl -n default get events --sort-by=.lastTimestamp
```

Check the actual probe's egress and authorization without printing the token:

```sh
kubectl -n default exec deploy/heartbeat-probe -- node --input-type=module -e '
for (const path of ["qq", "tg"]) {
  const r = await fetch(`http://38.92.9.143:9007/${path}/healthz`, {signal: AbortSignal.timeout(10000)});
  console.log(path, r.status, await r.text());
}
const r = await fetch("https://status.nbtca.space/api/config", {
  headers: {authorization: `Bearer ${process.env.PROBE_TOKEN}`}, signal: AbortSignal.timeout(10000)
});
console.log("config", r.status);
await r.body?.cancel();
console.log("clock", new Date().toISOString());
'
```

Authenticated config should return 200; without authentication 401 is expected.
Ingest rejects timestamps over 300 seconds away from Worker time. Pending points
to scheduling, ImagePullBackOff to registry access, CreateContainerConfigError to
the Secret, and CrashLoopBackOff to startup or resource errors. A Running Pod can
still fail authentication or egress; inspect logs and readiness.

Check bot-side hops from the SSH session:

```sh
curl --max-time 10 http://100.66.88.34:8787/healthz
curl --max-time 10 http://100.66.88.34:8788/healthz
curl --max-time 10 http://127.0.0.1:24444/qq/healthz
curl --max-time 10 http://127.0.0.1:24444/tg/healthz
systemctl status frpc-bot --no-pager
```

The bot host reaching the relay does not prove China cluster egress works.
Telegram's endpoint currently reflects startup GetMe success, not ongoing polling.

## Health and rollout

The Node 24 image exposes internal port 8080 (`HEALTH_PORT` overrides it).
No public Service or Ingress is required.

- `/healthz`: 200 while the cycle completes within 180 seconds. Startup grants
  the same initial grace period. A stalled loop eventually returns 503.
- `/readyz`: 200 only if ingest was accepted within 180 seconds. Starts at 503.
- Both return only readiness, liveness, last ingest time (Unix milliseconds), and
  consecutive failed cycles. Failed monitored services still constitute a healthy
  reporting probe. A Worker outage makes the Pod unready while completed retry
  cycles keep it live, avoiding a dependency-driven restart loop.

Restore the missing prerequisite found during diagnosis. The Worker and probe
must share `PROBE_TOKEN`; the cluster administrator and Worker administrator must
coordinate provisioning. Never commit or print either token. If rotation is
required, update both sides and restart this Deployment so env vars are reloaded.
Do not rotate just to diagnose a missing Pod or image pull failure.

CI publishes `latest` and the full commit SHA. After the desired image is built,
apply the manifest and select that SHA for a reproducible rollout:

```sh
kubectl -n default apply -f probe/deploy.yaml
kubectl -n default set image deployment/heartbeat-probe probe=ghcr.mirror.nbtca.space/nbtca/heartbeat-probe:<full-commit-sha>
kubectl -n default rollout status deployment/heartbeat-probe --timeout=300s
```

Confirm mirror availability before rollout. To roll back an image regression,
use `kubectl -n default rollout undo deployment/heartbeat-probe` and verify the
previous revision. It does not restore changed Secrets or Worker credentials.
The bot host's Node 12 cannot run the probe; deploying a second local probe also
changes the observation location and requires avoiding duplicate `cn` reporters.

## Acceptance

Observe at least five consecutive minutes of successful ingest logs. Check
`https://status.nbtca.space/api/status`: `probes.cn` must be a recent advancing
timestamp, and both bots should be operational while connected. Confirm periodic
`/qq/healthz` and `/tg/healthz` in Traefik's access log. Capture timestamp, image
SHA, root cause, and results for issue #3. Do not close the issue on code tests alone.

Probe offline/recovery notifications are emitted by the Worker's cron. A probe
that has never reported emits an initial offline notification; unchanged state
does not repeat it. This requires the Worker's existing `NOTIFY_TOKEN` and
`NOTIFY_URL` to work independently of the missing probe.
