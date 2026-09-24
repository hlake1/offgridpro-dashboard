# tweak-reports-worker

Backs two things for Tweak Reporting that used to live only in the browser:

1. **Real username/password login** — checks credentials against the
   `app_users` table in Supabase (bcrypt via the `pgcrypto` extension),
   using the `app_login` / `app_set_email` / `app_set_password` SQL
   functions already created in the project.
2. **Shared report storage** — reads/writes the `reports` table in
   Supabase, so a published report is fetchable from any device, not
   just the browser it was published from.

All database access uses the Supabase **service_role** key, which
bypasses Row Level Security — so authorization (who can see/edit what)
is enforced entirely in `src/worker.js`, not in the database.

## One-time setup

```
cd tweak-reports-worker
npx wrangler kv namespace create SESSIONS
```

Paste the `id` it prints into `wrangler.toml` under `[[kv_namespaces]]`.

```
npx wrangler secret put SUPABASE_SERVICE_KEY
```

When prompted, paste the **secret key** (or legacy `service_role` key)
from Supabase → Project Settings → API Keys. Never commit this value —
it is a secret, not a `[vars]` entry.

Then deploy:

```
npx wrangler deploy
```

## Routes

- `POST /login` `{ username, password }` → `{ token, user }` or 401.
  `user` includes `needsEmail` / `needsPasswordChange` flags the
  frontend uses to drive the first-login flow.
- `GET /whoami` (with `Authorization: Bearer <token>` or `?token=`) →
  `{ signedIn, user }`.
- `POST /account/email` `{ email }` (authenticated) → sets the caller's
  email.
- `POST /account/password` `{ newPassword }` (authenticated) → sets a
  new password and clears `needsPasswordChange`.
- `GET /reports/list?client=<slug>` (authenticated) → reports for that
  client. Team members (`role: admin`) see everything; a client login
  only ever sees their own **published** reports.
- `GET /reports/one?client=<slug>&period=YYYY-MM` (authenticated) → a
  single report, same visibility rule as above.
- `POST /reports/save` `{ client, period, title, author, status,
  answers, data, generated, revisionNotes }` (team members only) →
  upserts a report (unique on client + period) and returns it.

## Notes

- Passwords are bcrypt-hashed in Postgres via `crypt()`/`gen_salt('bf')`
  — the Worker never sees or stores a plaintext password beyond the
  single request that sets it.
- Session tokens are opaque random strings stored in the `SESSIONS` KV
  namespace with a 30-day TTL — nothing about the user is encoded in
  the token itself.
