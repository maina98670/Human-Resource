import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'

// ─── useAsync — wraps any async fn with loading/error/data state ──────────────
export function useAsync(asyncFn, immediate = true) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await asyncFn(...args)
      setData(result.data)
      return result.data
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Something went wrong'
      setError(typeof msg === 'object' ? msg.message : msg)
      toast.error(typeof msg === 'object' ? msg.message : msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [asyncFn])

  useEffect(() => { if (immediate) execute() }, [])

  return { data, loading, error, execute, setData }
}

// ─── useDebounce ──────────────────────────────────────────────────────────────
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── usePagination ────────────────────────────────────────────────────────────
export function usePagination(initialPage = 1, pageSize = 20) {
  const [page, setPage] = useState(initialPage)
  const nextPage = () => setPage(p => p + 1)
  const prevPage = () => setPage(p => Math.max(1, p - 1))
  const reset = () => setPage(1)
  return { page, pageSize, setPage, nextPage, prevPage, reset }
}

// ─── useLocalStorage ─────────────────────────────────────────────────────────
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initialValue }
    catch { return initialValue }
  })
  const set = (v) => { setValue(v); localStorage.setItem(key, JSON.stringify(v)) }
  return [value, set]
}

// ─── useClickOutside ─────────────────────────────────────────────────────────
export function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => { if (!ref.current?.contains(e.target)) handler(e) }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}
