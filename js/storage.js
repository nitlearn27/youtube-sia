// Persistence layer: curated video list + parent PIN, all in localStorage.
// No backend, no accounts — each device keeps its own private list.

const KEY_VIDEOS = 'sia.videos';
const KEY_PIN = 'sia.pin';
const PIN_SALT = 'sia-v1::'; // not real security, just keeps the stored hash opaque

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// --- videos ---
export function getVideos() {
  try {
    return JSON.parse(localStorage.getItem(KEY_VIDEOS)) || [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(KEY_VIDEOS, JSON.stringify(list));
  return list;
}

export function addVideo({ videoId, title }) {
  const list = getVideos();
  // skip exact duplicates
  if (list.some((v) => v.videoId === videoId)) return list;
  list.push({ id: uuid(), videoId, title: title || 'Video', addedAt: Date.now() });
  return save(list);
}

export function removeVideo(id) {
  return save(getVideos().filter((v) => v.id !== id));
}

export function moveVideo(id, dir) {
  const list = getVideos();
  const i = list.findIndex((v) => v.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return save(list);
}

// --- PIN ---
async function hash(pin) {
  const str = PIN_SALT + pin;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // fallback for non-secure contexts (e.g. plain http on a LAN IP):
  // a child's PIN is not a real secret, so a simple hash is acceptable here.
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return 'f' + h.toString(16);
}

export function hasPin() {
  return !!localStorage.getItem(KEY_PIN);
}

export async function setPin(pin) {
  localStorage.setItem(KEY_PIN, await hash(pin));
}

export async function verifyPin(pin) {
  return localStorage.getItem(KEY_PIN) === (await hash(pin));
}
