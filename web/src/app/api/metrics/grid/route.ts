import { withScope } from '@/lib/api'
import { gridData } from '@/lib/apiData'

export async function GET(request: Request) {
  return withScope(request, gridData)
}
