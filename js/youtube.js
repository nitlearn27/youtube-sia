// Pure helpers for working with YouTube links — no API key required.

const ID_RE = /^[\w-]{11}$/;

// Accepts watch?v=, youtu.be/, /shorts/, /embed/, /v/, or a bare 11-char id.
export function parseYouTubeId(input) {
  if (!input) return null;
  const s = input.trim();
  if (ID_RE.test(s)) return s;

  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return ID_RE.test(id) ? id : null;
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = url.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    const m = url.pathname.match(/\/(?:shorts|embed|v|live)\/([\w-]{11})/);
    if (m) return m[1];
  }

  return null;
}

// Thumbnail needs no API key. hqdefault always exists; fall back to mqdefault.
export function thumbUrl(videoId, quality = 'hqdefault') {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

// Fetch a human title via the keyless oEmbed endpoint. Returns null on failure.
export async function fetchTitle(videoId) {
  try {
    const u = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(u);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
  }
}
