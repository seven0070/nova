import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import type { CodingSession } from "./store";
/** Per-project FTS index: original JSON sessions remain the source of truth. */
export class DeviceRecall {
  readonly db: DatabaseSync;
  constructor(folder: string) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, "recall.sqlite");
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(
      'PRAGMA busy_timeout=5000;CREATE VIRTUAL TABLE IF NOT EXISTS history USING fts5(session UNINDEXED,role UNINDEXED,content,updated UNINDEXED,tokenize="unicode61");',
    );
  }
  index(session: CodingSession) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM history WHERE session=?").run(session.id);
      const insert = this.db.prepare(
        "INSERT INTO history(session,role,content,updated) VALUES(?,?,?,?)",
      );
      for (const m of session.messages)
        insert.run(session.id, m.role, m.content, session.updatedAt);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  search(query: string) {
    if (typeof query !== "string" || query.length > 500)
      throw new Error("Search query must be under 500 characters");
    const words = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 20) || [];
    if (!words.length) return [];
    const match = words
      .map((w) => '"' + w.replace(/"/g, '""') + '"')
      .join(" OR ");
    return this.db
      .prepare(
        "SELECT session AS sessionId,role,snippet(history,2,'','', ' … ',48) AS excerpt,updated AS updatedAt FROM history WHERE history MATCH ? ORDER BY bm25(history),updated DESC LIMIT 20",
      )
      .all(match);
  }
  close() {
    this.db.close();
  }
}
