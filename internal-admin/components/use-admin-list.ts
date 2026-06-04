"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ListState<T> {
  rows: T[]
  pagination: PaginationMeta
  loading: boolean
  error: string | null
}

/**
 * Generic paginated-list fetcher for the admin tables.
 *
 * `basePath` is the API path; `params` is a record of query params (empty values
 * are dropped). Refetches whenever `params` (serialized) or `page` changes.
 * Debounces param changes slightly to keep typing in search boxes smooth.
 */
export function useAdminList<T>(
  basePath: string,
  params: Record<string, string>,
  page: number,
  limit = 25,
): ListState<T> & { reload: () => void } {
  const [state, setState] = useState<ListState<T>>({
    rows: [],
    pagination: { page, limit, total: 0, totalPages: 1 },
    loading: true,
    error: null,
  })

  const serialized = JSON.stringify(params)
  const reqId = useRef(0)

  const fetchData = useCallback(async () => {
    const id = ++reqId.current
    setState((s) => ({ ...s, loading: true, error: null }))

    const qs = new URLSearchParams()
    qs.set("page", String(page))
    qs.set("limit", String(limit))
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") qs.set(k, v)
    }

    try {
      const res = await fetch(`${basePath}?${qs.toString()}`, { credentials: "include" })
      if (id !== reqId.current) return
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false, error: res.status === 400 ? "Invalid query" : "Failed to load" }))
        return
      }
      const json = (await res.json()) as { data: T[]; pagination: PaginationMeta }
      if (id !== reqId.current) return
      setState({ rows: json.data, pagination: json.pagination, loading: false, error: null })
    } catch {
      if (id !== reqId.current) return
      setState((s) => ({ ...s, loading: false, error: "Network error" }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, serialized, page, limit])

  useEffect(() => {
    const t = setTimeout(fetchData, 200)
    return () => clearTimeout(t)
  }, [fetchData])

  return { ...state, reload: fetchData }
}
