export class MessageIdDedupe {
  private readonly ids = new Set<string | number>();
  private readonly order: (string | number)[] = [];

  constructor(private readonly maxSize = 200) {
    if (maxSize <= 0) throw new Error("MessageIdDedupe: maxSize must be > 0");
  }

  /** Returns true if `id` was already seen; otherwise records it and returns false. */
  seen(id: string | number | undefined): boolean {
    if (!id) return false;
    if (this.ids.has(id)) return true;

    this.ids.add(id);
    this.order.push(id);

    if (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return false;
  }

  get size(): number {
    return this.ids.size;
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }
}