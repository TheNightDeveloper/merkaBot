import fs from "node:fs";
import path from "node:path";

import { drizzle, SQLJsDatabase } from "drizzle-orm/sql-js";
import initSqlJs, { Database as SqlJsDatabaseInstance } from "sql.js";

import type { AppConfig } from "../../config";
import * as schema from "./schema";

export type AppDatabase = SQLJsDatabase<typeof schema>;

export async function createDb(config: AppConfig): Promise<{
  db: AppDatabase;
  sqlite: SqlJsDatabaseInstance;
  persist: () => Promise<void>;
  close: () => Promise<void>;
}> {
  const absolutePath = path.resolve(config.sqlitePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
  });
  const existing = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath) : undefined;
  const sqlite = existing ? new SQL.Database(existing) : new SQL.Database();

  const db = drizzle(sqlite, { schema });

  const persist = async () => {
    const data = sqlite.export();
    await fs.promises.writeFile(absolutePath, Buffer.from(data));
  };

  return {
    db,
    sqlite,
    persist,
    close: async () => {
      await persist();
      sqlite.close();
    }
  };
}
