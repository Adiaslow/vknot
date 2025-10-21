# vknot.love — Domain Ledger

Last updated: 2025-10-10

## Registry & Lifecycle

- Registrar: Porkbun
- Registry create: 2025-10-09T20:09:01.419Z
- Registry expire: 2026-10-09T20:09:01.419Z
- Domain statuses: `clientTransferProhibited`, `clientDeleteProhibited`
- Auto-renew: **verify enabled** (toggle available via Porkbun dashboard)
- Renewal price (est.): $23.17 USD

## Contact Records

- Registrant: Adam Murray
- Email: a.murray0413@gmail.com
- Technical/Billing contacts: not yet delegated (consider adding aliases)

## Nameservers

- curitiba.ns.porkbun.com
- fortaleza.ns.porkbun.com
- maceio.ns.porkbun.com
- salvador.ns.porkbun.com

## DNS Zone Overview

- Current record count: 5 (export zone file from Porkbun → DNS → Export Zone)
- TODO: capture full record list (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, etc.) in `infrastructure/domains/vknot.love.zone` and checksum
- URL forwarding: not configured
- Parking: enabled (Porkbun holding page)
- Zone snapshot: see `vknot.love.zone` for current ALIAS/CNAME/TXT entries

## DNSSEC & Security

- Registry DNSSEC: 0 DS records (inactive)
- Porkbun DNSSEC toggle: available but currently off
- Action: plan DNSSEC enablement once final hosting DNS is stable

## TLS / Certificates

- SSL certificate: present via Porkbun static hosting (issuer/details pending)
- Action: run `openssl s_client -connect vknot.love:443 -servername vknot.love` or SSL Labs scan to record issuer, SANs, expiration
- Track renewal strategy if migrating to alternative hosting/CDN (Let’s Encrypt vs custom)

## Hosting & Deployment

- Current site: Porkbun parking page (`Oink!` placeholder)
- Target architecture: Astro multi-site monorepo (`apps/adam-murray/*`, `apps/landing`, `apps/tender-circuits`)
- Action plan:
  1. Finalize build outputs per app (`dist/` folders)
  2. Configure deployment pipeline (see forthcoming `.github/workflows/deploy.yml`)
  3. Update DNS `A/AAAA` (or CNAME) to new hosting provider once ready

## Operational Notes

- API access: available through Porkbun (enable if automation required)
- Domain transfer locks: enabled (keep until migration needed)
- Monitoring: add uptime monitoring / alerts post-launch
- Backups: include DNS zone export and infrastructure notes in repository history
