## SMTP configuration for Cloud Functions

This project uses Firebase Functions v2 params as the single source of truth for SMTP configuration.

The `sendMerchantEmail` function reads:

- Required:
  - `OVH_SMTP_HOST`
  - `OVH_SMTP_USER`
  - `OVH_SMTP_PASS`
- Optional:
  - `OVH_SMTP_PORT` with default `587`
  - `OVH_SMTP_FROM` with fallback to `OVH_SMTP_USER`
  - `OVH_SMTP_FROM_NAME`

### Recommended setup

1. Set the SMTP password in Secret Manager:

```bash
firebase functions:secrets:set OVH_SMTP_PASS
```

2. Set non-secret params in `functions/.env.<projectId>` or `functions/.env`:

```dotenv
OVH_SMTP_HOST=smtp.mail.ovh.net
OVH_SMTP_PORT=587
OVH_SMTP_USER=contact@example.com
OVH_SMTP_FROM=contact@example.com
OVH_SMTP_FROM_NAME=ProxiPlay
```

3. Deploy the functions:

```bash
firebase deploy --only functions
```

### Legacy config

`functions.config().smtp.*` is legacy and no longer read by the code.

After migration, remove it to avoid ambiguity:

```bash
firebase functions:config:unset smtp
```
