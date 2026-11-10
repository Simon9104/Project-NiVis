// Optional background music: plays a file the server operator puts next to the game
// (music.mp3 / music.ogg / music.m4a in the site root, i.e. public/ when developing).
// No music ships with the repository – the files are git-ignored. Without a file the toggle stays hidden.
const CANDIDATES = ['music.mp3', 'music.ogg', 'music.m4a'];
const STORE_KEY = 'nivis-music';

export class Music {
  private audio: HTMLAudioElement | null = null;
  private wanted = true;
  private unlocked = false;
  onChange: () => void = () => {};

  get available() { return !!this.audio; }
  get playing() { return !!this.audio && !this.audio.paused; }
  get enabled() { return this.wanted; }

  async init() {
    try { this.wanted = localStorage.getItem(STORE_KEY) !== 'off'; } catch { /* private mode */ }
    for (const name of CANDIDATES) {
      try {
        const url = import.meta.env.BASE_URL + name;
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        const type = r.headers.get('content-type') || '';
        if (!r.ok || type.includes('text/html')) continue; // dev servers answer unknown paths with index.html
        const a = new Audio(url); a.loop = true; a.volume = 0.35; a.preload = 'auto';
        a.addEventListener('play', () => this.onChange()); a.addEventListener('pause', () => this.onChange());
        this.audio = a; break;
      } catch { /* try the next one */ }
    }
    if (!this.audio) return;
    // browsers only allow sound after a user gesture → start on the first tap / click / key
    const unlock = () => { this.unlocked = true; if (this.wanted) this.play(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.audio?.pause(); else if (this.wanted && this.unlocked) this.play(); });
    this.onChange();
  }
  private play() { this.audio?.play().catch(() => { /* blocked until the next gesture */ }); }
  toggle() {
    this.wanted = !this.wanted;
    try { localStorage.setItem(STORE_KEY, this.wanted ? 'on' : 'off'); } catch { /* ignore */ }
    if (this.wanted) { this.unlocked = true; this.play(); } else this.audio?.pause();
    this.onChange();
  }
}
