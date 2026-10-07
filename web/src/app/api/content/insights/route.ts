import { withScope } from '@/lib/api'
import { contentInsights } from '@/lib/apiData'

export async function GET(request: Request) {
  return withScope(request, contentInsights)
}
