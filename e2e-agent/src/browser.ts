import { existsSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";

export type ToolResult = { text: string; image?: Buffer };

const TEXT_LIMIT = 6000;

export class BrowserTools {
  private problems: string[] = [];

  constructor(
    private page: Page,
    private baseUrl: string,
    private fixturesDir: string,
  ) {
    page.on("console", (m) => {
      if (m.type() === "error") this.problems.push(`console error: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => this.problems.push(`uncaught exception: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => {
      if (r.status() >= 500) this.problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    });
  }

  async run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case "navigate":
          return await this.navigate(String(args.path));
        case "click":
          await this.ref(args.ref).click({ timeout: 5000 });
          return await this.settled();
        case "type":
          await this.ref(args.ref).fill(String(args.text ?? ""), { timeout: 5000 });
          if (args.submit) await this.ref(args.ref).press("Enter");
          return await this.settled();
        case "select_option":
          await this.ref(args.ref).selectOption(String(args.value), { timeout: 5000 });
          return await this.settled();
        case "set_checked":
          await this.ref(args.ref).setChecked(Boolean(args.checked), { timeout: 5000 });
          return await this.settled();
        case "upload_file":
          return await this.upload(args.ref, String(args.fixture));
        case "press_key":
          await this.page.keyboard.press(String(args.key));
          return await this.settled();
        case "scroll":
          await this.page.mouse.wheel(0, args.direction === "up" ? -800 : 800);
          return await this.settled();
        case "wait":
          await this.page.waitForTimeout(Math.min(Number(args.seconds) || 1, 10) * 1000);
          return await this.snapshot();
        case "go_back":
          await this.page.goBack();
          return await this.settled();
        case "snapshot":
          return await this.snapshot();
        case "screenshot":
          return { text: "Screenshot attached.", image: await this.page.screenshot() };
        default:
          return { text: `Unknown tool ${name}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      const snap = await this.snapshot().catch(() => ({ text: "" }));
      return { text: `ACTION FAILED: ${msg}\n\n${snap.text}` };
    }
  }

  async navigate(target: string): Promise<ToolResult> {
    const url = new URL(target, this.baseUrl);
    if (url.origin !== new URL(this.baseUrl).origin) {
      return { text: `Refused: ${url.origin} is outside the app under test.` };
    }
    await this.page.goto(url.href, { waitUntil: "domcontentloaded" });
    return this.settled();
  }

  async screenshot(file: string) {
    await this.page.screenshot({ path: file, fullPage: true }).catch(() => {});
  }

  private ref(ref: unknown) {
    return this.page.locator(`[data-e2e-ref="${String(ref)}"]`).first();
  }

  private async upload(ref: unknown, fixture: string): Promise<ToolResult> {
    const file = path.join(this.fixturesDir, path.basename(fixture));
    if (!existsSync(file)) return { text: `No fixture named ${fixture} in fixtures/.` };
    await this.ref(ref).setInputFiles(file, { timeout: 5000 });
    return this.settled();
  }

  private async settled(): Promise<ToolResult> {
    await this.page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await this.page.waitForTimeout(300);
    return this.snapshot();
  }

  async snapshot(): Promise<ToolResult> {
    // tsx adds __name() to function source.
    const { elements, text } = (await this.page.evaluate(
      `(() => { const __name = (f) => f; return (${collectPage.toString()})(); })()`,
    )) as ReturnType<typeof collectPage>;
    const problems = this.problems.splice(0);
    const parts = [
      `URL: ${this.page.url()}`,
      `Title: ${await this.page.title()}`,
      problems.length ? `Errors since last action:\n${problems.join("\n")}` : "",
      `Interactive elements:\n${elements.join("\n") || "(none)"}`,
      `Visible text:\n${text.length > TEXT_LIMIT ? text.slice(0, TEXT_LIMIT) + " …(truncated)" : text}`,
    ];
    return { text: parts.filter(Boolean).join("\n\n") };
  }
}

function collectPage() {
  const SELECTOR = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]",
    "[role=menuitem]", "[role=option]", "[role=switch]", "[role=combobox]",
    "[contenteditable=true]",
  ].join(",");

  document.querySelectorAll("[data-e2e-ref]").forEach((el) => el.removeAttribute("data-e2e-ref"));

  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[aria-hidden=true]");
  };
  const labelFor = (el: HTMLElement) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(" ").map((id) => document.getElementById(id)?.textContent).join(" ");
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent;
    }
    const wrap = el.closest("label");
    if (wrap && wrap !== el) return wrap.textContent;
    return el.getAttribute("placeholder") || el.innerText || el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("name");
  };

  const elements: string[] = [];
  let n = 0;
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (!visible(el) && !(el instanceof HTMLInputElement && el.type === "file")) return;
    const ref = `e${++n}`;
    el.setAttribute("data-e2e-ref", ref);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "input" ? `input[${(el as HTMLInputElement).type}]` : tag);
    const bits = [`[${ref}] ${role} "${clean(labelFor(el)).slice(0, 80)}"`];
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) bits.push(el.checked ? "checked" : "unchecked");
      else if (el.type !== "file") bits.push(`value="${el.type === "password" ? "•".repeat(el.value.length) : clean(el.value).slice(0, 60)}"`);
    }
    if (el instanceof HTMLSelectElement) {
      bits.push(`selected="${clean(el.selectedOptions[0]?.text)}" options=[${Array.from(el.options).slice(0, 15).map((o) => clean(o.text)).join(" | ")}]`);
    }
    if (el instanceof HTMLAnchorElement) bits.push(`href=${el.getAttribute("href")}`);
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") bits.push("disabled");
    if (el.getAttribute("aria-invalid") === "true") bits.push("invalid");
    elements.push(bits.join(" "));
  });

  // onClick cards only show as cursor: pointer.
  document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
    if (el.closest("[data-e2e-ref]") || getComputedStyle(el).cursor !== "pointer") return;
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer") return;
    if (!visible(el)) return;
    const ref = `e${++n}`;
    el.setAttribute("data-e2e-ref", ref);
    elements.push(`[${ref}] clickable "${clean(el.getAttribute("aria-label") || el.innerText).slice(0, 80)}"`);
  });

  return { elements, text: (document.body?.innerText ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim() };
}
