import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        host: "db-lab.example",
        "x-forwarded-host": "db-lab.example",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("縦型4ステップとSQL事前ガイドをSSRする", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>DBラボ：学園祭データベース<\/title>/);
  assert.match(html, /MISSION MAP/);
  assert.match(html, /SQLには2つの仕事があります/);
  assert.match(html, /データ定義言語/);
  assert.match(html, /データ操作言語/);
  assert.match(html, /今回の命令を知る/);
  assert.match(html, /SQLを実行する/);
  assert.match(html, /結果を観察する/);
  assert.match(html, /確認問題に答える/);
  assert.match(html, /まだSQLを実行していません/);
  assert.match(html, /実行後に回答/);
  assert.match(html, /CREATE \/ INSERT \/ SELECT \/ WHERE/);
  assert.match(
    html,
    /<meta name="robots" content="noindex, nofollow"\/?>/i,
  );
  assert.match(html, /https:\/\/db-lab\.example\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);

  const guideIndex = html.indexOf("今回の命令を知る");
  const editorIndex = html.indexOf("SQLを実行する");
  const resultIndex = html.indexOf("結果を観察する");
  const checkpointIndex = html.indexOf("確認問題に答える");
  assert.ok(
    guideIndex >= 0 &&
      editorIndex > guideIndex &&
      resultIndex > editorIndex &&
      checkpointIndex > resultIndex,
  );
});

test("スターター用プレビューを残さない", async () => {
  const [page, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /@sqlite\.org\/sqlite-wasm/);
  assert.match(page, /PRAGMA foreign_keys = ON/);
  assert.match(page, /db-lab-progress-v1/);
  assert.match(page, /menu_itemsテーブルのshop_id列/);
  assert.doesNotMatch(page, /menu_items\.shop_id|shops\.shop_id/);
  assert.match(page, /<summary>SQLiteからの詳細<\/summary>/);
  assert.match(page, /setHasResult\(false\)/);
  assert.match(page, /pendingMissionScrollRef\.current = true/);
  assert.match(page, /missionTop\.scrollIntoView/);
  assert.doesNotMatch(page, /window\.scrollTo\(\{\s*top:\s*0/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await assert.rejects(
    access(new URL("../app/_sites-preview/preview.css", import.meta.url)),
  );
});
