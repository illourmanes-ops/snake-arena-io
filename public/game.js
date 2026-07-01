// ----- CONNEXION -----
const socket = io("https://snake-arena-io.onrender.com", {
  transports: ['websocket', 'polling']
});

let playerId = null;
let game = { players: {}, orbs: [] };
let mouseAngle = 0;
let lastSentAngle = null;
let isBoosting = false;
let currentZoom = 1;
let particles = [];

// Éléments DOM
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('name');
const skinInput = document.getElementById('skin');
const scoreEl = document.getElementById('score');
const rankEl = document.getElementById('rank');
const totalEl = document.getElementById('total');
const lenEl = document.getElementById('len');
const speedEl = document.getElementById('speed');
const leadersEl = document.getElementById('leaders');
const minimapCanvas = document.getElementById('minimap');
const deadScreen = document.getElementById('dead');
const finalScoreEl = document.getElementById('finalScore');
const respawnBtn = document.getElementById('respawnBtn');
const joystick = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystick-knob');

// Menu
socket.on('connect', () => {
  console.log('✅ Connecté');
  menu.style.display = 'flex';
});
socket.on('connect_error', () => {
  menu.style.display = 'flex';
});

// ----- PIXI -----
const app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x05050b });
document.body.prepend(app.view);

const world = new PIXI.Container();
app.stage.addChild(world);

const SKINS = {
  cyan: { body: 0x00f3ff, glow: 0x0055ff },
  magenta: { body: 0xff0055, glow: 0xff00aa },
  purple: { body: 0x9d50bb, glow: 0x3a1c71 },
  orange: { body: 0xff8800, glow: 0xff3300 },
  green: { body: 0x00ff66, glow: 0x009933 }
};

// Grille
const grid = new PIXI.Graphics();
grid.lineStyle(1.5, 0x00ffcc, 0.07);
for (let x = 0; x <= 5000; x += 120) { grid.moveTo(x, 0); grid.lineTo(x, 5000); }
for (let y = 0; y <= 5000; y += 120) { grid.moveTo(0, y); grid.lineTo(5000, y); }
grid.lineStyle(8, 0xff0055, 0.6);
grid.drawRect(0, 0, 5000, 5000);
world.addChild(grid);

const graphics = new PIXI.Graphics();
world.addChild(graphics);
const textContainer = new PIXI.Container();
world.addChild(textContainer);
const textCache = new Map();

// ----- START -----
startBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Anon';
  const skin = skinInput.value;
  socket.emit('join', { name, skin });
  menu.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
});

respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
  deadScreen.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
});

// ----- SOCKET -----
socket.on('init', (id) => {
  playerId = id;
  console.log('🆔 ID:', id);
  sendMoveIfChanged(0.3);
});

socket.on('state', (g) => {
  game = g;
  // Vérifier si le joueur local est présent
  if (playerId && !game.players[playerId]) {
    console.warn('⚠️ Joueur local absent, rejoin...');
    setTimeout(() => {
      socket.emit('join', {
        name: nameInput.value.trim() || 'Anon',
        skin: skinInput.value
      });
    }, 300);
  }
});

socket.on('dead', (data) => {
  finalScoreEl.textContent = Math.floor(data.score);
  deadScreen.style.display = 'flex';
});

// ----- PARTICULES (explosion) -----
function triggerExplosion(x, y, color) {
  const c = parseInt(color);
  for (let i = 0; i < 30; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14,
      alpha: 1,
      size: 3 + Math.random() * 4,
      color: c
    });
  }
}

// ----- CONTRÔLES CLAVIER -----
const keys = { w:false, a:false, s:false, d:false, z:false, q:false, ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false };
let isTouch = false;

function anyKey() { return Object.values(keys).some(v => v); }

function calcKeyAngle() {
  let x = 0, y = 0;
  if (keys.w || keys.z || keys.ArrowUp) y -= 1;
  if (keys.s || keys.ArrowDown) y += 1;
  if (keys.a || keys.q || keys.ArrowLeft) x -= 1;
  if (keys.d || keys.ArrowRight) x += 1;
  if (x !== 0 || y !== 0) {
    isTouch = false;
    mouseAngle = Math.atan2(y, x);
    sendMoveIfChanged(mouseAngle);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { socket.emit('boost', true); isBoosting = true; }
  if (e.key in keys) keys[e.key] = true;
  calcKeyAngle();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { socket.emit('boost', false); isBoosting = false; }
  if (e.key in keys) keys[e.key] = false;
  calcKeyAngle();
});

function sendMoveIfChanged(angle) {
  if (!playerId) return;
  if (lastSentAngle === null || Math.abs(angle - lastSentAngle) > 0.001) {
    lastSentAngle = angle;
    socket.emit('move', angle);
  }
}

