"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Database,
  Sqlite3Static,
  SqlValue,
} from "@sqlite.org/sqlite-wasm";

type MissionId = "table" | "create" | "insert" | "select";
type LabView = "mission" | "bonus" | "free";
type TokenKind = "keyword" | "table" | "column" | "value";
type ResultMode = "anatomy" | "structure" | "relation" | "selection" | "where" | "free";

type SqlTable = {
  columns: string[];
  rows: SqlValue[][];
  message: string;
};

type SqlErrorState = {
  friendly: string;
  raw: string;
};

type CheckpointOption = {
  id: string;
  label: string;
};

type GuideToken = {
  text: string;
  label: string;
  kind: TokenKind;
};

type Scenario = {
  id: MissionId | "where" | "free";
  number?: number;
  kicker: string;
  title: string;
  shortTitle: string;
  goal: string;
  task: string;
  expectedKeyword?: "CREATE" | "INSERT" | "SELECT";
  categoryLabel: string;
  categoryName: string;
  commandName: string;
  commandSummary: string;
  commandDetail: string;
  guideTokens: GuideToken[];
  seedSql: string;
  starterSql: string;
  previewSql: string;
  hints: string[];
  observations: string[];
  resultMode: ResultMode;
  showSqlOverview?: boolean;
  checkpoint?: {
    question: string;
    options: CheckpointOption[];
    answer: string;
    explanation: string;
  };
};

type StoredProgress = {
  version: 1;
  completedMissionIds: MissionId[];
  currentMissionId: MissionId;
};

const STORAGE_KEY = "db-lab-progress-v1";

const CREATE_SHOPS = `
CREATE TABLE shops (
  shop_id INTEGER PRIMARY KEY,
  shop_name TEXT,
  area TEXT
);`;

const CREATE_MENU_ITEMS = `
CREATE TABLE menu_items (
  item_id INTEGER PRIMARY KEY,
  shop_id INTEGER,
  item_name TEXT,
  price INTEGER,
  FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
);`;

const SHOP_ROWS = `
INSERT INTO shops (shop_id, shop_name, area) VALUES
  (1, 'たこ焼き研究会', '中庭'),
  (2, 'Coffee Lab', '2号館'),
  (3, '焼きそば工房', '体育館');`;

const MENU_ROWS = `
INSERT INTO menu_items (item_id, shop_id, item_name, price) VALUES
  (101, 1, 'たこ焼き', 500),
  (102, 1, 'チーズたこ焼き', 650),
  (201, 2, 'アイスコーヒー', 400),
  (202, 2, 'カフェラテ', 550),
  (301, 3, 'ソース焼きそば', 600);`;

const FULL_SEED = `${CREATE_SHOPS}
${CREATE_MENU_ITEMS}
${SHOP_ROWS}
${MENU_ROWS}`;

