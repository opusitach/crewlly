# Environment Variables

## Source of truth

- Main template: [`.env.example`](/Users/chizhikov/crewlly-main/.env.example)
- Production file on the server: `.env.production`
- Local host run (without production compose): `.env`

`docker/prod.env.example` is a legacy compatibility file. Use the repository root `.env.example` as the primary template.

## What is required for the app to work correctly

For the current architecture, the application works correctly when:

1. You copy [`.env.example`](/Users/chizhikov/crewlly-main/.env.example) to `.env.production`.
2. You replace every `CHANGE_ME_*` placeholder.
3. You set real domains for the `CADDY_*` and `NEXT_PUBLIC_APP_URL` values.
4. You configure one working email provider:
   - production: `EMAIL_PROVIDER=resend`
   - local Docker dev: `EMAIL_PROVIDER=mailpit`
5. You keep storage URLs consistent:
   - `AWS_S3_ENDPOINT` is the internal S3/MinIO endpoint
   - `AWS_S3_PRESIGN_ENDPOINT` is the public upload endpoint reachable by the browser
   - `AWS_S3_PUBLIC_BASE_URL` is the public base URL for uploaded files

## Quick commands to get values

Generate a strong secret:

```bash
openssl rand -base64 32 | tr -d '\n'; echo
```

Generate a Caddy Basic Auth hash:

```bash
caddy hash-password --plaintext 'CHANGE_ME_STRONG_PASSWORD'
```

Get Docker root dir for observability:

```bash
docker info -f '{{ .DockerRootDir }}'
```

## Full catalog

### 1. Core production envs

These are the primary variables that should live in [`.env.example`](/Users/chizhikov/crewlly-main/.env.example) and then be copied into `.env.production`.

