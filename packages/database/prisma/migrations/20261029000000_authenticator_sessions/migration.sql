-- CreateTable
CREATE TABLE "UserAuthenticator" (
    "userId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "lastStep" INTEGER NOT NULL DEFAULT -1,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuthenticator_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthenticatorEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthenticatorEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL,
    "mfaMethod" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "authAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticatorEnrollment_userId_key" ON "AuthenticatorEnrollment"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserAuthenticator" ADD CONSTRAINT "UserAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticatorEnrollment" ADD CONSTRAINT "AuthenticatorEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Outstanding pre-upgrade challenges must be proven again with the current factor policy.
UPDATE "LoginChallenge" SET "consumedAt"=CURRENT_TIMESTAMP,"expiresAt"=CURRENT_TIMESTAMP WHERE "consumedAt" IS NULL;
-- Existing JWTs have no registered sid and intentionally require a new MFA sign-in.
