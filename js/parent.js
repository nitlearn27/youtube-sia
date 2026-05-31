// Parent area: reached via a long-press on the grid's top-right hotspot,
// gated by a 4-digit PIN. Lets the parent add / remove / reorder videos.

import {
  hasPin, setPin, verifyPin,
  getVideos, addVideo, removeVideo, moveVideo,
} from './storage.js';
import { parseYouTubeId, fetchTitle, thumbUrl } from './youtube.js';

let api = {}; // { showScreen(name), refreshGrid() }
let buffer = '';
let mode = 'verify'; // verify | create | create-confirm | change-verify
let pendingNew = '';

export function initParent(callbacks) {
  api = callbacks;
  setupEntry();
  buildPinPad();
  wireManager();
}

// ---------- entry ----------
// The ⋮ button opens the PIN screen; the PIN still keeps the child out.
function setupEntry() {
  document.getElementById('parent-btn').addEventListener('click', openParent);
}

function openParent() {
  buffer = '';
  if (hasPin()) {
    mode = 'verify';
    setTitle('Enter PIN');
  } else {
    mode = 'create';
    setTitle('Create a PIN');
  }
  setMsg('');
  showPinView();
  api.showScreen('parent');
}

// ---------- pin pad ----------
function buildPinPad() {
  const pad = document.querySelector('.pin-pad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((k) => {
    const b = document.createElement('button');
    b.textContent = k;
    if (k === '') {
      b.className = 'key blank';
      b.disabled = true;
    } else {
      b.className = 'key';
      b.addEventListener('click', () => onKey(k));
    }
    pad.appendChild(b);
  });
  document.getElementById('pin-cancel').addEventListener('click', () => api.showScreen('grid'));
}

function onKey(k) {
  if (k === '⌫') buffer = buffer.slice(0, -1);
  else if (buffer.length < 4) buffer += k;
  renderDots();
  if (buffer.length === 4) setTimeout(processPin, 120);
}

function renderDots() {
  const dots = document.getElementById('pin-dots');
  dots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < buffer.length ? ' filled' : '');
    dots.appendChild(d);
  }
}

async function processPin() {
  const entered = buffer;
  buffer = '';
  renderDots();

  if (mode === 'verify') {
    if (await verifyPin(entered)) openManager();
    else reject('Wrong PIN');
  } else if (mode === 'change-verify') {
    if (await verifyPin(entered)) {
      mode = 'create';
      setTitle('New PIN');
      setMsg('');
    } else reject('Wrong PIN');
  } else if (mode === 'create') {
    pendingNew = entered;
    mode = 'create-confirm';
    setTitle('Confirm PIN');
    setMsg('');
  } else if (mode === 'create-confirm') {
    if (entered === pendingNew) {
      await setPin(entered);
      openManager();
    } else {
      mode = 'create';
      setTitle('Create a PIN');
      reject('Did not match');
    }
  }
}

function reject(text) {
  setMsg(text);
  const dots = document.getElementById('pin-dots');
  dots.classList.add('shake');
  setTimeout(() => dots.classList.remove('shake'), 400);
}

function setTitle(t) {
  document.getElementById('pin-title').textContent = t;
}
function setMsg(t) {
  document.getElementById('pin-msg').textContent = t;
}

// ---------- views ----------
function showPinView() {
  document.getElementById('manager-view').classList.add('hidden');
  document.getElementById('pin-view').classList.remove('hidden');
  renderDots();
}

function openManager() {
  document.getElementById('pin-view').classList.add('hidden');
  document.getElementById('manager-view').classList.remove('hidden');
  renderList();
}

// ---------- manager ----------
function wireManager() {
  document.getElementById('parent-done').addEventListener('click', () => api.showScreen('grid'));
  document.getElementById('add-btn').addEventListener('click', onAdd);
  document.getElementById('add-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAdd();
  });
  document.getElementById('change-pin').addEventListener('click', () => {
    buffer = '';
    mode = 'change-verify';
    setTitle('Enter current PIN');
    setMsg('');
    showPinView();
  });
}

async function onAdd() {
  const input = document.getElementById('add-url');
  const id = parseYouTubeId(input.value);
  if (!id) {
    addMsg('That doesn\'t look like a YouTube link.');
    return;
  }
  addMsg('Adding…');
  const title = await fetchTitle(id);
  addVideo({ videoId: id, title: title || 'Video' });
  input.value = '';
  addMsg('Added! 🎉');
  renderList();
  api.refreshGrid();
}

function addMsg(t) {
  document.getElementById('add-msg').textContent = t;
}

function renderList() {
  const ul = document.getElementById('manage-list');
  const videos = getVideos();
  ul.innerHTML = '';

  if (!videos.length) {
    const li = document.createElement('li');
    li.className = 'add-msg';
    li.textContent = 'No videos yet. Paste a link above to add one.';
    ul.appendChild(li);
    return;
  }

  videos.forEach((v, i) => {
    const li = document.createElement('li');
    li.className = 'manage-item';

    const img = document.createElement('img');
    img.src = thumbUrl(v.videoId, 'mqdefault');
    img.alt = '';

    const title = document.createElement('div');
    title.className = 'mt';
    title.textContent = v.title;

    const moves = document.createElement('div');
    moves.className = 'move-col';
    moves.appendChild(makeBtn('▲', 'icon-btn', i === 0, () => {
      moveVideo(v.id, -1); renderList(); api.refreshGrid();
    }));
    moves.appendChild(makeBtn('▼', 'icon-btn', i === videos.length - 1, () => {
      moveVideo(v.id, 1); renderList(); api.refreshGrid();
    }));

    const del = makeBtn('🗑️', 'icon-btn danger', false, () => {
      removeVideo(v.id); renderList(); api.refreshGrid();
    });

    li.append(img, title, moves, del);
    ul.appendChild(li);
  });
}

function makeBtn(label, cls, disabled, onClick) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.disabled = disabled;
  if (disabled) b.style.opacity = '.3';
  else b.addEventListener('click', onClick);
  return b;
}
