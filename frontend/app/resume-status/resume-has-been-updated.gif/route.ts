import { NextResponse } from 'next/server';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/resume-status/resume-has-been-updated.svg', request.url), 308);
}
