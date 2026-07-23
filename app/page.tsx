"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Database,
  Sqlite3Static,
  SqlValue,
} from "@sqlite.org/sqlite-wasm";

type MissionId = "table" | "create" | "insert" | "select";
type LabView = "mission" | "bonus" | "free";

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

type Scenario = {
  id: MissionId | "where" | "free";
  number?: number;
  kicker: string;
  title: string;
  shortTitle: string;
  goal: string;
  task: string;
  expectedKeyword?: "CREATE" | "INSERT" | "SELECT";
  seedSql: string;
  starterSql: string;
  previewSql: string;
  hints: string[];
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
    goal: "行・列・セルを見分け、1行が1件のデータを表すことを確認します。",
    task: "shopsテーブルをSELECTして、店舗データが行と列で表示される様子を見てみよう。",
    expectedKeyword: "SELECT",
    seedSql: `${CREATE_SHOPS}\n${SHOP_ROWS}`,
    starterSql: "SELECT * FROM shops;",
    previewSql: "SELECT * FROM shops;",
    hints: [
      "表を横に見ると「行」、縦に見ると「列」です。",
      "すべての列を取り出す記号は * です。",
      "SELECT * FROM shops;",
    ],
    checkpoint: {
      question: "shopsテーブルの1行は何を表しますか？",
      options: [
        { id: "one-shop", label: "1つの店舗" },
        { id: "one-column", label: "1つの列" },
        { id: "one-database", label: "データベース全体" },
      ],
      answer: "one-shop",
      explanation: "正解です。1行（レコード）が1つの店舗を表します。",
    },
  },
  {
    id: "create",
    number: 2,
    kicker: "MISSION 2",
    title: "CREATEで表をつくろう",
    shortTitle: "CREATEで作る",
    goal: "列名とデータ型を決め、主キーを持つshopsテーブルを作成します。",
    task: "用意されたCREATE文を実行し、shop_id・shop_name・areaの3列を作ろう。",
    expectedKeyword: "CREATE",
    seedSql: "",
    starterSql: CREATE_SHOPS.trim(),
    previewSql:
      "SELECT name AS column_name, type AS data_type, CASE pk WHEN 1 THEN 'PK' ELSE '' END AS key_type FROM pragma_table_info('shops');",
    hints: [
      "表を作る命令は CREATE TABLE から始めます。",
      "列は「列名 データ型」の順にカンマで区切ります。",
      CREATE_SHOPS.trim(),
    ],
    checkpoint: {
      question: "店舗を一意に識別する列はどれですか？",
      options: [
        { id: "shop-name", label: "shop_name" },
        { id: "shop-id", label: "shop_id" },
        { id: "area", label: "area" },
      ],
      answer: "shop-id",
      explanation: "正解です。shop_idが主キーなので、同じ値は使えません。",
    },
  },
  {
    id: "insert",
    number: 3,
    kicker: "MISSION 3",
    title: "INSERTしてキーでつなごう",
    shortTitle: "INSERTとキー",
    goal: "商品を追加し、shopsの主キーとmenu_itemsの外部キーを関連付けます。",
    task: "店舗1の商品「たこ焼き」をmenu_itemsに追加し、右の関係図と結果を確認しよう。",
    expectedKeyword: "INSERT",
    seedSql: `${CREATE_SHOPS}\n${CREATE_MENU_ITEMS}\n${SHOP_ROWS}`,
    starterSql:
      "INSERT INTO menu_items (item_id, shop_id, item_name, price)\nVALUES (101, 1, 'たこ焼き', 500);",
    previewSql:
      "SELECT item_id, shop_id, item_name, price FROM menu_items ORDER BY item_id;",
    hints: [
      "INSERT INTOのあとに、追加先のテーブル名を書きます。",
      "列とVALUESの値は、左から同じ順番で対応させます。",
      "INSERT INTO menu_items (item_id, shop_id, item_name, price)\nVALUES (101, 1, 'たこ焼き', 500);",
    ],
    checkpoint: {
      question: "menu_items.shop_idの役割はどれですか？",
      options: [
        { id: "primary", label: "この表の主キー" },
        { id: "foreign", label: "shopsを参照する外部キー" },
        { id: "text", label: "商品名を保存する列" },
      ],
      answer: "foreign",
      explanation:
        "正解です。menu_items.shop_idはshops.shop_idを参照する外部キーです。",
    },
  },
  {
    id: "select",
    number: 4,
    kicker: "MISSION 4",
    title: "SELECTで必要な列を取り出そう",
    shortTitle: "SELECTで取得",
    goal: "テーブルから必要な列を選び、結果表として取り出します。",
    task: "shopsテーブルから店舗名と出店エリアだけを取り出してみよう。",
    expectedKeyword: "SELECT",
    seedSql: FULL_SEED,
    starterSql: "SELECT shop_name, area FROM shops;",
    previewSql: "SELECT shop_name, area FROM shops;",
    hints: [
      "SELECTのあとには、見たい列名を書きます。",
      "複数の列名はカンマで区切り、FROMのあとに表名を書きます。",
      "SELECT shop_name, area FROM shops;",
    ],
    checkpoint: {
      question: "必要な列を指定する場所はどこですか？",
      options: [
        { id: "after-select", label: "SELECTのあと" },
        { id: "after-from", label: "FROMのあと" },
        { id: "after-table", label: "表名のあと" },
      ],
      answer: "after-select",
      explanation: "正解です。SELECTのあとに、取り出したい列名を書きます。",
    },
  },
];

