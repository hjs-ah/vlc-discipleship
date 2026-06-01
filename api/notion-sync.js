// api/notion-sync.js
// Vercel serverless function -- proxies feedback entries to Notion.
// Property names match the exact schema of the D2D Curriculum Feedback Log database.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB_ID = process.env.NOTION_DB_ID;

  console.log("[notion-sync] Token present:", !!NOTION_TOKEN);
  console.log("[notion-sync] DB ID present:", !!NOTION_DB_ID);

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    console.warn("[notion-sync] Skipping -- NOTION_TOKEN or NOTION_DB_ID not set in Vercel env vars (no VITE_ prefix).");
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { entry, moduleName } = req.body || {};

  if (!entry || !entry.body) {
    return res.status(400).json({ error: "Missing entry data" });
  }

  // Build title: "comment -- Month 3 -- Antone Holmes"
  const title = [entry.type, moduleName, entry.author].filter(Boolean).join(" -- ");

  // Module must be one of the select options: "Month 1" through "Month 12" or "Rotation View"
  // Extract just the "Month X" part from moduleName like "Month 3 -- Developing a Relationship..."
  const moduleMatch = (moduleName || "").match(/^(Month \d+|Rotation View)/);
  const moduleSelect = moduleMatch ? moduleMatch[1] : null;

  const properties = {
    // Title property (required, named "Title" in this database)
    "Title": {
      title: [{ text: { content: title } }]
    },
    // Author -- text
    "Author": {
      rich_text: [{ text: { content: entry.author || "Anonymous" } }]
    },
    // Type -- select: "comment" | "edit" | "question"
    "Type": {
      select: { name: entry.type || "comment" }
    },
    // Status -- select: "pending" | "approved" | "rejected"
    "Status": {
      select: { name: entry.status || "pending" }
    },
    // Body -- text
    "Body": {
      rich_text: [{ text: { content: (entry.body || "").slice(0, 2000) } }]
    },
    // Field -- text (optional)
    "Field": {
      rich_text: [{ text: { content: entry.field || "" } }]
    },
    // Supabase ID -- text
    "Supabase ID": {
      rich_text: [{ text: { content: String(entry.id || "") } }]
    },
    // Submitted -- date (ISO format)
    "Submitted": {
      date: { start: new Date().toISOString() }
    },
  };

  // Only add Module if it matches a valid select option
  if (moduleSelect) {
    properties["Module"] = { select: { name: moduleSelect } };
  }

  console.log("[notion-sync] Sending entry:", title, "| module:", moduleSelect);

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
        properties,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[notion-sync] Notion API error:", response.status, responseText.slice(0, 300));
      return res.status(200).json({ ok: false, notionError: response.status, detail: responseText.slice(0, 300) });
    }

    console.log("[notion-sync] Success -- page created in Notion");
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[notion-sync] Unexpected error:", err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
