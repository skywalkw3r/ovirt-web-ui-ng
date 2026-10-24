import { request } from '../transport'
import { ApiRootSchema, type ApiRoot } from '../schemas/system'

export async function fetchApiInfo(): Promise<ApiRoot> {
  return ApiRootSchema.parse(await request(''))
}
