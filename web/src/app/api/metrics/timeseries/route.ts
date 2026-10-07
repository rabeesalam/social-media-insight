import { withScope } from '@/lib/api'
import { timeseriesData } from '@/lib/apiData'

export async function GET(request: Request) {
  return withScope(request, timeseriesData)
}
