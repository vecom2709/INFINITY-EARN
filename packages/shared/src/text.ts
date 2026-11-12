// Bewusst: erkennt unzulässige ASCII-Steuerzeichen (außer Tab/LF/CR) in Benutzereingaben.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function hasControlChars(s: string): boolean {
  return CONTROL_CHARS.test(s);
}

/** JSON sicher parsen; bei Fehler `fallback`. */
export function parseJsonOr<T>(json: string | null | undefined, fallback: T): T {
  if (json === null || json === undefined) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
