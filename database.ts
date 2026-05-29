import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("stockjournal.db");
  }
  return dbPromise;
}

/** 关闭并重置数据库连接（用于从备份恢复后重新加载） */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
}

// 初始化数据库和建表
export async function initDB(): Promise<void> {
  const db = await getDatabase();
  // 建表（首次安装）
  await db.execAsync(`CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_uri TEXT NOT NULL,
    stock_code TEXT,
    tags TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  // 兼容旧版：用 ALTER TABLE 增加 P/L 字段（已存在时会报错，用 try/catch 忽略）
  const plColumns = [
    "ALTER TABLE records ADD COLUMN entry_price REAL;",
    "ALTER TABLE records ADD COLUMN exit_price REAL;",
    "ALTER TABLE records ADD COLUMN quantity REAL;",
    "ALTER TABLE records ADD COLUMN direction TEXT DEFAULT 'long';",
  ];
  for (const sql of plColumns) {
    try {
      await db.execAsync(sql);
    } catch (_) {
      /* 字段已存在，忽略 */
    }
  }
  // 交易计划表
  await db.execAsync(`CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_text TEXT NOT NULL,
    target_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  // 兼容旧版：增加 notify_at（通知触发时间 ISO string）和 notification_id（通知标识符）
  const planColumns = [
    "ALTER TABLE plans ADD COLUMN notify_at TEXT;",
    "ALTER TABLE plans ADD COLUMN notification_id TEXT;",
  ];
  for (const sql of planColumns) {
    try {
      await db.execAsync(sql);
    } catch (_) {
      /* 字段已存在，忽略 */
    }
  }
}

// 插入一条记录
export async function insertRecord({
  image_uri,
  stock_code,
  tags,
  note,
  entry_price,
  exit_price,
  quantity,
  direction,
}: {
  image_uri: string;
  stock_code: string;
  tags: string;
  note: string;
  entry_price?: number | null;
  exit_price?: number | null;
  quantity?: number | null;
  direction?: "long" | "short";
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO records (image_uri, stock_code, tags, note, entry_price, exit_price, quantity, direction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      image_uri,
      stock_code,
      tags,
      note,
      entry_price ?? null,
      exit_price ?? null,
      quantity ?? null,
      direction ?? "long",
    ],
  );
}

// 删除一条记录
export async function deleteRecord(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM records WHERE id = ?;`, [id]);
}

// 更新一条记录（image_uri 可选，不传则保持原图）
export async function updateRecord({
  id,
  image_uri,
  stock_code,
  tags,
  note,
  entry_price,
  exit_price,
  quantity,
  direction,
}: {
  id: number;
  image_uri: string;
  stock_code: string;
  tags: string;
  note: string;
  entry_price?: number | null;
  exit_price?: number | null;
  quantity?: number | null;
  direction?: "long" | "short";
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE records SET image_uri = ?, stock_code = ?, tags = ?, note = ?,
     entry_price = ?, exit_price = ?, quantity = ?, direction = ?
     WHERE id = ?;`,
    [
      image_uri,
      stock_code,
      tags,
      note,
      entry_price ?? null,
      exit_price ?? null,
      quantity ?? null,
      direction ?? "long",
      id,
    ],
  );
}

// ── 统计查询 ──────────────────────────────────────────────

/** 总记录数 & 本周新增 */
export async function getOverallStats(): Promise<{
  total: number;
  thisWeek: number;
}> {
  const db = await getDatabase();
  // 本周起始（UTC+8），取本周一 00:00:00
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const day = now.getUTCDay(); // 0=周日
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  // 转回 UTC 存入 SQL（SQLite 存的是 UTC）
  const mondayUTC = new Date(monday.getTime() - 8 * 3600 * 1000);
  const mondayStr = mondayUTC.toISOString().replace("T", " ").slice(0, 19);

  const totalRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM records;`,
  );
  const weekRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM records WHERE created_at >= ?;`,
    [mondayStr],
  );
  return {
    total: totalRow?.cnt ?? 0,
    thisWeek: weekRow?.cnt ?? 0,
  };
}

/** 标签统计：按出现次数降序（拆分逗号分隔的 tags 字段） */
export async function getTagStats(): Promise<
  Array<{ tag: string; count: number }>