| Variable | Required | What to put | Where to get it |
| --- | --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | Recommended | Stable project slug, for example `crewlly` | Choose yourself. Keep it stable between deploys so Docker volumes/container names do not change. |
| `CADDY_APP_DOMAIN` | Yes | Public frontend domain, for example `app.example.com` | Your DNS/hosting setup. Create an A/AAAA record pointing to the VPS. |
| `CADDY_API_DOMAIN` | Yes | Public API domain, for example `api.example.com` | Your DNS/hosting setup. |
| `CADDY_PGADMIN_DOMAIN` | Yes if you run `pgadmin` | Domain for pgAdmin, for example `pgadmin.example.com` | Your DNS/hosting setup. |
| `CADDY_MINIO_API_DOMAIN` | Yes if you use bundled MinIO | Public S3/MinIO API domain, for example `minio.example.com` | Your DNS/hosting setup. Browser uploads use this host. |
| `CADDY_MINIO_CONSOLE_DOMAIN` | Yes if you use bundled MinIO console | Domain for MinIO console, for example `minio-console.example.com` | Your DNS/hosting setup. |
| `BASIC_AUTH_USER1_NAME` | Yes with current Caddy config | Login name for first Basic Auth user | Choose yourself. Current Caddyfile expects 3 user/hash pairs. |
| `BASIC_AUTH_USER1_HASH` | Yes with current Caddy config | Password hash for `BASIC_AUTH_USER1_NAME` | Run `caddy hash-password --plaintext 'your-password'`. |
| `BASIC_AUTH_USER2_NAME` | Yes with current Caddy config | Login name for second Basic Auth user | Choose yourself. |
| `BASIC_AUTH_USER2_HASH` | Yes with current Caddy config | Password hash for `BASIC_AUTH_USER2_NAME` | Run `caddy hash-password --plaintext 'your-password'`. |
| `BASIC_AUTH_USER3_NAME` | Yes with current Caddy config | Login name for third Basic Auth user | Choose yourself. |
| `BASIC_AUTH_USER3_HASH` | Yes with current Caddy config | Password hash for `BASIC_AUTH_USER3_NAME` | Run `caddy hash-password --plaintext 'your-password'`. |
| `POSTGRES_USER` | Yes | DB user, usually `app` | Choose yourself. Keep in sync with `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | Yes | Strong DB password | Generate locally with `openssl rand -base64 32`. |
| `POSTGRES_DB` | Yes | DB name, usually `app` | Choose yourself. |
| `DATABASE_URL` | Yes | Example: `postgresql://app:password@db:5432/app` | Build it from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. |
| `PGADMIN_EMAIL` | Yes if you run `pgadmin` | pgAdmin login email | Choose yourself. |
| `PGADMIN_PASSWORD` | Yes if you run `pgadmin` | Strong pgAdmin password | Generate locally. |
| `MINIO_ROOT_USER` | Yes if you use bundled MinIO | MinIO root/access key, often `minio` or a custom value | Choose yourself if bundled MinIO. If you use external S3, this pair may be unused. |
| `MINIO_ROOT_PASSWORD` | Yes if you use bundled MinIO | MinIO root/secret key password | Generate locally. |
| `AWS_REGION` | Yes | Region string, for example `us-east-1` | For bundled MinIO, pick a fixed value such as `us-east-1`. For AWS/S3 provider, use the provider region. |
| `AWS_S3_BUCKET` | Yes | Bucket name, for example `crewlly-procedures` | Create/select a bucket in MinIO or your S3 provider. |
| `AWS_S3_ENDPOINT` | Yes | Internal S3 endpoint | Bundled MinIO: `http://minio:9000`. External S3: provider endpoint. |
| `AWS_S3_PRESIGN_ENDPOINT` | Yes for browser uploads | Public S3 endpoint reachable by the browser | Bundled MinIO behind Caddy: `https://<CADDY_MINIO_API_DOMAIN>`. External S3: provider public endpoint. |
| `AWS_S3_PUBLIC_BASE_URL` | Yes | Public base URL for uploaded files | Usually `https://<CADDY_MINIO_API_DOMAIN>/<AWS_S3_BUCKET>` for bundled MinIO, or your provider CDN/public bucket URL. |
| `AWS_ACCESS_KEY_ID` | Yes | S3 access key | Bundled MinIO: usually same as `MINIO_ROOT_USER`. External S3: from provider credentials panel. |
| `AWS_SECRET_ACCESS_KEY` | Yes | S3 secret key | Bundled MinIO: usually same as `MINIO_ROOT_PASSWORD`. External S3: from provider credentials panel. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL | Usually `https://<CADDY_APP_DOMAIN>`. |
| `COOKIE_SECURE` | Yes | `true` in production | Set `true` behind HTTPS. Use `false` only for local plain HTTP. |
| `API_PROXY_TARGET` | Yes in current compose build | Internal backend URL | Current production compose expects `http://back:3001`. |
| `EMAIL_PROVIDER` | Yes | `resend` for production, `mailpit` for local Docker dev | Choose based on environment. Production should use a real provider. |
| `EMAIL_FROM` | Yes | Verified sender, for example `Crewlly <no-reply@example.com>` | Resend dashboard: verified domain/sender identity. For local Mailpit, any value is acceptable. |
| `EMAIL_VERIFICATION_SECRET` | Yes | Strong random secret for verification codes/tokens | Generate locally with `openssl rand -base64 32`. |
| `RESEND_API_KEY` | Required when `EMAIL_PROVIDER=resend` | Resend API key | Resend dashboard -> API Keys. |
| `MAILPIT_SMTP_HOST` | Required when `EMAIL_PROVIDER=mailpit` | SMTP host | Docker dev compose: `mailpit`. Local host run: usually `127.0.0.1`. |
| `MAILPIT_SMTP_PORT` | Required when `EMAIL_PROVIDER=mailpit` | SMTP port | Mailpit default is `1025`. |
| `AUDIT_LOG_ENABLED` | Recommended | `true` or `false` | Usually keep `true` in production. |
| `INTERNAL_CRON_SECRET` | Yes | Shared secret for internal scheduler jobs | Generate locally with `openssl rand -base64 32`. |
| `INTERNAL_SCHEDULER_BASE_URL` | Recommended | Internal backend base URL | Current compose default is `http://back:3001`. Change only if the scheduler reaches the API differently. |
| `INTERNAL_SCHEDULER_STATE_PATH` | Recommended | State file path | Keep default `/tmp/internal-scheduler-state.json` unless you have a reason to change it. |
| `STALE_SHIFT_AUTO_CLOSE_INTERVAL_SECONDS` | Recommended | Positive integer, default `900` | Choose yourself. Controls scheduler frequency. |
| `WORK_INTERVAL_CONSISTENCY_INTERVAL_SECONDS` | Recommended | Positive integer, default `900` | Choose yourself. Controls scheduler frequency. |

