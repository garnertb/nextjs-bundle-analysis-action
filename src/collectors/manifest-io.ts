import fs from 'node:fs';
import path from 'node:path';

export function readJsonManifest<T>(nextDir: string, name: string): T | undefined {
  const file = path.join(nextDir, name);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * Turbopack (and Next 16 webpack) client-reference manifests are not plain
 * JSON: they're a `globalThis.__RSC_MANIFEST["<key>"] = {...};` assignment
 * emitted per route, under `server/app/**`.
 */
export interface ClientReferenceManifest {
  entryJSFiles?: Record<string, string[]>;
}

const RSC_MANIFEST_ASSIGNMENT =
  /globalThis\.__RSC_MANIFEST\[["']([^"']+)["']\]\s*=\s*(\{.*\});?\s*$/s;

export function readClientReferenceManifest(
  file: string,
): { key: string; manifest: ClientReferenceManifest } | undefined {
  const content = fs.readFileSync(file, 'utf8');
  const match = RSC_MANIFEST_ASSIGNMENT.exec(content);
  if (!match) return undefined;
  const key = match[1];
  const json = match[2];
  if (key === undefined || json === undefined) return undefined;
  return { key, manifest: JSON.parse(json) as ClientReferenceManifest };
}

/** Recursively collects file paths under `dir` matching `predicate`. Returns `[]` if `dir` doesn't exist. */
export function walkFiles(dir: string, predicate: (fileName: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}
