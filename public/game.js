// Connexion au serveur (changez l'URL si nécessaire)
const socket = io("https://snake-arena-io.onrender.com", {
  transports: ['websocket', 'polling'],
  upgrade: true
});

// Gestion du menu
socket.on('connect', () => {
  console.log("✅ Connecté");
  document.getElementById('menu').style.display = 'flex';
});
socket.on('connect_error', () => {
  document.getElementById('menu').style.display = 'flex';
});

// Gestion des erreurs fatales
window.addEventListener('error', (e) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff0055;color:#fff;padding:12px;font-family:monospace;';
  box.textContent = 'Erreur: ' + e.message;
  document.body.appendChild(box);
});

// PIXI
let app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x05050b });
document.body.prepend(app.view);

let playerId = null;
let game = { players: {}, orbs: [] };
let mouseAngle = 0;
let lastSentAngle = null;
let isBoosting = false;
let currentZoom = 1;
let particles = [];
let isConnected = false;

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
const textCache = new Map();

// Bouton start
document.getElementById('startBtn').addEventListener('click', () => {
  const name = document.getElementById('name').value.trim() || 'Anon';
  const skin = document.getElementById('skin').value;
  socket.emit('join', { name, skin });
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
});

document.getElementById('respawnBtn').addEventListener('click', () => {
  socket.emit('respawn');
  document.getElementById('dead').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
});

// Socket events
socket.on('init', (id) => {
  playerId = id;
  isConnected = true;
  sendMoveIfChanged(0);
});

socket.on('state', (g) => {
  Object.keys(game.players).forEach(id => {
    if (g.players[id] && game.players[id] && !game.players[id].dead && g.players[id].dead) {
      triggerExplosion(g.players[id].x, g.players[id].y, game.players[id].color);
    }
  });
  game = g;
  if (playerId && !game.players[playerId]) {
    socket.emit('join', {
      name: document.getElementById('name').value.trim() || 'Anon',
      skin: document.getElementById('skin').value
    });
  }
});

socket.on('dead', (data) => {
  document.getElementById('finalScore').innerText = Math.floor(data.score);
  document.getElementById('dead').style.display = 'block';
});

function triggerExplosion(x, y, color) {
  const pColor = parseInt(color);
  for (let i = 0; i < 30; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14,
      alpha: 1,
      size: 3 + Math.random() * 4,
      color: pColor
    });
  }
}

// Contrôles
let keys = { w:false, a:false, s:false, d:false, z:false, q:false, ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false };
let isTouchDevice = false;

function anyKeyActive() { return Object.values(keys).some(v => v); }

function calculateKeyAngle() {
  let x = 0, y = 0;
  if (keys.w || keys.z || keys.ArrowUp) y -= 1;
  if (keys.s || keys.ArrowDown) y += 1;
  if (keys.a || keys.q || keys.ArrowLeft) x -= 1;
  if (keys.d || keys.ArrowRight) x += 1;
  if (x !== 0 || y !== 0) {
    isTouchDevice = false;
    mouseAngle = Math.atan2(y, x);
    sendMoveIfChanged(mouseAngle);
  }
}

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

function sendMoveIfChanged(angle) {
  if (!isConnected) return;
  if (lastSentAngle === null || Math.abs(angle - lastSentAngle) > 0.001) {
    lastSentAngle = angle;
    socket.emit('move', angle);
  }
}

