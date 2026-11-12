import { redact } from './redact.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Sink = (line: string) => void;

let sink: Sink = (line) => console.log(line);

/** Für Tests: Log-Ausgabe umleiten. */
export function setLogSink(next: Sink | null): void {
  sink = next ?? ((line) => console.log(line));
}

/** Strukturierte, datensparsame JSON-Logs. Geheimnisse werden immer redigiert. */
export function log(level: LogLevel, msg: string, data: Record<string, unknown> = {}): void {
  const entry = redact({ ts: new Date().toISOString(), level, msg, ...data });
  sink(JSON.stringify(entry));
}
