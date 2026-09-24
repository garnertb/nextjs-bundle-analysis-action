/**
 * Extracts the workflow file path (e.g. `ci.yml`, or `nested/ci.yml`) from
 * `GITHUB_WORKFLOW_REF`, which Actions sets to
 * `<owner>/<repo>/.github/workflows/<file>@<ref>`. Used as the default
 * `baseline-workflow` so the baseline lookup targets the workflow currently
 * running, without requiring the consumer to name it explicitly.
 */
export function parseWorkflowFileFromRef(workflowRef: string | undefined): string | undefined {
  if (!workflowRef) return undefined;
  const withoutRef = workflowRef.split('@')[0] ?? '';
  const marker = '.github/workflows/';
  const index = withoutRef.indexOf(marker);
  if (index === -1) return undefined;
  const file = withoutRef.slice(index + marker.length);
  return file.length > 0 ? file : undefined;
}
