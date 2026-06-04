/**
 * Grant internal platform access to existing users.
 *
 * Usage:
 *   npx tsx scripts/grant-internal-access.ts
 *
 * Required env vars (comma-separated email lists):
 *   INTERNAL_ACCESS_OWNER_VIEW_EMAILS=alice@example.com,bob@example.com
 *   INTERNAL_ACCESS_EMPLOYEE_VIEW_EMAILS=carol@example.com,dave@example.com
 *
 * The script is idempotent — safe to re-run. It upserts access records and
 * sets isInternal=true on the user. It never creates new users or modifies
 * OrganizationMember records.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function parseEmails(envValue: string | undefined): string[] {
  if (!envValue) return []
  return envValue
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

async function grantAccess(
  email: string,
  accessLevel: "owner_view" | "employee_view",
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    console.warn(`  [skip] user not found: ${email}`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isInternal: true },
  })

  await prisma.internalGlobalAccess.upsert({
    where: {
      userId_accessLevel_scope: {
        userId: user.id,
        accessLevel,
        scope: "all_establishments",
      },
    },
    update: { enabled: true },
    create: {
      userId: user.id,
      accessLevel,
      scope: "all_establishments",
      enabled: true,
    },
  })

  console.log(`  [ok] ${email} → ${accessLevel}`)
}

async function main(): Promise<void> {
  const ownerViewEmails = parseEmails(process.env.INTERNAL_ACCESS_OWNER_VIEW_EMAILS)
  const employeeViewEmails = parseEmails(process.env.INTERNAL_ACCESS_EMPLOYEE_VIEW_EMAILS)

  if (ownerViewEmails.length === 0 && employeeViewEmails.length === 0) {
    console.error(
      "No emails configured. Set INTERNAL_ACCESS_OWNER_VIEW_EMAILS and/or INTERNAL_ACCESS_EMPLOYEE_VIEW_EMAILS.",
    )
    process.exit(1)
  }

  console.log("Granting internal access...")

  for (const email of ownerViewEmails) {
    await grantAccess(email, "owner_view")
  }

  for (const email of employeeViewEmails) {
    await grantAccess(email, "employee_view")
  }

  console.log("Done.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
