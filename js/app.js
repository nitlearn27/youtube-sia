// Main controller: screen routing, grid rendering, and player orchestration.

import { getVideos } from './storage.js';
import { thumbUrl } from './youtube.js';
import * as Player from './player.js';
import { initParent } from './parent.js';

const screens = {
  grid: document.getElementById('screen-grid'),
  player: document.getElementById('screen-player'),
  parent: document.getElementById('screen-parent'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('active', key === name);
  }
}

// ---------- grid ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGrid() {
  const videos = getVideos();
  const grid = document.getElementById('grid');
  document.getElementById('grid-empty').classList.toggle('hidden', videos.length > 0);
  grid.innerHTML = '';

  videos.forEach((v, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML =
      `<div class="thumb"><img alt="" loading="lazy" src="${thumbUrl(v.videoId)}"` +
      ` onerror="this.onerror=null;this.src='${thumbUrl(v.videoId, 'mqdefault')}'"></div>` +
      `<div class="card-title">${escapeHtml(v.title)}</div>`;
    card.addEventListener('click', () => openFeed(i));
    grid.appendChild(card);
  });
}

// ---------- player ----------
// A single, fixed YouTube player (the iframe never moves in the DOM — moving an
// iframe reloads it and breaks the API). To change videos we just load a new id
// into the same player. Swipe up/down or scroll changes the video; it wraps
// around (round-robin) so scrolling through the list never ends.
let playlist = [];
let current = 0;

function openFeed(index) {
  playlist = getVideos();
  if (!playlist.length) return;
  current = index;
  showScreen('player');
  loadCurrent();
}

function loadCurrent() {
  document.getElementById('player-error').classList.add('hidden');
  Player.loadVideo(playlist[current].videoId);
}

// move by `dir` (+1 next / -1 prev), wrapping around the list (round-robin)
function go(dir) {
  if (!playlist.length) return;
  const n = playlist.length;
  current = (((current + dir) % n) + n) % n;
  loadCurrent();
}

function backToGrid() {
  Player.stopVideo();
  showScreen('grid');
}

// ---------- buttons ----------
document.getElementById('btn-back').addEventListener('click', backToGrid);
document.getElementById('btn-next').addEventListener('click', () => go(1));
document.getElementById('btn-playpause').addEventListener('click', Player.togglePlay);

// ---------- swipe / scroll to change video, tap to play-pause ----------
const shield = document.getElementById('tap-shield');
const SWIPE_PX = 50;
let startY = 0, startX = 0, swiped = false;

shield.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  startY = t.clientY; startX = t.clientX; swiped = false;
}, { passive: true });

shield.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  const dy = t.clientY - startY, dx = t.clientX - startX;
  if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
    swiped = true;
    go(dy < 0 ? 1 : -1); // swipe up -> next, swipe down -> previous
  }
}, { passive: true });

shield.addEventListener('click', () => {
  if (swiped) { swiped = false; return; } // ignore the click after a swipe
  Player.togglePlay();
});

// desktop: mouse-wheel / trackpad scroll changes the video (throttled)
let wheelLock = false;
shield.addEventListener('wheel', (e) => {
  if (wheelLock || Math.abs(e.deltaY) < 20) return;
  wheelLock = true;
  go(e.deltaY > 0 ? 1 : -1);
  setTimeout(() => { wheelLock = false; }, 500);
}, { passive: true });

Player.initPlayer({
  onEnded: () => go(1), // auto-advance to the next video when one finishes
  onPlayState: (playing) => {
    document.getElementById('btn-playpause').textContent = playing ? '⏸️' : '▶️';
  },
  onError: () => document.getElementById('player-error').classList.remove('hidden'),
});

initParent({ showScreen, refreshGrid: renderGrid });

renderGrid();

// ---------- PWA service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
