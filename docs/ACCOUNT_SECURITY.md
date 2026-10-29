# Authenticator MFA and registered account sessions

This release completes authenticator-app MFA and account session controls in the application code. AWS provisioning and live-provider activation are separate work. Organization deletion, DNS/domain verification, SSO and subscriptions are not part of this change.

## Sign-in behavior

- Password, Google and invitation entry points still require a second factor before any authenticated session is issued.
- Accounts without an enrolled authenticator use the existing email OTP flow. Enrolled accounts use TOTP or a saved single-use recovery code. Resending an email does not bypass an enabled authenticator.
- TOTP uses RFC 6238 SHA-1, six digits, 30-second steps and a bounded previous/current/next step window. The last accepted time step is stored per account and checked under a user row lock. An accepted step cannot be used on another challenge or server replica. A user may need to wait for the next app code after setup or a recent verification.
- Existing first-factor binding, challenge expiry, five-attempt ceilings and PostgreSQL-backed abuse limits remain in force. Purpose-specific limits allow legitimate setup/recovery activity while a shared account limit bounds overall requests.
- Recovery codes still require a valid first-factor login challenge, are single-use and hashed, and revoke all prior sessions/challenges. Recovery does not silently disable an authenticator.

## Enrollment and factor removal

Account controls are available in independent workspace Settings → Security & Audit, and in the legacy account profile. They apply to the person's identity across all organizations. Organization ownership and membership do not change when the account factor changes.

Enrollment requires a sign-in within five minutes and a separate email challenge bound to enrollment. The setup secret is revealed only after that proof, as a locally generated QR image and manual setup key, with no-store response headers. It is not sent to a QR/image service. An encrypted pending enrollment expires after ten minutes and has five confirmation attempts. Correct app verification activates the factor; simply opening setup does not activate it.

Removal requires recent sign-in, a new email challenge bound to removal and a fresh authenticator code. A recent session created with a saved recovery code may instead use the email challenge to remove a lost device. An ordinary authenticated session cannot claim that recovery status. Failed combined removal verification may consume its email proof; start removal again when instructed.

Enabling/removing a factor increments the security/password version, expires pending challenges and revokes existing sessions. The initiating browser receives a replacement registered session that preserves its original authentication timestamp and seven-day deadline. Other browsers must sign in again. Rotating recovery codes on an authenticator-enabled account requires the existing authenticator rather than an email-only downgrade.

## Encryption configuration

Set `MFA_ENCRYPTION_KEY` to a separately managed, canonical base64 encoding of 32 random bytes before permitting authenticator enrollment. Never put a real key in Git or browser environment variables. CI uses a fictional test key only. Authenticator secrets use the existing AES-256-GCM envelope with this separate key, plus a validated account/purpose binding inside the authenticated plaintext. Pending and active secrets are encrypted; status, audit and session endpoints never return them.

Missing/incorrect encryption configuration blocks setup/verification instead of downgrading an enrolled account to email. Saved recovery codes remain available after a valid first factor. A versioned keyring and an explicit dry-run/apply rotation command are implemented. Provisioning keys is a deployment responsibility. Replacing a legacy key alone makes existing enrolled secrets unreadable.

For rotation, set `MFA_ENCRYPTION_KEYS` to a JSON map of key IDs to canonical base64 32-byte keys and `MFA_ENCRYPTION_ACTIVE_KEY_ID` to the new active ID. Keep `MFA_ENCRYPTION_KEY` while legacy envelopes still exist. First deploy readers with every required old/new key across all API instances, then select the new active key consistently for new writes. Retain old keys for rollback. After backup and an isolated rehearsal, run from the repository root:

```sh
node apps/api/dist/auth/rotate-authenticator-keys.js --dry-run
node apps/api/dist/auth/rotate-authenticator-keys.js --apply
node apps/api/dist/auth/rotate-authenticator-keys.js --dry-run
```

The default is dry-run; `--user=ID` can restrict a rehearsal. The command checks both active and pending secrets, locks each user during rotation, preserves accepted time steps and security versions, and audits changed accounts without printing keys or seeds. It is resumable: a failure may follow previously committed accounts, and rerunning skips secrets already on the active key while still validating their decryption. Retire old keys only after the final dry-run finds no credentials needing rotation, all running writers use the intended active key, and the rollback/backup key-retention policy permits it. Database backups may still require older keys; do not destroy them based only on the live-row count.

## Session registry and revocation

New full-session JWTs contain a registered `sid`. Both identity and legacy CRM guards check the session's account, security/password version, revocation, expiration and original authentication timestamp in PostgreSQL. A workspace cookie cannot extend the seven-day sign-in lifetime or override current organization permissions.

Users can view their active sessions, revoke one session or sign out every other device. Revocation requires recent sign-in. Signing out other devices preserves the current session timestamp, advances the security version and invalidates pending login challenges, preventing an already verified older challenge from creating a fresh session after the revocation. Logout revokes the server record as well as clearing browser cookies. Password change/reset and recovery invalidate prior sessions.

The registry stores bounded browser-reported user-agent text, not IP/geolocation or JWT contents. Browser labels are informational, not verified device identity. The page shows the latest 100 active sessions and total count; sign out other devices affects all other sessions, including any beyond the displayed list. Last-seen updates are throttled to five-minute intervals.

The operations worker removes session records expired more than 30 days ago and setup enrollments expired more than seven days ago. Security audit events retain their existing policy; this is not automatic deletion of audit/financial evidence.

## Upgrade impact and tests

The additive `20261029000000_authenticator_sessions` migration creates three tables and expires outstanding challenges. **All pre-release JWTs without a registered sid require a fresh password/Google plus MFA sign-in after deployment.** Do not backfill unverifiable sessions or enable an unregistered-token bypass. Schedule this authentication cutover and communicate the reauthentication requirement when deploying to existing users. Existing organizations, passwords, recovery codes, business records and signed documents are retained.

Validation includes RFC 6238 published SHA-1 test vectors; secret encryption, binding, tamper/key failure tests; native PostgreSQL API tests for enrollment, login, replay, concurrency, attempt ceilings, recovery and removal; session expiry/foreign-ID/logout/revocation checks; the existing full sales/security/isolation suites updated to register their synthetic sessions; and browser enrollment, account controls and authenticator sign-in. Test fixtures never enable production OTP disclosure.

References: [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) and [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). TOTP is not phishing-resistant; passkeys are separate future scope.
