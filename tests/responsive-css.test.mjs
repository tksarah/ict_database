import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("PC・タブレット・スマートフォンの配置ルールを持つ", () => {
  assert.match(
    css,
    /\.shell\s*\{[\s\S]*grid-template-columns:\s*250px minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /\.learning-flow\s*\{[\s\S]*max-width:\s*980px[\s\S]*display:\s*grid/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*1120px\)[\s\S]*\.shell\s*\{[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*\.checkpoint-options[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*\.insert-schema-table td[\s\S]*grid-template-columns:\s*minmax\(105px, 0\.8fr\) minmax\(0, 1\.7fr\)/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*460px\)[\s\S]*\.actions \.button\s*\{[\s\S]*width:\s*100%/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*460px\)[\s\S]*\.insert-schema-table td[\s\S]*grid-template-columns:\s*1fr/,
  );
});

test("読みやすい文字サイズ・フォーカス・動きを抑える設定を持つ", () => {
  assert.match(css, /body\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.button\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.sql-editor\s*\{[\s\S]*font-size:\s*17px/);
  assert.match(css, /\.result-table\s*\{[\s\S]*font-size:\s*15px/);
  assert.match(css, /\.checkpoint-options span\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
