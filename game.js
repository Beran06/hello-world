/* ═══════════════════════════════════════════════════════════
   GALAXY RUSH  –  Mobile Space Shooter
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ── Utilities ────────────────────────────────────────────────
const rand  = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const hit   = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x &&
  a.y < b.y + b.h && a.y + a.h > b.y;

// ── SFX (Web Audio API – procedural beeps) ──────────────────
class SFX {
  constructor() { this._ac = null; }
  _init() {
    if (this._ac) return;
    try { this._ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  _beep(freq, type, dur, vol = 0.12) {
    if (!this._ac) return;
    try {
      const o = this._ac.createOscillator();
      const g = this._ac.createGain();
      o.connect(g); g.connect(this._ac.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this._ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this._ac.currentTime + dur);
      o.start(); o.stop(this._ac.currentTime + dur);
    } catch {}
  }
  shoot()   { this._init(); this._beep(960,  'square',   0.06, 0.07); }
  explode() { this._init(); this._beep(80,   'sawtooth', 0.28, 0.16); }
  pickup()  { this._init(); this._beep(1300, 'sine',     0.28, 0.1);  }
  damage()  { this._init(); this._beep(160,  'sawtooth', 0.2,  0.14); }
  newWave() { this._init(); this._beep(440,  'sine',     0.5,  0.08); }
}

// ── Star (scrolling background) ──────────────────────────────
class Star {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.reset(true);
  }
  reset(anyY = false) {
    this.x   = rand(0, this.W);
    this.y   = anyY ? rand(0, this.H) : 0;
    this.r   = rand(0.3, 1.8);
    this.spd = rand(0.4, 2.4);
    this.a   = rand(0.2, 0.9);
  }
  tick() { if ((this.y += this.spd) > this.H) this.reset(); }
  draw(ctx) {
    ctx.globalAlpha = this.a;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── Particle ─────────────────────────────────────────────────
class Particle {
  constructor(x, y, col, scale = 1) {
    this.x = x; this.y = y; this.col = col;
    this.vx = rand(-4.5, 4.5) * scale;
    this.vy = rand(-6.5, 1.5) * scale;
    this.r  = rand(1.5, 5) * scale;
    this.life = 1;
    this.dr   = rand(0.013, 0.04);
  }
  tick() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.13;
    this.life -= this.dr;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.col;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.1, this.r * this.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  get dead() { return this.life <= 0; }
}

// ── Burst (group of particles = explosion) ───────────────────
class Burst {
  constructor(x, y, col, scale = 1) {
    const n = Math.round(14 * Math.min(scale, 2));
    this.parts = Array.from({ length: n }, () => new Particle(x, y, col, scale));
  }
  tick() {
    this.parts.forEach(p => p.tick());
    this.parts = this.parts.filter(p => !p.dead);
  }
  draw(ctx) { this.parts.forEach(p => p.draw(ctx)); }
  get done() { return this.parts.length === 0; }
}

// ── Bullet ───────────────────────────────────────────────────
class Bullet {
  constructor(x, y, vy, col, isEnemy = false, vx = 0) {
    this.x = x; this.y = y;
    this.vy = vy; this.vx = vx;
    this.col = col; this.isEnemy = isEnemy;
    this.w = isEnemy ? 5 : 3;
    this.h = isEnemy ? 11 : 15;
  }
  tick() { this.x += this.vx; this.y += this.vy; }
  draw(ctx) {
    ctx.shadowBlur = 9; ctx.shadowColor = this.col;
    ctx.fillStyle = this.col;
    ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    ctx.shadowBlur = 0;
  }
  oob(W, H) { return this.y < -25 || this.y > H + 25 || this.x < -25 || this.x > W + 25; }
  get hb() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
}

// ── Enemy definitions ─────────────────────────────────────────
const ET = {
  BASIC:   { col: '#ff2222', hp: 1, pts: 100, spd: 1.5, sz: 28, rate: 0,   sh: 0 },
  FAST:    { col: '#ff8800', hp: 1, pts: 150, spd: 4.0, sz: 22, rate: 0,   sh: 1 },
  SHOOTER: { col: '#ff0088', hp: 2, pts: 250, spd: 1.2, sz: 30, rate: 80,  sh: 3 },
  TANK:    { col: '#aa00ff', hp: 4, pts: 400, spd: 0.8, sz: 44, rate: 100, sh: 2 },
};

class Enemy {
  constructor(x, y, def, wave) {
    this.x = x; this.y = y; this.def = def;
    this.col    = def.col;
    this.hp     = def.hp;
    this.maxHp  = def.hp;
    this.pts    = def.pts;
    this.sz     = def.sz;
    this.spd    = def.spd * (1 + (wave - 1) * 0.08);
    this.rate   = def.rate;
    this.sh     = def.sh;
    this.wob    = rand(0, Math.PI * 2);
    this.wobSpd = rand(0.02, 0.06);
    this.sTimer = rand(0, def.rate);
  }

  tick(eBullets, px, py) {
    this.y += this.spd;
    this.wob += this.wobSpd;
    this.x += Math.sin(this.wob) * 1.3;

    if (this.rate > 0 && (this.sTimer += 1) >= this.rate) {
      this.sTimer = 0;
      const dx = px - this.x, dy = py - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      eBullets.push(new Bullet(this.x, this.y + this.sz / 2, (dy / d) * 4.2, '#ff4400', true, (dx / d) * 4.2));
    }
  }

  takeDmg() { return --this.hp <= 0; }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const s = this.sz, c = this.col;
    ctx.shadowBlur = 14; ctx.shadowColor = c; ctx.fillStyle = c;

    switch (this.sh) {
      case 0: // Basic – classic invader shape
        ctx.beginPath();
        ctx.moveTo(0,  s * .55); ctx.lineTo(-s * .5, -s * .45);
        ctx.lineTo(0, -s * .2);  ctx.lineTo( s * .5, -s * .45);
        ctx.closePath(); ctx.fill();
        break;
      case 1: // Fast – narrow dart
        ctx.beginPath();
        ctx.moveTo(0,  s * .65); ctx.lineTo(-s * .24, -s * .5);
        ctx.lineTo(0, -s * .28); ctx.lineTo( s * .24, -s * .5);
        ctx.closePath(); ctx.fill();
        break;
      case 2: // Tank – wide heavy cruiser
        ctx.beginPath();
        ctx.moveTo(0, s * .5); ctx.lineTo(-s * .65, -s * .5); ctx.lineTo(s * .65, -s * .5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7700cc';
        ctx.beginPath(); ctx.arc(0, 0, s * .28, 0, Math.PI * 2); ctx.fill();
        break;
      case 3: // Shooter – with twin cannons
        ctx.beginPath();
        ctx.moveTo(0, s * .5); ctx.lineTo(-s * .5, -s * .5); ctx.lineTo(s * .5, -s * .5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cc0066';
        ctx.fillRect(-s * .62, -s * .12, s * .17, s * .4);
        ctx.fillRect( s * .45, -s * .12, s * .17, s * .4);
        break;
    }

    // Health bar for multi-HP enemies
    if (this.maxHp > 1) {
      const bw = s * 1.2, bh = 4, bx = -bw / 2, by = s * .64;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#111'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.hp / this.maxHp > 0.4 ? '#00ff66' : '#ff4400';
      ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  get hb() {
    const r = this.sz * 0.44;
    return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
  }
  oob(H) { return this.y > H + 70; }
}

// ── Power-Up definitions ──────────────────────────────────────
const PT = {
  SHIELD: { col: '#00aaff', ico: '🛡', txt: 'KALKAN!'    },
  TRIPLE: { col: '#ffee00', ico: '⚡', txt: '3LÜ ATIŞ!'  },
  LIFE:   { col: '#ff4444', ico: '❤',  txt: '+CAN!'      },
  BOMB:   { col: '#ff6600', ico: '💣', txt: 'BOMBA! 💥'  },
  RAPID:  { col: '#00ff88', ico: '🔥', txt: 'HIZLI ATIŞ!'},
};
const PT_LIST = Object.values(PT);

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.vy = 1.8; this.r = 23; this.t = 0;
  }
  tick() { this.y += this.vy; this.t++; }
  draw(ctx) {
    const pulse = Math.sin(this.t * 0.09) * 3;
    const r = this.r + pulse;
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.shadowBlur = 22; ctx.shadowColor = this.type.col;
    ctx.fillStyle  = this.type.col + '33';
    ctx.strokeStyle = this.type.col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `${r * 0.95}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.type.ico, 0, 2);
    ctx.restore();
  }
  oob(H) { return this.y > H + 55; }
  get hb() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
}

// ── Player ───────────────────────────────────────────────────
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.tx = x;
    this.fTimer  = 0; this.fRate  = 15;
    this.triple  = false; this.tripleT = 0;
    this.shield  = false; this.shieldT = 0;
    this.inv     = false; this.invT    = 0;
    this.flash   = 0;
  }

  tick(pBullets, sfx) {
    this.x += (this.tx - this.x) * 0.14;
    if (++this.fTimer >= this.fRate) {
      this.fTimer = 0;
      this._fire(pBullets); sfx.shoot();
    }
    if (this.triple && --this.tripleT <= 0) this.triple = false;
    if (this.shield && --this.shieldT <= 0) this.shield = false;
    if (this.inv    && --this.invT    <= 0) this.inv    = false;
    this.flash++;
  }

  _fire(bullets) {
    const c = '#00ffff';
    bullets.push(new Bullet(this.x, this.y - 25, -13.5, c));
    if (this.triple) {
      bullets.push(new Bullet(this.x - 17, this.y - 15, -12.5, c, false, -1.7));
      bullets.push(new Bullet(this.x + 17, this.y - 15, -12.5, c, false,  1.7));
    }
  }

  draw(ctx) {
    if (this.inv && this.flash % 6 < 3) return;
    ctx.save(); ctx.translate(this.x, this.y);

    // Shield bubble
    if (this.shield) {
      ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.38 + Math.sin(Date.now() / 150) * 0.18;
      ctx.beginPath(); ctx.ellipse(0, 0, 40, 48, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Engine glow
    ctx.shadowBlur = 20; ctx.shadowColor = '#ff6600'; ctx.fillStyle = '#ff4400';
    ctx.beginPath(); ctx.ellipse(0, 24, 7, 14, 0, 0, Math.PI * 2); ctx.fill();

    // Wings
    ctx.shadowColor = '#1133bb'; ctx.fillStyle = '#1a3399';
    ctx.beginPath(); ctx.moveTo(-13, 8); ctx.lineTo(-34, 23); ctx.lineTo(-19, 20); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo( 13, 8); ctx.lineTo( 34, 23); ctx.lineTo( 19, 20); ctx.closePath(); ctx.fill();

    // Main body
    ctx.shadowColor = '#4488ff'; ctx.fillStyle = '#3366ee';
    ctx.beginPath();
    ctx.moveTo(0, -28); ctx.lineTo(18, 18);
    ctx.lineTo(10, 24); ctx.lineTo(-10, 24); ctx.lineTo(-18, 18);
    ctx.closePath(); ctx.fill();

    // Cockpit
    ctx.shadowBlur = 0; ctx.fillStyle = '#aaddff';
    ctx.beginPath(); ctx.ellipse(0, -4, 7, 10, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  get hb() { return { x: this.x - 14, y: this.y - 22, w: 28, h: 40 }; }
}

// ── Floating Notification ─────────────────────────────────────
class Notif {
  constructor(txt, col, ms = 1600) {
    this.txt = txt; this.col = col;
    this.ms = ms; this.rem = ms; this.dy = 0;
  }
  tick() { this.rem -= 16; this.dy -= 0.5; }
  get a() { return Math.max(0, this.rem / this.ms); }
  get done() { return this.rem <= 0; }
}

// ── Main Game ─────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.sfx    = new SFX();

    this.W = 0; this.H = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.hs = +(localStorage.getItem('gr_hs') || 0);
    document.getElementById('high-score').textContent = this.hs;

    this._bindUI();
    this._bindInput();

    // Start state
    this.state = 'menu';
    this._resetData();

    requestAnimationFrame(() => this._loop());
  }

  // ── Setup ────────────────────────────────────────────────────
  _resize() {
    this.W = Math.min(window.innerWidth, 480);
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    document.getElementById('game-container').style.cssText =
      `width:${this.W}px;height:${this.H}px`;
    this.stars = Array.from({ length: 75 }, () => new Star(this.W, this.H));
  }

  _resetData() {
    this.score   = 0; this.wave = 1; this.lives = 3;
    this.player  = null;
    this.pBullets = []; this.eBullets = [];
    this.enemies  = []; this.pups = [];
    this.bursts   = []; this.notifs = [];
    this.shake    = 0; this.combo = 0; this.comboT = 0;
    this.between  = false;
  }

  _bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('start-btn',   () => this._startGame());
    on('restart-btn', () => this._startGame());
    on('menu-btn',    () => this._goMenu());
    on('pause-btn',   () => this._togglePause());
    on('resume-btn',  () => this._togglePause());
    on('quit-btn',    () => this._goMenu());
  }

  _bindInput() {
    const mv = (cx) => {
      if (this.state !== 'playing' || !this.player) return;
      const r = this.canvas.getBoundingClientRect();
      this.player.tx = clamp(cx - r.left, 30, this.W - 30);
    };
    this.canvas.addEventListener('touchstart', e => { e.preventDefault(); mv(e.touches[0].clientX); }, { passive: false });
    this.canvas.addEventListener('touchmove',  e => { e.preventDefault(); mv(e.touches[0].clientX); }, { passive: false });
    this.canvas.addEventListener('mousemove',  e => mv(e.clientX));
  }

  // ── State transitions ─────────────────────────────────────────
  _startGame() {
    this.sfx._init();
    this._resetData();
    this.player = new Player(this.W / 2, this.H - 100);
    this.state  = 'playing';
    this._showScreen(null);
    document.getElementById('hud').classList.remove('hidden');
    this._updateHUD();
    this._spawnWave();
  }

  _goMenu() {
    this.state = 'menu';
    document.getElementById('high-score').textContent = this.hs;
    document.getElementById('hud').classList.add('hidden');
    this._showScreen('menu-screen');
  }

  _togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this._showScreen('pause-screen');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this._showScreen(null);
    }
  }

  _showScreen(id) {
    ['menu-screen', 'gameover-screen', 'pause-screen'].forEach(s =>
      document.getElementById(s).classList.add('hidden'));
    if (id) document.getElementById(id).classList.remove('hidden');
  }

  _updateHUD() {
    document.getElementById('score').textContent = this.score.toLocaleString('tr');
    document.getElementById('wave').textContent  = this.wave;
    document.getElementById('lives').textContent =
      '❤️'.repeat(this.lives) + '🖤'.repeat(Math.max(0, 3 - this.lives));
  }

  // ── Gameplay helpers ──────────────────────────────────────────
  _notify(txt, col, ms = 1600) { this.notifs.push(new Notif(txt, col, ms)); }

  _spawnWave() {
    this.between = true;
    this.sfx.newWave();
    this._notify(`⚡ DALGA ${this.wave}`, '#ffff00', 2200);

    const W = this.W, w = this.wave, pad = 55;
    const sp  = W - pad * 2;
    const list = [];

    if (w === 1) {
      for (let i = 0; i < 5; i++)
        list.push({ x: pad + sp / 4 * i, y: -60, d: ET.BASIC, t: i * 200 });
    } else if (w === 2) {
      for (let i = 0; i < 6; i++)
        list.push({ x: pad + sp / 5 * i, y: -60, d: ET.BASIC, t: i * 180 });
      list.push({ x: W / 2 - 55, y: -130, d: ET.FAST, t: 1500 });
      list.push({ x: W / 2 + 55, y: -130, d: ET.FAST, t: 1700 });
    } else if (w === 3) {
      // V formation of basics + first shooter
      const vCount = 7;
      for (let i = 0; i < vCount; i++) {
        const off = Math.abs(i - 3) * 50;
        list.push({ x: pad + sp / (vCount - 1) * i, y: -60 - off, d: ET.BASIC, t: i * 160 });
      }
      list.push({ x: W / 2, y: -180, d: ET.SHOOTER, t: 1800 });
    } else {
      const pool = [ET.BASIC, ET.FAST];
      if (w >= 3) pool.push(ET.SHOOTER);
      if (w >= 5) pool.push(ET.SHOOTER); // double weight
      if (w >= 6) pool.push(ET.TANK);
      const n = Math.min(4 + w * 2, 22);
      for (let i = 0; i < n; i++) {
        list.push({
          x: rand(pad, W - pad),
          y: -60 - i * 48,
          d: pool[0 | (Math.random() * pool.length)],
          t: i * 260
        });
      }
    }

    let maxT = 0;
    list.forEach(e => {
      maxT = Math.max(maxT, e.t);
      setTimeout(() => {
        if (this.state === 'playing')
          this.enemies.push(new Enemy(e.x, e.y, e.d, w));
      }, e.t);
    });
    setTimeout(() => { this.between = false; }, maxT + 950);
  }

  _maybeDropPup(x, y) {
    if (Math.random() > 0.28) return;
    this.pups.push(new PowerUp(x, y, PT_LIST[0 | (Math.random() * PT_LIST.length)]));
  }

  _applyPup(pu) {
    const t = pu.type;
    this._notify(t.txt, t.col);
    this.sfx.pickup();
    this.bursts.push(new Burst(pu.x, pu.y, t.col, 0.6));

    if (t === PT.SHIELD) {
      this.player.shield  = true;
      this.player.shieldT = 600;
    } else if (t === PT.TRIPLE) {
      this.player.triple  = true;
      this.player.tripleT = 600;
    } else if (t === PT.LIFE) {
      this.lives = Math.min(this.lives + 1, 5);
      this._updateHUD();
    } else if (t === PT.RAPID) {
      this.player.fRate = 7;
      setTimeout(() => { if (this.player) this.player.fRate = 15; }, 8000);
    } else if (t === PT.BOMB) {
      this.enemies.forEach(e => {
        this.score += e.pts;
        this.bursts.push(new Burst(e.x, e.y, e.col));
      });
      this.enemies = []; this.eBullets = [];
      this.shake   = 24;
      this._notify('💥 BOMBA!', '#ff6600', 1200);
      this._updateHUD();
    }
  }

  _hitPlayer() {
    if (this.player.shield) {
      this.player.shield = false; this.player.shieldT = 0;
      this._notify('KALKAN KALDI!', '#00aaff', 1300);
      this.bursts.push(new Burst(this.player.x, this.player.y, '#00aaff', 0.7));
      return;
    }
    this.lives--;
    this.shake = 16;
    this.sfx.damage();
    this.player.inv   = true;
    this.player.invT  = 180;
    this.player.flash = 0;
    this.bursts.push(new Burst(this.player.x, this.player.y, '#ff4444', 0.9));
    this._updateHUD();

    if (this.lives <= 0) {
      this.bursts.push(new Burst(this.player.x, this.player.y, '#ff4444', 2.2));
      this.player = null;
      this.state  = 'gameover';
      if (this.score > this.hs) {
        this.hs = this.score;
        localStorage.setItem('gr_hs', this.hs);
      }
      setTimeout(() => {
        document.getElementById('final-score').textContent = this.score.toLocaleString('tr');
        document.getElementById('best-score').textContent  = this.hs.toLocaleString('tr');
        document.getElementById('hud').classList.add('hidden');
        this._showScreen('gameover-screen');
      }, 1700);
    }
  }

  // ── Update ───────────────────────────────────────────────────
  _update() {
    // Stars always scroll
    this.stars.forEach(s => s.tick());

    // During game-over just drain explosions
    if (this.state === 'gameover') {
      this.bursts.forEach(b => b.tick());
      this.bursts = this.bursts.filter(b => !b.done);
      return;
    }
    if (this.state !== 'playing') return;

    this.shake *= 0.86;

    // Tick game objects
    const px = this.player ? this.player.x : this.W / 2;
    const py = this.player ? this.player.y : this.H - 100;
    if (this.player) this.player.tick(this.pBullets, this.sfx);
    this.enemies.forEach(e => e.tick(this.eBullets, px, py));
    this.pBullets.forEach(b => b.tick());
    this.eBullets.forEach(b => b.tick());
    this.pups.forEach(p => p.tick());
    this.bursts.forEach(b => b.tick());
    this.notifs.forEach(n => n.tick());
    if (this.combo > 0 && --this.comboT <= 0) this.combo = 0;

    // ── Player bullets → Enemies ──────────────────────────────
    for (let bi = this.pBullets.length - 1; bi >= 0; bi--) {
      const b = this.pBullets[bi];
      let consumed = false;
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (hit(b.hb, e.hb)) {
          consumed = true;
          if (e.takeDmg()) {
            this.combo++;
            this.comboT = 220;
            const mult = Math.max(1, 0 | (this.combo / 3));
            const pts  = e.pts * mult;
            this.score += pts;
            this._updateHUD();
            if (mult > 1) this._notify(`${mult}x COMBO! +${pts}`, '#ffcc00', 950);
            this.bursts.push(new Burst(e.x, e.y, e.col));
            this.sfx.explode();
            this._maybeDropPup(e.x, e.y);
            this.enemies.splice(ei, 1);
          }
          break;
        }
      }
      if (consumed || b.oob(this.W, this.H)) this.pBullets.splice(bi, 1);
    }

    // ── Enemy bullets → Player ────────────────────────────────
    if (this.player && !this.player.inv) {
      for (let bi = this.eBullets.length - 1; bi >= 0; bi--) {
        if (hit(this.eBullets[bi].hb, this.player.hb)) {
          this.eBullets.splice(bi, 1);
          this._hitPlayer();
          break;
        }
      }
    }

    // ── Enemies → Player (ram) ────────────────────────────────
    if (this.player && !this.player.inv) {
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        if (hit(this.enemies[ei].hb, this.player.hb)) {
          this.bursts.push(new Burst(this.enemies[ei].x, this.enemies[ei].y, this.enemies[ei].col));
          this.enemies.splice(ei, 1);
          this._hitPlayer();
          break;
        }
      }
    }

    // ── Power-ups → Player ────────────────────────────────────
    if (this.player) {
      for (let pi = this.pups.length - 1; pi >= 0; pi--) {
        if (hit(this.pups[pi].hb, this.player.hb)) {
          this._applyPup(this.pups[pi]);
          this.pups.splice(pi, 1);
        }
      }
    }

    // Cleanup off-screen objects
    this.pBullets = this.pBullets.filter(b => !b.oob(this.W, this.H));
    this.eBullets = this.eBullets.filter(b => !b.oob(this.W, this.H));
    this.enemies  = this.enemies.filter(e => !e.oob(this.H));
    this.pups     = this.pups.filter(p => !p.oob(this.H));
    this.bursts   = this.bursts.filter(b => !b.done);
    this.notifs   = this.notifs.filter(n => !n.done);

    // Wave complete?
    if (!this.between && this.enemies.length === 0) {
      this.between = true;
      this.wave++;
      this.eBullets = [];
      this._updateHUD();
      setTimeout(() => {
        if (this.state === 'playing') this._spawnWave();
      }, 2600);
    }
  }

  // ── Draw ─────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.save();
    if (this.shake > 1)
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // Deep-space gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#00000e');
    bg.addColorStop(1, '#000024');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Stars
    this.stars.forEach(s => s.draw(ctx));

    // Game world (all states except pure menu)
    if (this.state !== 'menu') {
      this.enemies.forEach(e => e.draw(ctx));
      this.pups.forEach(p => p.draw(ctx));
      this.eBullets.forEach(b => b.draw(ctx));
      this.pBullets.forEach(b => b.draw(ctx));
      if (this.player) this.player.draw(ctx);
      this.bursts.forEach(b => b.draw(ctx));

      // Floating notifications (centered)
      this.notifs.forEach(n => {
        ctx.globalAlpha = n.a;
        ctx.shadowBlur  = 16; ctx.shadowColor = n.col; ctx.fillStyle = n.col;
        ctx.font = 'bold 26px "Courier New",monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.txt, W / 2, H / 2 + n.dy);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      });

      // Combo counter (top-right)
      if (this.combo >= 3) {
        const a = Math.min(1, this.comboT / 60);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold ${14 + this.combo * 0.4}px "Courier New",monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`${this.combo}x COMBO`, W - 12, 94);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }

      // "Hazırlan!" between-wave message
      if (this.between && this.enemies.length === 0 && this.state === 'playing') {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px "Courier New",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Hazırlan...', W / 2, H - 55);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  // ── Game loop ─────────────────────────────────────────────────
  _loop() {
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => { new Game(); });
