// Force la connexion sur l'URL de ton projet Render
const socket = io("https://ake-arena-io.onrender.com", {
  transports: ['websocket', 'polling'],
  upgrade: true
});

// ⚠️ Si tu utilises PIXI v8 (CDN "latest"), remplace ce bloc par:
// const app = new PIXI.Application();
// await app.init({ resizeTo: window, antialias: true, background: 0x05050b });
// document.body.prepend(app.canvas);
const app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x05050b });
document.body.prepend(app.view);

let playerId = null, game = {players:{}, orbs:[]}, mouseAngle = 0, isBoosting = false;
let currentZoom = 1;
let particles = [];

socket.on('connect', () => {
  console.log("Connecté au serveur Render avec succès !");
  document.getElementById('menu').style.display = 'block';
});

socket.on('connect_error', (err) => {
  console.error("Erreur de connexion Socket.io:", err);
  document.getElementById('menu').style.display = 'block';
});

const world = new PIXI.Container();
app.stage.addChild(world);

const SKINS = {
  cyan: { body: 0x00f3ff, glow: 0x0055ff },
  magenta: { body: 0xff0055, glow: 0xff00aa },
  purple: { body: 0x9d50bb, glow: 0x3a1c71 },
  orange: { body: 0xff8800, glow: 0xff3300 },
  green: { body: 0x00ff66, glow: 0x009933 }
};

const gridBg = new PIXI.Graphics();
gridBg.lineStyle(1.5, 0x00ffcc, 0.07);
for (let x = 0; x <= 5000; x += 120) { gridBg.moveTo(x, 0); gridBg.lineTo(x, 5000); }
for (let y = 0; y <= 5000; y += 120) { gridBg.moveTo(0, y); gridBg.lineTo(5000, y); }
gridBg.lineStyle(8, 0xff0055, 0.6); gridBg.drawRect(0, 0, 5000, 5000);
world.addChild(gridBg);

const gameGraphics = new PIXI.Graphics();
world.addChild(gameGraphics);
const textContainer = new PIXI.Container();
world.addChild(textContainer);

function start() {
  socket.emit('join', { name: document.getElementById('name').value, skin: document.getElementById('skin').value });
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('length').style.display = 'block';
}
// CSP-safe : attache le bouton start via addEventListener plutôt qu'onclick inline
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.addEventListener('click', start);

socket.on('init', (id) => playerId = id);
socket.on('state', (g) => {
  Object.keys(game.players).forEach(id => {
    if (g.players[id] && game.players[id] && !game.players[id].dead && g.players[id].dead) {
      triggerExplosion(g.players[id].x, g.players[id].y, game.players[id].color);
    }
  });
  game = g;
});
socket.on('dead', (data) => {
  document.getElementById('finalScore').innerText = Math.floor(data.score);
  document.getElementById('dead').style.display = 'block';
});

function triggerExplosion(x, y, color) {
  const pColor = parseInt(color);
  for(let i=0; i<30; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, alpha: 1, size: 3 + Math.random() * 4, color: pColor });
  }
}

// CONTRÔLES PHYSIQUES PC — AZERTY + QWERTY + flèches
let keys = { w:false, a:false, s:false, d:false, z:false, q:false, ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false };
let isTouchDevice = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { socket.emit('boost', true); isBoosting = true; }
  if (e.key in keys) keys[e.key] = true;
  calculateKeyAngle();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { socket.emit('boost', false); isBoosting = false; }
  if (e.key in keys) keys[e.key] = false;
  calculateKeyAngle();
});

function anyKeyActive() {
  return Object.values(keys).some(v => v);
}

function calculateKeyAngle() {
  let x = 0, y = 0;
  if (keys.w || keys.z || keys.ArrowUp) y -= 1;
  if (keys.s || keys.ArrowDown) y += 1;
  if (keys.a || keys.q || keys.ArrowLeft) x -= 1;
  if (keys.d || keys.ArrowRight) x += 1;
  if (x !== 0 || y !== 0) {
    isTouchDevice = false;
    mouseAngle = Math.atan2(y, x);
    socket.emit('move', mouseAngle);
  }
}

// CONTRÔLE TACTILE
let touchStart = { x: 0, y: 0 };
window.addEventListener('touchstart', (e) => {
  isTouchDevice = true;
  if (e.touches.length === 1) {
    touchStart.x = e.touches[0].clientX;
    touchStart.y = e.touches[0].clientY;
  } else {
    socket.emit('boost', true); isBoosting = true;
  }
}, {passive: true});

window.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.hypot(dx, dy) > 5) {
      mouseAngle = Math.atan2(dy, dx);
      socket.emit('move', mouseAngle);
    }
  }
}, {passive: true});

window.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) { socket.emit('boost', false); isBoosting = false; }
}, {passive: true});

// FIX: conflit souris/clavier corrigé (toutes les touches, pas juste ArrowUp)
window.addEventListener('mousemove', (e) => {
  if (!isTouchDevice && !anyKeyActive()) {
    mouseAngle = Math.atan2(e.clientY - window.innerHeight/2, e.clientX - window.innerWidth/2);
    socket.emit('move', mouseAngle);
  }
});

setInterval(() => { if(playerId && game.players[playerId] && !game.players[playerId].dead) socket.emit('move', mouseAngle); }, 35);

const minimap = document.getElementById('minimap').getContext('2d');
document.getElementById('minimap').width = 130;
document.getElementById('minimap').height = 130;

