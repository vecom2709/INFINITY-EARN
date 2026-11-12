import { newId } from '../../shared/src/crypto.ts';
import type { SqlDb as Db } from '../../storage/src/types.ts';
import { redact } from './redact.ts';

export interface AuditInput {
  type: string;
  actor: string;
  subjectType?: string;
  subjectId?: string;
  data?: unknown;
  testMode: boolean;
}

export interface AuditRow {
  seq: number;
  event_id: string;
  event_type: string;
  actor: string;
  subject_type: string | null;
  subject_id: string | null;
  data_json: string;
  test_mode: number;
  created_at: string;
}

/** Append-only Audit-Log (DB-Trigger verhindern UPDATE/DELETE). */
export class AuditLog {
  readonly #db: Db;
  readonly #clock: () => Date;

  constructor(db: Db, clock: () => Date) {
    this.#db = db;
    this.#clock = clock;
  }

  record(e: AuditInput): string {
    const id = newId('evt');
    this.#db.run(
      `INSERT INTO audit_events (event_id, event_type, actor, subject_type, subject_id, data_json, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      e.type,
      e.actor,
      e.subjectType ?? null,
      e.subjectId ?? null,
      JSON.stringify(redact(e.data ?? {})),
      e.testMode ? 1 : 0,
      this.#clock().toISOString(),
    );
    return id;
  }

  list(limit = 50, subjectId?: string): AuditRow[] {
    if (subjectId) {
      return this.#db.all<AuditRow>('SELECT * FROM audit_events WHERE subject_id = ? ORDER BY seq DESC LIMIT ?', subjectId, limit);
    }
    return this.#db.all<AuditRow>('SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?', limit);
  }

  byType(type: string): AuditRow[] {
    return this.#db.all<AuditRow>('SELECT * FROM audit_events WHERE event_type = ? ORDER BY seq', type);
  }
}
