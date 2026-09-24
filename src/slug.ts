const MAX_SLUG_LENGTH = 63;

/**
 * Normalizes an arbitrary string (e.g. an action `name` input) into a
 * lowercase `[a-z0-9-]` slug, used for the hidden comment marker, artifact
 * names, and file paths. Collapses runs of invalid characters into a single
 * `-`, trims leading/trailing `-`, and caps length so it stays safe as both
 * an artifact name and a filename component.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'bundle-analysis';
}
