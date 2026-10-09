const API = "https://api.notion.com/v1";
const MAX_DEPTH = 3;

type RichText = { plain_text: string }[];
type Block = {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
};

export function isNotionUrl(input: string) {
  return /^https?:\/\/([\w-]+\.)?notion\.(so|site|com)\//i.test(input);
}

export function notionPageId(url: string) {
  const hex = new URL(url).pathname.replace(/-/g, "").match(/[0-9a-f]{32}$/i)?.[0];
  if (!hex) throw new Error(`Can't find a page id in ${url}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function loadNotionPage(url: string) {
  const id = notionPageId(url);
  const page = (await notion(`/pages/${id}`)) as { properties: Record<string, { type: string; title?: RichText; rich_text?: RichText }> };
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  const title = text(titleProp?.title) || "Untitled Notion page";
  // Cards keep text in properties like Description.
  const fields = Object.entries(page.properties)
    .filter(([, p]) => p.type === "rich_text" && text(p.rich_text))
    .map(([name, p]) => `${name}: ${text(p.rich_text)}`);
  const markdown = [title, ...fields, ...(await blocksToMarkdown(id, 0))].join("\n");
  return { id: `NOTION-${id.slice(0, 8)}`, title, markdown };
}

async function notion(pathname: string) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set. Create an internal integration at notion.so/my-integrations and share the page with it.");
  const res = await fetch(`${API}${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) {
    const hint = res.status === 404 ? " (is the page shared with your integration?)" : "";
    throw new Error(`Notion ${res.status}${hint}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function children(id: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | undefined;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = (await notion(`/blocks/${id}/children${q}`)) as { results: Block[]; next_cursor: string | null };
    out.push(...res.results);
    cursor = res.next_cursor ?? undefined;
  } while (cursor);
  return out;
}

async function blocksToMarkdown(id: string, depth: number): Promise<string[]> {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const b of await children(id)) {
    const data = (b[b.type] ?? {}) as { rich_text?: RichText; checked?: boolean; caption?: RichText; type?: string; file?: { url: string }; external?: { url: string } };
    const t = text(data.rich_text);
    switch (b.type) {
      case "heading_1": lines.push(`# ${t}`); break;
      case "heading_2": lines.push(`## ${t}`); break;
      case "heading_3": lines.push(`#### ${t}`); break;
      case "bulleted_list_item": case "toggle": lines.push(`${indent}- ${t}`); break;
      case "numbered_list_item": lines.push(`${indent}1. ${t}`); break;
      case "to_do": lines.push(`${indent}- [${data.checked ? "x" : " "}] ${t}`); break;
      case "quote": case "callout": lines.push(`> ${t}`); break;
      case "code": lines.push("```", t, "```"); break;
      case "image": {
        const src = data.type === "file" ? data.file?.url : data.external?.url;
        if (src) lines.push(`![${text(data.caption)}](${src})`);
        break;
      }
      default: if (t) lines.push(t);
    }
    if (b.has_children && depth < MAX_DEPTH && b.type !== "child_page" && b.type !== "child_database") {
      lines.push(...(await blocksToMarkdown(b.id, depth + 1)));
    }
  }
  return lines;
}

function text(rt: RichText | undefined) {
  return (rt ?? []).map((r) => r.plain_text).join("");
}