const MISSIONS: Scenario[] = [
  {
    id: "table",
    number: 1,
    kicker: "MISSION 1",
    title: "表のしくみを見つけよう",
    shortTitle: "表のしくみ",
    goal: "SELECTの役割を知り、結果表から行・列・セルを見分けます。",
    task: "shopsテーブルのすべてのデータを取り出し、結果表の形を観察しよう。",
    expectedKeyword: "SELECT",
    categoryLabel: "DML",
    categoryName: "データ操作言語",
    commandName: "SELECT",
    commandSummary: "テーブルからデータを取り出す命令です。",
    commandDetail:
      "今回はデータを変更せず、shopsテーブルに入っている内容を読み取ります。* は「すべての列」という意味です。",
    guideTokens: [
      { text: "SELECT", label: "取り出す命令", kind: "keyword" },
      { text: "*", label: "すべての列", kind: "column" },
      { text: "FROM", label: "どの表から", kind: "keyword" },
      { text: "shops", label: "テーブル名", kind: "table" },
    ],
    seedSql: `${CREATE_SHOPS}\n${SHOP_ROWS}`,
    starterSql: "SELECT * FROM shops;",
    previewSql: "SELECT * FROM shops;",
    hints: [
      "実行後は、見出しと1行目を見比べてみましょう。",
      "* を使うと、テーブルのすべての列を取り出せます。",
      "SELECT * FROM shops;",
    ],
    observations: [
      "表の一番上に並ぶshop_id・shop_name・areaが「列」です。",
      "横方向の1行が、1つの店舗を表します。",
      "行と列が交わる1つの値を「セル」と呼びます。",
    ],
    resultMode: "anatomy",
    showSqlOverview: true,
    checkpoint: {
      question: "shopsテーブルの1行は何を表しますか？",
      options: [
        { id: "one-shop", label: "1つの店舗" },
        { id: "one-column", label: "1つの列" },
        { id: "one-database", label: "データベース全体" },
      ],
      answer: "one-shop",
      explanation: "正解です。結果表の横方向の1行が、1つの店舗を表します。",
    },
  },
  {
    id: "create",
    number: 2,
    kicker: "MISSION 2",
    title: "CREATE TABLEで表をつくろう",
    shortTitle: "CREATEで作る",
    goal: "表の構造を定義する命令を知り、主キーを持つshopsテーブルを作ります。",
    task: "用意されたCREATE TABLE文を実行し、3つの列を持つshopsテーブルを作ろう。",
    expectedKeyword: "CREATE",
    categoryLabel: "DDL",
    categoryName: "データ定義言語",
    commandName: "CREATE TABLE",
    commandSummary: "新しいテーブルの形を決めて作る命令です。",
    commandDetail:
      "かっこの中へ「列名 データ型」の順で書きます。PRIMARY KEYは、その列を行の識別に使うという指定です。",
    guideTokens: [
      { text: "CREATE TABLE", label: "表を作る命令", kind: "keyword" },
      { text: "shops", label: "テーブル名", kind: "table" },
      {
        text: "shop_id INTEGER PRIMARY KEY",
        label: "列名・型・主キー",
        kind: "column",
      },
      { text: "shop_name TEXT, area TEXT", label: "列名と型", kind: "column" },
    ],
    seedSql: "",
    starterSql: CREATE_SHOPS.trim(),
    previewSql:
      "SELECT name AS column_name, type AS data_type, CASE pk WHEN 1 THEN 'PK' ELSE '' END AS key_type FROM pragma_table_info('shops');",
    hints: [
      "shop_id列は、各店舗を見分ける番号として使います。",
      "主キーにする列の型の後ろへ PRIMARY KEY と書きます。",
      CREATE_SHOPS.trim(),
    ],
    observations: [
      "shopsテーブルにはshop_id・shop_name・areaの3列があります。",
      "shop_id列のデータ型はINTEGER、ほかの2列はTEXTです。",
      "shop_id列にはPKと表示され、主キーに設定されています。",
    ],
    resultMode: "structure",
    checkpoint: {
      question: "店舗を一意に識別する列はどれですか？",
      options: [
        { id: "shop-name", label: "shop_name列" },
        { id: "shop-id", label: "shop_id列" },
        { id: "area", label: "area列" },
      ],
      answer: "shop-id",
      explanation:
        "正解です。shopsテーブルのshop_id列が主キーなので、同じ値は使えません。",
    },
  },
  {
    id: "insert",
    number: 3,
    kicker: "MISSION 3",
    title: "INSERT INTOでデータを追加しよう",
    shortTitle: "INSERTとキー",
    goal: "新しい行を追加し、主キーと外部キーで2つのテーブルを関連付けます。",
    task:
      "商品番号101、店舗番号1、商品名「たこ焼き」、価格500円の1行をmenu_itemsテーブルへ追加しよう。",
    expectedKeyword: "INSERT",
    categoryLabel: "DML",
    categoryName: "データ操作言語",
    commandName: "INSERT INTO",
    commandSummary: "テーブルへ新しい1行を追加する命令です。",
    commandDetail:
      "列名とVALUESの値は、左から同じ順番で対応します。shop_id列の値1は、shopsテーブルにある店舗1を指します。",
    guideTokens: [
      { text: "INSERT INTO", label: "行を追加する命令", kind: "keyword" },
      { text: "menu_items", label: "追加先の表", kind: "table" },
      {
        text: "(item_id, shop_id, item_name, price)",
        label: "列の順番",
        kind: "column",
      },
      { text: "VALUES", label: "値を指定", kind: "keyword" },
      { text: "(101, 1, 'たこ焼き', 500)", label: "追加する値", kind: "value" },
    ],
    seedSql: `${CREATE_SHOPS}\n${CREATE_MENU_ITEMS}\n${SHOP_ROWS}`,
    starterSql:
      "INSERT INTO menu_items (item_id, shop_id, item_name, price)\nVALUES (101, 1, 'たこ焼き', 500);",
    previewSql:
      "SELECT item_id, shop_id, item_name, price FROM menu_items ORDER BY item_id;",
    hints: [
      "店舗1の商品なので、shop_id列には1を入れます。",
      "かっこ内の列名とVALUESの値を、左から順に対応させましょう。",
      "INSERT INTO menu_items (item_id, shop_id, item_name, price)\nVALUES (101, 1, 'たこ焼き', 500);",
    ],
    observations: [
      "追加された行のshop_id列には1が入っています。",
      "menu_itemsテーブルのshop_id列は、shopsテーブルのshop_id列を参照します。",
      "存在しない店舗番号は、外部キーの制約によって追加できません。",
    ],
    resultMode: "relation",
    checkpoint: {
      question: "menu_itemsテーブルのshop_id列の役割はどれですか？",
      options: [
        { id: "primary", label: "このテーブルの主キー" },
        { id: "foreign", label: "shopsテーブルを参照する外部キー" },
        { id: "text", label: "商品名を保存する列" },
      ],
      answer: "foreign",
      explanation:
        "正解です。menu_itemsテーブルのshop_id列は、shopsテーブルのshop_id列を参照する外部キーです。",
    },
  },
  {
    id: "select",
    number: 4,
    kicker: "MISSION 4",
    title: "SELECTで必要な列を取り出そう",
    shortTitle: "SELECTで取得",
    goal: "SELECTの後ろへ列名を書き、必要な情報だけを結果表として取り出します。",
    task: "shopsテーブルから、店舗名と出店エリアの2列だけを取り出してみよう。",
    expectedKeyword: "SELECT",
    categoryLabel: "DML",
    categoryName: "データ操作言語",
    commandName: "SELECT",
    commandSummary: "指定した列だけをテーブルから取り出せます。",
    commandDetail:
      "SELECTの後ろへ見たい列名をカンマで区切って書き、FROMの後ろへ取り出し元のテーブル名を書きます。",
    guideTokens: [
      { text: "SELECT", label: "取り出す命令", kind: "keyword" },
      { text: "shop_name, area", label: "取り出す列", kind: "column" },
      { text: "FROM", label: "どの表から", kind: "keyword" },
      { text: "shops", label: "テーブル名", kind: "table" },
    ],
    seedSql: FULL_SEED,
    starterSql: "SELECT shop_name, area FROM shops;",
    previewSql: "SELECT shop_name, area FROM shops;",
    hints: [
      "今回は店舗名と出店エリアだけが必要です。",
      "複数の列名は、SELECTの後ろでカンマを使って区切ります。",
      "SELECT shop_name, area FROM shops;",
    ],
    observations: [
      "結果表にはshop_name列とarea列だけが表示されています。",
      "元のshopsテーブルにあるshop_id列は、今回の結果には含まれません。",
      "SELECTでは、目的に合わせて表示する列を選べます。",
    ],
    resultMode: "selection",
    checkpoint: {
      question: "取り出したい列名を書く場所はどこですか？",
      options: [
        { id: "after-select", label: "SELECTの後ろ" },
        { id: "after-from", label: "FROMの後ろ" },
        { id: "after-table", label: "テーブル名の後ろ" },
      ],
      answer: "after-select",
      explanation: "正解です。SELECTの後ろに、取り出したい列名を書きます。",
    },
  },
];

