import test from 'node:test';
import assert from 'node:assert/strict';

let serial = 0;
async function setup({ ready = true } = {}) {
  let instance;
  const YT = {
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
    Player: class {
      constructor(_id, options) {
        instance = this;
        this.events = options.events;
        this.state = -1;
        this.id = '';
        this.loads = [];
        if (ready) queueMicrotask(() => this.events.onReady());
      }
      loadVideoById(id) { this.id = id; this.loads.push(id); }
      getVideoUrl() { return `https://www.youtube.com/watch?v=${this.id}`; }
      getPlayerState() { return this.state; }
      getCurrentTime() { return 2; }
      getPlaybackRate() { return 1; }
      pauseVideo() { this.state = 2; }
      playVideo() { this.state = 1; }
      stopVideo() { this.state = -1; }
      emit(state) { this.state = state; this.events.onStateChange({ data: state }); }
    },
  };
  globalThis.window = { YT };
  globalThis.YT = YT;
  const player = await import(`../js/player.js?test=${++serial}`);
  const events = [];
  await player.initPlayer({
    onPlayback: (snapshot) => events.push(snapshot),
    onEnded: () => { events.push('ended'); player.loadVideo('lmnopqrstuv'); },
    onPlayState: (playing) => events.push(playing),
  });
  return { player, instance, events };
}

test('publishes completion for the old video before auto-advancing', async () => {
  const { player, instance, events } = await setup();
  player.loadVideo('abcdefghijk');
  instance.emit(0);
  assert.equal(events[0].videoId, 'abcdefghijk');
  assert.equal(events[0].state, 'ended');
  assert.equal(events[1], false);
  assert.equal(events[2], 'ended');
  assert.deepEqual(instance.loads, ['abcdefghijk', 'lmnopqrstuv']);
});

test('ignores old-video events while a new video is loading', async () => {
  const { player, instance, events } = await setup();
  player.loadVideo('abcdefghijk');
  player.loadVideo('lmnopqrstuv');
  instance.id = 'abcdefghijk';
  instance.emit(0);
  assert.deepEqual(events, []);
  assert.equal(player.getPlayback(), null);
});

test('canceling before the player is ready prevents delayed playback', async () => {
  const { player, instance } = await setup({ ready: false });
  player.loadVideo('abcdefghijk');
  player.stopVideo();
  instance.events.onReady();
  assert.deepEqual(instance.loads, []);
  assert.equal(player.getPlayback(), null);
});

test('reports explicit pause/resume interactions only when appropriate', async () => {
  const { player, instance } = await setup();
  assert.equal(player.togglePlay(), null);
  player.loadVideo('abcdefghijk');
  instance.state = -1;
  assert.equal(player.togglePlay(), null);
  assert.equal(player.togglePlay(), 'pauses');
  assert.equal(player.togglePlay(), 'resumes');
  player.stopVideo();
  assert.equal(player.togglePlay(), null);
});
