// Wrapper around the YouTube IFrame Player API.
//
// Why the IFrame API (not a plain embed): it lets us detect when a video ENDS
// so we can auto-advance to the next curated video ourselves — meaning the
// native YouTube "suggested videos" end screen never gets a chance to appear.

let player = null;
let ready = false;
let cb = {};
let pendingId = null; // video requested before the player finished loading

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
      onError: () => cb.onError && cb.onError(),
    },
  });
}

function onStateChange(e) {
  const S = YT.PlayerState;
  if (e.data === S.ENDED && cb.onEnded) cb.onEnded();
  if (cb.onPlayState) {
    if (e.data === S.PLAYING) cb.onPlayState(true);
    else if (e.data === S.PAUSED || e.data === S.ENDED) cb.onPlayState(false);
  }
}

export function loadVideo(videoId) {
  if (player && ready) player.loadVideoById(videoId);
  else pendingId = videoId; // play it as soon as the player is ready
}

export function togglePlay() {
  if (!player || !ready) return;
  if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
}

export function stopVideo() {
  if (player && ready) player.stopVideo();
}
