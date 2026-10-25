// Device-local playback counters. No analytics service, account, or API key.
const KEY = 'sia.metrics';
const COUNTERS = [
  'watchSeconds', 'plays', 'autoPlays', 'completions', 'selections',
  'pauses', 'resumes', 'skips', 'exits',
];
const INTERACTIONS = ['selections', 'pauses', 'resumes', 'skips', 'exits'];
let fallback = { version: 1, videos: {} };
let storageError = '';
let unsaved = false;

export function dayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function read() {
  if (unsaved) return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : { version: 1, videos: {} };
    if (data?.version !== 1 || !data.videos || typeof data.videos !== 'object' || Array.isArray(data.videos)) {
      throw new Error('Invalid metrics');
    }
    fallback = data;
    storageError = '';
  } catch {
    storageError = 'Metrics could not be read from this browser. New activity is kept in memory until storage is available.';
  }
  return fallback;
}

export function recordVideoMetrics(video, changes, timestamp = Date.now()) {
  if (!/^[\w-]{11}$/.test(video?.videoId)) return;
  const data = read();
  let entry = Object.hasOwn(data.videos, video.videoId) ? data.videos[video.videoId] : null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    entry = data.videos[video.videoId] = { title: video.title, days: {} };
  }
  entry.title = video.title || entry.title || 'Video';
  if (!entry.days || typeof entry.days !== 'object' || Array.isArray(entry.days)) entry.days = {};
  const key = dayKey(timestamp);
  let bucket = entry.days[key];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) bucket = entry.days[key] = {};
  for (const counter of COUNTERS) {
    bucket[counter] = number(bucket[counter]) + number(changes[counter]);
  }
  if (changes.plays || changes.watchSeconds) {
    bucket.lastWatchedAt = Math.max(number(bucket.lastWatchedAt), timestamp);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    unsaved = false;
    storageError = '';
  } catch {
    unsaved = true;
    storageError = 'Metrics cannot be saved in this browser. Activity may be lost when the app closes.';
  }
}

export function getMetricsStorageError() {
  return storageError;
}

export function clearMetrics() {
  // Only change the in-memory copy once removal succeeds.
  try {
    localStorage.removeItem(KEY);
    fallback = { version: 1, videos: {} };
    unsaved = false;
    storageError = '';
    return true;
  } catch {
    storageError = 'Metrics could not be cleared. Please try again.';
    return false;
  }
}

export function getVideoMetrics(videos, range = '7', sort = 'watchSeconds', timestamp = Date.now()) {
  const data = read();
  const cutoff = new Date(timestamp);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (range === 'today' ? 0 : Number(range) - 1));
  const firstDay = range === 'all' ? '' : dayKey(cutoff);
  const today = dayKey(timestamp);
  const current = new Map(videos.map((video) => [video.videoId, video]));
  const ids = new Set([...current.keys(), ...Object.keys(data.videos)]);
  const rows = [];
  for (const videoId of ids) {
    if (!/^[\w-]{11}$/.test(videoId)) continue;
    const saved = Object.hasOwn(data.videos, videoId) ? data.videos[videoId] : null;
    const row = {
      videoId, title: current.get(videoId)?.title || saved?.title || 'Video',
      removed: !current.has(videoId), lastWatchedAt: 0,
      ...Object.fromEntries(COUNTERS.map((key) => [key, 0])),
    };
    for (const [date, bucket] of Object.entries(saved?.days || {})) {
      if (date < firstDay || date > today || !bucket || typeof bucket !== 'object') continue;
      for (const counter of COUNTERS) row[counter] += number(bucket[counter]);
      row.lastWatchedAt = Math.max(row.lastWatchedAt, number(bucket.lastWatchedAt));
    }
    row.interactions = INTERACTIONS.reduce((total, key) => total + row[key], 0);
    // Removed videos remain visible when they have activity in the selected period.
    if (!row.removed || row.plays || row.watchSeconds || row.interactions || row.completions) rows.push(row);
  }
  const field = ['watchSeconds', 'plays', 'interactions', 'lastWatchedAt'].includes(sort) ? sort : 'watchSeconds';
  return rows.sort((a, b) => b[field] - a[field] || b.watchSeconds - a.watchSeconds || a.title.localeCompare(b.title));
}

// The clock and recorder are injectable so playback accounting can be tested
// without YouTube, a browser, or elapsed real time.
export function createWatchTracker({ record = recordVideoMetrics, now = Date.now } = {}) {
  let video = null;
  let source = 'manual';
  let visible = true;
  let started = false;
  let completed = false;
  let last = null;
  let pending = new Map();
  let pendingSeconds = 0;

  function flush() {
    if (video) {
      for (const item of pending.values()) record(video, { watchSeconds: item.seconds }, item.timestamp);
    }
    pending = new Map();
    pendingSeconds = 0;
  }

  function addSeconds(seconds, end) {
    // Split the small sampled interval at local midnight for accurate day filters.
    let start = end - seconds * 1000;
    while (start < end) {
      const nextDay = new Date(start);
      nextDay.setHours(24, 0, 0, 0);
      const until = Math.min(end, nextDay.getTime());
      const key = dayKey(start);
      const item = pending.get(key) || { timestamp: start, seconds: 0 };
      item.seconds += (until - start) / 1000;
      item.timestamp = until - 1;
      pending.set(key, item);
      start = until;
    }
    pendingSeconds += seconds;
  }

  function update(snapshot) {
    const timestamp = now();
    if (!video || snapshot?.videoId !== video.videoId) {
      last = null;
      return;
    }
    const position = Number(snapshot.position);
    const rate = Number(snapshot.rate) || 1;
    if (visible && last && Number.isFinite(position)) {
      const elapsed = (timestamp - last.timestamp) / 1000;
      const progress = position - last.position;
      // Ignore seeks, clock changes, and long gaps caused by a suspended app.
      // Media progress prevents loading/buffering from being counted as watching.
      if (elapsed > 0 && elapsed <= 10 && progress > 0 && progress <= elapsed * last.rate + 0.5) {
        addSeconds(Math.min(elapsed, progress / last.rate), timestamp);
      }
    }
    if (visible && snapshot.state === 'playing' && !started) {
      record(video, { plays: 1, autoPlays: source === 'auto' ? 1 : 0 }, timestamp);
      started = true;
    }
    if (snapshot.state === 'ended' && !completed) {
      if (visible && started) record(video, { completions: 1 }, timestamp);
      completed = true;
    }
    last = visible && snapshot.state === 'playing' && Number.isFinite(position)
      ? { timestamp, position, rate } : null;
    if (pendingSeconds >= 5 || snapshot.state !== 'playing') flush();
  }

  return {
    start(nextVideo, nextSource = 'manual') {
      flush();
      video = nextVideo;
      source = nextSource;
      started = false;
      completed = false;
      last = null;
      if (source === 'grid' && visible) record(video, { selections: 1 }, now());
    },
    update,
    interact(kind) {
      if (video && visible && INTERACTIONS.includes(kind)) record(video, { [kind]: 1 }, now());
    },
    finish(kind, snapshot) {
      update(snapshot);
      if (video && kind && !(kind === 'skips' && completed)) this.interact(kind);
      flush();
      video = null;
      last = null;
    },
    setVisible(on, snapshot) {
      // Flush up to the moment the app becomes hidden; never include the hidden gap.
      if (!on) update(snapshot);
      visible = on;
      last = null;
      if (on) update(snapshot);
      else flush();
    },
    flush,
  };
}