const BONUS_SCENARIO: Scenario = {
  id: "where",
  kicker: "BONUS",
  title: "WHEREで条件をしぼろう",
  shortTitle: "発展 WHERE",
  goal: "SELECTへ条件を加え、条件に合う行だけを取り出します。",
  task: "価格が500円以上の商品だけを取り出してみよう。",
  expectedKeyword: "SELECT",
  categoryLabel: "DML + 条件",
  categoryName: "データ操作言語",
  commandName: "WHERE",
  commandSummary: "SELECTの結果を条件でしぼり込む部分です。",
  commandDetail:
    "WHEREは単独の命令ではありません。SELECT文の中で使い、今回はprice列が500以上という条件を指定します。",
  guideTokens: [
    { text: "SELECT", label: "取り出す命令", kind: "keyword" },
    { text: "item_name, price", label: "取り出す列", kind: "column" },
    { text: "FROM menu_items", label: "取り出し元の表", kind: "table" },
    { text: "WHERE", label: "条件を追加", kind: "keyword" },
    { text: "price >= 500", label: "500以上という条件", kind: "value" },
  ],
  seedSql: FULL_SEED,
  starterSql:
    "SELECT item_name, price\nFROM menu_items\nWHERE price >= 500;",
  previewSql:
    "SELECT item_name, price FROM menu_items WHERE price >= 500 ORDER BY price;",
  hints: [
    "400円の商品は結果から外れるはずです。",
    "500以上は、比較記号を使って price >= 500 と書きます。",
    "SELECT item_name, price\nFROM menu_items\nWHERE price >= 500;",
  ],
  observations: [
    "結果には500円以上の商品だけが表示されています。",
    "400円のアイスコーヒーは条件に合わないため表示されません。",
    "条件を変えると、取り出される行も変わります。",
  ],
  resultMode: "where",
};

const FREE_SCENARIO: Scenario = {
  id: "free",
  kicker: "FREE LAB",
  title: "自由SQLラボ",
  shortTitle: "自由SQLラボ",
  goal: "これまでに学んだ命令を、1文ずつ自由に試せます。",
  task: "下の早見表を参考に、CREATE・INSERT・SELECTを実行して結果を観察しよう。",
  categoryLabel: "REFERENCE",
  categoryName: "SQL早見表",
  commandName: "自由練習",
  commandSummary: "CREATE・INSERT・SELECT・WHEREを見返しながら試せます。",
  commandDetail:
    "最初は学園祭のサンプルデータが入っています。実行できるSQLは1回につき1文です。",
  guideTokens: [
    { text: "CREATE TABLE", label: "表を作る", kind: "keyword" },
    { text: "INSERT INTO", label: "行を追加する", kind: "keyword" },
    { text: "SELECT", label: "データを取り出す", kind: "keyword" },
    { text: "WHERE", label: "条件でしぼる", kind: "keyword" },
  ],
  seedSql: FULL_SEED,
  starterSql: "SELECT * FROM shops;",
  previewSql: "SELECT * FROM shops;",
  hints: [
    "まずはshopsテーブルの内容を取り出してみましょう。",
    "新しい表はCREATE TABLE、行の追加はINSERT INTOを使います。",
    "SELECT item_name, price FROM menu_items WHERE price >= 500;",
  ],
  observations: [
    "SQLを変えると、表示される結果やデータベースの状態が変わります。",
    "失敗しても「やり直す」でサンプルデータへ戻せます。",
  ],
  resultMode: "free",
};

const QUICK_REFERENCE = [
  {
    command: "CREATE TABLE",
    meaning: "新しいテーブルを作る",
    syntax: "CREATE TABLE 表名 (列名 データ型);",
    sample:
      "CREATE TABLE events (event_id INTEGER PRIMARY KEY, event_name TEXT);",
  },
  {
    command: "INSERT INTO",
    meaning: "テーブルへ1行追加する",
    syntax: "INSERT INTO 表名 (列名1, 列名2) VALUES (値1, 値2);",
    sample:
      "INSERT INTO shops (shop_name, area) VALUES ('クレープ広場', '中庭');",
  },
  {
    command: "SELECT",
    meaning: "データを取り出す",
    syntax: "SELECT 列名 FROM 表名;",
    sample: "SELECT shop_name, area FROM shops;",
  },
  {
    command: "WHERE",
    meaning: "取り出す行を条件でしぼる",
    syntax: "SELECT 列名 FROM 表名 WHERE 条件;",
    sample:
      "SELECT item_name, price FROM menu_items WHERE price >= 500;",
  },
];

let sqliteLoader: Promise<Sqlite3Static> | null = null;

function loadSQLite() {
  sqliteLoader ??= import("@sqlite.org/sqlite-wasm").then(({ default: init }) =>
    init(),
  );
  return sqliteLoader;
}

function runTableQuery(db: Database, sql: string): SqlTable {
  const columns: string[] = [];
  const rows = db.exec({
    sql,
    rowMode: "array",
    columnNames: columns,
    returnValue: "resultRows",
  }) as SqlValue[][];

  return {
    columns,
    rows,
    message: columns.length
      ? `${rows.length}件のデータを取得しました。`
      : "SQLを実行しました。",
  };
}

function validateUserSql(sql: string) {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { ok: false as const, message: "SQLを入力してください。" };
  }

  const statements = trimmed
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (statements.length !== 1) {
    return {
      ok: false as const,
      message: "このラボでは、SQLを1文ずつ実行してください。",
    };
  }

  const keyword = statements[0].match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  if (!keyword || !["CREATE", "INSERT", "SELECT"].includes(keyword)) {
    return {
      ok: false as const,
      message:
        "このラボで実行できるのはCREATE・INSERT・SELECTです。UPDATE・DELETE・DROPなどは今回の学習範囲外です。",
    };
  }

  return {
    ok: true as const,
    keyword: keyword as "CREATE" | "INSERT" | "SELECT",
    sql: `${statements[0]};`,
  };
}

