# Network Monitoring for Claude Code

Own the record of what failed, what stopped reporting and who is fixing it. HTTP, TCP and DNS checks, external metric readings, maintenance and recovery follow-up in one database. A scoped alternative for teams reviewing a PRTG bill.

## Three ways to own it

| Path | What happens |
|---|---|
| Do it yourself | Free MIT source. Install, run the demo, import your PRTG sensor inventory and configure the checks you need. |
| We customise it | Enterprise DNA maps the inventory, builds your required collectors and rules, and adds a screen or a different stack when the job needs one. One setup fee, then a retainer for ongoing work. |
| We run it for you | Installed, scheduled, connected and maintained through Omni by Enterprise DNA. One setup fee, then a retainer. |

[Get your version built](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_campaign=prtg). The software is free. Hosting, agents, custom integrations and operations have their own costs.

## Start with the demo

Node 22.15 or later. Works through Claude Code, Codex, OpenCode or Cursor. Both CLAUDE.md and AGENTS.md ship with the same workflow instructions.

```sh
npm install
npm run demo
npm run monitor -- attention
npm run monitor -- weekly-samples
npm run monitor -- compliance
npm run view
npm run docs
npm test
```

With no DATABASE_URL, PGlite stores the local database under .data/db. Set DATABASE_URL for PostgreSQL. DATA_DIR selects a different embedded location. Use a fresh database and only npm run migrate for real data. Never load demo rows into production. The sample company, names and observations are invented demonstration data.

Open views/week.html for the read-only weekly report. docs-out contains monitor investigation papers and maintenance records. Set brand.json once for the business name, logo and colours. Agent recipes live in .claude/commands. Use /weekly-review for the combined paper, /customise to add a field or rule and /new-view for a new read-only report.

## The operating week

1. Morning: /attention and /stale find failed services and missing collection.
2. Ownership: /unowned and /log record a person and recovery commitment.
3. Planned work: /plan-maintenance records the approved window before work begins.
4. Recovery: /history provides the evidence, then /close requires a fresh successful result and a written check.
5. Monday: /weekly-review prepares the failed samples, coverage gaps, overdue actions and policy review.

The collector sends an HTTP request, opens a TCP connection or resolves a hostname only after you explicitly authorise the configured target with --allow-network. The recurring collect-due command is ready for a scheduler you control. Imported monitors cannot issue network requests until separately configured and enabled. No notification or device-configuration sends are included.

## Ten questions answered from your record

These combine collection, ownership and follow-up rather than relying on a fixed dashboard. This is not a claim that PRTG cannot be extended to answer them.

1. Which enabled monitors have stopped reporting, even if their last reading was good? `stale`
2. Which unplanned failures have no named owner? `attention`
3. Which branch has the most missing evidence? `site-review`
4. Which recovery promises are overdue? `overdue`
5. Which failures happened inside approved maintenance? `failures`
6. Which monitors supplied failed samples this week? `noisy-monitors`
7. Which imported sensors still need a working collector? `migration-gaps`
8. Which readings have passed our retention period? `retention`
9. Who owns the largest queue of failed or stale monitors? `owner-review`
10. What proportion of captured samples succeeded, and how many were actually captured? `weekly-samples`

## Your first hour: ten things to ask for

1. Show the failed checks that need a person today.
2. Find monitors whose collector has gone quiet.
3. Bring in my PRTG sensor export without enabling checks.
4. Assign a responsible operator to this branch.
5. Configure an approved website check.
6. Add our planned maintenance window.
7. Record a recovery promise and its due time.
8. Prepare an investigation brief in our brand.
9. Add our escalation contact as a new field.
10. Give us a read-only report for each site.

## Switch with evidence

[Export and import guide](docs/replace-prtg.md). One command imports the saved PRTG sensor inventory with its source IDs, device labels, probe/group, type and status text. Dry runs, atomic imports and repeat-import checks are included. Native collection settings, historical channel samples, notifications and credentials are separate migration work. Keep PRTG until every required check and alert route has been verified.

## Scope and controls

The base performs HTTP status, TCP connection and DNS resolution checks, plus receives external numeric or status readings. It does not implement all PRTG sensors, discovery, SNMP, WMI, packet analysis or distributed probes. [Why no front end](docs/why-no-front-end.md) explains where custom collectors and screens fit.

A successful sample is not proof of continuous uptime. The weekly ratio is the success rate of captured samples outside maintenance, with its denominator shown. Collection gaps remain visible. Configuration changes invalidate old evidence for current-state purposes. There is no guaranteed notification service or installed scheduler.

[Record checks](docs/compliance.md) cite NZ privacy principles and label local policy choices. A passing check is not legal certification. Tables use row security and revoke public access, but operational roles, authentication, backups, notification delivery and capacity testing are deployment work. Audit actor names are annotations. Administrators can change append-only controls. Export is an inspection archive, not automatic restore.

## Validation

npm test creates an isolated database, exercises every CLI command, probes local HTTP/TCP services and resolves localhost. It tests failure, timeout, redirects, stale evidence, maintenance, import rollback, repeated and conflicting IDs, thresholds, recovery gates, immutable evidence, HTML escaping and generated documents. CI runs Node 22 and 24 on Linux and Windows, plus PostgreSQL 16. MONITOR_TEST_POSTGRES_URL must point only at an empty disposable database.

[Full CLI syntax](docs/cli.md). Independent software, not affiliated with Paessler or PRTG. MIT. Copyright 2026 Enterprise DNA.
