import { NextResponse } from 'next/server';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/resume-status/statusupload-resume.gif', request.url), 308);
}
