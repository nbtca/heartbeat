-- Packed rows the cron and pages read instead of scanning ticks and events: each read costs one row.
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO state (key, value)
SELECT 'recent:' || region, json_group_array(json_object('region', region, 'ts', ts, 'results', json(results)))
FROM (SELECT * FROM ticks WHERE ts >= (SELECT max(ts) FROM ticks) - 4800 ORDER BY ts)
GROUP BY region;

INSERT INTO state (key, value)
SELECT 'last', json_group_object(monitor, json_object('monitor', monitor, 'ts', ts, 'state', state, 'detail', json(detail)))
FROM events e
WHERE ts = (SELECT max(ts) FROM events WHERE monitor = e.monitor)
HAVING count(*) > 0;
