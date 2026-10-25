import { getVideos } from './storage.js';
import { getVideoMetrics, clearMetrics, getMetricsStorageError } from './metrics.js';
import { thumbUrl } from './youtube.js';

export function formatWatchTime(seconds) {
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function stat(label, value) {
  const block = document.createElement('div');
  const name = document.createElement('dt');
  name.textContent = label;
  const count = document.createElement('dd');
  count.textContent = value;
  block.append(name, count);
  return block;
}

function videoCard(row) {
  const card = document.createElement('article');
  card.className = 'metrics-video';
  const heading = document.createElement('div');
  heading.className = 'metrics-video-heading';
  const image = document.createElement('img');
  image.src = thumbUrl(row.videoId, 'mqdefault');
  image.alt = '';
  image.loading = 'lazy';
  const text = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = row.title;
  const last = document.createElement('p');
  last.textContent = row.lastWatchedAt
    ? `Last watched ${new Date(row.lastWatchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'Not watched in this period';
  text.append(title, last);
  if (row.removed) {
    const badge = document.createElement('span');
    badge.className = 'metrics-badge';
    badge.textContent = 'Removed from library';
    text.append(badge);
  }
  heading.append(image, text);
  const stats = document.createElement('dl');
  stats.className = 'metrics-video-stats';
  stats.append(
    stat('Watch time', formatWatchTime(row.watchSeconds)),
    stat('Plays', row.plays), stat('Completed', row.completions), stat('Interactions', row.interactions),
  );
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Playback & interaction details';
  const breakdown = document.createElement('dl');
  breakdown.className = 'metrics-breakdown';
  breakdown.append(
    stat('Manual starts', row.plays - row.autoPlays), stat('Autoplay starts', row.autoPlays),
    stat('Chosen from grid', row.selections), stat('Pause taps', row.pauses),
    stat('Resume taps', row.resumes), stat('Skipped away', row.skips), stat('Back to list', row.exits),
  );
  details.append(summary, breakdown);
  card.append(heading, stats, details);
  return card;
}

export function renderDashboard() {
  const rows = getVideoMetrics(
    getVideos(), document.getElementById('metrics-range').value,
    document.getElementById('metrics-sort').value,
  );
  const totals = rows.reduce((sum, row) => {
    for (const key of ['watchSeconds', 'plays', 'completions', 'interactions']) sum[key] += row[key];
    return sum;
  }, { watchSeconds: 0, plays: 0, completions: 0, interactions: 0 });
  const summary = document.getElementById('metrics-totals');
  summary.replaceChildren(
    stat('Watch time', formatWatchTime(totals.watchSeconds)), stat('Plays', totals.plays),
    stat('Completed', totals.completions), stat('Interactions', totals.interactions),
  );
  const most = [...rows].sort((a, b) => b.watchSeconds - a.watchSeconds)[0];
  document.getElementById('metrics-highlight').textContent = most?.watchSeconds > 0
    ? `Most watched: ${most.title} · ${formatWatchTime(most.watchSeconds)}`
    : 'No watch time recorded for this period yet.';
  const list = document.getElementById('metrics-videos');
  list.replaceChildren(...rows.map(videoCard));
  const hasActivity = totals.plays || totals.interactions || totals.watchSeconds || totals.completions;
  document.getElementById('metrics-empty').classList.toggle('hidden', !!hasActivity);
  const error = document.getElementById('metrics-error');
  error.textContent = getMetricsStorageError();
  error.classList.toggle('hidden', !error.textContent);
}

export function initDashboard() {
  document.getElementById('metrics-range').addEventListener('change', renderDashboard);
  document.getElementById('metrics-sort').addEventListener('change', renderDashboard);
  document.getElementById('clear-metrics').addEventListener('click', () => {
    if (!window.confirm('Clear all viewing metrics on this device? Your videos and PIN will stay.')) return;
    if (clearMetrics()) renderDashboard();
    else {
      const error = document.getElementById('metrics-error');
      error.textContent = getMetricsStorageError();
      error.classList.remove('hidden');
    }
  });
  window.addEventListener('storage', (event) => {
    if ((event.key === 'sia.metrics' || event.key === 'sia.videos' || event.key === null)
      && document.getElementById('screen-parent').classList.contains('active')
      && !document.getElementById('manager-view').classList.contains('hidden')) renderDashboard();
  });
}
