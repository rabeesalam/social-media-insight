import { withScope } from '@/lib/api'
import { summaryData } from '@/lib/apiData'

export async function GET(request: Request) {
  return withScope(request, summaryData)
}
