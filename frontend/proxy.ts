import { NextResponse, type NextRequest } from "next/server";

// Legacy Calsie routes still depend on the old database. Keep them outside
// the fresh Jobs-project application until each feature is rebuilt there.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This legacy service is not available in the new Calsie app." }, { status: 410 });
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export const config = {
  matcher: [
    "/api/:path*", "/profile", "/campaign/:path*", "/matching",
    "/payment", "/admin/:path*", "/apply", "/applying/:path*",
    "/resume-canvas", "/dashboard-design", "/dashboard/jobs/:path*",
    "/dev-cockpit", "/adzuna-test",
  ],
};
