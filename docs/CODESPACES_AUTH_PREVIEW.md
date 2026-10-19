# SalesOS authentication in a private GitHub Codespace

## Refresh an already running Codespace

1. Stop `npm run dev` in the Codespace terminal with **Ctrl+C**.
2. Confirm the feature branch: `git branch --show-current` should display `feature/ci-isolation-finance-audit`.
3. Run `git pull --ff-only`, then `bash scripts/start-codespaces.sh`.
4. This checks Docker, starts PostgreSQL, Redis and **Mailpit**, updates the local-only `.env` and applies the schema to the disposable development database.
5. Open **port 3000**, visibility **Private**, from the Codespaces **Ports** tab. Do not make ports 3000, 4000 or 8025 public.
6. Open **port 8025**, visibility **Private**, to read test emails from Mailpit.

## User flow

- **Email/password login:** Existing admin credentials remain in `.env`; use `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The login form reports wrong credentials separately from a rejected origin.
- **Email registration:** Codespaces enables `DEV_EMAIL_SIGNUP_ENABLED=true`. Only in non-production Codespaces, new accounts can sign up directly and are routed to create their first workspace. **Email ownership is not verified in this developer-only mode**. Do not use with real customers or a publicly shared port.
- **Password recovery:** Use **Forgot password** and enter the account email. In the Codespaces preview the reset email appears in Mailpit at port 8025. Open the one-use reset URL within 30 minutes. Password change increments session version and revokes old JWT sessions.
- **Google login:** The UI displays a configuration explanation if the OAuth client ID is absent. To enable it, configure a Google OAuth Web application with the exact Codespace port 3000 HTTPS origin, set `GOOGLE_LOGIN_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID` to that authorized client ID, and restart the servers. Keep `GOOGLE_SELF_SIGNUP_ENABLED=false` until intentionally enabling private testing.
- **Team invitations:** Workspace owners can invite a user and share a private link. Invitations are bound to the invited email and only grant membership after the recipient proves control of that email or signs into the already registered account with that email.

## Production boundaries

- `DEV_EMAIL_SIGNUP_ENABLED` and `DEV_MAIL_CAPTURE_ENABLED` cannot work when `NODE_ENV=production`.
- Public email/password signup requires `EMAIL_SIGNUP_ENABLED=true`, a real configured SMTP provider, and successful 30-minute email-link verification; no company membership is granted by registration alone.
- Recovery requires SMTP mail delivery. Never return reset tokens in API responses or client-side error messages.
- API accepts only the configured application origin and exact known private Codespaces web origins; arbitrary origins are denied for writes.
- This is not production certification. Add distributed rate limiting, fraud/abuse defenses, MFA, email-delivery observability, verified migrations, and an independent tenant authorization review before public registration or real data.

## Existing local .env

The preview script preserves any existing `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `JWT_SECRET` in `.env`. Never paste `.env` or credentials into GitHub commits, issues, or chats. Running `npm run db:seed` repeatedly will not automatically enroll newly registered standalone users into Seebot.
