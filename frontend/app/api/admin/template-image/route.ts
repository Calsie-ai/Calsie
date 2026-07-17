import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = "template-images";

async function requireAdmin(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminError } = await admin
    .from("applix_admin_users")
    .select("user_id,role")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (adminError || !adminRow) return null;
  return { admin, userId: authData.user.id };
}

function safeExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return byType[file.type] || "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAdmin(request);
    if (!context) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    const slug = String(formData.get("slug") || "template").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const previousPath = String(formData.get("previous_path") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, and WebP images are supported." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
    }

    const path = `${context.userId}/${slug}-${Date.now()}.${safeExtension(file)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await context.admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (uploadError) throw uploadError;

    if (previousPath && previousPath !== path) {
      await context.admin.storage.from(bucket).remove([previousPath]);
    }

    const { data } = context.admin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, image_path: path, image_url: data.publicUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireAdmin(request);
    if (!context) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const path = String(body?.image_path || "");
    if (!path) return NextResponse.json({ ok: true });

    const { error } = await context.admin.storage.from(bucket).remove([path]);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image removal failed." },
      { status: 500 },
    );
  }
}