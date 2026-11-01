// Eingabe: Tastatur, Maus, Gamepad (z. B. PS5-Controller) und Touch (Joystick + Sprungknopf).
export class Input {
  moveX = 0; // rechts +
  moveY = 0; // vorwärts +
  menuActive = false;
  onNav: (dx: number, dy: number) => void = () => {};
  onConfirm: () => void = () => {};
  onBack: () => void = () => {};

  private keys = new Set<string>();
  private jumpQ = false;
  private pauseQ = false;
  private rotAcc = 0;
  private zoomAcc = 1; // Faktor, multiplikativ gesammelt
  private pitchAcc = 0; // Kamera neigen (Radiant)
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private camTouch = { id: -1, lx: 0, ly: 0 };
  private mouse = { down: false, lx: 0, ly: 0 };
  private padPrev: boolean[] = [];
  private padNavT = 0;
  readonly isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  constructor(canvas: HTMLElement, private joyBase: HTMLElement, private joyKnob: HTMLElement, jumpBtn: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.menuActive) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.onNav(-1, 0);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.onNav(1, 0);
        if (e.code === 'ArrowUp' || e.code === 'KeyW') this.onNav(0, -1);
        if (e.code === 'ArrowDown' || e.code === 'KeyS') this.onNav(0, 1);
        if (e.code === 'Enter' || e.code === 'Space') this.onConfirm();
        if (e.code === 'Escape') this.onBack();
        return;
      }
      if (e.code === 'Space') this.jumpQ = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQ = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAcc *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.down = true; this.mouse.lx = e.clientX; this.mouse.ly = e.clientY;
        return;
      }
      if (e.clientX < window.innerWidth * 0.45 && this.joy.id < 0) {
        this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = 0; this.joy.y = 0;
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = `${e.clientX}px`; this.joyBase.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
      } else if (this.camTouch.id < 0) {
        this.camTouch.id = e.pointerId; this.camTouch.lx = e.clientX; this.camTouch.ly = e.clientY;
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (this.mouse.down) {
          this.rotAcc -= (e.clientX - this.mouse.lx) * 0.006;
          this.pitchAcc += (e.clientY - this.mouse.ly) * 0.004;
          this.mouse.lx = e.clientX; this.mouse.ly = e.clientY;
        }
        return;
      }
      if (e.pointerId === this.joy.id) {
        const R = 55;
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
        this.joy.x = dx / R; this.joy.y = dy / R;
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (e.pointerId === this.camTouch.id) {
        this.rotAcc -= (e.clientX - this.camTouch.lx) * 0.008;
        this.pitchAcc += (e.clientY - this.camTouch.ly) * 0.005;
        this.camTouch.lx = e.clientX; this.camTouch.ly = e.clientY;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { this.mouse.down = false; return; }
      if (e.pointerId === this.joy.id) { this.joy.id = -1; this.joy.x = this.joy.y = 0; this.joyBase.style.display = 'none'; }
      if (e.pointerId === this.camTouch.id) this.camTouch.id = -1;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.jumpQ = true; });
  }

  poll(dt: number) {
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (!this.menuActive) {
      this.rotAcc += ((k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0)) * 2.2 * dt;
      const zin = k.has('Equal') || k.has('NumpadAdd') || k.has('BracketRight');
      const zout = k.has('Minus') || k.has('NumpadSubtract') || k.has('Slash');
      if (zin || zout) this.zoomAcc *= Math.exp(((zout ? 1 : 0) - (zin ? 1 : 0)) * 1.2 * dt);
      this.pitchAcc += ((k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0)) * 0.9 * dt;
    }
    mx += this.joy.x; my -= this.joy.y;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (pad) {
      let ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      const l = Math.hypot(ax, ay);
      if (l < 0.18) { ax = ay = 0; } else { const s = (l - 0.18) / (0.82 * l); ax *= s; ay *= s; }
      const rx = pad.axes[2] ?? 0;
      const btn = (i: number) => !!pad!.buttons[i]?.pressed;
      const edge = (i: number) => btn(i) && !this.padPrev[i];
      if (this.menuActive) {
        this.padNavT -= dt;
        const nx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0) || (Math.abs(ax) > 0.5 ? Math.sign(ax) : 0);
        const ny = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0) || (Math.abs(ay) > 0.5 ? Math.sign(ay) : 0);
        if ((nx || ny) && this.padNavT <= 0) { this.onNav(nx, ny); this.padNavT = 0.22; }
        if (!nx && !ny) this.padNavT = 0;
        if (edge(0)) this.onConfirm();
        if (edge(1) || edge(9)) this.onBack();
      } else {
        mx += ax; my -= ay;
        if (Math.abs(rx) > 0.2) this.rotAcc -= rx * 2.6 * dt;
        const ry = pad.axes[3] ?? 0;
        if (Math.abs(ry) > 0.25) this.pitchAcc += ry * 1.0 * dt;
        if (btn(4) || btn(5)) this.zoomAcc *= Math.exp(((btn(5) ? 1 : 0) - (btn(4) ? 1 : 0)) * 1.2 * dt);
        if (edge(0)) this.jumpQ = true;
        if (edge(9)) this.pauseQ = true;
      }
      for (let i = 0; i < pad.buttons.length; i++) this.padPrev[i] = btn(i);
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.moveX = mx; this.moveY = my;
  }

  consumeJump() { const j = this.jumpQ; this.jumpQ = false; return j; }
  consumePause() { const p = this.pauseQ; this.pauseQ = false; return p; }
  consumeRot() { const r = this.rotAcc; this.rotAcc = 0; return r; }
  consumeZoom() { const z = this.zoomAcc; this.zoomAcc = 1; return z; }
  consumePitch() { const p = this.pitchAcc; this.pitchAcc = 0; return p; }
  requestPause() { this.pauseQ = true; }
}
