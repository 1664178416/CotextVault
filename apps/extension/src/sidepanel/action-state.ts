export type ActionLock = {
  current: boolean;
};

export async function runExclusiveAction<T>(
  lock: ActionLock,
  setBusy: (busy: boolean) => void,
  action: () => Promise<T>
): Promise<T | undefined> {
  if (lock.current) {
    return undefined;
  }

  lock.current = true;
  setBusy(true);

  try {
    return await action();
  } finally {
    lock.current = false;
    setBusy(false);
  }
}