// Tactile
let touchCount = 0, touchStartX = 0, touchStartY = 0;
window.addEventListener('touchstart', (e) => {
  isTouchDevice = true;
  touchCount = e.touches.length;
  if (touchCount === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  } else if (touchCount >= 2) {
    socket.emit('boost', true);
    isBoosting = true;
  }
}, {passive: true});
window.addEventListener('touchmove', (e) => {
  const newCount = e.touches.length;
  if (newCount !== touchCount) {
    touchCount = newCount;
    if (touchCount >= 2) { socket.emit('boost', true); isBoosting = true; }
    else { socket.emit('boost', false); isBoosting = false; }
  }
  if (touchCount === 1) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.hypot(dx, dy) > 5) {
      mouseAngle = Math.atan2(dy, dx);
      sendMoveIfChanged(mouseAngle);
    }
  }
}, {passive: true});
window.addEventListener('touchend', (e) => {
  touchCount = e.touches.length;
  if (touchCount < 2) { socket.emit('boost', false); isBoosting = false; }
  if (touchCount === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}, {passive: true});

// Souris
window.addEventListener('mousemove', (e) => {
  if (!isTouchDevice && !anyKeyActive()) {
    const angle = Math.atan2(e.clientY - window.innerHeight/2, e.clientX - window.innerWidth/2);
    mouseAngle = angle;
    sendMoveIfChanged(angle);
  }
});

// Envoi périodique
setInterval(() => {
  if (isConnected && playerId && game.players[playerId] && !game.players[playerId].dead) {
    if (lastSentAngle === null) {
      socket.emit('move', mouseAngle);
      lastSentAngle = mouseAngle;
    } else if (Math.abs(mouseAngle - lastSentAngle) > 0.001) {
      socket.emit('move', mouseAngle);
      lastSentAngle = mouseAngle;
    }
  }
}, 35);

// Minimap
const minimap = document.getElementById('minimap').getContext('2d');
document.getElementById('minimap').width = 130;
document.getElementById('minimap').height = 130;
let lastMinimapUpdate = 0;

// Boucle de rendu
app.ticker.add(() => {
  const now = Date.now();
  gameGraphics.clear();
  textContainer.removeChildren();

  // Particules
  gameGraphics.blendMode = PIXI.BLEND_MODES.ADD;
  particles.forEach((p, idx) => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.alpha -= 0.03;
    if (p.alpha <= 0) { particles.splice(idx, 1); return; }
    gameGraphics.beginFill(p.color, p.alpha);
    gameGraphics.drawCircle(p.x, p.y, p.size);
    gameGraphics.endFill();
  });
  gameGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;

  // Orbes
  game.orbs.forEach((orb) => {
    const color = parseInt(orb.color);
    const pulse = 1 + Math.sin(now * 0.007) * 0.1;
    gameGraphics.beginFill(color, 0.15);
    gameGraphics.drawCircle(orb.x, orb.y, orb.size * 3.5 * pulse);
    gameGraphics.endFill();
    gameGraphics.beginFill(color, 0.9);
    gameGraphics.drawCircle(orb.x, orb.y, orb.size);
    gameGraphics.endFill();
    gameGraphics.beginFill(0xFFFFFF, 0.9);
    gameGraphics.drawCircle(orb.x - orb.size*0.18, orb.y - orb.size*0.18, orb.size * 0.3);
    gameGraphics.endFill();
  });

  // Classement
  const sorted = Object.values(game.players).filter(p => !p.dead).sort((a,b) => b.score - a.score);
  const topPlayer = sorted[0] || null;

  // Rendu des joueurs
  sorted.forEach(p => {
    if (p.dead) return;
    const colors = SKINS[p.skin] || SKINS.cyan;

    if (p.boostActive && Math.random() < 0.3) {
      gameGraphics.blendMode = PIXI.BLEND_MODES.ADD;
      gameGraphics.beginFill(colors.body, 0.3);
      gameGraphics.drawCircle(p.x + (Math.random()-0.5)*12, p.y + (Math.random()-0.5)*12, p.size * 0.7);
      gameGraphics.endFill();
      gameGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    }

    for (let i = p.segments.length - 1; i >= 0; i--) {
      const seg = p.segments[i];
      const size = p.size * (1 - (i / Math.max(1, p.segments.length)) * 0.2);
      gameGraphics.beginFill(colors.glow, 0.18);
      gameGraphics.drawCircle(seg.x, seg.y, size * 1.3);
      gameGraphics.endFill();
      gameGraphics.beginFill(colors.body);
      gameGraphics.drawCircle(seg.x, seg.y, size);
      gameGraphics.endFill();
    }

    gameGraphics.beginFill(colors.glow, 0.3);
    gameGraphics.drawCircle(p.x, p.y, p.size * 1.35);
    gameGraphics.endFill();
    gameGraphics.beginFill(colors.body);
    gameGraphics.drawCircle(p.x, p.y, p.size);
    gameGraphics.endFill();

    const eye1 = p.angle + 0.48, eye2 = p.angle - 0.48;
    const ed = p.size * 0.5, es = p.size * 0.35;
    gameGraphics.beginFill(0xFFFFFF);
    gameGraphics.drawCircle(p.x + Math.cos(eye1)*ed, p.y + Math.sin(eye1)*ed, es);
    gameGraphics.drawCircle(p.x + Math.cos(eye2)*ed, p.y + Math.sin(eye2)*ed, es);
    gameGraphics.endFill();

    // Texte
    let textObj = textCache.get(p.id);
    if (!textObj) {
      textObj = {
        name: new PIXI.Text('', { fontSize: 12, fill: 0xffffff, stroke: 0x010103, strokeThickness: 3, fontFamily: 'Arial', fontWeight: 'bold' }),
        crown: new PIXI.Text('', { fontSize: 16, fontFamily: 'Arial' })
      };
      textCache.set(p.id, textObj);
      textContainer.addChild(textObj.name);
      textContainer.addChild(textObj.crown);
    }
    if (textObj.name.text !== p.name) textObj.name.text = p.name || '';
    textObj.name.x = p.x - textObj.name.width/2;
    textObj.name.y = p.y - p.size - 18;

    if (topPlayer && p.id === topPlayer.id) {
      const bounce = Math.sin(now * 0.008) * 4;
      textObj.crown.text = '👑';
      textObj.crown.x = p.x - textObj.crown.width/2;
      textObj.crown.y = p.y - p.size - 42 + bounce;
      textObj.crown.visible = true;
    } else {
      textObj.crown.visible = false;
    }

    if (p.id === playerId) {
      const targetZoom = Math.max(0.45, 1.1 - (p.size / 110));
      currentZoom += (targetZoom - currentZoom) * 0.05;
      world.scale.set(currentZoom);
      const tx = -p.x * currentZoom + window.innerWidth/2;
      const ty = -p.y * currentZoom + window.innerHeight/2;
      world.x += (tx - world.x) * 0.15;
      world.y += (ty - world.y) * 0.15;

      document.getElementById('score').innerText = Math.floor(p.score);
      document.getElementById('len').innerText = Math.floor(p.size);
      document.getElementById('rank').innerText = sorted.indexOf(p) + 1;
      document.getElementById('total').innerText = sorted.length;
      document.getElementById('speed').innerText = Math.round(p.speed);

      if (now - lastMinimapUpdate > 100) {
        lastMinimapUpdate = now;
        minimap.clearRect(0,0,130,130);
        minimap.fillStyle = 'rgba(8,8,16,0.7)';
        minimap.beginPath(); minimap.arc(65,65,65,0,7); minimap.fill();
        Object.values(game.players).forEach(pl => {
          if (pl.dead) return;
          minimap.fillStyle = pl.id === playerId ? '#00ffcc' : '#ff0055';
          minimap.beginPath();
          minimap.arc(65 + (pl.x-2500)/5000*115, 65 + (pl.y-2500)/5000*115, pl.id === playerId ? 4 : 2, 0, 7);
          minimap.fill();
        });
      }
    }
  });

  document.getElementById('leaders').innerHTML = sorted.slice(0,7).map((p,i) =>
    `<div style="color:${i===0?'#00ffcc':i===1?'#ff0055':'#b2b2cc'}; margin:4px 0; font-family: monospace;">#${i+1} ${p.name.substring(0,9).padEnd(10,'_')} [${Math.floor(p.score)}]</div>`
  ).join('');
});
