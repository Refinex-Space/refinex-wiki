import type { NextRequest } from 'next/server';

import { NextResponse } from 'next/server';

import { resolveLinkPreviewMetadata } from '@/lib/link-preview-metadata';

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url') ?? '';
  const title = request.nextUrl.searchParams.get('title') ?? undefined;
  const metadata = await resolveLinkPreviewMetadata({ title, url: source });

  if (metadata.error === 'invalid_url' || metadata.error === 'blocked_url') {
    return NextResponse.json(metadata, { status: 400 });
  }

  return NextResponse.json(metadata);
}
