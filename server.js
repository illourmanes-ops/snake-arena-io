const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

// Servir les fichiers du dossier public
app.use(express.static('public'));

// ---- LOGIQUE DU JEU ----
const MAP_SIZE = 5000;
const ORB_COUNT = 400;
const MAX_ORBS = ORB_COUNT * 2;
const BOT_COUNT = 15;
const TICK_INTERVAL = 20;

const COLORS = ['0x00ffcc', '0xff0055', '0x00f3ff', '0xff8800', '0xcc00ff', '0xffff00'];
function randColor() { return COLORS[Math.floor(Math.random()*COLORS.length)]; }

let game = { players: {}, orbs: [], bots: {} };

// Orbes
for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    size: 6 + Math.random() * 5,
    color: randColor()
  });
}

// Bots
const BOT_NAMES = ['K1NG_SNAKE', 'N3ON_BLAD3', 'V3CTOR_X', 'CYB3R_VIP3R', 'GL1TCH_MONST3R', 'PULSE_CRAWL3R'];
const SKIN_KEYS = ['cyan', 'magenta', 'purple', 'orange', 'green'];

function createBot(id) {
  return {
    id,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: Math.random() * 6.28,
    targetAngle: Math.random() * 6.28,
    segments: [],
    size: 16,
    score: 200,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    speed: 20,
    isBot: true,
    skin: SKIN_KEYS[Math.floor(Math.random() * SKIN_KEYS.length)],
    color: randColor(),
    dead: false,
    deadSince: null
  };
}

for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = createBot(id);
}

// ---- SOCKET.IO ----
io.on('connection', (socket) => {
  console.log('🟢 Client connecté:', socket.id);

  socket.on('join', (data) => {
    let p = game.players[socket.id];
    if (p) {
      p.x = Math.random() * 3000 + 1000;
      p.y = Math.random() * 3000 + 1000;
      p.angle = 0.3;
      p.targetAngle = 0.3;
      p.segments = [];
      p.size = 16;
      p.score = 150;
      p.name = data.name?.substring(0,15) || 'Anon';
      p.skin = data.skin || 'cyan';
      p.color = randColor();
      p.dead = false;
      p.deadSince = null;
      p.boost = false;
      p.boostActive = false;
      p.speed = 30;
    } else {
      p = {
        id: socket.id,
        x: Math.random() * 3000 + 1000,
        y: Math.random() * 3000 + 1000,
        angle: 0.3,
        targetAngle: 0.3,
        segments: [],
        size: 16,
        score: 150,
        name: data.name?.substring(0,15) || 'Anon',
        speed: 30,
        boost: false,
        boostActive: false,
        skin: data.skin || 'cyan',
        color: randColor(),
        dead: false,
        deadSince: null
      };
      game.players[socket.id] = p;
    }
    socket.emit('init', socket.id);
  });

  socket.on('respawn', () => {
    const p = game.players[socket.id];
    if (p && p.dead) {
      p.dead = false;
      p.deadSince = null;
      p.x = Math.random() * 3000 + 1000;
      p.y = Math.random() * 3000 + 1000;
      p.angle = 0.3;
      p.targetAngle = 0.3;
      p.segments = [];
      p.size = 16;
      p.score = 150;
      p.boost = false;
      p.boostActive = false;
      p.speed = 30;
    }
  });

  socket.on('move', (angle) => {
    const p = game.players[socket.id];
    if (p && !p.dead) p.targetAngle = angle;
  });

  socket.on('boost', (b) => {
    const p = game.players[socket.id];
    if (p && !p.dead) p.boost = b;
  });

  socket.on('disconnect', () => {
    delete game.players[socket.id];
  });
});

// ---- BOUCLE DE JEU ----
setInterval(() => {
  // 1. Manger les orbes (humains)
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;
    for (let idx = game.orbs.length - 1; idx >= 0; idx--) {
      const o = game.orbs[idx];
      const dist = Math.hypot(p.x - o.x, p.y - o.y);
      if (dist < p.size + o.size + 6) {
        p.score += 25;
        p.size += 0.35;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: randColor() };
      } else if (dist < p.size * 3.2) {
        o.x += (p.x - o.x) * 0.25;
        o.y += (p.y - o.y) * 0.25;
      }
    }
  }

  // 2. Déplacement humains
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;
    if (p.boost && p.score > 50) {
      p.speed = 50;
      p.score -= 0.7;
      p.size = Math.max(16, p.size - 0.02);
      p.boostActive = true;
    } else {
      p.speed = 30;
      p.boostActive = false;
    }
    let diff = p.targetAngle - p.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.angle += diff * 0.25;
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    manageSegments(p);
  }

  // 3. Bots
  for (let id in game.bots) {
    const b = game.bots[id];
    if (Math.random() < 0.02) b.targetAngle = Math.random() * 6.28;
    let diff = b.targetAngle - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * 0.2;
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));
    for (let idx = game.orbs.length - 1; idx >= 0; idx--) {
      const o = game.orbs[idx];
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size + 8) {
        b.score += 15;
        b.size += 0.25;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: randColor() };
      }
    }
    manageSegments(b);
  }

  // 4. Collisions
  const toKill = [];
  const all = { ...game.players, ...game.bots };
  for (let id1 in all) {
    const p1 = all[id1];
    if (p1.dead) continue;
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2];
      if (p2.dead) continue;
      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.size + p2.size + 20) {
        for (let seg of p2.segments) {
          if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.8) {
            toKill.push(id1);
            break;
          }
        }
        if (toKill.includes(id1)) break;
      }
    }
  }

  toKill.forEach(id => {
    const p = all[id];
    if (!p || p.dead) return;
    p.segments.forEach((s, idx) => {
      if (idx % 2 === 0) game.orbs.push({ x: s.x + (Math.random()-0.5)*15, y: s.y + (Math.random()-0.5)*15, size: 8, color: p.color });
    });
    if (p.isBot) {
      delete game.bots[id];
      game.bots[id] = createBot(id);
    } else {
      p.dead = true;
      p.deadSince = Date.now();
      io.to(id).emit('dead', { score: p.score });
    }
  });

  // Nettoyage
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead && p.deadSince && Date.now() - p.deadSince > 5000) {
      delete game.players[id];
    }
  }
  if (game.orbs.length > MAX_ORBS) {
    game.orbs.splice(0, game.orbs.length - MAX_ORBS);
  }

  // Envoi
  const active = { ...game.players };
  for (let id in game.bots) active[id] = game.bots[id];
  io.emit('state', { players: active, orbs: game.orbs });
}, TICK_INTERVAL);

function manageSegments(p) {
  if (p.segments.length === 0) p.segments.push({x: p.x, y: p.y});
  const last = p.segments[p.segments.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > p.size * 0.25) {
    p.segments.push({x: p.x, y: p.y});
  }
  const maxSeg = Math.floor(18 + (p.score * 0.1));
  while (p.segments.length > maxSeg) p.segments.shift();
}

http.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));
