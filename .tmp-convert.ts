import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
(async () => {
  const { autoConvertAfterRetainer } = await import("@/lib/autoConvertAfterRetainer");
  await autoConvertAfterRetainer("b8d79fa4-a38f-42f3-aef6-ef66a194cd0d");
})();
