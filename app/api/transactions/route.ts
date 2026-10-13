import { getContainer } from '@/lib/container';

/** Card-feed transaction ingestion (bonus B2: triggers re-matching of UNMATCHED documents). HTTP only. */
export function POST(request: Request): Promise<Response> {
  return getContainer().transactions(request);
}