// ----- SOURIS -----
window.addEventListener('mousemove', (e) => {
  if (!isTouch && !anyKey()) {
    const angle = Math.atan2(e.clientY - window.innerHeight/2, e.clientX - window.innerWidth/2);
    mouseAngle = angle;
    sendMoveIfChanged(angle);
  }
});

// ----- JOYSTICK (tactile) -----
let joystickActive = false;
let jCenterX = 0, jCenterY = 0;
const jRadius = 50;

function setupJoystick() {
  const rect = joystick.getBoundingClientRect();
  jCenterX = rect.left + rect.width/2;
  jCenterY = rect.top + rect.height/2;
}
setTimeout(setupJoystick, 200);
window.addEventListener('resize', setupJoystick);

joystick.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isTouch = true;
  const touch = e.touches[0];
  handleJoystick(touch.clientX, touch.clientY);
  joystickActive = true;
}, {passive: false});

joystick.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleJoystick(touch.clientX, touch.clientY);
}, {passive: false});

joystick.addEventListener('touchend', (e) => {
  e.preventDefault();
  joystickActive = false;
  joystickKnob.style.transform = 'translate(-50%, -50%)';
}, {passive: false});

function handleJoystick(cx, cy) {
  const dx = cx - jCenterX;
  const dy = cy - jCenterY;
  const dist = Math.hypot(dx, dy);
  let clampedX = dx, clampedY = dy;
  if (dist > jRadius) {
    clampedX = (dx / dist) * jRadius;
    clampedY = (dy / dist) * jRadius;
  }
  joystickKnob.style.transform = `translate(${-50 + (clampedX/jRadius)*50}%, ${-50 + (clampedY/jRadius)*50}%)`;
  if (dist > 10) {
    const angle = Math.atan2(dy, dx);
    mouseAngle = angle;
    sendMoveIfChanged(angle);
  }
}

// Envoi périodique (sécurité)
setInterval(() => {
  if (playerId && game.players[playerId] && !game.players[playerId].dead) {
    if (lastSentAngle === null) {
      socket.emit('move', mouseAngle);
      lastSentAngle = mouseAngle;
    } else if (Math.abs(mouseAngle - lastSentAngle) > 0.001) {
      socket.emit('move', mouseAngle);
      lastSentAngle = mouseAngle;
    }
  }
}, 35);

// ----- MINIMAP -----
const ctx = minimapCanvas.getContext('2d');
let lastMinimapUpdate = 0;

