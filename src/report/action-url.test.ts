import { buildActionUrl } from './action-url.js';

const REPO = 'garnertb/nextjs-bundle-analysis-action';
const SERVER = 'https://github.com';

describe('buildActionUrl', () => {
  it('links a tag ref', () => {
    expect(buildActionUrl({ serverUrl: SERVER, repository: REPO, ref: 'v1.2.3' })).toBe(
      `https://github.com/${REPO}/tree/v1.2.3`,
    );
  });

  it('keeps a full SHA in the URL', () => {
    const sha = '0562a1d3f76ac459586a5b4c40a4113452500ca7';
    expect(buildActionUrl({ serverUrl: SERVER, repository: REPO, ref: sha })).toBe(
      `https://github.com/${REPO}/tree/${sha}`,
    );
  });

  it('keeps slashes between ref segments', () => {
    expect(buildActionUrl({ serverUrl: SERVER, repository: REPO, ref: 'feature/x-y' })).toBe(
      `https://github.com/${REPO}/tree/feature/x-y`,
    );
  });

  it('percent-encodes characters that could end a Markdown link destination', () => {
    expect(buildActionUrl({ serverUrl: SERVER, repository: REPO, ref: "a(b)c<d> e|f'g!h*i" })).toBe(
      `https://github.com/${REPO}/tree/a%28b%29c%3Cd%3E%20e%7Cf%27g%21h%2Ai`,
    );
  });

  it('accepts names and refs that merely contain dots', () => {
    expect(buildActionUrl({ serverUrl: SERVER, repository: 'a.b/c..d', ref: 'v1.2..x/.y' })).toBe(
      'https://github.com/a.b/c..d/tree/v1.2..x/.y',
    );
  });

  it('accepts a server URL with a trailing slash', () => {
    expect(buildActionUrl({ serverUrl: 'https://github.com/', repository: REPO, ref: 'v1' })).toBe(
      `https://github.com/${REPO}/tree/v1`,
    );
  });

  it.each([
    ['a GHES server', { serverUrl: 'https://ghe.example.com', repository: REPO, ref: 'v1' }],
    ['a non-https server', { serverUrl: 'http://github.com', repository: REPO, ref: 'v1' }],
    ['an invalid server URL', { serverUrl: 'not a url', repository: REPO, ref: 'v1' }],
    ['no server URL', { serverUrl: undefined, repository: REPO, ref: 'v1' }],
    ['no ref', { serverUrl: SERVER, repository: REPO, ref: undefined }],
    ['an empty ref', { serverUrl: SERVER, repository: REPO, ref: '' }],
    ['no repository', { serverUrl: SERVER, repository: undefined, ref: 'v1' }],
    ['an empty repository', { serverUrl: SERVER, repository: '', ref: 'v1' }],
    ['a repository without an owner', { serverUrl: SERVER, repository: 'repo', ref: 'v1' }],
    ['a repository with extra segments', { serverUrl: SERVER, repository: 'a/b/c', ref: 'v1' }],
    ['a repository with markup', { serverUrl: SERVER, repository: 'a/b)[x](y', ref: 'v1' }],
    ['a .. repository owner', { serverUrl: SERVER, repository: '../x', ref: 'v1' }],
    ['a .. repository name', { serverUrl: SERVER, repository: 'a/..', ref: 'v1' }],
    ['a . repository segment', { serverUrl: SERVER, repository: './x', ref: 'v1' }],
    ['a .. ref segment', { serverUrl: SERVER, repository: REPO, ref: '../../evil' }],
    ['a trailing . ref segment', { serverUrl: SERVER, repository: REPO, ref: 'v1/.' }],
  ])('returns undefined for %s', (_label, params) => {
    expect(buildActionUrl(params)).toBeUndefined();
  });
});
