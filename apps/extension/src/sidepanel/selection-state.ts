type SelectableMemory = {
  id: string;
};

export function selectVisibleMemoryIds(cards: readonly SelectableMemory[]): Set<string> {
  return new Set(cards.map((card) => card.id));
}

export function pruneSelectedMemoryIds(selectedIds: Set<string>, visibleIds: ReadonlySet<string>): Set<string> {
  let changed = false;
  const next = new Set<string>();

  selectedIds.forEach((id) => {
    if (visibleIds.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  });

  return changed ? next : selectedIds;
}
