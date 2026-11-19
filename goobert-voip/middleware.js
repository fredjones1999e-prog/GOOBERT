// Vercel Edge Middleware: serve a real maintenance response before the app loads.
const SUPABASE_URL = "https://bdbzpwsdjuoigpxntlim.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VqRbHogpVXM8DEwPb9xQvQ_y5bME2ZW";

const maintenanceHtml = (message) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Goobert VoIP — Maintenance</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0,#28164c 0,transparent 55%),#090914;color:#f7f2ff;font:16px system-ui,Segoe UI,sans-serif;text-align:center}
main{max-width:520px} .frog{font-size:68px} .eyebrow{letter-spacing:3px;color:#b99aff;font-size:11px;font-weight:800}h1{font-size:clamp(30px,6vw,46px);margin:14px 0}p{color:#aaa8c5;line-height:1.7}.foot{margin-top:28px;color:#77758f;font-size:12px}
</style></head><body><main><div class="frog">🐸</div><div class="eyebrow">GOOBERT VOIP</div><h1>Temporarily offline</h1><p>${message}</p><div class="foot">We'll be back shortly.</div></main></body></html>`;

export const config = {
  matcher: ["/((?!_vercel/|favicon.ico).*)"]
};

export default async function middleware(request) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=is_offline,message&id=eq.1`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      // If maintenance status cannot be checked, let the regular site load;
      // the browser-side checker will also report the issue in its console.
      return;
    }

    const rows = await response.json();
    const settings = rows?.[0];
    if (settings?.is_offline) {
      const message = String(settings.message || "Goobert is temporarily offline for maintenance. Please try again soon.")
        .replace(/[<>&"']/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;" }[c]));
      return new Response(maintenanceHtml(message), {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Retry-After": "60"
        }
      });
    }
  } catch (error) {
    // Do not take the site offline just because Supabase has a temporary hiccup.
    console.error("Goobert maintenance middleware check failed:", error);
  }
}
