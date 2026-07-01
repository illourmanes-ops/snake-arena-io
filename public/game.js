// Connexion au serveur
const socket = io("https://snake-arena-io.onrender.com", {
  transports: ['websocket', 'polling'],
  upgrade: true
});

// Variables globales
let playerId = null;
let game = { players: {}, orbs: [] };
let mouseAngle = 0;
let lastSentAngle = null;
let isBoosting = false;
let currentZoom = 1;
let particles = [];
let isConnected = false;
let joinAttempts = 0;

// Position locale du joueur (pour la caméra)
let localPos = { x: 2500, y: 2500 }; // position par défaut au centre

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

// Gestion du menu
socket.on('connect', () => {
  console.log("✅ Connecté au serveur");
  menu.style.display = 'flex';
});
socket.on('connect_error', (err) => {
  console.error("❌ Erreur de connexion:", err);
  menu.style.display = 'flex';
});

// Erreurs fatales
window.addEventListener('error', (e) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff0055;color:#fff;padding:12px;font-family:monospace;z-index:9999;';
  box.textContent = 'Erreur: ' + e.message;
  document.body.appendChild(box);
  console.error(e);
});

// PIXI
let app = new PIXI.Application({ resizeTo: window, antialias: true, backgroundColor: 0x05050b });
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
startBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Anon';
  const skin = skinInput.value;
  console.log(`📤 Envoi de join avec nom=${name}, skin=${skin}`);
  socket.emit('join', { name, skin });
  menu.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
  document.getElementById('score').innerText = '…';
});

// Respawn
respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
  deadScreen.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('length').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';
});

// Socket events
socket.on('init', (id) => {
  console.log(`🆔 ID reçu du serveur: ${id}`);
  playerId = id;
  isConnected = true;
  sendMoveIfChanged(0.3);
  joinAttempts = 0;
});

socket.on('state', (g) => {
  // Détection des morts
  Object.keys(game.players).forEach(id => {
    if (g.players[id] && game.players[id] && !game.players[id].dead && g.players[id].dead) {
      triggerExplosion(g.players[id].x, g.players[id].y, game.players[id].color);
    }
  });
  game = g;

  // Mettre à jour la position locale si le joueur existe
  if (playerId && game.players[playerId]) {
    const p = game.players[playerId];
    localPos.x = p.x;
    localPos.y = p.y;
    if (!p.dead) {
      scoreEl.innerText = Math.floor(p.score);
    }
  } else if (playerId) {
    // Le joueur local n'est pas dans le state, rejoin
    console.warn(`⚠️ Joueur local ${playerId} absent, rejoin...`);
    if (joinAttempts < 5) {
      joinAttempts++;
      setTimeout(() => {
        socket.emit('join', {
          name: nameInput.value.trim() || 'Anon',
          skin: skinInput.value
        });
      }, 300);
    }
  }
});

socket.on('dead', (data) => {
  console.log(`💀 Mort, score: ${data.score}`);
  finalScoreEl.innerText = Math.floor(data.score);
  deadScreen.style.display = 'block';
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

// --- Contrôles clavier ---
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
  if (!isConnected || !playerId) {
    mouseAngle = angle;
    return;
  }
  if (lastSentAngle === null || Math.abs(angle - lastSentAngle) > 0.001) {
    lastSentAngle = angle;
    socket.emit('move', angle);
  }
}

// --- Joystick tactile ---
const joystickZone = document.getElementById('joystickZone');
const joystickKnob = document.getElementById('joystickKnob');
let joystickActive = false;
let joystickCenterX = 0, joystickCenterY = 0;
const joystickRadius = 50;

function setupJoystick() {
  const rect = joystickZone.getBoundingClientRect();
  joystickCenterX = rect.left + rect.width/2;
  joystickCenterY = rect.top + rect.height/2;
}
setTimeout(setupJoystick, 100);
window.addEventListener('resize', setupJoystick);

joystickZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isTouchDevice = true;
  const touch = e.touches[0];
  handleJoystickMove(touch.clientX, touch.clientY);
  joystickActive = true;
}, {passive: false});

joystickZone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleJoystickMove(touch.clientX, touch.clientY);
}, {passive: false});

