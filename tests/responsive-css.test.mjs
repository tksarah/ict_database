import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("PC・タブレット・スマートフォンの配置ルールを持つ", () => {
  assert.match(css, /\.shell\s*\{[\s\S]*grid-template-columns:\s*244px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width:\s*1120px\)[\s\S]*\.lab-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.topbar\s*\{[\s\S]*align-items:\s*flex-start/);
  assert.match(css, /@media \(max-width:\s*460px\)[\s\S]*\.actions \.button\s*\{[\s\S]*width:\s*100%/);
});

test("キーボードフォーカスと動きを抑える設定を持つ", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
