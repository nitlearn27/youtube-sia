// Wrapper around the YouTube IFrame Player API.
//
// Why the IFrame API (not a plain embed): it lets us detect when a video ENDS
// so we can auto-advance to the next curated video ourselves — meaning the
// native YouTube "suggested videos" end screen never gets a chance to appear.

let player = null;
let ready = false;
let cb = {};
let pendingId = null; // video requested before the player finished loading
let requestedId = null;

// Resolve once the IFrame API is available. The API calls a global
// onYouTubeIframeAPIReady when loaded; we also poll in case it fired first.
const apiReady = new Promise((resolve) => {
  const loaded = () => window.YT && window.YT.Player;
  if (loaded()) return resolve();
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof prev === 'function') prev();
    resolve();
  };
  const iv = setInterval(() => {
    if (loaded()) {
      clearInterval(iv);
      resolve();
    }
  }, 150);
});

export async function initPlayer(callbacks) {
  cb = callbacks || {};
  await apiReady;
  player = new YT.Player('yt', {
    height: '100%',
    width: '100%',
    playerVars: {
      rel: 0, // don't show unrelated channels' videos
      modestbranding: 1, // minimal YouTube logo
      controls: 0, // we provide our own controls; tap-shield blocks YT chrome
      fs: 0, // no fullscreen button (would expose YouTube UI)
      iv_load_policy: 3, // no video annotations
      disablekb: 1, // no keyboard control
      playsinline: 1, // stay in-page on iOS instead of native fullscreen
      autoplay: 0,
    },
    events: {
      onReady: () => {
        ready = true;
        if (pendingId) {
          player.loadVideoById(pendingId);
          pendingId = null;
        }
      },
      onStateChange: onStateChange,
      onError: () => {
        if (requestedId && cb.onError) cb.onError();
      },
    },
  });
}

function onStateChange(e) {
  const S = YT.PlayerState;
  const snapshot = getPlayback();
  // Late events from the previous video must not affect the next video's metrics.
  if (!snapshot || snapshot.videoId !== requestedId) return;
  if (cb.onPlayback) cb.onPlayback(snapshot);
  if (cb.onPlayState) {
    cb.onPlayState(snapshot.state === 'playing');
  }
  // Record the end before loading the next video into the same player.
  if (e.data === S.ENDED && snapshot.state === 'ended' && cb.onEnded) cb.onEnded();
}

export function loadVideo(videoId) {
  requestedId = videoId;
  if (player && ready) player.loadVideoById(videoId);
  else pendingId = videoId; // play it as soon as the player is ready
}

export function togglePlay() {
  if (!player || !ready || !requestedId) return null;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    return 'pauses';
  }
  player.playVideo();
  return state === YT.PlayerState.PAUSED ? 'resumes' : null;
}

export function stopVideo() {
  pendingId = null;
  requestedId = null;
  if (player && ready) player.stopVideo();
}

export function getPlayback() {
  if (!player || !ready || !requestedId) return null;
  try {
    const videoId = new URL(player.getVideoUrl()).searchParams.get('v');
    if (videoId !== requestedId) return null;
    return {
      videoId,
      state: ({ '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' })[player.getPlayerState()],
      position: player.getCurrentTime(),
      rate: player.getPlaybackRate(),
    };
  } catch {
    return null;
  }
}
