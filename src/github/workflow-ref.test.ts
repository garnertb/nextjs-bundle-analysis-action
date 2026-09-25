import { parseWorkflowFileFromRef } from './workflow-ref.js';

describe('parseWorkflowFileFromRef', () => {
  it('extracts the workflow file from a standard ref', () => {
    expect(
      parseWorkflowFileFromRef('octocat/hello-world/.github/workflows/ci.yml@refs/heads/main'),
    ).toBe('ci.yml');
  });

  it('extracts a nested workflow file path', () => {
    expect(parseWorkflowFileFromRef('o/r/.github/workflows/nested/ci.yml@refs/heads/main')).toBe(
      'nested/ci.yml',
    );
  });

  it('returns undefined for an undefined ref', () => {
    expect(parseWorkflowFileFromRef(undefined)).toBeUndefined();
  });

  it('returns undefined when the ref has no workflows marker', () => {
    expect(parseWorkflowFileFromRef('not-a-workflow-ref')).toBeUndefined();
  });
});
