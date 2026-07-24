export function pluralizeCount(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralizeCount(count, singular, plural)}`;
}
