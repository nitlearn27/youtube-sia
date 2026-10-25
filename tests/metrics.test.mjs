import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMetrics, createWatchTracker, dayKey, getMetricsStorageError,
  getVideoMetrics, recordVideoMetrics,
} from '../js/metrics.js';
import { formatWatchTime } from '../js/dashboard.js';

const video = { videoId: 'abcdefghijk', title: 'Colors' };
const other = { videoId: 'lmnopqrstuv', title: 'Movement' };
let saved;
beforeEach(() => {
  saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  clearMetrics();
});

function playbackHarness(start = new Date(2026, 9, 25, 12).getTime()) {
  let time = start;
  const events = [];
  const tracker = createWatchTracker({
    now: () => time,
    record: (item, changes, timestamp) => events.push({ videoId: item.videoId, changes, timestamp }),
  });
  const snapshot = (state = 'playing', position = 0, item = video, rate = 1) => ({ videoId: item.videoId, state, position, rate });
  return {
    tracker, events, snapshot,
    advance(seconds) { time += seconds * 1000; },
    count(key, item = video) {
      return events.filter((event) => event.videoId === item.videoId)
        .reduce((sum, event) => sum + (event.changes[key] || 0), 0);
    },
  };
}

test('counts one play across pauses and buffering and only counts advancing playback', () => {
  const h = playbackHarness();
  h.tracker.start(video, 'grid');
  h.tracker.update(h.snapshot('playing', 0));
  h.advance(3);
  h.tracker.update(h.snapshot('paused', 3));
  h.tracker.interact('pauses');
  h.advance(20);
  h.tracker.update(h.snapshot('paused', 3));
  h.tracker.interact('resumes');
  h.tracker.update(h.snapshot('playing', 3));
  h.advance(2);
  h.tracker.update(h.snapshot('buffering', 5));
  h.advance(30);
  h.tracker.update(h.snapshot('playing', 5));
  h.advance(2);
  h.tracker.finish('exits', h.snapshot('paused', 7));
  assert.equal(h.count('watchSeconds'), 7);
  assert.equal(h.count('plays'), 1);
  assert.equal(h.count('selections'), 1);
  assert.equal(h.count('pauses'), 1);
  assert.equal(h.count('resumes'), 1);
  assert.equal(h.count('exits'), 1);
});

test('excludes hidden time, suspended timers, seeks and stalled video progress', () => {
  const h = playbackHarness();
  h.tracker.start(video);
  h.tracker.update(h.snapshot('playing', 0));
  h.advance(2);
  h.tracker.setVisible(false, h.snapshot('playing', 2));
  h.advance(60);
  h.tracker.update(h.snapshot('playing', 62));
  h.tracker.setVisible(true, h.snapshot('playing', 62));
  h.advance(2);
  h.tracker.update(h.snapshot('playing', 64));
  h.advance(30); // The app was suspended without a visibility event.
  h.tracker.update(h.snapshot('playing', 94));
  h.advance(1);
  h.tracker.update(h.snapshot('playing', 200)); // Seek, not watch time.
  h.advance(1);
  h.tracker.update(h.snapshot('playing', 200)); // No progress.
  h.advance(1);
  h.tracker.finish(null, h.snapshot('paused', 201));
  assert.equal(h.count('watchSeconds'), 5);
  assert.equal(h.count('plays'), 1);
});

test('distinguishes auto starts, manual skips and completions without double counting', () => {
  const h = playbackHarness();
  h.tracker.start(video, 'grid');
  h.tracker.update(h.snapshot('playing', 0));
  h.advance(2);
  h.tracker.update(h.snapshot('ended', 2));
  h.tracker.update(h.snapshot('ended', 2));
  h.tracker.finish(null, h.snapshot('ended', 2));
  h.tracker.start(other, 'auto');
  h.tracker.update(h.snapshot('playing', 0)); // Late event from the old video.
  h.tracker.update(h.snapshot('playing', 0, other));
  h.advance(1);
  h.tracker.finish('skips', h.snapshot('playing', 1, other));
  assert.equal(h.count('completions'), 1);
  assert.equal(h.count('skips'), 0);
  assert.equal(h.count('autoPlays'), 0);
  assert.equal(h.count('plays', other), 1);
  assert.equal(h.count('autoPlays', other), 1);
  assert.equal(h.count('skips', other), 1);
  assert.equal(h.count('watchSeconds', other), 1);
});

test('failed loads and hidden autoplay do not count as watched videos', () => {
  const h = playbackHarness();
  h.tracker.start(video, 'grid');
  h.tracker.update(h.snapshot('unstarted', 0));
  h.advance(10);
  h.tracker.finish(null, h.snapshot('unstarted', 0));
  assert.equal(h.count('plays'), 0);
  assert.equal(h.count('watchSeconds'), 0);
  assert.equal(h.count('selections'), 1);
  h.tracker.setVisible(false, null);
  h.tracker.start(other, 'auto');
  h.tracker.update(h.snapshot('playing', 0, other));
  h.advance(2);
  h.tracker.update(h.snapshot('ended', 2, other));
  assert.equal(h.count('plays', other), 0);
  assert.equal(h.count('completions', other), 0);
});