// ENGINE GENERATOR RENDU
app.ticker.add(() => {
  gameGraphics.clear();
  textContainer.removeChildren();

  gameGraphics.blendMode = PIXI.BLEND_MODES.ADD;
  particles.forEach((p, idx) => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.alpha -= 0.03;
    if(p.alpha <= 0) { particles.splice(idx, 1); return; }
    gameGraphics.beginFill(p.color, p.alpha); gameGraphics.drawCircle(p.x, p.y, p.size); gameGraphics.endFill();
  });

  game.orbs.forEach((orb) => {
    const color = parseInt(orb.color);
    const pulse = 1 + Math.sin(Date.now() * 0.007) * 0.1;
    gameGraphics.beginFill(color, 0.15); gameGraphics.drawCircle(orb.x, orb.y, orb.size * 3.5 * pulse); gameGraphics.endFill();
    gameGraphics.beginFill(color, 0.9); gameGraphics.drawCircle(orb.x, orb.y, orb.size); gameGraphics.endFill();
    gameGraphics.beginFill(0xFFFFFF, 0.9); gameGraphics.drawCircle(orb.x - orb.size*0.18, orb.y - orb.size*0.18, orb.size * 0.3); gameGraphics.endFill();
  });
  gameGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;

  const sorted = Object.values(game.players).sort((a,b) => b.score - a.score);
  const topPlayer = sorted.filter(pl => !pl.dead)[0];

  sorted.forEach(p => {
    if (p.dead) return;
    const colors = SKINS[p.skin] || SKINS.cyan;

    if (p.boostActive && Math.random() < 0.3) {
      gameGraphics.blendMode = PIXI.BLEND_MODES.ADD;
      gameGraphics.beginFill(colors.body, 0.3); gameGraphics.drawCircle(p.x + (Math.random()-0.5)*12, p.y + (Math.random()-0.5)*12, p.size * 0.7); gameGraphics.endFill();
      gameGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    }

    for(let i = p.segments.length - 1; i >= 0; i--) {
      const seg = p.segments[i];
      const size = p.size * (1 - (i / Math.max(1, p.segments.length)) * 0.2);
      gameGraphics.beginFill(colors.glow, 0.18); gameGraphics.drawCircle(seg.x, seg.y, size * 1.3); gameGraphics.endFill();
      gameGraphics.beginFill(colors.body); gameGraphics.drawCircle(seg.x, seg.y, size); gameGraphics.endFill();
    }

    gameGraphics.beginFill(colors.glow, 0.3); gameGraphics.drawCircle(p.x, p.y, p.size * 1.35); gameGraphics.endFill();
    gameGraphics.beginFill(colors.body); gameGraphics.drawCircle(p.x, p.y, p.size); gameGraphics.endFill();

    const eye1 = p.angle + 0.48; const eye2 = p.angle - 0.48;
    const ed = p.size * 0.5; const es = p.size * 0.35;
    gameGraphics.beginFill(0xFFFFFF);
    gameGraphics.drawCircle(p.x + Math.cos(eye1)*ed, p.y + Math.sin(eye1)*ed, es);
    gameGraphics.drawCircle(p.x + Math.cos(eye2)*ed, p.y + Math.sin(eye2)*ed, es);
    gameGraphics.endFill();

    if (topPlayer && p.id === topPlayer.id) {
      const crownBounce = Math.sin(Date.now() * 0.008) * 4;
      const textCrown = new PIXI.Text("👑", {fontSize: Math.max(16, p.size * 0.9), fontFamily: 'Arial'});
      textCrown.x = p.x - textCrown.width/2; textCrown.y = p.y - p.size - 42 + crownBounce;
      textContainer.addChild(textCrown);
    }

    if(p.name) {
      const text = new PIXI.Text(p.name, {fontSize: 12, fill: 0xffffff, stroke: 0x010103, strokeThickness: 3, fontFamily: 'Arial', fontWeight: 'bold'});
      text.x = p.x - text.width/2; text.y = p.y - p.size - 18;
      textContainer.addChild(text);
    }

    if (p.id === playerId) {
      const targetZoom = Math.max(0.45, 1.1 - (p.size / 110));
      currentZoom += (targetZoom - currentZoom) * 0.05;
      world.scale.set(currentZoom);

      const targetCamX = -p.x * currentZoom + window.innerWidth / 2;
      const targetCamY = -p.y * currentZoom + window.innerHeight / 2;
      world.x += (targetCamX - world.x) * 0.15;
      world.y += (targetCamY - world.y) * 0.15;

      document.getElementById('score').innerText = Math.floor(p.score);
      document.getElementById('len').innerText = Math.floor(p.size);
      document.getElementById('rank').innerText = sorted.filter(pl=>!pl.dead).indexOf(p) + 1;
      document.getElementById('total').innerText = sorted.filter(pl=>!pl.dead).length;

      minimap.clearRect(0,0,130,130);
      minimap.fillStyle = 'rgba(8,8,16,0.7)';
      minimap.beginPath(); minimap.arc(65,65,65,0,7); minimap.fill();
      Object.values(game.players).forEach(pl => {
        if (pl.dead) return;
        minimap.fillStyle = pl.id === playerId ? '#00ffcc' : '#ff0055';
        minimap.beginPath(); minimap.arc(65 + (pl.x-2500)/5000*115, 65 + (pl.y-2500)/5000*115, pl.id === playerId ? 4 : 2, 0, 7); minimap.fill();
      });
    }
  });

  document.getElementById('leaders').innerHTML = sorted.filter(p=>!p.dead).slice(0,7).map((p,i) =>
    `<div style="color:${i===0?'#00ffcc':i===1?'#ff0055':'#b2b2cc'}; margin:4px 0; font-family: monospace;">#${i+1} ${p.name.substring(0,9).padEnd(10,'_')} [${Math.floor(p.score)}]</div>`
  ).join('');
});
                        
