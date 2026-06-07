"use client"

/**
 * Admin layout shell: header + side nav + content area.
 *
 * Pages render `<AdminShell access={...}>{content}</AdminShell>`. Active nav item
 * is derived from the current pathname. Real navigation links (not tab state) so
 * each section is a real URL.
 */
import type { ReactNode } from "react"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { AdminAccessContext } from "../lib/admin-access"

interface NavItem {
  href: string
  label: string
  // Only render this item when the user is a super_admin.
  superAdminOnly?: boolean
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/organizations", label: "Organizations" },
  { href: "/users", label: "Users" },
  { href: "/audit-logs", label: "Audit Logs" },
  // Write feature — only surfaced to super_admins, so read-only admins never see
  // a link they can't use.
  { href: "/internal-access", label: "Internal Access", superAdminOnly: true },
]

interface Props {
  access: AdminAccessContext
  children: ReactNode
}

export default function AdminShell({ access, children }: Props) {
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => {
    setLoggingOut(true)
    try {
      const mainApp = process.env.NEXT_PUBLIC_MAIN_APP_URL || ""
      await fetch(`${mainApp}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {})
      window.location.href = mainApp ? `${mainApp}/login` : "/"
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-500 text-white">
              <span className="text-sm font-bold">C</span>
            </div>
            <div>
              <h1 className="text-base font-semibold">Crewlly Internal Admin</h1>
              <p className="text-xs text-neutral-500">Platform administration · read-only</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{access.user.fullName || access.user.email}</div>
              <div className="text-xs text-neutral-500">
                {access.enabledLevels.join(", ") || "no levels"}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {loggingOut ? "Signing out…" : "Logout"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav className="w-48 flex-shrink-0">
          <ul className="space-y-1 text-sm">
            {NAV.filter((item) => !item.superAdminOnly || access.isSuperAdmin).map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/")
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={
                      "block rounded px-3 py-2 transition-colors " +
                      (active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-700 hover:bg-neutral-100")
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-medium">Read-only console</div>
            <p className="mt-1 text-amber-800">
              This app cannot edit business data. Use{" "}
              <a
                href={process.env.NEXT_PUBLIC_MAIN_APP_URL || "/"}
                className="font-medium underline"
              >
                crewlly.com
              </a>{" "}
              with an internal access session to take actions.
            </p>
          </div>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
