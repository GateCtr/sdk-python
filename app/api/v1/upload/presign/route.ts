import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { getUploadPresignedUrl, getPublicUrl } from "@/lib/storage";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { filename, contentType, size, scope } = body ?? {};

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (typeof size === "number" && size > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const ext = filename?.split(".").pop()?.toLowerCase() ?? "png";
  const key = `${scope ?? "uploads"}/${clerkId}/${randomBytes(8).toString("hex")}.${ext}`;

  const uploadUrl = await getUploadPresignedUrl(key, contentType);
  const publicUrl = getPublicUrl(key);

  return NextResponse.json({ uploadUrl, publicUrl, key });
}