### 2. Optional production envs

Set these only when the related subsystem is enabled.

| Variable | When needed | What to put | Where to get it |
| --- | --- | --- | --- |
| `STALE_SHIFT_AUTO_CLOSE_CRON_SECRET` | Only if you want a job-specific secret instead of `INTERNAL_CRON_SECRET` | Strong random secret | Generate locally. |
| `STALE_SHIFT_AUTO_CLOSE_URL` | Only if the scheduler should call a non-default URL | Full internal URL | Build from your internal routing. Default is derived from `INTERNAL_SCHEDULER_BASE_URL`. |
| `WORK_INTERVAL_CONSISTENCY_CRON_SECRET` | Only if you want a job-specific secret instead of `INTERNAL_CRON_SECRET` | Strong random secret | Generate locally. |
| `WORK_INTERVAL_CONSISTENCY_URL` | Only if the scheduler should call a non-default URL | Full internal URL | Build from your internal routing. |
| `ALLOY_HTTP_PORT` | Only if you deploy `compose.observability.yml` | Local Alloy UI/health port, default `12345` | Choose a free localhost port or keep default. |
| `DOCKER_ROOT_DIR` | Only if you deploy `compose.observability.yml` | Docker root directory on the VPS | Run `docker info -f '{{ .DockerRootDir }}'`. Usually `/var/lib/docker`. |
| `GRAFANA_CLOUD_LOKI_URL` | Only if you deploy `compose.observability.yml` | Full Loki push URL | Grafana Cloud -> stack details / Logs connection details. |
| `GRAFANA_CLOUD_LOKI_USERNAME` | Only if you deploy `compose.observability.yml` | Loki username / tenant id | Grafana Cloud -> stack details. |
| `GRAFANA_CLOUD_LOGS_TOKEN` | Only if you deploy `compose.observability.yml` | Access policy token with `logs:write` | Grafana Cloud -> Access Policies. |
| `GRAFANA_CLOUD_PROMETHEUS_URL` | Only if you deploy `compose.observability.yml` | Full Prometheus remote write URL | Grafana Cloud -> stack details / Metrics connection details. |
| `GRAFANA_CLOUD_PROMETHEUS_USERNAME` | Only if you deploy `compose.observability.yml` | Prometheus username / tenant id | Grafana Cloud -> stack details. |
| `GRAFANA_CLOUD_METRICS_TOKEN` | Only if you deploy `compose.observability.yml` | Access policy token with `metrics:write` | Grafana Cloud -> Access Policies. |

### 3. Local development and test envs

These are not primary production settings, but they are useful for local runs.

