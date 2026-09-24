import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { collectBundleReport } from './index.js';

describe('collectBundleReport', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-collect-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  it("derives Pages Router shared from '/_app', not the route intersection", () => {
    const nextDir = path.join(dir, '.next');
    writeFile(
      '.next/build-manifest.json',
      JSON.stringify({ pages: { '/_app': ['static/app.js'], '/about': ['static/about.js'] } }),
    );
    writeFile('.next/static/app.js', 'x'.repeat(100));
    writeFile('.next/static/about.js', 'y'.repeat(50));

    const report = collectBundleReport(nextDir, { compression: 'none' });
    const about = report.routes.find((r) => r.route === '/about');
    expect(report.routers.pages?.shared).toBe(100);
    expect(about?.own).toBe(50);
  });

  it("resolves nextVersion from nextDir's parent directory by default", () => {
    const nextDir = path.join(dir, '.next');
    writeFile('.next/build-manifest.json', JSON.stringify({ pages: { '/about': ['a.js'] } }));
    writeFile('.next/a.js', 'x');
    writeFile('node_modules/next/package.json', JSON.stringify({ version: '15.5.4' }));

    const report = collectBundleReport(nextDir, { compression: 'none' });
    expect(report.nextVersion).toBe('15.5.4');
  });

  it('resolves nextVersion from an explicit workingDirectory override', () => {
    const nextDir = path.join(dir, 'apps/web/.next');
    const appDir = path.join(dir, 'elsewhere');
    writeFile('apps/web/.next/build-manifest.json', JSON.stringify({ pages: { '/a': ['a.js'] } }));
    writeFile('apps/web/.next/a.js', 'x');
    writeFile('elsewhere/node_modules/next/package.json', JSON.stringify({ version: '14.2.0' }));

    const report = collectBundleReport(nextDir, { compression: 'none', workingDirectory: appDir });
    expect(report.nextVersion).toBe('14.2.0');
  });

  it("throws when next-dir doesn't exist, instead of silently reporting zero routes", () => {
    const nextDir = path.join(dir, '.nxt-typo');
    expect(() => collectBundleReport(nextDir, { compression: 'none' })).toThrow(/does not exist/);
  });

  it('throws when next-dir exists but has no recognizable manifests', () => {
    const nextDir = path.join(dir, '.next');
    writeFile('.next/BUILD_ID', '123');

    expect(() => collectBundleReport(nextDir, { compression: 'none' })).toThrow(
      /no build-manifest\.json/,
    );
  });
});
