import { hashPassword } from '../packages/shared/src/crypto.ts';

/**
 * Erzeugt OWNER_PASSWORD_HASH. Das Passwort wird verdeckt eingelesen (TTY) oder per Pipe übergeben
 * und nie gespeichert oder geloggt. Ausgabe: Zeile für die lokale .env.
 */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c: string) => (data += c));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let pw = '';
    const onData = (ch: string): void => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(pw);
          return;
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') pw = pw.slice(0, -1);
        else pw += c;
      }
    };
    stdin.on('data', onData);
  });
}

const pw = await readHidden('Neues Owner-Passwort (min. 12 Zeichen): ');
try {
  console.log(`\nIn .env eintragen:\nOWNER_PASSWORD_HASH=${hashPassword(pw)}\n`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
