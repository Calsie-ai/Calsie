import { NextResponse } from 'next/server';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/connector-status/notconnected.svg', request.url), 308);
}
