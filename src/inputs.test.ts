import { parseInputs } from './inputs.js';

describe('parseInputs', () => {
  it('applies documented defaults when raw inputs are empty', () => {
    const inputs = parseInputs({});
    expect(inputs.workingDirectory).toBe('.');
    expect(inputs.nextDir).toBe('.next');
    expect(inputs.uploadArtifact).toBe(true);
    expect(inputs.comment).toBe(true);
    expect(inputs.commentAuthor).toBeUndefined();
    expect(inputs.jobSummary).toBe(true);
    expect(inputs.compression).toBe('gzip');
    expect(inputs.significantChange).toBe('512B');
    expect(inputs.buildCommand).toBeUndefined();
    expect(inputs.budgetsFile).toBeUndefined();
  });

  it('parses booleans and passes through overrides', () => {
    const inputs = parseInputs({
      'working-directory': 'apps/web',
      'upload-artifact': 'false',
      comment: 'false',
      'job-summary': 'false',
      compression: 'brotli',
      'warn-route-size': '250kB',
    });
    expect(inputs.workingDirectory).toBe('apps/web');
    expect(inputs.uploadArtifact).toBe(false);
    expect(inputs.comment).toBe(false);
    expect(inputs.jobSummary).toBe(false);
    expect(inputs.compression).toBe('brotli');
    expect(inputs.warnRouteSize).toBe('250kB');
  });

  it('rejects an invalid compression value', () => {
    expect(() => parseInputs({ compression: 'zstd' })).toThrow(/Invalid "compression"/);
  });

  it('rejects a non-boolean value for a boolean input', () => {
    expect(() => parseInputs({ comment: 'yes' })).toThrow(/Invalid "comment"/);
    expect(() => parseInputs({ 'upload-artifact': '1' })).toThrow(/Invalid "upload-artifact"/);
  });

  it('accepts boolean values regardless of case or surrounding whitespace', () => {
    const inputs = parseInputs({ comment: ' TRUE ', 'job-summary': 'False' });
    expect(inputs.comment).toBe(true);
    expect(inputs.jobSummary).toBe(false);
  });

  it('treats an empty-string input the same as an absent one', () => {
    const inputs = parseInputs({ 'base-branch': '' });
    expect(inputs.baseBranch).toBeUndefined();
  });

  it('passes through comment-author', () => {
    const inputs = parseInputs({ 'comment-author': 'my-bundle-bot[bot]' });
    expect(inputs.commentAuthor).toBe('my-bundle-bot[bot]');
  });
});
