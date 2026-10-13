import { NextResponse } from 'next/server';

// Inbound whatsapp webhook — implemented with the ingestion pipeline.
export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
