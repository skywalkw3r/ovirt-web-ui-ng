/**
 * The slice of a TanStack `UseQueryResult` the option-list primitives
 * (OptionsSelect / OptionsHelper) read. Structural on purpose: any query result
 * (or a hand-built stub in tests) satisfies it without importing the TanStack
 * types.
 */
export interface OptionsQuery<T> {
  data: T[] | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export type OptionsStatus = 'loading' | 'error' | 'empty' | 'ready'

/**
 * The four states of a form option list, derived from its query (CLAUDE.md
 * "Four states, always" — inside dialogs too): `loading` until the first read
 * settles, `error` when it failed, `empty` on a successful read that returned
 * no rows, `ready` otherwise. A failed catalog read must never pass for an
 * empty catalog, so `error` wins over whatever `data` is left over.
 */
export function optionsStatus<T>(query: OptionsQuery<T>): OptionsStatus {
  if (query.isError) return 'error'
  if (query.isPending) return 'loading'
  return (query.data?.length ?? 0) === 0 ? 'empty' : 'ready'
}
