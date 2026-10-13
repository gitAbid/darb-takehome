import { NextResponse } from 'next/server';

// Inbound email webhook — implemented with the ingestion pipeline.
export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
