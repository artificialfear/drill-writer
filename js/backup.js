// Drill Writer — automatic backup copies, kept in the browser's database (IndexedDB).
// This is separate from the main autosave (localStorage) and holds much more, so it keeps a history:
// a copy every few minutes while editing, plus one right before anything that replaces or reshapes the show
// (New, Open, Sample, Drop, Fix all, Delete set, Restore…). Old copies are thinned out automatically:
// everything from the last 2 hours, then one per hour for 2 days, then one per day for 60 days.

const DB_NAME = 'drillwriter', DB_VER = 1, STORE = 'snaps';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('at', 'at');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
};

let lastData = null; // the newest copy's contents, so identical copies aren't stored twice

// Store a copy of the show. Returns true if a copy was written (false if identical to the newest one).
export async function addSnapshot(show, reason) {
  const data = JSON.stringify(show);
  if (lastData === null) { const n = await newest(); lastData = n ? n.data : ''; }
  if (data === lastData) {
    // same as the newest copy: don't store it twice, but if this one says why it matters ("Before starting a
    // new show…"), put that on the newest copy so it's easy to find
    if (/^Before/.test(reason)) {
      const n = await newest();
      if (n && n.data === data && n.reason !== reason) { n.reason = reason; await tx('readwrite', st => st.put(n)); }
    }
    return false;
  }
  const rec = {
    at: Date.now(), reason, title: show.title || 'Untitled Show',
    sets: show.sets.length, performers: show.performers.length, size: data.length, data
  };
  await tx('readwrite', st => st.add(rec));
  lastData = data;
  prune().catch(() => {});
  return true;
}
async function newest() {
  return tx('readonly', st => {
    const r = st.index('at').openCursor(null, 'prev'), box = { result: null };
    r.onsuccess = () => { box.result = r.result ? r.result.value : null; };
    return box;
  });
}
// List copies, newest first (without their contents).
export async function listSnapshots() {
  const all = await tx('readonly', st => st.getAll());
  return all.map(({ data, ...meta }) => meta).sort((a, b) => b.at - a.at);
}
export async function getSnapshot(id) { return tx('readonly', st => st.get(id)); }

// Thin out old copies: keep everything from the last 2 hours, the newest per hour for 2 days,
// the newest per day for 60 days — and always at least the 10 newest.
async function prune() {
  const all = await listSnapshots(), now = Date.now(), H = 3600e3, keep = new Set(), seen = new Set();
  all.forEach((s, k) => {
    const age = now - s.at;
    let bucket = null;
    if (k < 10 || age < 2 * H) keep.add(s.id);
    else if (age < 48 * H) bucket = 'h' + Math.floor(s.at / H);
    else if (age < 60 * 24 * H) bucket = 'd' + new Date(s.at).toDateString();
    if (bucket && !seen.has(bucket)) { seen.add(bucket); keep.add(s.id); }
  });
  const drop = all.filter(s => !keep.has(s.id)).map(s => s.id);
  if (drop.length) await tx('readwrite', st => { for (const id of drop) st.delete(id); });
}

// Ask the browser not to clear this site's storage on its own (it may still say no).
export async function askPersistent() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) { return null; }
}