function explainSqlError(error: unknown): SqlErrorState {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("unique constraint failed") ||
    normalized.includes("primary key")
  ) {
    return {
      friendly:
        "主キーに同じ値が使われています。主キーには、まだ使われていない値を指定しましょう。",
      raw,
    };
  }
  if (normalized.includes("foreign key constraint failed")) {
    return {
      friendly:
        "参照先の店舗が見つかりません。menu_itemsテーブルのshop_id列には、shopsテーブルに存在するshop_idを指定しましょう。",
      raw,
    };
  }
  if (normalized.includes("no such table")) {
    return {
      friendly:
        "指定したテーブルが見つかりません。テーブル名のつづりと、CREATE済みかどうかを確認しましょう。",
      raw,
    };
  }
  if (normalized.includes("no such column")) {
    return {
      friendly:
        "指定した列が見つかりません。表の関係図や結果表で列名を確認しましょう。",
      raw,
    };
  }
  if (
    normalized.includes("syntax error") ||
    normalized.includes("incomplete input")
  ) {
    return {
      friendly:
        "SQLの書き方に誤りがあります。命令、カンマ、かっこ、引用符を確認しましょう。",
      raw,
    };
  }

  return {
    friendly: "SQLiteがSQLを実行できませんでした。入力内容を確認しましょう。",
    raw,
  };
}

function isMissionId(value: string): value is MissionId {
  return MISSIONS.some((mission) => mission.id === value);
}

function SqlOverview() {
  return (
    <section className="sql-overview" aria-labelledby="sql-overview-title">
      <div className="overview-heading">
        <span className="mini-label">最初に知っておこう</span>
        <h3 id="sql-overview-title">SQLには2つの仕事があります</h3>
        <p>
          難しい名前を暗記する必要はありません。「表の形」と「中のデータ」で役割が違うことをつかみましょう。
        </p>
      </div>
      <div className="overview-cards">
        <article>
          <span className="category-badge ddl">DDL</span>
          <div>
            <h4>データ定義言語</h4>
            <p>テーブルの形を作ったり、列やデータ型を決めたりします。</p>
            <code>CREATE TABLE</code>
          </div>
        </article>
        <article>
          <span className="category-badge dml">DML</span>
          <div>
            <h4>データ操作言語</h4>
            <p>テーブルの中へ行を追加したり、必要なデータを取り出したりします。</p>
            <code>INSERT INTO / SELECT</code>
          </div>
        </article>
      </div>
    </section>
  );
}

function InsertPreparationGuide() {
  return (
    <section
      className="insert-preparation"
      aria-labelledby="insert-preparation-title"
    >
      <div className="insert-preparation-heading">
        <span className="mini-label">INSERTの前に</span>
        <h4 id="insert-preparation-title">まず、追加先の表を確認</h4>
        <p>
          このミッションでは、<code>menu_items</code>
          テーブルを用意済みです。1行が1つの商品を表します。
        </p>
      </div>

      <div className="insert-schema-wrap">
        <table className="insert-schema-table">
          <caption className="sr-only">
            menu_itemsテーブルの列、データ型とキー、列の意味、今回追加する値
          </caption>
          <thead>
            <tr>
              <th scope="col">列名</th>
              <th scope="col">型・キー</th>
              <th scope="col">何を入れる列か</th>
              <th scope="col">今回の値</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="列名"><code>item_id</code></td>
              <td data-label="型・キー">
                <code>INTEGER</code>
                <span className="schema-key-badge pk">PK</span>
              </td>
              <td data-label="何を入れる列か">商品を見分ける重複しない番号</td>
              <td data-label="今回の値"><code>101</code></td>
            </tr>
            <tr>
              <td data-label="列名"><code>shop_id</code></td>
              <td data-label="型・キー">
                <code>INTEGER</code>
                <span className="schema-key-badge fk">FK</span>
              </td>
              <td data-label="何を入れる列か">商品を販売する店舗の番号</td>
              <td data-label="今回の値" className="insert-shop-value">
                <code>1</code>
                <small>
                  <code>shops</code>の店舗1＝たこ焼き研究会
                </small>
              </td>
            </tr>
            <tr>
              <td data-label="列名"><code>item_name</code></td>
              <td data-label="型・キー"><code>TEXT</code></td>
              <td data-label="何を入れる列か">
                商品名。文字列なので引用符で囲む
              </td>
              <td data-label="今回の値"><code>&apos;たこ焼き&apos;</code></td>
            </tr>
            <tr>
              <td data-label="列名"><code>price</code></td>
              <td data-label="型・キー"><code>INTEGER</code></td>
              <td data-label="何を入れる列か">価格（円）</td>
              <td data-label="今回の値"><code>500</code></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="insert-value-map" aria-labelledby="insert-value-map-title">
        <strong id="insert-value-map-title">列名と値を同じ順番で対応させよう</strong>
        <pre aria-label="INSERTする列名と値の対応">
          <code>{`列: (item_id, shop_id, item_name, price)\n値: (    101,       1, 'たこ焼き',   500)`}</code>
        </pre>
      </div>

      <aside className="insert-practical-tip" role="note">
        <strong>SQLで確認するなら</strong>
        <p>
          実務では <code>SELECT * FROM menu_items;</code>
          で現在の列名やデータを確認できます。ただし、型やキーはこの設計図で確認します。このミッションでは確認SQLの実行は必須ではありません。
        </p>
      </aside>
    </section>
  );
}

