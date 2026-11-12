# CLI and operating scope

Run `npm run monitor -- <command>`. Use `--json` for structured output. Values use `--flag=value`, with quotes around values containing spaces. Every database mutation requires `--actor="Real operator"`. This label is an audit annotation, not authentication.

## Read

`monitors`, `attention`, `stale`, `unowned`, `failures`, `maintenance`, `overdue`, `weekly-samples`, `site-review`, `owner-review`, `migration-gaps`, `noisy-monitors`, `compliance`, `retention`, `audit`, `help`.

`monitor <identifier>` and `history <identifier>` show one monitor. Identifiers accept exact UUIDs, UUID prefixes and case-insensitive names. Ambiguity lists candidates and exits 1. Supply a full UUID when names repeat. Historical detail is capped at 100 readings and audit at 100 events. Export holds the full record.

`weekly-samples` reports the proportion of captured samples that succeeded, excluding samples inside recorded maintenance windows. It is not elapsed-time availability, an SLA calculation or proof of continuous coverage. A stale successful reading cannot make a service green. Fresh means within twice the configured interval. A changed monitor configuration needs new evidence.

## Set up

```sh
npm run monitor -- add --name="Order portal" --device=web-01 --site=Auckland --owner=Mere --kind=http --target=https://example.com/ --actor=Mere
npm run monitor -- configure "Order portal" --interval=300 --timeout=5000 --expected=200 --actor=Mere
npm run monitor -- enable "Order portal" --actor=Mere
npm run monitor -- collect "Order portal" --allow-network --actor=Mere
```

New and reconfigured monitors are disabled until explicitly enabled. Assignment: `assign <id> --owner=Name --actor=Name`. Disable: `disable <id> --actor=Name`.

Kinds: `http` (exact expected status, no redirect following), `tcp` (connection accepted) and `dns` (hostname resolves through the host operating system). Targets: `https://host/path`, `tcp://host:443`, `dns://hostname`. IPv6 literals are supported for HTTP/TCP. A successful connection is not proof that the whole application works. DNS timeout stops waiting but an OS resolver request can finish in the background. No response bodies, credentials, URL query strings or cookies are stored. Do not put sensitive identifiers in path names.

`external` accepts local numeric or status readings from a separate authorised collector. Configure `--upper-limit=85 --unit=percent` to flag readings above that maximum. A numeric value is required once a maximum is configured. Use `--upper-limit=none` to remove it. To convert a native monitor to external, specify `--kind=external --target=none`. The free base has no SNMP, WMI, NetFlow, packet capture or device discovery engine.

## Repeated checks

`collect-due --allow-network --actor="Scheduled collector"` checks up to 100 enabled native monitors whose last reading is older than their interval. Run it on a schedule you manage, from a machine allowed to reach those exact targets. Use one scheduler per database. No scheduler is installed by this project. Monitor the scheduler independently; stale evidence detects missing collection only when you run a review. Native probes are sequential. Large estates and high-volume retention require a measured capacity plan, partitioning and a separate collection service.

The operator owns the monitoring targets and authorises their use with `--allow-network`. This tool intentionally supports internal networks. Never expose it as an unauthenticated network-request service or load targets from untrusted files and enable them automatically. PRTG import cannot trigger a network request. There are no notification sends in this version.

## Import and external readings

```sh
npm run monitor -- import prtg --source=main-office --file=exports/sensors.csv --dry-run --actor=Mere
npm run monitor -- import prtg --source=main-office --file=exports/sensors.csv --actor=Mere
npm run monitor -- ingest --file=imports/readings.json --dry-run --actor=Mere
```

Use the same `--source` for repeat imports from the same PRTG installation. Different installations can reuse sensor IDs. Import is atomic, duplicates within a file fail, identical repeated inventory is skipped, and changes to a previously imported record fail for explicit reconciliation. Import does not overwrite local configuration or enable anything. See [switching guide](replace-prtg.md).

Reading file format, a nonempty array:

```json
[{"monitor":"full-monitor-uuid","source_key":"collector-a:unique-event-id","observed_at":"2026-11-12T10:00:00Z","outcome":"up","value":54,"latency_ms":12,"detail":"Disk usage sampled"}]
```

Only external monitors accept ingestion. Use a stable, globally unique source key. Repeating the exact event skips it. Conflicting events roll back the whole file. Different monitor configuration versions require new source keys. Values over the configured maximum become down even if the collector reports up. A collector-reported down remains down. Timestamps require a timezone and cannot be more than five minutes ahead. Older observations remain history and do not displace a newer observation. Ingested readings use the current configuration: import old evidence before changing thresholds or archive it separately. Readings supplied by operators are evidence assertions, not independent measurements by this program.

## Maintenance and follow-up

```sh
npm run monitor -- plan-maintenance "Order portal" --start=2026-12-01T08:00:00Z --end=2026-12-01T09:00:00Z --reason="Approved upgrade" --actor=Mere
npm run monitor -- log "Order portal" --owner=Noah --note="Verify recovery" --due=2026-12-01T09:15:00Z --actor=Mere
npm run monitor -- close <followup-id> --evidence="Checked service and confirmed recovery" --actor=Noah
```

Maintenance must begin now or later and finish after it starts. A window never deletes readings. Failed samples in an active window are kept but excluded from unplanned failure counts. Missing or stale evidence remains an attention item during maintenance. Windows are append-only in ordinary operation. Confirm times before recording them; an authorised administrator must correct an erroneous window and document the change. Close needs a fresh up reading outside current maintenance and written evidence. Follow-up owners and monitor owners can differ.

## Policy, drafts and exports

`review-policy --purpose="Service monitoring" --access-due=2027-01-01 --retention-days=90 --retention-due=2027-01-01 --actor=Mere` records the local policy. These dates and periods are operator decisions, not statutory defaults. Read [compliance](compliance.md).

`weekly-review` and `draft-monitor-brief <id>` write branded HTML in `drafts/`. `npm run docs` writes monitor investigation and maintenance papers to `docs-out/`. `npm run view` writes the week to `views/`. Set `OUTPUT_DIR` to keep outputs elsewhere. No command sends a document.

`export --file=exports/network.json` writes all six collections from one consistent read snapshot. Without `--file`, it prints JSON. Existing files are never overwritten. Export is a portable inspection archive, not an automatic restore. Back up the database with tools for your deployment and test recovery.
