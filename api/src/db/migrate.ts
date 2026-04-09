import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

const db  = new Database(process.env.DB_PATH ?? "data.db");
const sql = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
db.exec(sql);
console.log("Migration abgeschlossen.");
