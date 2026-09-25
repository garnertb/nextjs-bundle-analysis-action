import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { detectBundler, detectNextVersion, isSupportedNextVersion } from './environment.js';

describe('detectBundler', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-environment-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects turbopack via its marker file', () => {
    fs.writeFileSync(path.join(dir, 'turbopack'), '');
    expect(detectBundler(dir)).toBe('turbopack');
  });

  it('detects webpack via server/webpack-runtime.js', () => {
    fs.mkdirSync(path.join(dir, 'server'));
    fs.writeFileSync(path.join(dir, 'server', 'webpack-runtime.js'), '');
    expect(detectBundler(dir)).toBe('webpack');
  });

  it('returns undefined when neither marker is present', () => {
    expect(detectBundler(dir)).toBeUndefined();
  });
});

describe('detectNextVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-environment-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the version from node_modules/next/package.json', () => {
    const nextDir = path.join(dir, 'node_modules', 'next');
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(path.join(nextDir, 'package.json'), JSON.stringify({ version: '15.5.25' }));
    expect(detectNextVersion(dir)).toBe('15.5.25');
  });

  it('returns undefined when next is not installed', () => {
    expect(detectNextVersion(dir)).toBeUndefined();
  });

  it('returns undefined when package.json is malformed', () => {
    const nextDir = path.join(dir, 'node_modules', 'next');
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(path.join(nextDir, 'package.json'), '{not json');
    expect(detectNextVersion(dir)).toBeUndefined();
  });

  it('walks up to an ancestor node_modules/next', () => {
    const nextDir = path.join(dir, 'node_modules', 'next');
    fs.mkdirSync(nextDir, { recursive: true });
    fs.writeFileSync(path.join(nextDir, 'package.json'), JSON.stringify({ version: '16.3.6' }));
    const appDir = path.join(dir, 'apps', 'web');
    fs.mkdirSync(appDir, { recursive: true });
    expect(detectNextVersion(appDir)).toBe('16.3.6');
  });
});

describe('isSupportedNextVersion', () => {
  it.each([
    ['14.2.35', false],
    ['9.5.0', false],
    ['15.0.0', true],
    ['16.0.0-canary.42', true],
    ['v15.5.26', true],
    ['latest', undefined],
    [undefined, undefined],
  ])('%s -> %s', (version, expected) => {
    expect(isSupportedNextVersion(version)).toBe(expected);
  });
});
