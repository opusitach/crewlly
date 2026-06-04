/**
 * Bland 403 page. No detail about why access was denied — we don't reveal the
 * admin app's authorization model to ineligible users.
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">403 — Forbidden</h1>
        <p className="mt-2 text-sm text-neutral-600">
          You do not have permission to access this resource.
        </p>
      </div>
    </main>
  )
}
