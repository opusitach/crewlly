import { Prisma } from "@prisma/client"

const DEFAULT_PERMISSION_DEFINITIONS: Array<{ key: string; name: string; description: string }> = [
  { key: "workday:create", name: "Create Workday", description: "Can create workdays" },
  { key: "workday:edit", name: "Edit Workday", description: "Can edit workdays" },
  { key: "workday:publish", name: "Publish Workday", description: "Can publish workdays" },
  { key: "workday:delete", name: "Delete Workday", description: "Can delete workdays" },
  { key: "interval:create", name: "Create Interval", description: "Can create work intervals" },
  { key: "interval:edit", name: "Edit Interval", description: "Can edit work intervals" },
  { key: "interval:delete", name: "Delete Interval", description: "Can delete work intervals" },
  { key: "employee:view", name: "View Employees", description: "Can view employees" },
  { key: "employee:create", name: "Create Employee", description: "Can create employees" },
  { key: "employee:edit", name: "Edit Employee", description: "Can edit employees" },
  { key: "employee:delete", name: "Delete Employee", description: "Can delete employees" },
  { key: "cash:view", name: "View Cash", description: "Can view cash sessions" },
  { key: "cash:manage", name: "Manage Cash", description: "Can manage cash sessions" },
  { key: "tips:view", name: "View Tips", description: "Can view tips" },
  { key: "tips:manage", name: "Manage Tips", description: "Can manage tips" },
  { key: "payroll:view", name: "View Payroll", description: "Can view payroll" },
  { key: "payroll:manage", name: "Manage Payroll", description: "Can manage payroll" },
  { key: "settings:view", name: "View Settings", description: "Can view settings" },
  { key: "settings:manage", name: "Manage Settings", description: "Can manage organization settings" },
  { key: "reports:view", name: "View Reports", description: "Can view reports" },
]

const WORKER_PERMISSION_KEYS = new Set(["employee:view", "cash:view", "tips:view"])
const MANAGER_FORBIDDEN_KEYS = new Set(["settings:manage", "payroll:manage", "employee:delete"])

export async function ensureDefaultRolesAndPermissions(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.accessPermission.createMany({
    data: DEFAULT_PERMISSION_DEFINITIONS,
    skipDuplicates: true,
  })

  const [ownerRole, managerRole, workerRole, permissions] = await Promise.all([
    tx.accessRole.upsert({
      where: { organizationId_key: { organizationId, key: "owner" } },
      create: { organizationId, key: "owner", name: "Владелец", isSystem: true },
      update: {},
    }),
    tx.accessRole.upsert({
      where: { organizationId_key: { organizationId, key: "manager" } },
      create: { organizationId, key: "manager", name: "Менеджер", isSystem: true },
      update: {},
    }),
    tx.accessRole.upsert({
      where: { organizationId_key: { organizationId, key: "worker" } },
      create: { organizationId, key: "worker", name: "Сотрудник", isSystem: true },
      update: {},
    }),
    tx.accessPermission.findMany({ select: { id: true, key: true } }),
  ])

  const byPermissionKey = new Map(permissions.map((permission) => [permission.key, permission.id]))

  const ownerPermissions = Array.from(byPermissionKey.values())
  const managerPermissions = Array.from(byPermissionKey.entries())
    .filter(([key]) => !MANAGER_FORBIDDEN_KEYS.has(key))
    .map(([, id]) => id)
  const workerPermissions = Array.from(byPermissionKey.entries())
    .filter(([key]) => WORKER_PERMISSION_KEYS.has(key))
    .map(([, id]) => id)

  await Promise.all([
    assignPermissionsToRole(tx, ownerRole.id, ownerPermissions),
    assignPermissionsToRole(tx, managerRole.id, managerPermissions),
    assignPermissionsToRole(tx, workerRole.id, workerPermissions),
  ])

  return {
    ownerRole,
    managerRole,
    workerRole,
  }
}

async function assignPermissionsToRole(
  tx: Prisma.TransactionClient,
  accessRoleId: string,
  permissionIds: string[],
) {
  if (permissionIds.length === 0) return

  await tx.accessRolePermission.createMany({
    data: permissionIds.map((permissionId) => ({
      accessRoleId,
      permissionId,
    })),
    skipDuplicates: true,
  })
}
