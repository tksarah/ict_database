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
  assert.match(page, /function InsertPreparationGuide\(\)/);
  assert.match(page, /まず、追加先の表を確認/);
  assert.match(page, /1行が1つの商品を表します/);
  assert.match(page, /商品を見分ける重複しない番号/);
  assert.match(page, /商品を販売する店舗の番号/);
  assert.match(page, /文字列なので引用符で囲む/);
  assert.match(page, /shops<\/code>の店舗1＝たこ焼き研究会/);
  assert.match(page, /実行前 <strong>0件<\/strong>/);
  assert.match(page, /実行後 <strong>1件<\/strong>/);
  assert.match(
    page,
    /WHERE item_id = 101 AND shop_id = 1 AND item_name = 'たこ焼き' AND price = 500/,
  );
  assert.match(page, /function WherePreparationGuide\(\)/);
  assert.match(page, /まず、しぼり込む前のデータを確認/);
  assert.match(page, /価格の低い順に見て、500円の境界を探しましょう/);
  assert.match(page, /アイスコーヒー/);
  assert.match(page, /チーズたこ焼き/);
  assert.match(page, /500円の境界/);
  assert.match(page, /大きい、または等しい/);
  assert.match(page, /しぼり込み前 <strong>5件<\/strong>/);
  assert.match(page, /しぼり込み後 <strong>4件<\/strong>/);
  assert.match(page, /function matchesWhereResult\(table: SqlTable\)/);
  assert.match(page, /activeView === "bonus"/);
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

test("自由SQLラボの早見表に書式と実行サンプルを持つ", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /<span>書式<\/span>/);
  assert.match(page, /<span>サンプル<\/span>/);
  assert.match(
    page,
    /CREATE TABLE events \(event_id INTEGER PRIMARY KEY, event_name TEXT\);/,
  );
  assert.match(
    page,
    /INSERT INTO shops \(shop_name, area\) VALUES \('クレープ広場', '中庭'\);/,
  );
  assert.match(page, /SELECT shop_name, area FROM shops;/);
  assert.match(
    page,
    /SELECT item_name, price FROM menu_items WHERE price >= 500;/,
  );
});
