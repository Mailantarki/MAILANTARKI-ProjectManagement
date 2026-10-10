// pdf.js 6 calls Map/WeakMap.prototype.getOrInsertComputed (ES2026). Browsers released before
// early 2026 (including many iPhones) lack it and the viewer crashes on first render.
type Insertable<K, V> = { has(key: K): boolean; get(key: K): V | undefined; set(key: K, value: V): unknown };

function install(proto: object) {
  const target = proto as Record<string, unknown>;
  if (!target.getOrInsert) {
    Object.defineProperty(proto, "getOrInsert", { configurable: true, writable: true,
      value(this: Insertable<unknown, unknown>, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      } });
  }
  if (!target.getOrInsertComputed) {
    Object.defineProperty(proto, "getOrInsertComputed", { configurable: true, writable: true,
      value(this: Insertable<unknown, unknown>, key: unknown, compute: (key: unknown) => unknown) {
        if (!this.has(key)) this.set(key, compute(key));
        return this.get(key);
      } });
  }
}

install(Map.prototype);
install(WeakMap.prototype);
export {};
