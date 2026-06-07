/**
 * Bootstrap the first super_admin.
 *
 * Usage:
 *   INITIAL_SUPER_ADMIN_EMAIL=admin@example.com npx tsx scripts/bootstrap-super-admin.ts
 *
 * Behaviour (idempotent, safe to re-run):
 *   1. Find an EXISTING user by INITIAL_SUPER_ADMIN_EMAIL.
 *   2. Set user.isInternal = true.
 *   3. Upsert an InternalGlobalAccess(super_admin, all_establishments, enabled).
 *
 * Hard rules:
 *   - The email is read from env, never hardcoded.
 *   - If the user does not exist, log a clear error and exit 1 — this script
 *     NEVER creates a user (consistent with the existing grant-internal-access
 *     script).
 *   - Existing access record is not duplicated (upsert).
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase()

  if (!email) {
    console.error(
      "INITIAL_SUPER_ADMIN_EMAIL is not set. Set it to the email of an existing user.",
    )
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(
      `[error] No user found with email "${email}". This script never creates users. ` +
        `Create the account first, then re-run.`,
    )
    process.exit(1)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isInternal: true },
  })

  await prisma.internalGlobalAccess.upsert({
    where: {
      userId_accessLevel_scope: {
        userId: user.id,
        accessLevel: "super_admin",
        scope: "all_establishments",
      },
    },
    update: { enabled: true },
    create: {
      userId: user.id,
      accessLevel: "super_admin",
      scope: "all_establishments",
      enabled: true,
    },
  })

  console.log(`[ok] ${email} is now an internal super_admin.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
