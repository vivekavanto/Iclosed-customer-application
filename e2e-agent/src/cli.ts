import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { testRequirement } from "./agent.js";
import { counts, writeReports, type Result } from "./report.js";
import { loadRequirements, type Requirement } from "./requirements.js";

const ROOT = path.resolve(import.meta.dirname, "..");
for (const f of [path.join(ROOT, ".env"), path.join(ROOT, "../.env.local")]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "base-url": { type: "string", default: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
    only: { type: "string", multiple: true },
    "max-steps": { type: "string", default: "30" },
    headed: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || !positionals.length) {
  console.log(`Usage:
  npm run req -- requirements/iclosed.md            test every requirement in a file
  npm run req -- "Login shows an error for a wrong password"   test one inline requirement
  npm run req -- https://www.notion.so/My-Story-<id>             test a Notion page (needs NOTION_TOKEN)
  npm run req -- file.md "another inline requirement" ...      mix any of these

Options:
  --base-url <url>    app under test (default http://localhost:3000, or E2E_BASE_URL)
  --only <ID>         run only these requirement ids (repeatable)
  --max-steps <n>     browser actions allowed per requirement (default 30)
  --headed            show the browser
  --allow-remote      permit a non-localhost base URL

Requirements may include "Start: /path", "Auth: yes" and "Image: ./mockup.png" lines,
or markdown images ![alt](path-or-url) as references for the expected result.`);
  process.exit(values.help ? 0 : 1);
}

const baseUrl = values["base-url"]!.replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl) && !values["allow-remote"]) {
  console.error(`Refusing to test ${baseUrl} without --allow-remote (the agent fills and submits forms).`);
  process.exit(1);
}

let reqs = await loadRequirements(positionals).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
if (values.only?.length) reqs = reqs.filter((r) => values.only!.includes(r.id));
if (!reqs.length) {
  console.error("No requirements found. In .md files, each requirement is a `### ID Title` heading.");
  process.exit(1);
}

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const credentials = email && password
  ? `Test account for sign-in when needed: email ${email}, password ${password}.`
  : "No test account is configured; requirements that need sign-in are BLOCKED.";

const startedAt = new Date();
const outDir = path.join(ROOT, "reports", startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19));
mkdirSync(outDir, { recursive: true });
const authFile = path.join(ROOT, ".auth", "state.json");
const maxSteps = Number(values["max-steps"]);

const browser = await chromium.launch({ headless: !values.headed });
const results: Result[] = [];
let authReady: boolean | null = null;

try {
  for (const [i, req] of reqs.entries()) {
    console.log(`\n[${i + 1}/${reqs.length}] ${req.id} ${req.title}`);
    const t0 = Date.now();

    if (req.auth && authReady === null) authReady = await signIn(browser);
    if (req.auth && !authReady) {
      results.push({ req, seconds: 0, verdict: { status: "BLOCKED", summary: "Needs a signed-in user, but sign-in failed or E2E_USER_EMAIL/E2E_USER_PASSWORD are not set.", criteria: [], steps: [] } });
      console.log("  ⛔ skipped: no signed-in session");
      continue;
    }

    const context = await newContext(browser, req.auth);
    const page = await context.newPage();
    const verdict = await testRequirement({
      page,
      req,
      baseUrl,
      maxSteps,
      credentials,
      screenshotPath: path.join(outDir, `${req.id}.png`),
      log: console.log,
    });
    await context.close();
    results.push({ req, verdict, seconds: Math.round((Date.now() - t0) / 1000) });
    console.log(`  ${verdict.summary}`);
    writeReports(outDir, results, { baseUrl, startedAt });
  }
} finally {
  await browser.close();
}

writeReports(outDir, results, { baseUrl, startedAt });
console.log(`\n${counts(results).map(([s, n]) => `${s}: ${n}`).join("  ")}`);
console.log(`Report: ${path.join(outDir, "report.html")}`);
process.exitCode = results.every((r) => r.verdict.status === "PASS") ? 0 : 1;

async function newContext(b: Browser, signedIn: boolean): Promise<BrowserContext> {
  return b.newContext({
    baseURL: baseUrl,
    viewport: { width: 1280, height: 900 },
    storageState: signedIn && existsSync(authFile) ? authFile : undefined,
  });
}

// Signs in once per run for `Auth: yes`.
async function signIn(b: Browser): Promise<boolean> {
  if (!email || !password) return false;
  console.log("\n[auth] signing in as test user");
  const context = await newContext(b, false);
  const page = await context.newPage();
  const login: Requirement = {
    id: "AUTH",
    title: "Sign in as the test user",
    section: "",
    start: process.env.E2E_LOGIN_PATH ?? "/login",
    auth: false,
    images: [],
    body: "Sign in with the test account. PASS once you are on a signed-in page (e.g. a dashboard). FAIL if sign-in is rejected.",
  };
  const verdict = await testRequirement({
    page, req: login, baseUrl, maxSteps: 12, credentials,
    screenshotPath: path.join(outDir, "AUTH.png"),
    log: console.log,
  });
  const ok = verdict.status === "PASS";
  if (ok) {
    mkdirSync(path.dirname(authFile), { recursive: true });
    await context.storageState({ path: authFile });
  }
  console.log(`  ${ok ? "signed in" : `sign-in failed: ${verdict.summary}`}`);
  await context.close();
  return ok;
}
