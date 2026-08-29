/**
 * Deterministic JSON → YAML serializer.
 *
 * A small, dependency-free YAML emitter for JSON-like objects (the shape
 * produced by the API-governance OpenAPI generator). Emits valid YAML with
 * correct nested indentation. Intended for the OpenAPI YAML export, not a
 * general-purpose YAML library.
 */

function needsQuotes(value: string): boolean {
  if (value.length === 0) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/[:#](\s|$)/.test(value)) return true;
  if (/^[ \t]|^~$|^null$|^true$|^false$|^yes$|^no$|^on$|^off$|^\d/.test(value)) return true;
  if (/\n/.test(value)) return true;
  return false;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return needsQuotes(value) ? quote(value) : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return quote(String(value));
}

/** Emit `value` as already-padded YAML lines at the given depth. */
function emit(value: unknown, depth: number): string[] {
  const pad = "  ".repeat(depth);
  if (value === null || value === undefined) return [`${pad}null`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const out: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) {
          out.push(`${pad}- {}`);
          continue;
        }
        const [k, v] = entries[0]!;
        const key = needsQuotes(k) ? quote(k) : k;
        if (isInline(v)) {
          out.push(`${pad}- ${key}: ${inlineScalar(v)}`);
        } else {
          out.push(`${pad}- ${key}:`);
          out.push(...emit(v, depth + 2));
        }
        for (const [rk, rv] of entries.slice(1)) {
          const rkey = needsQuotes(rk) ? quote(rk) : rk;
          out.push(...pair(rkey, rv, depth + 2));
        }
      } else {
        out.push(`${pad}- ${scalar(item)}`);
      }
    }
    return out;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [`${pad}{}`];
    const out: string[] = [];
    for (const [k, v] of entries) {
      const key = needsQuotes(k) ? quote(k) : k;
      out.push(...pair(key, v, depth));
    }
    return out;
  }
  return [`${pad}${scalar(value)}`];
}

function isInline(v: unknown): boolean {
  if (v === null || typeof v !== "object") return true;
  if (Array.isArray(v)) return v.length === 0;
  return Object.keys(v as Record<string, unknown>).length === 0;
}

function inlineScalar(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[]";
  if (typeof v === "object") return "{}";
  return scalar(v);
}

/** Emit `key: <value>` (or key-on-own-line for a nested block). */
function pair(key: string, val: unknown, depth: number): string[] {
  const pad = "  ".repeat(depth);
  if (isInline(val)) return [`${pad}${key}: ${inlineScalar(val)}`];
  return [`${pad}${key}:`, ...emit(val, depth + 1)];
}

/** Serialize a JSON-compatible object to a YAML string. */
export function jsonToYaml(value: unknown): string {
  return emit(value, 0).join("\n") + "\n";
}
