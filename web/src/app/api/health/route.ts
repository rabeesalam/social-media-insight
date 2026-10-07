import { withScope } from '@/lib/api'
import { healthData } from '@/lib/apiData'

export async function GET(request: Request) {
  return withScope(request, healthData)
}
