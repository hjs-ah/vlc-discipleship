// api/notion-update.js
// Updates the Status of an existing Notion page when admin resolves or deletes.
// Finds the page by Supabase ID property, then patches its Status.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DB_ID = process.env.NOTION_DB_ID;

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { supabaseId, status } = req.body || {};
  if (!supabaseId) return res.status(400).json({ error: "Missing supabaseId" });

  console.log("[notion-update] Looking for page with Supabase ID:", supabaseId, "-> status:", status);

  try {
    // Find the Notion page by Supabase ID property
    const searchRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: {
            property: "Supabase ID",
            rich_text: { equals: supabaseId },
          },
        }),
      }
    );

    const searchData = await searchRes.json();
    const page = searchData?.results?.[0];

    if (!page) {
      console.warn("[notion-update] No Notion page found for Supabase ID:", supabaseId);
      return res.status(200).json({ ok: false, reason: "not found" });
    }

    if (status === "deleted") {
      // Archive the Notion page (Notion doesn't support hard delete via API)
      const archiveRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ archived: true }),
      });
      console.log("[notion-update] Archived page:", page.id, archiveRes.status);
      return res.status(200).json({ ok: archiveRes.ok });
    }

    // Update status property
    const updateRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        properties: {
          Status: { select: { name: status } },
        },
      }),
    });

    const ok = updateRes.ok;
    console.log("[notion-update] Updated status to", status, "->", updateRes.status);
    return res.status(200).json({ ok });

  } catch (err) {
    console.error("[notion-update] Error:", err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