joystickZone.addEventListener('touchend', (e) => {
  e.preventDefault();
  joystickActive = false;
  joystickKnob.style.transform = 'translate(-50%, -50%)';
}, {passive: false});

function handleJoystickMove(clientX, clientY) {
  const dx = clientX - joystickCenterX;
  const dy = clientY - joystickCenterY;
  const dist = Math.hypot(dx, dy);
  const maxDist = joystickRadius;
  let clampedX = dx, clampedY = dy;
  if (dist > maxDist) {
    clampedX = (dx / dist) * maxDist;
    clampedY = (dy / dist) * maxDist;
  }
  joystickKnob.style.transform = `translate(${-50 + (clampedX / joystickRadius) * 50}%, ${-50 + (clampedY / joystickRadius) * 50}%)`;
  if (dist > 10) {
    const angle = Math.atan2(dy, dx);
    mouseAngle = angle;
    sendMoveIfChanged(angle);
  }
}

// --- Souris ---
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
const minimap = minimapCanvas.getContext('2d');
minimapCanvas.width = 130;
minimapCanvas.height = 130;
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
    const isLocal = (p.id === playerId);

    // Effet boost
    if (p.boostActive && Math.random() < 0.3) {
      gameGraphics.blendMode = PIXI.BLEND_MODES.ADD;
      gameGraphics.beginFill(colors.body, 0.3);
      gameGraphics.drawCircle(p.x + (Math.random()-0.5)*12, p.y + (Math.random()-0.5)*12, p.size * 0.7);
      gameGraphics.endFill();
      gameGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    }

    // Segments
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

    // Corps principal
    if (isLocal) {
      gameGraphics.beginFill(0xffffff, 0.4);
      gameGraphics.drawCircle(p.x, p.y, p.size * 1.6);
      gameGraphics.endFill();
    }
    gameGraphics.beginFill(colors.glow, 0.3);
    gameGraphics.drawCircle(p.x, p.y, p.size * 1.35);
    gameGraphics.endFill();
    gameGraphics.beginFill(colors.body);
    gameGraphics.drawCircle(p.x, p.y, p.size);
    gameGraphics.endFill();

    // Yeux
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

    // Mise à jour du HUD pour le local
    if (isLocal) {
      scoreEl.innerText = Math.floor(p.score);
      lenEl.innerText = Math.floor(p.size);
      rankEl.innerText = sorted.indexOf(p) + 1;
      totalEl.innerText = sorted.length;
      speedEl.innerText = Math.round(p.speed);
    }
  });

  // === GESTION DE LA CAMÉRA ===
  // Utiliser localPos (mis à jour dans le state) ou la position du joueur local si présent
  let targetX = localPos.x;
  let targetY = localPos.y;
  // Si le joueur local est dans le state, on prend sa position
  if (playerId && game.players[playerId]) {
    const p = game.players[playerId];
    if (!p.dead) {
      targetX = p.x;
      targetY = p.y;
      // On met à jour localPos pour la prochaine fois
      localPos.x = p.x;
      localPos.y = p.y;
    }
  }

  // Calcul du zoom
  let targetZoom = 1;
  if (playerId && game.players[playerId]) {
    const p = game.players[playerId];
    targetZoom = Math.max(0.45, 1.1 - (p.size / 110));
  }
  currentZoom += (targetZoom - currentZoom) * 0.05;
  world.scale.set(currentZoom);

  // Calcul de la position de la caméra
  const desiredX = -targetX * currentZoom + window.innerWidth / 2;
  const desiredY = -targetY * currentZoom + window.innerHeight / 2;
  world.x += (desiredX - world.x) * 0.15;
  world.y += (desiredY - world.y) * 0.15;

  // Minimap (mise à jour périodique)
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

  // Leaderboard
  leadersEl.innerHTML = sorted.slice(0,7).map((p,i) =>
    `<div style="color:${i===0?'#00ffcc':i===1?'#ff0055':'#b2b2cc'}; margin:4px 0; font-family: monospace;">#${i+1} ${p.name.substring(0,9).padEnd(10,'_')} [${Math.floor(p.score)}]</div>`
  ).join('');
});
