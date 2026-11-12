# Monitoring record checks

`npm run monitor -- compliance` checks recorded ownership, collection freshness, policy reviews and retention age. It does not certify legal compliance, network security or a service-level agreement.

Sources opened 12 November 2026:

- [NZ Privacy Act principle 5, storage and security](https://www.privacy.org.nz/privacy-principles/5/) requires reasonable security safeguards for personal information. Named operators and monitoring notes can contain personal information. The access-review finding prompts an operator to review permissions; it does not inspect firewall rules or prove the safeguards are adequate.
- [NZ Privacy Act principle 9, retention](https://www.privacy.org.nz/privacy-principles/9/) limits keeping personal information to what is needed for a lawful purpose. The retention-age and retention-review findings compare saved readings and review dates with the operator's written policy. The law does not prescribe the demo's retention period.

| Rule | Check | Basis |
|---|---|---|
| owner | Enabled monitor has a named owner | House rule |
| coverage | Enabled monitor has fresh evidence for its current configuration | House rule |
| policy-missing | Purpose, access review and retention policy recorded | Record prompt supporting IPP5 and IPP9 |
| access-review | Recorded access review date has not passed | Record prompt supporting IPP5 |
| retention-review | Recorded retention review date has not passed | Record prompt supporting IPP9 |
| retention-age | Readings do not exceed the configured retention period | Record prompt supporting IPP9 |

A clear result only means these specific record checks found no issue. Apply your own jurisdiction and contractual obligations before operational use. There is no regulated certification claim.

Tables have row security enabled and public privileges revoked. The trusted database owner operates this local application; per-user roles and authentication need deployment configuration. Never grant the database owner role to public visitors. The actor field is a label, not authenticated identity. Keep reports and exports private and encrypt storage and backups using the host's tools.

Readings, maintenance and audit entries are append-only for ordinary commands. Database administrators can alter those controls. Authorised retention disposal must handle all collections, drafts, exports and backups, preserve an appropriate disposal record and respect any lawful hold. No automatic deletion is included. Do not store passwords, response bodies or session tokens in notes or imported files.
