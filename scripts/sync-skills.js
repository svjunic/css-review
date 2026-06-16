#!/usr/bin/env node
/**
 * ビルド後に css-diff CLI を css-verify スキルへバンドルして同期する。
 * package.json の postbuild から呼ばれる。
 *
 * bin/css-diff.js + src/core/*.js + postcss を単一の CJS ファイルにバンドルするため、
 * スキルディレクトリに node_modules は不要。
 */
import { buildSync } from "esbuild";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, ".claude/skills/css-verify/bin/css-diff.cjs");

mkdirSync(dirname(OUT), { recursive: true });

const bundledCss = readFileSync(join(ROOT, "src/styles.css"), "utf8");

buildSync({
  entryPoints: [join(ROOT, "bin/css-diff.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: OUT,
  target: "node18",
  // import.meta.url は --version フラグのパッケージ読み込みにのみ使用。
  // バンドル後は空になるが、差分検証機能には影響しない。
  define: {
    // src/reporters/html.js がバンドル時にこの定数でCSSをインライン化する
    __BUNDLED_CSS__: JSON.stringify(bundledCss),
  },
  logLevel: "error",
});

console.log("✓ bundled css-diff CLI to .claude/skills/css-verify/bin/css-diff.cjs");
