export class AccountRefreshLock {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  run<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(accountId) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const task = operation().finally(() => {
      this.inFlight.delete(accountId);
    });

    this.inFlight.set(accountId, task);
    return task;
  }
}