| Variable | When needed | Default | Where to get it |
| --- | --- | --- | --- |
| `E2E_BASE_URL` | Only for Playwright E2E | `http://localhost:3000` | Set it only if E2E tests should hit another URL. |
| `DEV_DB_PORT` | Only for `docker-compose.dev.yml` | `5432` | Choose yourself if the port conflicts locally. |
| `DEV_PGADMIN_PORT` | Only for `docker-compose.dev.yml` | `5050` | Choose yourself if the port conflicts locally. |
| `DEV_MINIO_API_PORT` | Only for `docker-compose.dev.yml` | `9000` | Choose yourself if the port conflicts locally. |
| `DEV_MINIO_CONSOLE_PORT` | Only for `docker-compose.dev.yml` | `9001` | Choose yourself if the port conflicts locally. |
| `DEV_MAILPIT_SMTP_PORT` | Only for `docker-compose.dev.yml` | `1025` | Choose yourself if the port conflicts locally. |
| `DEV_MAILPIT_UI_PORT` | Only for `docker-compose.dev.yml` | `8025` | Choose yourself if the port conflicts locally. |
| `DEV_BACK_PORT` | Only for `docker-compose.dev.yml` | `3001` | Choose yourself if the port conflicts locally. |
| `DEV_FRONT_PORT` | Only for `docker-compose.dev.yml` | `3000` | Choose yourself if the port conflicts locally. |

### 4. Compatibility envs and auto-managed envs

These exist in code/compose for compatibility or runtime control, but you usually should not manage them manually in `.env.production`.

| Variable | Status | Notes |
| --- | --- | --- |
| `APP_ENV` | Optional compatibility override | Only changes the `environment` label in audit logs. If unset, the app uses `NODE_ENV`. |
| `AWS_S3_REGION` | Compatibility alias | The code accepts it, but primary config should use `AWS_REGION`. |
| `NEXT_PUBLIC_API_BASE_URL` | Compatibility fallback | `next.config.mjs` falls back to it if `API_PROXY_TARGET` is missing. Prefer `API_PROXY_TARGET`. |
| `APP_SERVICE_NAME` | Auto-managed | Set by `compose.app.yml` for log labeling. |
| `NODE_ENV` | Auto-managed | Set by Next.js / Docker runtime. |
| `PORT` | Auto-managed | Set by compose commands/service environment. |
| `NEXT_TELEMETRY_DISABLED` | Auto-managed | Set by Dockerfile/compose. |
| `WATCHPACK_POLLING` | Auto-managed | Dev-only compose flag for file watching. |
| `CHOKIDAR_USEPOLLING` | Auto-managed | Dev-only compose flag for file watching. |

### 5. Legacy env names that are no longer part of the current deploy flow

These appear only in the legacy [docker/prod.env.example](/Users/chizhikov/crewlly-main/docker/prod.env.example) and are not used by the current `compose.app.yml`, `compose.data.yml`, `compose.caddy.yml`, or application code:

- `APP_PORT`
- `PGADMIN_PORT`
- `MINIO_API_PORT`
- `MINIO_CONSOLE_PORT`

Do not add them to the root `.env.example` unless the deploy flow changes.

## Practical presets

### Production preset

Use these values/patterns:

- `EMAIL_PROVIDER=resend`
- `COOKIE_SECURE=true`
- `NEXT_PUBLIC_APP_URL=https://<CADDY_APP_DOMAIN>`
- `API_PROXY_TARGET=http://back:3001`
- `AWS_S3_ENDPOINT=http://minio:9000`
- `AWS_S3_PRESIGN_ENDPOINT=https://<CADDY_MINIO_API_DOMAIN>`
- `AWS_S3_PUBLIC_BASE_URL=https://<CADDY_MINIO_API_DOMAIN>/<AWS_S3_BUCKET>`

### Local Docker dev preset

Use these values/patterns:

- `EMAIL_PROVIDER=mailpit`
- `COOKIE_SECURE=false`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `API_PROXY_TARGET=http://back:3001`
- `AWS_S3_ENDPOINT=http://minio:9000`
- `AWS_S3_PRESIGN_ENDPOINT=http://localhost:9000`
- `AWS_S3_PUBLIC_BASE_URL=http://localhost:9000/<AWS_S3_BUCKET>`
- `MAILPIT_SMTP_HOST=mailpit`
- `MAILPIT_SMTP_PORT=1025`
