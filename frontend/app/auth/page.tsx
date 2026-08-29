import { redirect } from "next/navigation";
import { safeInternalPath } from "../../lib/navigation";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeInternalPath(nextValue);
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