test('splits watch time at local midnight and accounts for playback speed', () => {
  const midnight = new Date(2026, 9, 26, 0, 0, 0).getTime();
  const h = playbackHarness(midnight - 1000);
  h.tracker.start(video);
  h.tracker.update(h.snapshot('playing', 0, video, 2));
  h.advance(2);
  h.tracker.finish(null, h.snapshot('paused', 4, video, 2));
  const watch = h.events.filter((event) => event.changes.watchSeconds);
  assert.deepEqual(watch.map((event) => [dayKey(event.timestamp), event.changes.watchSeconds]), [
    ['2026-10-25', 1], ['2026-10-26', 1],
  ]);
});

test('flushes recent progress periodically and on exit without counting pause as a new play', () => {
  const h = playbackHarness();
  h.tracker.start(video);
  h.tracker.update(h.snapshot('playing', 0));
  for (let i = 1; i <= 6; i++) {
    h.advance(1);
    h.tracker.update(h.snapshot('playing', i));
  }
  assert.equal(h.count('watchSeconds'), 5);
  h.tracker.finish('exits', h.snapshot('paused', 6));
  assert.equal(h.count('watchSeconds'), 6);
  h.advance(5);
  h.tracker.update(h.snapshot('playing', 11));
  assert.equal(h.count('watchSeconds'), 6);
});

test('aggregates by calendar period, sorts activity and retains removed videos', () => {
  const today = new Date(2026, 9, 25, 12).getTime();
  recordVideoMetrics(video, { plays: 1, watchSeconds: 10, selections: 1 }, today);
  recordVideoMetrics(video, { plays: 1, watchSeconds: 30 }, new Date(2026, 9, 19, 12).getTime());
  recordVideoMetrics(video, { watchSeconds: 100 }, new Date(2026, 9, 18, 12).getTime());
  recordVideoMetrics(other, { plays: 2, autoPlays: 1, watchSeconds: 20, pauses: 2, skips: 1 }, today);
  const weekly = getVideoMetrics([video], '7', 'watchSeconds', today);
  assert.equal(weekly[0].videoId, video.videoId);
  assert.equal(weekly[0].watchSeconds, 40);
  assert.equal(weekly[1].removed, true);
  assert.equal(weekly[1].interactions, 3);
  assert.equal(getVideoMetrics([video], 'today', 'watchSeconds', today)[0].videoId, other.videoId);
  assert.equal(getVideoMetrics([video], 'all', 'watchSeconds', today)[0].watchSeconds, 140);
  assert.equal(getVideoMetrics([video], '7', 'interactions', today)[0].videoId, other.videoId);
});

test('zero activity and clearing metrics preserve the library and PIN', () => {
  localStorage.setItem('sia.videos', JSON.stringify([video]));
  localStorage.setItem('sia.pin', 'existing-pin-hash');
  recordVideoMetrics(video, { plays: 2, watchSeconds: 60 });
  assert.equal(clearMetrics(), true);
  assert.equal(getVideoMetrics([video], 'all')[0].plays, 0);
  assert.equal(localStorage.getItem('sia.pin'), 'existing-pin-hash');
  assert.deepEqual(JSON.parse(localStorage.getItem('sia.videos')), [video]);
});

test('corrupt and unavailable storage does not interrupt playback accounting', () => {
  saved.set('sia.metrics', '{broken');
  assert.doesNotThrow(() => getVideoMetrics([video]));
  assert.ok(getMetricsStorageError());
  recordVideoMetrics(video, { plays: 1 });
  assert.equal(getVideoMetrics([video], 'all')[0].plays, 1);
  const originalSet = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.doesNotThrow(() => recordVideoMetrics(video, { watchSeconds: 5 }));
  assert.ok(getMetricsStorageError());
  recordVideoMetrics(video, { watchSeconds: 2 });
  assert.equal(getVideoMetrics([video], 'all')[0].watchSeconds, 7);
  localStorage.setItem = originalSet;
  recordVideoMetrics(video, { watchSeconds: 3 });
  assert.equal(getVideoMetrics([video], 'all')[0].watchSeconds, 10);
  assert.equal(getMetricsStorageError(), '');
});

test('formats watch time for short clips and long totals', () => {
  assert.equal(formatWatchTime(0), '0s');
  assert.equal(formatWatchTime(59.9), '59s');
  assert.equal(formatWatchTime(125), '2m 5s');
  assert.equal(formatWatchTime(3665), '1h 1m');
});
