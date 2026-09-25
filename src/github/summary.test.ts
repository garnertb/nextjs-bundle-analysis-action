import { buildJobSummaryUrl, writeJobSummary } from './summary.js';

describe('writeJobSummary', () => {
  it('writes the raw markdown with a trailing EOL', async () => {
    const addRaw = vi.fn().mockReturnThis();
    const write = vi.fn(async () => undefined);
    await writeJobSummary({ markdown: '# report', summary: { addRaw, write } as never });
    expect(addRaw).toHaveBeenCalledWith('# report', true);
    expect(write).toHaveBeenCalledOnce();
  });
});

describe('buildJobSummaryUrl', () => {
  it('builds the run summary URL', () => {
    expect(
      buildJobSummaryUrl({
        serverUrl: 'https://github.com',
        owner: 'octocat',
        repo: 'hello-world',
        runId: 42,
      }),
    ).toBe('https://github.com/octocat/hello-world/actions/runs/42');
  });
});
