import assert from "node:assert/strict";
import test from "node:test";
import initSqlite from "@sqlite.org/sqlite-wasm";

const sqlite3 = await initSqlite();

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE shops (
    shop_id INTEGER PRIMARY KEY,
    shop_name TEXT,
    area TEXT
  );
  CREATE TABLE menu_items (
    item_id INTEGER PRIMARY KEY,
    shop_id INTEGER,
    item_name TEXT,
    price INTEGER,
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
  );
`;

function openLab() {
  const db = new sqlite3.oo1.DB(":memory:", "c");
  db.exec(schema);
  return db;
}

function query(db, sql) {
  const columns = [];
  const rows = db.exec({
    sql,
    rowMode: "array",
    columnNames: columns,
    returnValue: "resultRows",
  });
  return { columns, rows };
}

test("CREATE → INSERT → SELECT と WHERE が実SQLiteで動く", () => {
  const db = openLab();
  try {
    db.exec(`
      INSERT INTO shops (shop_id, shop_name, area)
      VALUES (1, 'たこ焼き研究会', '中庭');
      INSERT INTO menu_items (item_id, shop_id, item_name, price)
      VALUES
        (101, 1, 'たこ焼き', 500),
        (102, 1, 'チーズたこ焼き', 650);
    `);

    assert.deepEqual(query(db, "SELECT shop_name, area FROM shops;"), {
      columns: ["shop_name", "area"],
      rows: [["たこ焼き研究会", "中庭"]],
    });
    assert.deepEqual(
      query(
        db,
        "SELECT item_name, price FROM menu_items WHERE price >= 600;",
      ),
      {
        columns: ["item_name", "price"],
        rows: [["チーズたこ焼き", 650]],
      },
    );
  } finally {
    db.close();
  }
});

test("主キー重複をSQLiteが拒否する", () => {
  const db = openLab();
  try {
    db.exec(
      "INSERT INTO shops (shop_id, shop_name, area) VALUES (1, 'A', '中庭');",
    );
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO shops (shop_id, shop_name, area) VALUES (1, 'B', '体育館');",
        ),
      /UNIQUE constraint failed: shops\.shop_id/i,
    );
  } finally {
    db.close();
  }
});

test("参照先のない外部キーをSQLiteが拒否する", () => {
  const db = openLab();
  try {
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO menu_items (item_id, shop_id, item_name, price) VALUES (999, 99, '迷子メニュー', 100);",
        ),
      /FOREIGN KEY constraint failed/i,
    );
  } finally {
    db.close();
  }
});

test("存在しない表・列と構文ミスをSQLiteが報告する", () => {
  const db = openLab();
  try {
    assert.throws(() => db.exec("SELECT * FROM missing_table;"), /no such table/i);
    assert.throws(() => db.exec("SELECT missing_column FROM shops;"), /no such column/i);
    assert.throws(() => db.exec("SELEC * FROM shops;"), /syntax error/i);
  } finally {
    db.close();
  }
});
