export class MessageIdDedupe {
    maxSize;
    ids = new Set();
    order = [];
    constructor(maxSize = 200) {
        this.maxSize = maxSize;
        if (maxSize <= 0)
            throw new Error("MessageIdDedupe: maxSize must be > 0");
    }
    /** Returns true if `id` was already seen; otherwise records it and returns false. */
    seen(id) {
        if (!id)
            return false;
        if (this.ids.has(id))
            return true;
        this.ids.add(id);
        this.order.push(id);
        if (this.order.length > this.maxSize) {
            const oldest = this.order.shift();
            if (oldest !== undefined)
                this.ids.delete(oldest);
        }
        return false;
    }
    get size() {
        return this.ids.size;
    }
    clear() {
        this.ids.clear();
        this.order.length = 0;
    }
}