> {
  const db = await getDatabase();
  // 取出所有非空 tags
  const rows = await db.getAllAsync<{ tags: string }>(
    `SELECT tags FROM records WHERE tags IS NOT NULL AND tags != '';`,
  );
  const counter: Record<string, number> = {};
  for (const row of rows) {
    row.tags.split(",").forEach((t: string) => {
      const tag = t.trim();
      if (tag) counter[tag] = (counter[tag] ?? 0) + 1;
    });
  }
  return Object.entries(counter)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** 过去 7 天每天的记录数（UTC+8 日期） */
export async function getDailyStats(): Promise<
  Array<{ date: string; count: number }>
> {
  const db = await getDatabase();
  const result: Array<{ date: string; count: number }> = [];

  for (let i = 6; i >= 0; i--) {
    // 构造 UTC+8 的当天起止，再转成 UTC 与数据库比对
    const dayStart = new Date(Date.now() + 8 * 3600 * 1000);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const startUTC = new Date(dayStart.getTime() - 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    const endUTC = new Date(dayEnd.getTime() - 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const label = `${String(dayStart.getUTCMonth() + 1).padStart(2, "0")}/${String(dayStart.getUTCDate()).padStart(2, "0")}`;
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM records WHERE created_at >= ? AND created_at < ?;`,
      [startUTC, endUTC],
    );
    result.push({ date: label, count: row?.cnt ?? 0 });
  }
  return result;
}

// 获取所有记录，按创建时间倒序
export async function getAllRecords(): Promise<
  Array<{
    id: number;
    image_uri: string;
    stock_code: string;
    tags: string;
    note: string;
    created_at: string;
    entry_price: number | null;
    exit_price: number | null;
    quantity: number | null;
    direction: "long" | "short";
  }>
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    image_uri: string;
    stock_code: string;
    tags: string;
    note: string;
    created_at: string;
    entry_price: number | null;
    exit_price: number | null;
    quantity: number | null;
    direction: "long" | "short";
  }>(`SELECT * FROM records ORDER BY created_at DESC;`);
  return rows.map((r) => ({
    ...r,
    stock_code: r.stock_code,
    tags: r.tags,
    note: r.note,
  }));
}

/** 过去 7 天内的所有完整记录（UTC+8 时间基准），按创建时间倒序 */
export async function getThisWeekRecords(): Promise<
  Array<{
    id: number;
    image_uri: string;
    stock_code: string;
    tags: string;
    note: string;
    created_at: string;
    entry_price: number | null;
    exit_price: number | null;
    quantity: number | null;
    direction: "long" | "short";
  }>
> {
  const db = await getDatabase();
  const now8 = new Date(Date.now() + 8 * 3600 * 1000);
  const sevenDaysAgo8 = new Date(now8);
  sevenDaysAgo8.setUTCDate(now8.getUTCDate() - 6);
  sevenDaysAgo8.setUTCHours(0, 0, 0, 0);
  const startUTC = new Date(sevenDaysAgo8.getTime() - 8 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const rows = await db.getAllAsync<{
    id: number;
    image_uri: string;
    stock_code: string;
    tags: string;
    note: string;
    created_at: string;
    entry_price: number | null;
    exit_price: number | null;
    quantity: number | null;
    direction: "long" | "short";
  }>(`SELECT * FROM records WHERE created_at >= ? ORDER BY created_at DESC;`, [
    startUTC,
  ]);
  return rows.map((r) => ({
    ...r,
    stock_code: r.stock_code,
    tags: r.tags,
    note: r.note,
  }));
}

/**
 * 日历统计：返回每个有记录的日期（UTC+8，格式 YYYY-MM-DD）及其总盈亏和记录数
 */
export async function getCalendarStats(): Promise<
  Record<string, { count: number; totalPL: number; hasPL: boolean }>
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    created_at: string;
    entry_price: number | null;
    exit_price: number | null;
    quantity: number | null;
    direction: string;
  }>(
    `SELECT created_at, entry_price, exit_price, quantity, direction FROM records;`,
  );

  const map: Record<
    string,
    { count: number; totalPL: number; hasPL: boolean }
  > = {};

  for (const r of rows) {
    // 转 UTC+8 日期字符串
    const normalized = r.created_at.includes("T")
      ? r.created_at
      : r.created_at.replace(" ", "T") + "Z";
    const d = new Date(normalized);
    const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
    const dateKey = `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, "0")}-${String(utc8.getUTCDate()).padStart(2, "0")}`;

    if (!map[dateKey]) map[dateKey] = { count: 0, totalPL: 0, hasPL: false };
    map[dateKey].count++;

    if (r.entry_price != null && r.exit_price != null && r.quantity != null) {
      const sign = r.direction === "short" ? -1 : 1;
      const pl = sign * (r.exit_price - r.entry_price) * r.quantity;
      map[dateKey].totalPL += pl;
      map[dateKey].hasPL = true;
    }
  }

  // 四舍五入
  for (const key of Object.keys(map)) {
    map[key].totalPL = Math.round(map[key].totalPL * 100) / 100;
  }

  return map;
}
export async function getPLStats(): Promise<{
  totalPL: number; // 总盈亏金额
  winCount: number; // 盈利笔数
  lossCount: number; // 亏损笔数
  winRate: number; // 胜率 0~1
  bestTrade: number; // 最佳单笔盈亏
  worstTrade: number; // 最差单笔盈亏
}> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    entry_price: number;
    exit_price: number;
    quantity: number;
    direction: string;
  }>(
    `SELECT entry_price, exit_price, quantity, direction FROM records
     WHERE entry_price IS NOT NULL AND exit_price IS NOT NULL AND quantity IS NOT NULL;`,
  );

  let totalPL = 0,
    winCount = 0,
    lossCount = 0;
  let bestTrade = -Infinity,
    worstTrade = Infinity;

  for (const r of rows) {
    const sign = r.direction === "short" ? -1 : 1;
    const pl = sign * (r.exit_price - r.entry_price) * r.quantity;
    totalPL += pl;
    if (pl > 0) winCount++;
    else if (pl < 0) lossCount++;
    if (pl > bestTrade) bestTrade = pl;
    if (pl < worstTrade) worstTrade = pl;
  }

  const total = winCount + lossCount;
  return {
    totalPL: Math.round(totalPL * 100) / 100,
    winCount,
    lossCount,
    winRate: total > 0 ? winCount / total : 0,
    bestTrade: bestTrade === -Infinity ? 0 : Math.round(bestTrade * 100) / 100,
    worstTrade:
      worstTrade === Infinity ? 0 : Math.round(worstTrade * 100) / 100,
  };
}

// ── 交易计划 ──────────────────────────────────────────────

/** 插入一条交易计划 */
export async function insertPlan(
  planText: string,
  targetDate: string,
  notifyAt?: string,
  notificationId?: string,
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO plans (plan_text, target_date, notify_at, notification_id) VALUES (?, ?, ?, ?);`,
    [planText, targetDate, notifyAt ?? null, notificationId ?? null],
  );
  return result.lastInsertRowId;
}

export type PlanRow = {
  id: number;
  plan_text: string;
  target_date: string;
  notify_at: string | null;
  notification_id: string | null;
  created_at: string;
};

/** 根据目标日期查询计划（返回最新一条） */
export async function getPlanByDate(date: string): Promise<PlanRow | null> {
  const db = await getDatabase();
  return (
    (await db.getFirstAsync<PlanRow>(
      `SELECT * FROM plans WHERE target_date = ? ORDER BY created_at DESC LIMIT 1;`,
      [date],
    )) ?? null
  );
}

/** 获取所有计划，按 notify_at / created_at 降序 */
export async function getAllPlans(): Promise<PlanRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<PlanRow>(
    `SELECT * FROM plans ORDER BY COALESCE(notify_at, created_at) DESC;`,
  );
}

/** 更新计划内容和提醒时间 */
export async function updatePlan(
  id: number,
  planText: string,
  targetDate: string,
  notifyAt?: string,
  notificationId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE plans SET plan_text=?, target_date=?, notify_at=?, notification_id=? WHERE id=?;`,
    [planText, targetDate, notifyAt ?? null, notificationId ?? null, id],
  );
}

/** 删除一条计划 */
export async function deletePlan(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM plans WHERE id=?;`, [id]);
}
