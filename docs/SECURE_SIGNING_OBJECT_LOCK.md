# Production signing evidence: independently retained copies

The SalesOS signing service creates Ed25519-sealed receipts with event hashes and pinned public-key verification. In production it also requires an independently administered S3 bucket with **Object Lock enabled in COMPLIANCE mode**, bucket versioning, server-side encryption using an approved KMS key, and an explicit retention period of at least 365 days.

## Deployment requirements
1. Provision a dedicated evidence bucket in a **separate security-controlled AWS account**, enable Object Lock **at bucket creation**, enable versioning, and prohibit anonymous access.
2. Limit the application role to  `s3:PutObject`, `s3:GetObject`, `s3:GetObjectRetention` on the `signing-evidence/v1/` prefix only. Do not grant `s3:DeleteObject`, `s3:BypassGovernanceRetention`, bucket-policy administration or Object Lock configuration rights to the app.
3. Require TLS, server-side KMS encryption, bucket policy object-lock controls and separately monitored CloudTrail data events.
4. Keep the Ed25519 private sealing key inaccessible to database administrators and outside the public frontend. Maintain a separately pinned public key, backup, key rotation record and disaster recovery procedure.
5. Configure `SIGNING_EVIDENCE_OBJECT_LOCK_BUCKET`, `SIGNING_EVIDENCE_KMS_KEY_ARN`, `SIGNING_EVIDENCE_RETENTION_DAYS` and `AWS_REGION` securely in server-side secret management. Never commit keys.
6. Before `SIGNING_ENABLED=true`, test a signing session against a real secured bucket and independently verify the returned evidence using the pinned public key. Confirm that delete/overwrite/shortened retention are denied in the bucket account.
7. Review signing and privacy retention with qualified UK legal/privacy counsel. **Typed/drawn signatures on a PDF with a signed audit receipt are not qualified e-signatures or a PAdES certificate merely by virtue of these protections.**

The application fails closed for missing offsite storage configuration in production. GitHub Actions tests run with `SIGNING_ENABLED=false` and no external storage. They test logic, not a live Object Lock bucket or legal enforceability.