// ----- RENDU -----
app.ticker.add((delta) => {
  const now = Date.now();
  graphics.clear();
  textContainer.removeChildren();

  // Particules
  graphics.blendMode = PIXI.BLEND_MODES.ADD;
  particles.forEach((p, idx) => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.95; p.vy *= 0.95;
    p.alpha -= 0.03;
    if (p.alpha <= 0) { particles.splice(idx, 1); return; }
    graphics.beginFill(p.color, p.alpha);
    graphics.drawCircle(p.x, p.y, p.size);
    graphics.endFill();
  });
  graphics.blendMode = PIXI.BLEND_MODES.NORMAL;

  // Orbes
  game.orbs.forEach((orb) => {
    const color = parseInt(orb.color);
    const pulse = 1 + Math.sin(now * 0.007) * 0.1;
    graphics.beginFill(color, 0.15);
    graphics.drawCircle(orb.x, orb.y, orb.size * 3.5 * pulse);
    graphics.endFill();
    graphics.beginFill(color, 0.9);
    graphics.drawCircle(orb.x, orb.y, orb.size);
    graphics.endFill();
    graphics.beginFill(0xFFFFFF, 0.9);
    graphics.drawCircle(orb.x - orb.size*0.18, orb.y - orb.size*0.18, orb.size * 0.3);
    graphics.endFill();
  });

  // Classement
  const sorted = Object.values(game.players).filter(p => !p.dead).sort((a,b) => b.score - a.score);
  const top = sorted[0] || null;

  // Rendu des joueurs
  sorted.forEach(p => {
    if (p.dead) return;
    const colors = SKINS[p.skin] || SKINS.cyan;
    const isLocal = (p.id === playerId);

    // Boost
    if (p.boostActive && Math.random() < 0.3) {
      graphics.blendMode = PIXI.BLEND_MODES.ADD;
      graphics.beginFill(colors.body, 0.3);
      graphics.drawCircle(p.x + (Math.random()-0.5)*12, p.y + (Math.random()-0.5)*12, p.size * 0.7);
      graphics.endFill();
      graphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    }

    // Segments
    for (let i = p.segments.length - 1; i >= 0; i--) {
      const seg = p.segments[i];
      const size = p.size * (1 - (i / Math.max(1, p.segments.length)) * 0.2);
      graphics.beginFill(colors.glow, 0.18);
      graphics.drawCircle(seg.x, seg.y, size * 1.3);
      graphics.endFill();
      graphics.beginFill(colors.body);
      graphics.drawCircle(seg.x, seg.y, size);
      graphics.endFill();
    }

    // Corps
    if (isLocal) {
      graphics.beginFill(0xffffff, 0.4);
      graphics.drawCircle(p.x, p.y, p.size * 1.6);
      graphics.endFill();
    }
    graphics.beginFill(colors.glow, 0.3);
    graphics.drawCircle(p.x, p.y, p.size * 1.35);
    graphics.endFill();
    graphics.beginFill(colors.body);
    graphics.drawCircle(p.x, p.y, p.size);
    graphics.endFill();

    // Yeux
    const e1 = p.angle + 0.48, e2 = p.angle - 0.48;
    const ed = p.size * 0.5, es = p.size * 0.35;
    graphics.beginFill(0xFFFFFF);
    graphics.drawCircle(p.x + Math.cos(e1)*ed, p.y + Math.sin(e1)*ed, es);
    graphics.drawCircle(p.x + Math.cos(e2)*ed, p.y + Math.sin(e2)*ed, es);
    graphics.endFill();

    // Texte
    let obj = textCache.get(p.id);
    if (!obj) {
      obj = {
        name: new PIXI.Text('', { fontSize: 12, fill: 0xffffff, stroke: 0x010103, strokeThickness: 3, fontFamily: 'Arial', fontWeight: 'bold' }),
        crown: new PIXI.Text('', { fontSize: 16, fontFamily: 'Arial' })
      };
      textCache.set(p.id, obj);
      textContainer.addChild(obj.name);
      textContainer.addChild(obj.crown);
    }
    if (obj.name.text !== p.name) obj.name.text = p.name || '';
    obj.name.x = p.x - obj.name.width/2;
    obj.name.y = p.y - p.size - 18;

    if (top && p.id === top.id) {
      const bounce = Math.sin(now * 0.008) * 4;
      obj.crown.text = '👑';
      obj.crown.x = p.x - obj.crown.width/2;
      obj.crown.y = p.y - p.size - 42 + bounce;
      obj.crown.visible = true;
    } else {
      obj.crown.visible = false;
    }

    // Mise à jour HUD local
    if (isLocal) {
      scoreEl.textContent = Math.floor(p.score);
      lenEl.textContent = Math.floor(p.size);
      rankEl.textContent = sorted.indexOf(p) + 1;
      totalEl.textContent = sorted.length;
      speedEl.textContent = Math.round(p.speed);
    }
  });

  // ---- CAMÉRA ----
  let targetX = 2500, targetY = 2500;
  let targetZoom = 1;
  if (playerId && game.players[playerId]) {
    const p = game.players[playerId];
    if (!p.dead) {
      targetX = p.x;
      targetY = p.y;
      targetZoom = Math.max(0.45, 1.1 - (p.size / 110));
    }
  }
  currentZoom += (targetZoom - currentZoom) * 0.05;
  world.scale.set(currentZoom);
  const dx = -targetX * currentZoom + window.innerWidth/2;
  const dy = -targetY * currentZoom + window.innerHeight/2;
  world.x += (dx - world.x) * 0.15;
  world.y += (dy - world.y) * 0.15;

  // ---- MINIMAP ----
  if (now - lastMinimapUpdate > 100) {
    lastMinimapUpdate = now;
    ctx.clearRect(0,0,130,130);
    ctx.fillStyle = 'rgba(8,8,16,0.7)';
    ctx.beginPath(); ctx.arc(65,65,65,0,7); ctx.fill();
    Object.values(game.players).forEach(pl => {
      if (pl.dead) return;
      ctx.fillStyle = (pl.id === playerId) ? '#00ffcc' : '#ff0055';
      ctx.beginPath();
      ctx.arc(65 + (pl.x-2500)/5000*115, 65 + (pl.y-2500)/5000*115, (pl.id === playerId) ? 4 : 2, 0, 7);
      ctx.fill();
    });
  }

  // ---- LEADERBOARD ----
  leadersEl.innerHTML = sorted.slice(0,7).map((p,i) =>
    `<div style="color:${i===0?'#00ffcc':i===1?'#ff0055':'#b2b2cc'};">#${i+1} ${p.name.substring(0,9)} [${Math.floor(p.score)}]</div>`
  ).join('');
});
