import { NextResponse } from "next/server";

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const allowedOrigins = new Set<string>([new URL(request.url).origin]);
    const appUrl = process.env.APP_URL;
    if (appUrl) allowedOrigins.add(new URL(appUrl).origin);

    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const host = forwardedHost || request.headers.get("host");
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (host) {
      const protocol = forwardedProtocol || new URL(request.url).protocol.replace(/:$/, "");
      allowedOrigins.add(new URL(`${protocol}://${host}`).origin);
    }

    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function badOrigin() {
  return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
