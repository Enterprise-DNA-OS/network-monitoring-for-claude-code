# Move the PRTG sensor inventory

Start by deciding which services need HTTP, TCP or DNS checks and which need a separate metric collector. This import moves the sensor inventory, not PRTG's collection engine. Keep PRTG running until you have reconciled every required check, history archive and notification route.

## Export from PRTG

Paessler documents its multiple-object API with CSV output and selectable columns. An authorised administrator can save the sensor list with these fields:

```text
/api/table.csv?content=sensors&columns=objid,probe,group,device,sensor,type,status&count=50000
```

Use PRTG's own authenticated session or approved credential handling. Do not put tokens, passhashes or passwords in this repository, command history, the export or the new database. This project only reads the saved CSV. Confirm the exported count against PRTG and paginate or filter the export for larger inventories. A truncated export is not a full migration.

The importer accepts `objid`, `ID` or `Object ID` for the source sensor ID and `sensor` or `name` for its name. It accepts `probe`, `group`, `device`, `type` and `status` as optional columns. These are the English export headers. Inspect localised headers and map them explicitly before loading. `tests/fixtures/prtg-sensors.csv` is a synthetic fixture using the documented fields, not an export from a customer account.

Current sources, checked 12 November 2026:

- [Multiple Object Property or Status, PRTG manual](https://www.paessler.com/manuals/prtg/multiple_object_property_or_status)
- [Paessler sensor-by-device CSV example](https://helpdesk.paessler.com/en/support/solutions/articles/76000076734-report-of-sensors-by-device). This older support example is marked as no longer maintained; use the current manual and reconcile the file from your version.
- [Report settings and historical CSV files](https://www.paessler.com/manuals/prtg/report_settings)

## Import in one command

Use a fresh database with `npm run migrate`, without demo data. Put the export under ignored `exports/`.

```sh
npm run monitor -- import prtg --source=head-office --file=exports/sensors.csv --dry-run --actor="Your name"
npm run monitor -- import prtg --source=head-office --file=exports/sensors.csv --actor="Your name"
```

The first command validates without saving. The second loads the inventory atomically. Repeating the same file with the same source does not duplicate sensors. Conflicting existing IDs fail rather than overwrite local work. Separate installations require separate source labels.

## What maps

| PRTG field | New record |
|---|---|
| objid / ID | Source sensor ID, scoped by installation |
| sensor / name | Monitor name |
| device | Device label |
| probe and group | Combined site label |
| type | Original sensor type, preserved as text |
| status | Original status, preserved as historical text |

All imported monitors start disabled and external, with no owner or executable target. An imported Up status is not a new successful check. Assign the responsible operator, configure the target or external collector, set the expected interval, enable it and obtain a fresh result.

## What needs separate work

PRTG's historical channel samples, credentials, sensor-specific settings, notification rules, maps, dependencies and device discovery do not come across in the inventory CSV. Archive PRTG history before cancellation. The readings importer can load a reviewed, mapped JSON array from a separate collector, but it does not parse arbitrary PRTG historical-report layouts. Treat historical mapping as a separate migration task.

The native collectors cover HTTP status, TCP connection and hostname resolution. SNMP, WMI, bandwidth counters, distributed probes and other sensor types need separate collectors or integration work. Enterprise DNA can scope those collectors, an operator screen, notification channels and a different deployment stack for your version. Do not retire a required check merely because its sensor name imported.

## Reconcile before switching

Compare source counts, unique IDs, device groups and the list of required sensor types. Use `migration-gaps`, `stale` and `compliance`. Verify successful and failing services from the intended network location, planned maintenance and the independent notification route. Run both systems through a full operating cycle. Cancel only once the owner accepts collection coverage, history preservation, restoration and alert delivery. Importing the inventory is one command; approving the operational switch takes those checks.