function RelationDiagram() {
  return (
    <div
      className="relationship"
      role="img"
      aria-label="shopsテーブルのshop_id主キーから、menu_itemsテーブルのshop_id外部キーへの一対多の関係"
    >
      <section className="table-card" aria-label="shopsテーブル">
        <h4>shops</h4>
        <ul>
          <li className="pk-row">
            <span className="key-label pk">PK</span>
            <code>shop_id</code>
            <small>INTEGER</small>
          </li>
          <li>
            <span className="key-spacer" aria-hidden="true" />
            <code>shop_name</code>
            <small>TEXT</small>
          </li>
          <li>
            <span className="key-spacer" aria-hidden="true" />
            <code>area</code>
            <small>TEXT</small>
          </li>
        </ul>
      </section>

      <div className="relation-line" aria-hidden="true">
        <span>1</span>
        <i />
        <span>多</span>
        <b>shop_id列で関連付け</b>
      </div>

      <section className="table-card" aria-label="menu_itemsテーブル">
        <h4>menu_items</h4>
        <ul>
          <li>
            <span className="key-label pk">PK</span>
            <code>item_id</code>
            <small>INTEGER</small>
          </li>
          <li className="fk-row">
            <span className="key-label fk">FK</span>
            <code>shop_id</code>
            <small>INTEGER</small>
          </li>
          <li>
            <span className="key-spacer" aria-hidden="true" />
            <code>item_name</code>
            <small>TEXT</small>
          </li>
          <li>
            <span className="key-spacer" aria-hidden="true" />
            <code>price</code>
            <small>INTEGER</small>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function Home() {
  const sqliteRef = useRef<Sqlite3Static | null>(null);
  const dbRef = useRef<Database | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const missionTopRef = useRef<HTMLElement | null>(null);
  const missionTitleRef = useRef<HTMLHeadingElement | null>(null);
  const pendingMissionScrollRef = useRef(false);
  const [dbReady, setDbReady] = useState(false);
  const [dbVersion, setDbVersion] = useState("");
  const [loadingError, setLoadingError] = useState("");
  const [activeView, setActiveView] = useState<LabView>("mission");
  const [currentMissionId, setCurrentMissionId] =
    useState<MissionId>("table");
  const [completedMissionIds, setCompletedMissionIds] = useState<MissionId[]>(
    [],
  );
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [sql, setSql] = useState(MISSIONS[0].starterSql);
  const [result, setResult] = useState<SqlTable>({
    columns: [],
    rows: [],
    message: "まだSQLを実行していません。",
  });
  const [hasResult, setHasResult] = useState(false);
  const [sqlError, setSqlError] = useState<SqlErrorState | null>(null);
  const [status, setStatus] = useState("準備しています。");
  const [hintLevel, setHintLevel] = useState(0);
  const [checkpointChoice, setCheckpointChoice] = useState("");
  const [taskMet, setTaskMet] = useState(false);

  const currentMission =
    MISSIONS.find((mission) => mission.id === currentMissionId) ?? MISSIONS[0];

  const scenario = useMemo(() => {
    if (activeView === "bonus") return BONUS_SCENARIO;
    if (activeView === "free") return FREE_SCENARIO;
    return currentMission;
  }, [activeView, currentMission]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<StoredProgress>;
          if (parsed.version === 1) {
            const completed = Array.isArray(parsed.completedMissionIds)
              ? parsed.completedMissionIds.filter(
                  (id): id is MissionId =>
                    typeof id === "string" && isMissionId(id),
                )
              : [];
            const current =
              typeof parsed.currentMissionId === "string" &&
              isMissionId(parsed.currentMissionId)
                ? parsed.currentMissionId
                : "table";
            setCompletedMissionIds(completed);
            setCurrentMissionId(current);
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setProgressLoaded(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!progressLoaded) return;
    const progress: StoredProgress = {
      version: 1,
      completedMissionIds,
      currentMissionId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [completedMissionIds, currentMissionId, progressLoaded]);

  useEffect(() => {
    if (!pendingMissionScrollRef.current) return;
    pendingMissionScrollRef.current = false;

    const frame = window.requestAnimationFrame(() => {
      const missionTop = missionTopRef.current;
      const missionTitle = missionTitleRef.current;
      if (!missionTop || !missionTitle) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      missionTitle.focus({ preventScroll: true });
      missionTop.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentMissionId]);

  useEffect(() => {
    let cancelled = false;
    loadSQLite()
      .then((sqlite) => {
        if (cancelled) return;
        sqliteRef.current = sqlite;
        setDbVersion(sqlite.version.libVersion);
        setDbReady(true);
        setStatus("準備OK。命令の説明を読んでからSQLを実行しましょう。");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadingError(
          error instanceof Error ? error.message : "SQLiteを読み込めませんでした。",
        );
        setStatus("SQLiteの読み込みに失敗しました。ページを再読み込みしてください。");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resetScenario = useCallback(() => {
    const sqlite = sqliteRef.current;
    if (!sqlite) return;

    dbRef.current?.close();
    const db = new sqlite.oo1.DB(":memory:", "c");
    db.exec("PRAGMA foreign_keys = ON;");
    if (scenario.seedSql.trim()) db.exec(scenario.seedSql);
    dbRef.current = db;

    setSql(scenario.starterSql);
    setSqlError(null);
    setHintLevel(0);
    setCheckpointChoice("");
    setTaskMet(false);
    setHasResult(false);
    setResult({
      columns: [],
      rows: [],
      message: "まだSQLを実行していません。",
    });
    setStatus("この演習の初期状態を準備しました。");
  }, [scenario]);

  useEffect(() => {
    if (!dbReady) return;
    resetScenario();
  }, [dbReady, resetScenario]);

  useEffect(
    () => () => {
      dbRef.current?.close();
    },
    [],
  );

  const checkTask = useCallback(
    (
      db: Database,
      keyword: "CREATE" | "INSERT" | "SELECT",
      table: SqlTable,
    ) => {
      if (activeView !== "mission") return true;
      if (keyword !== currentMission.expectedKeyword) return false;

      if (currentMission.id === "create") {
        const info = runTableQuery(
          db,
          "SELECT name, type, pk FROM pragma_table_info('shops');",
        );
        return (
          info.rows.length === 3 &&
          info.rows.some(
            (row) =>
              String(row[0]) === "shop_id" &&
              String(row[1]).toUpperCase() === "INTEGER" &&
              Number(row[2]) === 1,
          )
        );
      }
      if (currentMission.id === "insert") {
        const expectedItem = runTableQuery(
          db,
          "SELECT item_id, shop_id, item_name, price FROM menu_items WHERE item_id = 101 AND shop_id = 1 AND item_name = 'たこ焼き' AND price = 500;",
        );
        return expectedItem.rows.length >= 1;
      }
      if (currentMission.id === "select") {
        return (
          table.columns.includes("shop_name") &&
          table.columns.includes("area") &&
          table.rows.length > 0
        );
      }
      return table.rows.length > 0;
    },
    [activeView, currentMission],
  );

  const focusResult = () => {
    window.requestAnimationFrame(() => {
      const section = resultRef.current;
      if (!section) return;
      section.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      section.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const runSql = () => {
    const db = dbRef.current;
    if (!db) return;

    const validation = validateUserSql(sql);
    if (!validation.ok) {
      setSqlError({ friendly: validation.message, raw: "実行前チェック" });
      setStatus("SQLを実行できませんでした。入力を確認しましょう。");
      return;
    }

    try {
      setSqlError(null);
      const executed = runTableQuery(db, validation.sql);
      let nextResult = executed;

      if (validation.keyword !== "SELECT") {
        if (scenario.id === "create" || scenario.id === "insert") {
          nextResult = runTableQuery(db, scenario.previewSql);
        } else if (validation.keyword === "CREATE") {
          nextResult = runTableQuery(
            db,
            "SELECT name AS table_name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
          );
        } else {
          nextResult = runTableQuery(
            db,
            "SELECT changes() AS affected_rows;",
          );
        }
      }

      const met = checkTask(db, validation.keyword, nextResult);
      setResult(nextResult);
      setHasResult(true);
      setTaskMet(met);
      setStatus(
        met && activeView === "mission"
          ? "課題のSQLは成功です。結果を観察して、確認問題へ進みましょう。"
          : nextResult.message,
      );
      focusResult();
    } catch (error: unknown) {
      setSqlError(explainSqlError(error));
      setStatus("SQLを実行できませんでした。説明を確認して修正しましょう。");
    }
  };

  const chooseMission = (missionId: MissionId) => {
    setActiveView("mission");
    setCurrentMissionId(missionId);
  };

  const checkpointCorrect =
    activeView === "mission" &&
    Boolean(currentMission.checkpoint) &&
    checkpointChoice === currentMission.checkpoint?.answer;

  const completeMission = () => {
    if (!taskMet || !checkpointCorrect) return;
    setCompletedMissionIds((completed) =>
      completed.includes(currentMissionId)
        ? completed
        : [...completed, currentMissionId],
    );
    const index = MISSIONS.findIndex(
      (mission) => mission.id === currentMissionId,
    );
    if (index < MISSIONS.length - 1) {
      pendingMissionScrollRef.current = true;
      setCurrentMissionId(MISSIONS[index + 1].id as MissionId);
    } else {
      setStatus(
        "4つのミッションを完了しました！発展WHEREか自由SQLラボに進めます。",
      );
    }
  };

  const clearProgress = () => {
    const accepted = window.confirm(
      "4つのミッションの完了記録を消して、最初から始めますか？",
    );
    if (!accepted) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setCompletedMissionIds([]);
    setCurrentMissionId("table");
    setActiveView("mission");
    setStatus("学習記録を消去しました。ミッション1から始めましょう。");
  };

  const setExperiment = (kind: "duplicate" | "foreign") => {
    setSql(
      kind === "duplicate"
        ? "INSERT INTO shops (shop_id, shop_name, area)\nVALUES (1, '重複テスト店', '中庭');"
        : "INSERT INTO menu_items (item_id, shop_id, item_name, price)\nVALUES (999, 99, '参照テスト', 300);",
    );
    setSqlError(null);
    setStatus(
      kind === "duplicate"
        ? "同じ主キーを使うと、重複エラーを体験できます。"
        : "存在しない店舗番号を使うと、外部キーのエラーを体験できます。",
    );
  };

  const hint = scenario.hints[Math.max(0, hintLevel - 1)];
  const progress = Math.round(
    (completedMissionIds.length / MISSIONS.length) * 100,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            DB
          </div>
          <div>
            <h1>DBラボ</h1>
            <p>学園祭データベース</p>
          </div>
        </div>
        <div className="course-meta" aria-label="学習状況">
          <span className="meta-chip">
            <span className="meta-dot" aria-hidden="true" />
            完了 {completedMissionIds.length} / 4
          </span>
          <span className="meta-chip">
            <span className="clock-mark" aria-hidden="true" />
            30〜40分
          </span>
          <button className="reset-progress" type="button" onClick={clearProgress}>
            学習記録を消す
          </button>
        </div>
      </header>

      <div className="shell">
        <nav className="mission-rail" aria-label="ミッション一覧">
          <div className="rail-heading">
            <p>MISSION MAP</p>
            <span>{progress}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="ミッションの進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <ol className="mission-list">
            {MISSIONS.map((mission) => {
              const completed = completedMissionIds.includes(
                mission.id as MissionId,
              );
              const current =
                activeView === "mission" && currentMissionId === mission.id;
              return (
                <li key={mission.id}>
                  <button
                    className={`mission-button${completed ? " is-complete" : ""}${current ? " is-current" : ""}`}
                    type="button"
                    onClick={() => chooseMission(mission.id as MissionId)}
                    aria-current={current ? "step" : undefined}
                  >
                    <span className="mission-number" aria-hidden="true">
                      {completed ? "✓" : mission.number}
                    </span>
                    <span className="mission-copy">
                      <span className="mission-kicker">
                        {completed ? "完了" : `ミッション ${mission.number}`}
                      </span>
                      <span className="mission-title">
                        {mission.shortTitle}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="rail-tools">
            <button
              className={activeView === "bonus" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveView("bonus")}
            >
              <span aria-hidden="true">＋</span>
              発展 WHERE
            </button>
            <button
              className={activeView === "free" ? "is-active" : ""}
              type="button"
              onClick={() => setActiveView("free")}
            >
              <span aria-hidden="true">⌘</span>
              自由SQLラボ
            </button>
          </div>
          <p className="rail-note">
            SQLとデータはこのブラウザの中だけで動きます。名前や成績は送信されません。
          </p>
        </nav>

        <section className="workspace" aria-labelledby="lesson-title">
          <header className="lesson-heading" ref={missionTopRef}>
            <div>
              <p className="eyebrow">{scenario.kicker}</p>
              <h2 id="lesson-title" ref={missionTitleRef} tabIndex={-1}>
                {scenario.title}
              </h2>
            </div>
            <p className="lesson-goal">{scenario.goal}</p>
          </header>

          {completedMissionIds.length === 4 && activeView === "mission" ? (
            <div className="course-complete" role="status">
              <span className="complete-mark" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>基本4ミッション完了！</strong>
                <p>
                  発展WHEREで条件検索に進むか、自由SQLラボで好きなSQLを試してみよう。
                </p>
              </div>
            </div>
          ) : null}

          <div className="learning-flow">
            {scenario.showSqlOverview ? <SqlOverview /> : null}

            <section className="step-card command-step" aria-labelledby="command-step-title">
              <div className="step-heading">
                <span className="step-number">1</span>
                <div>
                  <p>STEP 1</p>
                  <h3 id="command-step-title">今回の命令を知る</h3>
                </div>
                <span
                  className={`category-badge ${scenario.categoryLabel === "DDL" ? "ddl" : "dml"}`}
                >
                  {scenario.categoryLabel}
                </span>
              </div>
              <div className="command-intro">
                <div>
                  <span>{scenario.categoryName}</span>
                  <h4>{scenario.commandName}</h4>
                </div>
                <p>
                  <strong>{scenario.commandSummary}</strong>
                  {scenario.commandDetail}
                </p>
              </div>
              {scenario.id === "insert" ? <InsertPreparationGuide /> : null}
              <div className="syntax-guide" aria-label={`${scenario.commandName}の構文解説`}>
                {scenario.guideTokens.map((token, index) => (
                  <span
                    className={`syntax-token token-${token.kind}`}
                    key={`${token.text}-${index}`}
                  >
                    <code>{token.text}</code>
                    <small>{token.label}</small>
                  </span>
                ))}
              </div>

              {scenario.id === "free" ? (
                <details className="sql-reference" open>
                  <summary>SQL早見表</summary>
                  <div className="reference-grid">
                    {QUICK_REFERENCE.map((item) => (
                      <article key={item.command}>
                        <code className="reference-command">{item.command}</code>
                        <strong>{item.meaning}</strong>
                        <div className="reference-snippets">
                          <div>
                            <span>書式</span>
                            <pre>
                              <code>{item.syntax}</code>
                            </pre>
                          </div>
                          <div>
                            <span>サンプル</span>
                            <pre>
                              <code>{item.sample}</code>
                            </pre>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>

            <section className="step-card editor-panel" aria-labelledby="editor-title">
              <div className="step-heading">
                <span className="step-number">2</span>
                <div>
                  <p>STEP 2</p>
                  <h3 id="editor-title">SQLを実行する</h3>
                </div>
                <span className="sqlite-badge">
                  {dbReady ? `SQLite ${dbVersion}` : "準備中"}
                </span>
              </div>
              <p className="step-task">{scenario.task}</p>

              <div className="editor-wrap">
                <div className="editor-bar">
                  <strong>query.sql</strong>
                  <span>1文ずつ実行</span>
                </div>
                <label className="sr-only" htmlFor="sql-editor">
                  実行するSQL
                </label>
                <textarea
                  id="sql-editor"
                  className="sql-editor"
                  value={sql}
                  onChange={(event) => setSql(event.target.value)}
                  spellCheck={false}
                  aria-describedby="sql-status"
                />
              </div>

              {scenario.id === "insert" ? (
                <div className="experiment-row" aria-label="エラー実験">
                  <span>ミニ実験：</span>
                  <button type="button" onClick={() => setExperiment("duplicate")}>
                    主キー重複を試す
                  </button>
                  <button type="button" onClick={() => setExperiment("foreign")}>
                    外部キー違反を試す
                  </button>
                </div>
              ) : null}

              {hintLevel > 0 ? (
                <div className="hint-box" role="note">
                  <div>
                    <span>
                      {hintLevel === 1
                        ? "小ヒント"
                        : hintLevel === 2
                          ? "構文ヒント"
                          : "完成例"}
                    </span>
                    <b>{hintLevel} / 3</b>
                  </div>
                  <pre>
                    <code>{hint}</code>
                  </pre>
                </div>
              ) : null}

              <div className="actions" aria-label="SQL操作">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={runSql}
                  disabled={!dbReady}
                >
                  <span className="play-mark" aria-hidden="true" />
                  実行する
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() =>
                    setHintLevel((level) => (level >= 3 ? 0 : level + 1))
                  }
                >
                  {hintLevel >= 3 ? "ヒントを閉じる" : "ヒントを見る"}
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={resetScenario}
                  disabled={!dbReady}
                >
                  やり直す
                </button>
              </div>

              <div
                id="sql-status"
                className={`live-status${sqlError ? " is-error" : ""}`}
                role="status"
                aria-live="polite"
              >
                {loadingError ? (
                  <>
                    <strong>SQLiteを読み込めませんでした。</strong>
                    <code>{loadingError}</code>
                  </>
                ) : sqlError ? (
                  <>
                    <strong>{sqlError.friendly}</strong>
                    <details className="raw-error">
                      <summary>SQLiteからの詳細</summary>
                      <code>{sqlError.raw}</code>
                    </details>
                  </>
                ) : (
                  <span>{status}</span>
                )}
              </div>
            </section>

            <section
              className={`step-card result-step result-${scenario.resultMode}`}
              aria-labelledby="result-title"
              ref={resultRef}
              tabIndex={-1}
            >
              <div className="step-heading">
                <span className="step-number">3</span>
                <div>
                  <p>STEP 3</p>
                  <h3 id="result-title">結果を観察する</h3>
                </div>
                {hasResult ? (
                  <span className="result-badge">{result.rows.length}件</span>
                ) : null}
              </div>

              {!hasResult ? (
                <div className="result-placeholder">
                  <span aria-hidden="true">▶</span>
                  <div>
                    <strong>まだSQLを実行していません</strong>
                    <p>STEP 2の「実行する」を押すと、ここに結果が表示されます。</p>
                  </div>
                </div>
              ) : (
                <>
                  {scenario.resultMode === "anatomy" ? (
                    <div className="anatomy-key" aria-label="表の用語">
                      <span><b>列</b>同じ種類のデータ</span>
                      <span><b>行</b>1件のデータ</span>
                      <span><b>セル</b>1つの値</span>
                    </div>
                  ) : null}

                  <div className="table-scroll">
                    {result.columns.length ? (
                      <table className="result-table">
                        <caption className="sr-only">SQLの実行結果</caption>
                        <thead>
                          <tr>
                            {result.columns.map((column) => (
                              <th scope="col" key={column}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.length ? (
                            result.rows.map((row, rowIndex) => (
                              <tr key={`${rowIndex}-${row.join("-")}`}>
                                {row.map((value, cellIndex) => (
                                  <td key={`${rowIndex}-${cellIndex}`}>
                                    {value === null ? (
                                      <span className="null-value">NULL</span>
                                    ) : (
                                      String(value)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={result.columns.length}>
                                結果は0件です。
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-result">
                        <p>SQLは成功しました。表示する行はありません。</p>
                      </div>
                    )}
                  </div>
                  <p className="result-caption">{result.message}</p>

                  {scenario.resultMode === "relation" && taskMet ? (
                    <div className="insert-row-change" role="status">
                      <span>実行前 <strong>0件</strong></span>
                      <i aria-hidden="true">→</i>
                      <span>実行後 <strong>1件</strong></span>
                      <b>商品が1行追加されました</b>
                    </div>
                  ) : null}

                  <section className="observation" aria-labelledby="observation-title">
                    <div>
                      <span aria-hidden="true">✓</span>
                      <h4 id="observation-title">観察ポイント</h4>
                    </div>
                    <ul>
                      {scenario.observations.map((observation) => (
                        <li key={observation}>{observation}</li>
                      ))}
                    </ul>
                  </section>

                  {scenario.resultMode === "relation" ? (
                    <section className="relation-section" aria-labelledby="relation-title">
                      <div className="relation-heading">
                        <div>
                          <h4 id="relation-title">2つのテーブルをキーでつなぐ</h4>
                          <p>
                            同じshop_idを使って、商品がどの店舗のものかを表します。
                          </p>
                        </div>
                        <div className="schema-key" aria-label="キーの凡例">
                          <span><i className="key-swatch pk" />主キー PK</span>
                          <span><i className="key-swatch fk" />外部キー FK</span>
                        </div>
                      </div>
                      <RelationDiagram />
                    </section>
                  ) : null}
                </>
              )}
            </section>

            {activeView === "mission" && currentMission.checkpoint ? (
              <section className="step-card checkpoint-step" aria-labelledby="checkpoint-title">
                <div className="step-heading">
                  <span className="step-number">4</span>
                  <div>
                    <p>STEP 4</p>
                    <h3 id="checkpoint-title">確認問題に答える</h3>
                  </div>
                  <span className={`unlock-badge${taskMet ? " is-unlocked" : ""}`}>
                    {taskMet ? "回答できます" : "実行後に回答"}
                  </span>
                </div>

                {!taskMet ? (
                  <div className="checkpoint-lock" role="note">
                    <span aria-hidden="true">1→2→3</span>
                    <p>まずSTEP 2で課題のSQLを成功させ、STEP 3の結果を観察しましょう。</p>
                  </div>
                ) : null}

                <fieldset className="checkpoint" disabled={!taskMet}>
                  <legend>{currentMission.checkpoint.question}</legend>
                  <div className="checkpoint-options">
                    {currentMission.checkpoint.options.map((option) => (
                      <label key={option.id}>
                        <input
                          type="radio"
                          name={`checkpoint-${currentMission.id}`}
                          value={option.id}
                          checked={checkpointChoice === option.id}
                          onChange={(event) =>
                            setCheckpointChoice(event.target.value)
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  {checkpointChoice ? (
                    <p
                      className={
                        checkpointCorrect
                          ? "checkpoint-feedback is-correct"
                          : "checkpoint-feedback is-wrong"
                      }
                    >
                      {checkpointCorrect
                        ? currentMission.checkpoint.explanation
                        : "もう一度考えてみよう。必要なら結果の観察ポイントを確認できます。"}
                    </p>
                  ) : null}
                  <button
                    className="button complete-button"
                    type="button"
                    onClick={completeMission}
                    disabled={!taskMet || !checkpointCorrect}
                  >
                    このミッションを完了
                  </button>
                </fieldset>
              </section>
            ) : null}
          </div>

          <footer className="lab-footer">
            <span>端末内だけで動作・登録不要</span>
            <span>CREATE / INSERT / SELECT / WHERE</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
