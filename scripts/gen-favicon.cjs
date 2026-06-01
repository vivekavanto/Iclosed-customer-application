// One-off favicon generator. Takes the wide public/logo.png wordmark and
// produces clean SQUARE icon assets (white background, logo centered with
// padding) so the favicon never appears letterboxed or transparent-boxed.
// Run from the project root: node scripts/gen-favicon.cjs
const fs = require("fs");
const path = require("path");

// Resolve sharp from the pnpm store (not hoisted to top-level node_modules).
const pnpmDir = path.join(__dirname, "..", "node_modules", ".pnpm");
const sharpPkg = fs.readdirSync(pnpmDir).find((d) => /^sharp@/.test(d));
if (!sharpPkg) throw new Error("sharp not found in node_modules/.pnpm");
const sharp = require(path.join(pnpmDir, sharpPkg, "node_modules", "sharp"));

const SRC = path.join(__dirname, "..", "public", "logo.png");
const OUT = path.join(__dirname, "..", "public");

// White, fully-opaque background (apple-touch-icon must not be transparent or
// iOS fills it with black).
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

// size = final square px; padRatio = fraction of the square kept as margin.
async function makeSquare(size, padRatio, outName) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: BG })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, outName));

  console.log(`wrote ${outName} (${size}x${size})`);
}

(async () => {
  const meta = await sharp(SRC).metadata();
  console.log(`source logo: ${meta.width}x${meta.height}`);

  await makeSquare(16, 0.06, "favicon-16x16.png");
  await makeSquare(32, 0.08, "favicon-32x32.png");
  await makeSquare(48, 0.08, "favicon-48x48.png");
  await makeSquare(180, 0.12, "apple-touch-icon.png");
  await makeSquare(192, 0.12, "icon-192.png");
  await makeSquare(512, 0.12, "icon-512.png");
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
