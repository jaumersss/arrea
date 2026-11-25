const frameAreas = {
  idle: { width: 238, height: 162, back: 119, above: 149 },
  whip: { width: 296, height: 162, back: 110, above: 146 },
  mega: { width: 260, height: 178, back: 130, above: 151 },
  world: { width: 475, height: 253, back: 122, above: 167 },
  crew: { width: 465, height: 229, back: 118, above: 194 },
  planes: { width: 458, height: 244, back: 120, above: 161 },
  duel: { width: 820, height: 264, back: 96, above: 228 },
  dino: { width: 505, height: 217, back: 120, above: 151 }
};

const planeTiming = { order: .25, radioEnd: .26, poseEnd: .28, firstImpact: .48 };
const duelTiming = { arrival: .22, countdown: .24, greetingEnd: .26, two: .363, one: .486, impact: .61 };
const planeChanges = Object.values(planeTiming);
const duelChanges = Object.values(duelTiming);
const dinosaurEntrance = .15;

globalThis.GalactusAnimation = class {
  constructor(canvas, provider) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.provider = provider;
    this.bounds = null;
    this.damage = null;
    this.lastScene = null;
    this.fracture = null;
    this.megaWhip = null;
    this.megaHold = null;
    this.planes = new Map();
    this.glows = new Map();
    this.sprites = new Map();
    this.bubbles = new Map();
    this.labels = {
      whip: `¡Vamos, ${provider}!`, mega: '¡Mega… ultra… giga!', world: '¡Se rompió la pantalla!',
      crew: '¡Necesito refuerzos!', planes: '¡Aquí Vaquero Uno!', duel: `¡Al duelo, ${provider}!`,
      dino: '¡Esto es jurásico!'
    };
    this.sparkDirections = Array.from({ length: 13 }, (_, i) => {
      const angle = i * 2.4;
      return [Math.cos(angle), Math.sin(angle), .48 + (i % 5) / 8];
    });
  }

  effectCanvas(name) {
    const canvas = document.createElement('canvas');
    canvas.dataset.effect = name;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    this.canvas.before(canvas);
    return canvas;
  }

  clearEffects() {
    if (this.fracture) this.fracture.canvas.hidden = true;
    this.stopMegaWhip();
    for (const plane of this.planes.values()) {
      plane.flight?.cancel();
      plane.flight = null;
      plane.scene = null;
      plane.canvas.hidden = true;
    }
  }

  nextVisualChange(scene, now) {
    const t = (now - scene.start) / scene.duration;
    let boundary;
    if (scene.name === 'mega' && t >= scene.impact && t < scene.recovery) {
      boundary = scene.recovery;
    } else if (scene.name === 'planes' && t < planeTiming.firstImpact) {
      boundary = planeChanges.find(phase => phase > t);
    } else if (scene.name === 'duel' && t >= duelTiming.arrival && t < duelTiming.impact) {
      boundary = duelChanges.find(phase => phase > t);
    } else if (scene.name === 'dino' && t < dinosaurEntrance) {
      boundary = dinosaurEntrance;
    }
    return boundary === undefined ? 0 : scene.start + scene.duration * boundary;
  }

  draw(box, scene, now, bubbles, reduced) {
    const contextLost = this.ctx.isContextLost();
    if (this.lastScene !== scene || reduced || contextLost) {
      this.clearEffects();
      this.lastScene = scene;
    }
    if (contextLost) return;
    const { x, y } = box;
    const w = innerWidth, h = innerHeight;
    const name = scene?.name || 'idle';
    const t = scene ? Math.max(0, Math.min(1, (now - scene.start) / scene.duration)) : 0;
    let dir = x <= w / 2 ? 1 : -1;
    let pose = 0;
    if (name === 'mega' && !reduced) {
      const whip = this.prepareMegaWhip(scene, x, y, w, h, dir);
      dir = whip.facing;
      const releasePose = this.playMegaWhip(whip, x, y, t * scene.duration, scene);
      if (t >= scene.impact) {
        pose = releasePose;
        if (pose === 1) {
          const held = this.megaHold;
          if (held && held.whip === whip && held.x === x && held.y === y && held.bubbles === bubbles) return;
          this.megaHold = { whip, x, y, bubbles };
        }
      }
    }
    const staticCrew = reduced && name === 'crew' && scene.repeating;
    this.prepareFrame(x, y, w, h, dir, reduced && !staticCrew ? 'idle' : name);
    const reach = Math.min(260, (dir === 1 ? w - x : x) - 22);
    const target = x + dir * reach;

    if (reduced) {
      if (staticCrew) this.crew(x, y, reach, dir, 0, false, true, false);
      this.cowboy(x, y, dir, 1, 0);
      if (scene && bubbles) this.bubble(x, y - 107, this.labels[name]);
      return;
    }
    if (name === 'duel') {
      this.duel(x, y, w, dir, t, bubbles);
      return;
    }

    if (name === 'mega') {
      if (t < scene.impact) {
        pose = this.swingWhip(x, y, dir, t, scene.impact, 1.15);
        this.glow(x, y - 48, 36 + t * 55, '#efad39', .22 + t * .23);
      }
    } else if (name === 'whip' || name === 'crew' || name === 'world') {
      const charged = name === 'world';
      const release = charged ? .64 : .32;
      pose = this.swingWhip(x, y, dir, t, release, charged ? 1.4 : .78);
      if (t < release) {
        if (charged) this.glow(x, y - 48, 36 + t * 55, '#efad39', .22 + t * .23);
      } else {
        const impact = (t - release) / (1 - release);
        this.burst(x + dir * Math.min(reach, charged ? 151 : 108), y - 42, impact, '#bb4027', charged ? 105 : 35);
        if (name === 'world') {
          this.cracks(target, y - 75, impact, w, h, scene);
          this.glow(target, y - 75, 52, '#ed852d', (1 - impact) * .36);
        }
      }
    }
    if (name === 'crew') this.crew(x, y, reach, dir, t, bubbles, scene.repeating);
    if (name === 'planes') {
      for (let i = 0; i < 3; i++) {
        this.flyPlane(i, w, Math.max(80, y - 198) + i * 36, scene, t);
        const impact = (t - planeTiming.firstImpact - i * .09) / .39;
        if (impact > 0 && impact < 1) {
          const bx = x + dir * reach * (.44 + i * .24);
          this.glow(bx, y - 26 - i * 28, 28 + impact * 42, '#ee6746', .65 * (1 - impact));
          this.glow(bx, y - 30 - i * 28, 17 + impact * 28, '#ffb236', .72 * (1 - impact));
          this.burst(bx, y - 30 - i * 28, impact, '#e56135', 60);
        }
      }
      if (t < planeTiming.poseEnd) pose = -.85;
    }
    if (name === 'dino' && t >= dinosaurEntrance) {
      const progress = Math.min(1, (t - dinosaurEntrance) / .26);
      const dx = x + dir * (reach * (.30 + progress * .46));
      this.dinosaur(dx, y + Math.sin(t * Math.PI * 4) * 3, dir);
      if (t > .46) {
        const impact = (t - .46) / .54;
        this.whip(dx + dir * 22, y + 8, dir, impact, true, .8);
        const burstX = Math.max(28, Math.min(w - 28, dx + dir * 90));
        this.burst(burstX, y - 37, impact, '#de902c', 63);
      }
    }
    this.cowboy(x, y, dir, 1, pose, { radio: name === 'planes' && t < planeTiming.radioEnd });
    if (bubbles && scene && (name === 'whip' || name === 'mega' || t < .82 || name === 'world')) {
      let phrase = this.labels[name];
      if (name === 'mega') phrase = t < .18 ? 'Mega…' : t < .35 ? '¡Ultra…!' : t < scene.impact ? '¡¡Giga…!!' : '¡CRAC!';
      if (name === 'planes' && t >= planeTiming.order) phrase = '¡A cubierto!';
      this.bubble(x, y - 108, phrase, name === 'mega' || name === 'world');
    }
  }

  prepareFrame(x, y, w, h, dir, name) {
    const area = frameAreas[name];
    const width = Math.min(w, area.width);
    const height = Math.min(h, area.height);
    const left = Math.max(0, Math.min(w - width, x - (dir === 1 ? area.back : width - area.back)));
    const top = Math.max(0, Math.min(h - height, y - area.above));
    const scale = Math.min(devicePixelRatio || 1, 1.25);
    const previous = this.bounds;
    const canvas = this.canvas;
    const pixelsWide = Math.ceil(width * scale), pixelsHigh = Math.ceil(height * scale);
    const resized = canvas.width !== pixelsWide || canvas.height !== pixelsHigh;
    if (!previous || previous.width !== width || previous.height !== height || previous.scale !== scale) {
      if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
      if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    if (!previous || previous.left !== left || previous.top !== top || previous.width !== width ||
        previous.height !== height || previous.scale !== scale) {
      if (!previous || previous.left !== left || previous.top !== top) {
        canvas.style.transform = `translate(${left}px, ${top}px)`;
      }
      this.bounds = { left, top, width, height, scale };
    }
    const c = this.ctx;
    c.resetTransform();
    if (!resized && previous) this.clearPreviousFrame(previous);
    this.damage = name === 'whip'
      ? { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
      : null;
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    c.setTransform(scaleX, 0, 0, scaleY, -left * scaleX, -top * scaleY);
    c.lineCap = c.lineJoin = 'round';
  }

  clearPreviousFrame(previous) {
    const { ctx, canvas, damage } = this;
    if (!damage) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (damage.left === Infinity) return;
    const scaleX = canvas.width / previous.width, scaleY = canvas.height / previous.height;
    const left = Math.max(0, Math.floor((damage.left - previous.left) * scaleX) - 1);
    const top = Math.max(0, Math.floor((damage.top - previous.top) * scaleY) - 1);
    const right = Math.min(canvas.width, Math.ceil((damage.right - previous.left) * scaleX) + 1);
    const bottom = Math.min(canvas.height, Math.ceil((damage.bottom - previous.top) * scaleY) + 1);
    if (right > left && bottom > top) ctx.clearRect(left, top, right - left, bottom - top);
  }

  includePaintedArea(left, top, right, bottom) {
    const area = this.damage;
    if (!area) return;
    area.left = Math.min(area.left, left);
    area.top = Math.min(area.top, top);
    area.right = Math.max(area.right, right);
    area.bottom = Math.max(area.bottom, bottom);
  }

  swingWhip(x, y, facing, progress, release, reach) {
    const windup = release * .62;
    const rest = [0, 22, -17, 23, -30, 15, -40];
    const back = [-1, -3, -100, -52, -126, -46, -102];
    const strike = [1, 58, -99, 91, -34, 152, -42];
    let from = rest, to = back, phase = progress / windup;
    if (progress >= release) {
      from = strike;
      to = rest;
      phase = (progress - release) / (1 - release);
    } else if (progress >= windup) {
      from = back;
      to = strike;
      phase = (progress - windup) / (release - windup);
    }
    const eased = phase * phase * (3 - 2 * phase);
    const [pose, x1, y1, x2, y2, tx, ty] = from.map((value, i) => value + (to[i] - value) * eased);
    const gripX = 12 + Math.max(0, pose) * 22;
    const gripY = -42 - Math.abs(pose) * 36;
    if (this.damage) {
      const first = facing * x1 * reach, second = facing * x2 * reach, tip = facing * tx * reach;
      this.includePaintedArea(x + Math.min(facing * gripX, first, second, tip) - 2,
        y + Math.min(gripY, y1, y2, ty) - 2, x + Math.max(facing * gripX, first, second, tip) + 2,
        y + Math.max(gripY, y1, y2, ty) + 2);
    }
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(facing, 1);
    c.beginPath();
    c.moveTo(gripX, gripY);
    c.bezierCurveTo(x1 * reach, y1, x2 * reach, y2, tx * reach, ty);
    c.strokeStyle = '#804c25';
    c.lineWidth = 2.2;
    c.stroke();
    c.restore();
    return pose;
  }

  prepareMegaWhip(scene, x, y, w, h, facing) {
    const cached = this.megaWhip;
    if (cached && cached.w === w && cached.h === h &&
        (cached.scene === scene || (cached.x === x && cached.y === y))) {
      cached.scene = scene;
      return cached;
    }

    this.stopMegaWhip();
    const canvas = cached?.canvas ?? this.effectCanvas('mega-whip');
    const height = Math.round(Math.min(h, Math.max(144, Math.min(400, h * .42))));
    const bitmapWidth = Math.min(w, 768), bitmapHeight = Math.min(height, 184);
    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
      canvas.width = bitmapWidth;
      canvas.height = bitmapHeight;
    }
    const handX = x + facing * 34;
    const handY = y - 78;
    const top = Math.max(0, Math.min(h - height, Math.round(handY - height * .46)));
    const gripY = handY - top;
    const inset = Math.min(26, w * .035);
    const rear = facing === 1 ? inset : w - inset;
    const span = w - 2 * inset;
    const across = fraction => rear + facing * span * fraction;
    const windupX = rear + facing * Math.max(0, (handX - rear) * facing - span * .18);
    const rope = new Path2D();
    rope.moveTo(handX, gripY);
    rope.bezierCurveTo(windupX, height * .08, across(0), height * .16, across(.025), height * .46);
    rope.bezierCurveTo(across(.12), height * .92, across(.31), height * .10, across(.47), height * .34);
    rope.bezierCurveTo(across(.63), height * .55, across(.67), height * .94, across(.80), height * .63);
    rope.bezierCurveTo(across(.89), height * .40, across(.93), height * .25, across(1), height * .46);

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, bitmapWidth, bitmapHeight);
    ctx.setTransform(bitmapWidth / w, 0, 0, bitmapHeight / height, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [color, width] of [['#fff2cb', 10], ['#624026', 6], ['#e8a758', 2.4]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke(rope);
    }
    const tipX = across(1);
    const tipY = height * .46;
    const sparkLength = Math.min(16, inset * .78);
    const sparks = new Path2D();
    for (const [dx, dy] of [[1, -1], [1, 1], [-.5, -1.5], [-.5, 1.5]]) {
      sparks.moveTo(tipX + facing * dx * 5, tipY + dy * 5);
      sparks.lineTo(tipX + facing * dx * sparkLength, tipY + dy * 15);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e6a23c';
    ctx.stroke(sparks);
    const spriteGripX = handX * bitmapWidth / w;
    const spriteGripY = gripY * bitmapHeight / height;
    canvas.style.left = `${handX - spriteGripX}px`;
    canvas.style.top = `${handY - spriteGripY}px`;
    canvas.style.transformOrigin = `${spriteGripX}px ${spriteGripY}px`;
    canvas.style.translate = 'none';
    this.megaWhip = { canvas, scene, x, y, w, h, facing, scaleX: w / bitmapWidth, scaleY: height / bitmapHeight,
      offsetX: 0, offsetY: 0, animation: null };
    return this.megaWhip;
  }

  playMegaWhip(whip, x, y, elapsed, scene) {
    const { canvas } = whip;
    const delay = scene.duration * scene.impact;
    const duration = scene.duration * scene.recovery - delay;
    const end = delay + duration;
    if (elapsed >= end) {
      this.stopMegaWhip();
      return (scene.duration - elapsed) / (scene.duration - end);
    }
    const offsetX = x - whip.x, offsetY = y - whip.y;
    if (offsetX !== whip.offsetX || offsetY !== whip.offsetY) {
      canvas.style.translate = `${offsetX}px ${offsetY}px`;
      whip.offsetX = offsetX;
      whip.offsetY = offsetY;
    }
    if (!whip.animation) {
      canvas.hidden = false;
      const scale = (x, y) => `scale(${x * whip.scaleX}, ${y * whip.scaleY})`;
      const animation = canvas.animate([
        { offset: 0, transform: scale(.2, .54), opacity: 0, easing: 'cubic-bezier(.16, .9, .24, 1)' },
        { offset: .16, transform: scale(1, 1), opacity: 1, easing: 'ease-out' },
        { offset: .43, transform: scale(1, .97), opacity: 1, easing: 'ease-in-out' },
        { offset: 1, transform: scale(.94, .84), opacity: 0 }
      ], { delay, duration, fill: 'both' });
      whip.animation = animation;
      animation.currentTime = elapsed;
      animation.onfinish = () => {
        if (whip.animation === animation) canvas.hidden = true;
      };
    }
    return 1;
  }

  stopMegaWhip() {
    this.megaHold = null;
    if (!this.megaWhip) return;
    this.megaWhip.animation?.cancel();
    this.megaWhip.animation = null;
    if (!this.megaWhip.canvas.hidden) this.megaWhip.canvas.hidden = true;
  }

  path(points, stroke, width = 2, fill, c = this.ctx) {
    c.beginPath();
    c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    if (fill) {
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  oval(x, y, rx, ry, fill, stroke, width = 2, c = this.ctx) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  sprite(key, width, height, paint) {
    const stored = this.sprites.get(key);
    if (stored) return stored;
    const bitmap = document.createElement('canvas');
    bitmap.width = width * 2;
    bitmap.height = height * 2;
    const c = bitmap.getContext('2d');
    c.scale(2, 2);
    c.lineCap = c.lineJoin = 'round';
    paint(c);
    this.sprites.set(key, bitmap);
    return bitmap;
  }

  cowboy(x, y, facing, size, pose, options = {}) {
    const c = this.ctx;
    const { mounted = false, opponent = false, radio = false, hat = '#6c422b' } = options;
    const ink = opponent ? '#903e29' : '#202828';
    this.includePaintedArea(x - 39 * size, y - 105 * size, x + 39 * size, y + 5 * size);
    const body = this.sprite(`cowboy-${mounted}-${opponent}-${hat}`, 52, 110, bitmap => {
      bitmap.translate(26, 105);
      const legs = mounted ? [[0,-34],[13,-19],[8,-7]] : [[-19,-1],[0,-34],[19,-1]];
      if (!mounted) this.oval(0, 0, 22, 3, '#232b2730', undefined, 2, bitmap);
      for (const points of [legs, [[0,-34],[0,-68]]]) {
        this.path(points, '#fffbef', 5.6, undefined, bitmap);
        this.path(points, ink, 2.7, undefined, bitmap);
      }
      if (opponent) {
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, dx = Math.cos(a), dy = Math.sin(a);
          this.path([[dx * 6,-79 + dy * 6],[dx * 13,-79 + dy * 13]], '#d1745c', 3, undefined, bitmap);
        }
        this.oval(0, -79, 7, 7, '#bd644d', undefined, 2, bitmap);
      } else {
        this.oval(0, -80, 12, 12, '#fbf6e9', ink, 2.5, bitmap);
        this.oval(-4, -80, 1.2, 1.6, ink, undefined, 2, bitmap);
        this.oval(4, -80, 1.2, 1.6, ink, undefined, 2, bitmap);
        this.path([[-2,-75],[0,-74],[3,-75]], ink, 1.1, undefined, bitmap);
      }
      this.path([[-17,-90],[17,-90]], '#fffbef', 4.7, undefined, bitmap);
      this.path([[-17,-90],[17,-90]], ink, 2.3, undefined, bitmap);
      bitmap.beginPath();
      bitmap.roundRect(-8.5, -101, 17, 11, 3);
      bitmap.fillStyle = opponent ? '#25322f' : hat;
      bitmap.fill();
      bitmap.strokeStyle = '#fffbef';
      bitmap.lineWidth = 1.2;
      bitmap.stroke();
    });
    c.save();
    c.translate(x, y);
    c.scale(facing * size, size);
    c.drawImage(body, -26, -105, 52, 110);
    const lift = Math.abs(pose), reach = Math.max(0, pose);
    const arms = [[-11,-40],[-9,-54],[0,-67],[9 + reach * 10,-56 - lift * 17],
      [radio ? 12 : 12 + reach * 22,-42 - lift * 36]];
    this.path(arms, '#fffbef', 5.6);
    this.path(arms, ink, 2.7);
    if (radio) {
      c.fillStyle = '#507e8b';
      c.fillRect(10, -84, 6, 12);
      this.path([[15,-83],[15,-90]], ink, 1.4);
    }
    c.restore();
  }

  bubble(x, y, message, emphasis = false) {
    const c = this.ctx;
    const font = emphasis ? '800 15px system-ui' : '700 13px system-ui';
    const key = `bubble-${font}-${message}`;
    let bubble = this.bubbles.get(key);
    if (!bubble) {
      c.save();
      c.font = font;
      const width = Math.ceil(c.measureText(message).width + 20);
      c.restore();
      const bitmap = this.sprite(key, width + 4, 29, drawing => {
        drawing.beginPath();
        drawing.roundRect(2, 2, width, 25, 8);
        drawing.fillStyle = '#fffdf4';
        drawing.fill();
        drawing.strokeStyle = '#303931';
        drawing.lineWidth = 1.5;
        drawing.stroke();
        drawing.font = font;
        drawing.fillStyle = emphasis ? '#a32923' : '#212820';
        drawing.textBaseline = 'middle';
        drawing.fillText(message, 12, 14.5);
      });
      bubble = { width, bitmap };
      this.bubbles.set(key, bubble);
    }
    const { width, bitmap } = bubble;
    const left = Math.max(6, Math.min(innerWidth - width - 6, x - width / 2));
    const top = Math.max(7, y - 31);
    const tail = Math.min(left + width - 10, Math.max(left + 10, x));
    this.includePaintedArea(Math.min(x - 1, left - 2), top - 2, Math.max(x + 1, left + width + 2), top + 37);
    this.path([[tail - 7,top + 24],[x,top + 35],[tail + 4,top + 24]], '#303931', 1.5, '#fffdf4');
    c.drawImage(bitmap, left - 2, top - 2, width + 4, 29);
    this.path([[tail - 5,top + 25],[tail + 1,top + 25]], '#fffdf4', 1.8);
  }

  whip(x, y, dir, t, released, size) {
    const c = this.ctx;
    c.save();
    c.translate(x, y - 67);
    c.scale(dir, 1);
    c.globalAlpha = released ? Math.max(0, 1 - t * 1.03) : .86;
    c.beginPath();
    if (released) {
      const swing = Math.sin(t * Math.PI);
      c.moveTo(33, -10);
      c.bezierCurveTo(53 * size, -58 * swing, 75 * size, 50 * swing, 155 * size, 22 + t * 41);
    } else {
      c.moveTo(11, -10);
      c.bezierCurveTo(18, -68 * t * size, -96 * size * t, -42 * size, -20 - 32 * t, -9 - 42 * t);
    }
    c.lineWidth = 2.2;
    c.strokeStyle = '#804c25';
    c.stroke();
    c.restore();
  }

  glow(x, y, r, color, opacity) {
    let texture = this.glows.get(color);
    if (!texture) {
      const size = 96;
      texture = document.createElement('canvas');
      texture.width = texture.height = size;
      const ctx = texture.getContext('2d');
      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '00');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      this.glows.set(color, texture);
    }
    const c = this.ctx;
    c.save();
    c.globalAlpha *= opacity;
    c.drawImage(texture, x - r, y - r, 2 * r, 2 * r);
    c.restore();
  }

  burst(x, y, t, color, size) {
    if (t < 0 || t >= 1) return;
    const texture = this.sprite(`burst-${color}`, 80, 80, bitmap => {
      bitmap.translate(40, 40);
      for (const [i, [dx, dy, multiplier]] of this.sparkDirections.entries()) {
        const r = 28 * multiplier;
        this.path([[dx * r,dy * r],[dx * (r + 7),dy * (r + 7)]], i % 3 ? color : '#f3a935', 2.6,
          undefined, bitmap);
      }
    });
    const c = this.ctx;
    c.save();
    c.globalAlpha *= 1 - t;
    const half = (12 + size * t) * 1.12;
    this.includePaintedArea(x - half, y - half, x + half, y + half);
    c.drawImage(texture, x - half, y - half, 2 * half, 2 * half);
    c.restore();
  }

  cracks(x, y, t, w, h, scene) {
    const old = this.fracture;
    const canvas = old?.canvas ?? this.effectCanvas('cracks');
    const scale = Math.min(1, 960 / w, 540 / h);
    if (!old || old.w !== w || old.h !== h || (old.scene !== scene && (old.x !== x || old.y !== y))) {
      const pixelsWide = Math.ceil(w * scale), pixelsHigh = Math.ceil(h * scale);
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide;
        canvas.height = pixelsHigh;
      }
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.transformOrigin = `${x}px ${y}px`;
      const c = canvas.getContext('2d');
      c.resetTransform();
      c.clearRect(0, 0, pixelsWide, pixelsHigh);
      c.setTransform(pixelsWide / w, 0, 0, pixelsHigh / h, 0, 0);
      c.lineCap = c.lineJoin = 'round';
      const radius = Math.hypot(w, h);
      for (let i = 0; i < 14; i++) {
        const a = i * Math.PI / 7 + Math.sin(i * 7) * .18;
        const dx = Math.cos(a), dy = Math.sin(a);
        const r = radius * (.37 + (i % 5) / 10);
        const j = [x + dx * r * .38 + dy * 16, y + dy * r * .38 - dx * 16];
        const ray = [[x,y],[x+dx*r*.15,y+dy*r*.15],j,[x+dx*r*.66-dy*18,y+dy*r*.66+dx*18],[x+dx*r,y+dy*r]];
        this.path(ray, '#f8faf2', 3.2, undefined, c);
        this.path(ray, '#282a28', 1.2, undefined, c);
        this.path([j,[j[0]+dx*r*.19-dy*44,j[1]+dy*r*.19+dx*44],[j[0]+dx*r*.35-dy*61,j[1]+dy*r*.35+dx*61]], '#282a28', .9, undefined, c);
      }
      this.fracture = { canvas, x, y, w, h, scene };
    }
    this.fracture.scene = scene;
    if (canvas.hidden) canvas.hidden = false;
    canvas.style.opacity = Math.min(1, (1 - t) * 3) * .82;
    canvas.style.transform = `translate3d(${x - this.fracture.x}px,${y - this.fracture.y}px,0) scale(${.90 + .10 * Math.min(1, t * 8)})`;
  }

  crew(x, y, reach, facing, t, bubbles, repeating, animate = true) {
    const c = this.ctx;
    for (let i = 0; i < 6; i++) {
      const phase = repeating ? (t + i * .12) % 1 : (t - i * .038 - .07) / .73;
      if (!repeating && (phase <= 0 || phase >= 1)) continue;
      const px = x + facing * (34 + (reach - 32) * (i + 1) / 6);
      const swing = animate ? Math.sin(phase * Math.PI * 4) : 0;
      const py = y - (i % 3) * 37 + swing * 8;
      c.save();
      c.globalAlpha = repeating ? 1 : Math.min(1, phase * 9, (1 - phase) * 9);
      this.cowboy(px, py, i % 2 ? -facing : facing, .55, swing, { hat: ['#bd7933', '#526844', '#ae4d42'][i % 3] });
      if (bubbles && i % 2 === 0 && (!repeating || phase < .4)) {
        this.bubble(px, py - 61, ['¡Aquí!', '¡En marcha!', '¡Vamos!'][i / 2]);
      }
      if (animate && phase > .4) this.burst(px + 17, py - 15, (phase - .4) / .6, '#c97a31', 29);
      c.restore();
    }
  }

  flyPlane(index, width, y, scene, progress) {
    let plane = this.planes.get(index);
    const delay = scene.duration * (.19 + index * .1);
    const duration = scene.duration * .48;
    const elapsed = progress * scene.duration;
    if (elapsed >= delay + duration) return;
    if (!plane) {
      const canvas = this.effectCanvas('plane');
      canvas.width = 240;
      canvas.height = 112;
      canvas.style.width = '120px';
      canvas.style.height = '56px';
      canvas.style.transformOrigin = 'top left';
      const c = canvas.getContext('2d');
      c.setTransform(2, 0, 0, 2, 120, 56);
      c.lineCap = c.lineJoin = 'round';
      this.path([[-50,1],[-39,-8],[34,-6],[49,-19],[56,-18],[52,0],[41,7],[-35,10]], '#30412d', 1.6, '#647858', c);
      this.path([[-19,-3],[4,-24],[18,-24],[11,3],[26,21],[13,24],[-9,7]], '#30412d', 1.6, '#82916a', c);
      this.oval(-29, -7, 9, 4, '#aed2d1', '#30412d', 1.1, c);
      this.oval(27, 0, 6, 6, '#405348', undefined, 2, c);
      this.path([[27,-4],[28,4],[23,-1],[31,-1],[25,4],[27,-4]], '#eae8d6', 1.1, undefined, c);
      plane = { canvas, width: 0, y: null, scene: null, flight: null };
      this.planes.set(index, plane);
    }
    const size = index % 2 ? .8 : 1;
    const { canvas } = plane;
    if (plane.y !== y) {
      canvas.style.top = `${y - 28 * size}px`;
      plane.y = y;
    }
    if (plane.scene !== scene || plane.width !== width) {
      plane.flight?.cancel();
      const pass = x => `translate3d(${x - 60 * size}px, 0, 0) scale(${size})`;
      canvas.hidden = false;
      const flight = canvas.animate([
        { transform: pass(width + 66), opacity: 1 },
        { transform: pass(-66), opacity: 1 }
      ], { delay, duration });
      flight.currentTime = elapsed;
      flight.onfinish = () => {
        if (plane.flight === flight) canvas.hidden = true;
      };
      Object.assign(plane, { scene, width, flight });
    }
  }

  horse(x, y, facing, mare, step, size) {
    const c = this.ctx;
    const coat = mare ? '#c9dfd9' : '#875239';
    const edge = mare ? '#596c63' : '#4c3528';
    const standing = step === 0;
    const body = this.sprite(`horse-${mare}-${standing}`, 134, 91, bitmap => {
      bitmap.translate(65, 85);
      this.oval(0, 0, 57, 4, '#28332c27', undefined, 2, bitmap);
      this.path([[-36,-42],[-51,-33],[-56,-21],[-57,-12]], edge, 4.7, undefined, bitmap);
      this.oval(-2, -42, 39, 19, coat, edge, 1.5, bitmap);
      this.path([[12,-37],[25,-64],[34,-81],[38,-70],[52,-72],[63,-61],[61,-53],[48,-53],[37,-57],[29,-37]],
        edge, 1.5, coat, bitmap);
      this.path([[29,-66],[24,-57],[22,-50]], edge, 3.3, undefined, bitmap);
      this.oval(49, -65, 1.6, 1.6, edge, undefined, 2, bitmap);
      if (standing) this.horseLegs(coat, edge, step, bitmap);
      this.oval(-4, -58, 14, 4, edge, undefined, 2, bitmap);
    });
    c.save();
    c.translate(x, y);
    c.scale(facing * size, size);
    c.drawImage(body, -65, -85, 134, 91);
    if (!standing) this.horseLegs(coat, edge, step, c);
    c.restore();
  }

  horseLegs(coat, edge, step, c) {
    for (const leg of [-25, -17, 21, 29]) {
      const swing = Math.sin(step + leg) * 7;
      const points = [[leg,-33],[leg + swing,-15],[leg - swing * .5,-2]];
      this.path(points, '#faf8ec', 7, undefined, c);
      this.path(points, coat, 4.7, undefined, c);
      this.oval(leg - swing * .5, -2, 3.9, 2.2, edge, undefined, 2, c);
    }
  }

  duel(x, y, w, facing, t, bubbles) {
    const fade = Math.max(0, Math.min(1, t * 9, (1 - t) * 13));
    const openWidth = facing === 1 ? w - x : x;
    const distance = Math.max(58, Math.min(460, openWidth * .78));
    const opponent = x + facing * distance;
    const size = Math.min(1, w / 460);
    const motion = t < duelTiming.arrival ? (1 - t / duelTiming.arrival) * Math.min(180, w * .28) : 0;
    const hit = t > duelTiming.impact ? (t - duelTiming.impact) / (1 - duelTiming.impact) : 0;
    const c = this.ctx;
    c.save();
    c.globalAlpha = fade;
    const opponentNow = opponent + facing * motion;
    this.horse(x, y, facing, false, 0, size);
    this.horse(opponentNow, y, -facing, true, motion * .12, size);
    this.cowboy(x, y - 29 * size, facing, .82 * size, hit ? .8 : 0, { mounted: true });
    this.cowboy(opponentNow, y - 29 * size, -facing, .82 * size, hit ? -.6 : 0, { mounted: true, opponent: true });
    if (t >= duelTiming.countdown && t < duelTiming.impact) {
      c.font = '900 61px system-ui';
      c.fillStyle = '#eed393';
      c.lineWidth = 2;
      c.strokeStyle = '#4c3528';
      c.textAlign = 'center';
      const number = t < duelTiming.two ? '3' : t < duelTiming.one ? '2' : '1';
      const middle = (x + opponent) / 2;
      const top = Math.max(67, y - 153);
      c.fillText(number, middle, top);
      c.strokeText(number, middle, top);
    }
    if (hit) {
      this.whip(x, y - 24 * size, facing, hit, true, Math.max(.65, distance / 155));
      this.burst(opponent, y - 93 * size, hit, '#c0603f', 61);
    }
    if (bubbles && t < duelTiming.greetingEnd) this.bubble(x, y - 123 * size, `¡Al duelo, ${this.provider}!`);
    if (bubbles && t > .72) this.bubble(opponent, y - 123 * size, 'Eso va contra las reglas.');
    c.restore();
  }

  dinosaur(x, y, facing) {
    const c = this.ctx;
    const shape = this.sprite('dinosaur', 128, 82, bitmap => {
      const green = '#648651', edge = '#304b34';
      bitmap.translate(67, 78);
      this.oval(0, 0, 38, 3, '#28332c29', undefined, 2, bitmap);
      this.path([[-63,-24],[-41,-27],[-22,-43],[-5,-52],[11,-54],[19,-72],[40,-74],[54,-66],
        [53,-58],[33,-57],[31,-43],[17,-28],[-9,-24],[-29,-27]], edge, 2, green, bitmap);
      this.path([[12,-33],[19,-17],[10,-3],[1,-3]], edge, 5, undefined, bitmap);
      this.path([[-8,-33],[-12,-15],[-4,-3]], green, 6, undefined, bitmap);
      this.path([[28,-46],[43,-40],[48,-45]], edge, 3, undefined, bitmap);
      this.oval(40, -66, 2.4, 2.4, edge, undefined, 2, bitmap);
      this.path([[36,-59],[48,-61]], edge, 1.4, undefined, bitmap);
    });
    c.save();
    c.translate(x, y);
    c.scale(facing, 1);
    c.drawImage(shape, -67, -78, 128, 82);
    c.restore();
  }
};
