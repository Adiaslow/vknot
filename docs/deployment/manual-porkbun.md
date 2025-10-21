# Manual Deployment — Porkbun Static Hosting

This runbook describes how to build and upload the multi-site Astro deployment to Porkbun static hosting. It assumes:

- Porkbun static hosting is enabled for `vknot.love`.
- FTP credentials are stored securely (e.g. 1Password). Refer to `PORKBUN_FTP_USER` and `PORKBUN_FTP_PASSWORD` secrets when automating.
- Porkbun-managed SSL remains active.

## Build

```bash
pnpm install
pnpm turbo run build
```

Build artefacts land in:

- `apps/landing/dist`
- `apps/adam-murray/research/dist`
- `apps/adam-murray/technical/dist`
- `apps/tender-circuits/dist`

## Bundle for Upload

Create a `deploy/` staging directory that mirrors the desired URL structure:

```bash
rm -rf deploy
mkdir -p deploy
cp -R apps/landing/dist/* deploy/
mkdir -p deploy/adam-murray/research
cp -R apps/adam-murray/research/dist/* deploy/adam-murray/research/
mkdir -p deploy/adam-murray/technical
cp -R apps/adam-murray/technical/dist/* deploy/adam-murray/technical/
mkdir -p deploy/tender_circuits
cp -R apps/tender-circuits/dist/* deploy/tender_circuits/
```

The resulting structure should be:

```
deploy/
├── index.html                # landing site
├── adam-murray/
│   ├── research/
│   └── technical/
└── tender_circuits/
```

## Upload via FTP

1. Connect to Porkbun static hosting FTP endpoint (`pixie-ss1-ftp.porkbun.com`).
2. Authenticate with your stored credentials.
3. Upload contents of `deploy/` to the FTP root, preserving directories.
4. Verify that `index.html` exists at the root and subdirectories align with desired routes.

## Post-Deployment

- Spot-check `https://vknot.love/` and key subpaths once propagation completes.
- Update DNS records if switching away from the `ss1-sixie.porkbun.com` ALIAS (currently points to static hosting).
- Record deployment summary in `docs/deployment/log.md` (create if missing).

## Future Automation

- Predefined GitHub Actions workflow template in `.github/workflows/deploy.yml` (currently commented) mirrors these steps; supply `PORKBUN_FTP_*` secrets to enable.
- Optional: add checksum verification or artifact archiving before upload.
