// api/notion-sync.js
// Vercel serverless function -- proxies feedback entries to Notion.
// Reads NOTION_TOKEN and NOTION_DB_ID from server-side env vars (no VITE_ prefix).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB_ID = process.env.NOTION_DB_ID;

  // Log what the server sees -- appears in Vercel runtime logs
  console.log("[notion-sync] Token present:", !!NOTION_TOKEN);
  console.log("[notion-sync] DB ID present:", !!NOTION_DB_ID, NOTION_DB_ID ? NOTION_DB_ID.slice(0,8)+"..." : "MISSING");

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    console.warn("[notion-sync] Skipping -- env vars not configured. Add NOTION_TOKEN and NOTION_DB_ID in Vercel project settings (no VITE_ prefix).");
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { entry, moduleName } = req.body || {};

  if (!entry || !entry.body) {
    console.warn("[notion-sync] Missing entry data in request body");
    return res.status(400).json({ error: "Missing entry data" });
  }

  console.log("[notion-sync] Syncing entry from:", entry.author, "| module:", moduleName, "| type:", entry.type);

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties: {
          Name:   { title:     [{ text: { content: `${entry.type} -- ${moduleName || "General"}` } }] },
          Author: { rich_text: [{ text: { content: entry.author || "Anonymous" } }] },
          Type:   { select:    { name: entry.type || "comment" } },
          Module: { rich_text: [{ text: { content: moduleName || "" } }] },
          Field:  { rich_text: [{ text: { content: entry.field || "" } }] },
          Body:   { rich_text: [{ text: { content: entry.body } }] },
          Status: { select:    { name: entry.status || "pending" } },
          Date:   { date:      { start: new Date().toISOString() } },
        },
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[notion-sync] Notion API error:", response.status, responseText.slice(0, 200));
      return res.status(200).json({ ok: false, notionError: response.status, detail: responseText.slice(0,200) });
    }

    console.log("[notion-sync] Success -- page created in Notion");
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[notion-sync] Unexpected error:", err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
