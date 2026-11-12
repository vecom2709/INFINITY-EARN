import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Minimaler .env-Editor: ersetzt Werte zeilengenau, behält Kommentare und Reihenfolge. */
export function readEnvFile(path: string, fallbackTemplate: string): string[] {
  return (existsSync(path) ? readFileSync(path, 'utf8') : readFileSync(fallbackTemplate, 'utf8')).replace(/\r\n/g, '\n').split('\n');
}

export function getEnv(lines: string[], key: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line === undefined ? undefined : line.slice(key.length + 1);
}

export function setEnv(lines: string[], key: string, value: string): void {
  if (/[\r\n]/.test(value)) throw new Error(`Ungültiger Wert für ${key}`);
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}

export const isUnset = (v: string | undefined): boolean => {
  const t = (v ?? '').trim();
  return t === '' || t === 'NOT_SET' || t.startsWith('REPLACE_ME');
};

export function writeEnvFile(path: string, lines: string[]): void {
  writeFileSync(path, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
}

export function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c: string) => (data += c));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0]?.trim() ?? ''));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string): void => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}
