import type { RequestOptions } from '../../transport'

// One mock endpoint: an HTTP method plus a path regex (matched against the path
// below /ovirt-engine/api, query string stripped). Capture groups become the
// handler's params (URI-decoded, in order).
export interface MockRoute {
  method: NonNullable<RequestOptions['method']>
  pattern: RegExp
  handle: (params: string[], body: unknown, query: URLSearchParams) => unknown
}
