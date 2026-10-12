// Tiny IndexedDB wrapper. Stores: "models" (cached model files), "vault" (encrypted reports), "meta".
const DB = "shasthosathi", VER = 1, STORES = ["models", "vault", "meta"];
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => STORES.forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store), req = fn(s);
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const idbGet = (s, k) => tx(s, "readonly", (st) => st.get(k));
export const idbPut = (s, k, v) => tx(s, "readwrite", (st) => st.put(v, k));
export const idbDel = (s, k) => tx(s, "readwrite", (st) => st.delete(k));
export const idbKeys = (s) => tx(s, "readonly", (st) => st.getAllKeys());
export const idbAll = (s) => tx(s, "readonly", (st) => st.getAll());
export const idbClear = (s) => tx(s, "readwrite", (st) => st.clear());