const BONUS_SCENARIO: Scenario = {
  id: "where",
  kicker: "BONUS",
  title: "WHEREで条件をしぼろう",
  shortTitle: "発展 WHERE",
  goal: "条件に合う行だけを取り出す検索に挑戦します。",
  task: "価格が500円以上の商品だけを取り出してみよう。",
  expectedKeyword: "SELECT",
  seedSql: FULL_SEED,
  starterSql:
    "SELECT item_name, price\nFROM menu_items\nWHERE price >= 500;",
  previewSql:
    "SELECT item_name, price FROM menu_items WHERE price >= 500 ORDER BY price;",
  hints: [
    "条件は WHERE のあとに書きます。",
    "500以上は price >= 500 と表します。",
    "SELECT item_name, price\nFROM menu_items\nWHERE price >= 500;",
  ],
};

const FREE_SCENARIO: Scenario = {
  id: "free",
  kicker: "FREE LAB",
  title: "自由SQLラボ",
  shortTitle: "自由SQLラボ",
  goal: "CREATE・INSERT・SELECTを自由に組み合わせて試せます。",
  task: "最初は学園祭のサンプルDBが入っています。1文ずつ実行して、結果を観察しよう。",
  seedSql: FULL_SEED,
  starterSql: "SELECT * FROM shops;",
  previewSql: "SELECT * FROM shops;",
  hints: [
    "まず SELECT * FROM shops; を実行して、現在の表を確認しましょう。",
    "新しい表を作るときは CREATE TABLE、行を加えるときは INSERT INTO を使います。",
    "SELECT item_name, price FROM menu_items WHERE price >= 500;",
  ],
};

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
        "このラボで実行できるのは CREATE・INSERT・SELECT です。UPDATE・DELETE・DROPなどは初版の範囲外です。",
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
        "主キーの値が重複しています。主キーには、まだ使われていない値を指定しましょう。",
      raw,
    };
  }
  if (normalized.includes("foreign key constraint failed")) {
    return {
      friendly:
        "参照先の店舗が見つかりません。menu_items.shop_idには、shopsに存在するshop_idを指定しましょう。",
      raw,
    };
  }
  if (normalized.includes("no such table")) {
    return {
      friendly:
        "指定したテーブルが見つかりません。表名のつづりと、CREATE済みかどうかを確認しましょう。",
      raw,
    };
  }
  if (normalized.includes("no such column")) {
    return {
      friendly:
        "指定した列が見つかりません。右の関係図で列名を確認しましょう。",
      raw,
    };
  }
  if (
    normalized.includes("syntax error") ||
    normalized.includes("incomplete input")
  ) {
    return {
      friendly:
        "SQLの書き方に誤りがあります。キーワード、カンマ、かっこ、引用符を確認しましょう。",
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

export default function Home() {
  const sqliteRef = useRef<Sqlite3Static | null>(null);
  const dbRef = useRef<Database | null>(null);
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
    message: "SQLiteを準備しています。",
  });
  const [sqlError, setSqlError] = useState<SqlErrorState | null>(null);
  const [status, setStatus] = useState("SQLiteを準備しています。");
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

  const scenarioKey = `${activeView}:${scenario.id}`;

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
    let cancelled = false;
    loadSQLite()
      .then((sqlite) => {
        if (cancelled) return;
        sqliteRef.current = sqlite;
        setDbVersion(sqlite.version.libVersion);
        setDbReady(true);
        setStatus("準備OK。SQLを実行してみよう。");
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
    setResult(runTableQuery(db, scenario.previewSql));
    setStatus("この演習の初期状態を準備しました。");
  }, [scenario]);

  useEffect(() => {
    if (!dbReady) return;
    resetScenario();
  }, [dbReady, resetScenario, scenarioKey]);

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
        const count = runTableQuery(
          db,
          "SELECT COUNT(*) FROM menu_items;",
        ).rows[0]?.[0];
        return Number(count) >= 1;
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

  const runSql = () => {
    const db = dbRef.current;
    if (!db || !dbReady) {
      setStatus("SQLiteの準備が終わるまで少し待ってください。");
      return;
    }

    const validation = validateUserSql(sql);
    if (!validation.ok) {
      setSqlError({ friendly: validation.message, raw: "実行前チェック" });
      setStatus("SQLを実行できませんでした。");
      setTaskMet(false);
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
      setTaskMet(met);
      setStatus(
        met && activeView === "mission"
          ? "SQLは成功です。確認問題にも答えて、ミッションを完了しよう。"
          : nextResult.message,
      );
    } catch (error: unknown) {
      setSqlError(explainSqlError(error));
      setTaskMet(false);
      setStatus("SQLエラーを確認して、もう一度試してみよう。");
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
        ? "同じitem_idを使うと、主キーのエラーを体験できます。"
        : "存在しないshop_idを使うと、外部キーのエラーを体験できます。",
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
          <div className="lesson-heading">
            <div>
              <p className="eyebrow">{scenario.kicker}</p>
              <h2 id="lesson-title">{scenario.title}</h2>
            </div>
            <p className="lesson-goal">{scenario.goal}</p>
          </div>

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

          <div className="lab-grid">
            <section className="panel editor-panel" aria-labelledby="editor-title">
              <div className="panel-heading">
                <div>
                  <h3 id="editor-title">SQLエディター</h3>
                  <p>{scenario.task}</p>
                </div>
                <span className="sqlite-badge">
                  {dbReady ? `SQLite ${dbVersion}` : "準備中"}
                </span>
              </div>

              {scenario.id === "table" ? (
                <div className="anatomy-strip" aria-label="表の用語">
                  <span>
                    <b>列</b> 同じ種類のデータ
                  </span>
                  <span>
                    <b>行</b> 1件のデータ
                  </span>
                  <span>
                    <b>セル</b> 1つの値
                  </span>
                </div>
              ) : null}

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
                    <code>SQLite: {sqlError.raw}</code>
                  </>
                ) : (
                  <span>{status}</span>
                )}
              </div>

              {activeView === "mission" && currentMission.checkpoint ? (
                <fieldset className="checkpoint">
                  <legend>確認問題：{currentMission.checkpoint.question}</legend>
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
                        : "もう一度考えてみよう。必要ならヒントを開いて確認できます。"}
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
              ) : null}
            </section>

            <section className="panel output-panel" aria-label="実行結果とテーブルの関係">
              <section className="result-section" aria-labelledby="result-title">
                <div className="result-header">
                  <div>
                    <h3 id="result-title">実行結果</h3>
                    <p>SQLの結果が行と列の表になります。</p>
                  </div>
                  <span className="result-badge">
                    {result.rows.length}件
                  </span>
                </div>

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
                      <span aria-hidden="true">▦</span>
                      <p>SQLを実行すると、ここに結果が表示されます。</p>
                    </div>
                  )}
                </div>
                <p className="result-caption">{result.message}</p>
              </section>

              <section className="schema-section" aria-labelledby="schema-title">
                <div className="schema-header">
                  <div>
                    <h3 id="schema-title">テーブルの関係</h3>
                    <p>同じshop_idが2つの表をつなぎます。</p>
                  </div>
                  <div className="schema-key" aria-label="キーの凡例">
                    <span>
                      <i className="key-swatch pk" aria-hidden="true" />
                      主キー PK
                    </span>
                    <span>
                      <i className="key-swatch fk" aria-hidden="true" />
                      外部キー FK
                    </span>
                  </div>
                </div>

                <div
                  className="relationship"
                  role="img"
                  aria-label="shopsのshop_id主キーからmenu_itemsのshop_id外部キーへの一対多の関係"
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
                    <b>shop_idで関連付け</b>
                  </div>

                  <section
                    className="table-card"
                    aria-label="menu_itemsテーブル"
                  >
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

                <div className="key-explainer">
                  <div>
                    <span className="key-label pk">PK</span>
                    <p>
                      <strong>主キー</strong>
                      行を一意に識別する、重複しない値
                    </p>
                  </div>
                  <div>
                    <span className="key-label fk">FK</span>
                    <p>
                      <strong>外部キー</strong>
                      別の表の主キーを参照して関係を作る値
                    </p>
                  </div>
                </div>
              </section>
            </section>
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
