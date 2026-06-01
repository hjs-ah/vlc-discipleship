// api/notion-sync.js
// Vercel serverless function -- proxies feedback entries to Notion.
// Called from the browser after a successful Supabase insert.
// Reads NOTION_TOKEN and NOTION_DB_ID from server-side env vars (no VITE_ prefix needed).

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB_ID = process.env.NOTION_DB_ID;

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    // Notion not configured -- silently succeed so the app doesn't error
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { entry, moduleName } = req.body;

  if (!entry || !entry.body) {
    return res.status(400).json({ error: "Missing entry data" });
  }

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
          Name: { title: [{ text: { content: `${entry.type} -- ${moduleName || "General"}` } }] },
          Author: { rich_text: [{ text: { content: entry.author || "Anonymous" } }] },
          Type: { select: { name: entry.type || "comment" } },
          Module: { rich_text: [{ text: { content: moduleName || "" } }] },
          Field: { rich_text: [{ text: { content: entry.field || "" } }] },
          Body: { rich_text: [{ text: { content: entry.body } }] },
          Status: { select: { name: entry.status || "pending" } },
          Date: { date: { start: new Date().toISOString() } },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[notion-sync] Notion error:", response.status, err);
      return res.status(200).json({ ok: false, notionError: response.status });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[notion-sync] Unexpected error:", err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
