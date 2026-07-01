const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 400;
const MAX_ORBS = ORB_COUNT * 2;
const BOT_COUNT = 15;
const DEAD_PLAYER_TTL = 5000;

const CYBER_COLORS = ['0x00ffcc', '0xff0055', '0x00f3ff', '0xff8800', '0xcc00ff', '0xffff00'];
function getRandomColor() { return CYBER_COLORS[Math.floor(Math.random()*CYBER_COLORS.length)]; }

let game = { players: {}, orbs: [], bots: {} };

// Création des orbes initiaux
for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 6 + Math.random() * 5, color: getRandomColor() });
}

const BOT_NAMES = ['K1NG_SNAKE', 'N3ON_BLAD3', 'V3CTOR_X', 'CYB3R_VIP3R', 'GL1TCH_MONST3R', 'PULSE_CRAWL3R'];
const SKIN_KEYS = ['cyan', 'magenta', 'purple', 'orange', 'green'];

function createBot(id) {
  return {
    id,
    x: Math.random()*MAP_SIZE,
    y: Math.random()*MAP_SIZE,
    angle: Math.random()*6.28,
    targetAngle: Math.random()*6.28,
    segments: [],
    size: 16,
    score: 200,
    name: BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)],
    speed: 11.5,
    isBot: true,
    skin: SKIN_KEYS[Math.floor(Math.random()*SKIN_KEYS.length)],
    color: getRandomColor(),
    dead: false
  };
}

for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = createBot(id);
}

// --- Gestion des connexions ---
io.on('connection', (socket) => {
  console.log('🟢 Nouvelle connexion:', socket.id);

  socket.on('join', (data) => {
    console.log(`📥 Join de ${socket.id} avec nom ${data.name}`);
    let player = game.players[socket.id];
    if (player) {
      // Réinitialisation
      player.x = Math.random()*3000 + 1000;
      player.y = Math.random()*3000 + 1000;
      player.angle = 0;
      player.targetAngle = 0;
      player.segments = [];
      player.size = 16;
      player.score = 150;
      player.name = data.name?.substring(0,15) || 'Cyber_Anon';
      player.skin = data.skin || 'cyan';
      player.color = getRandomColor();
      player.dead = false;
      player.deadSince = null;
      player.spawnTime = Date.now();
      player.boost = false;
      player.boostActive = false;
    } else {
      player = {
        id: socket.id,
        x: Math.random()*3000 + 1000,
        y: Math.random()*3000 + 1000,
        angle: 0,
        targetAngle: 0,
        segments: [],
        size: 16,
        score: 150,
        name: data.name?.substring(0,15) || 'Cyber_Anon',
        speed: 12,
        boost: false,
        boostActive: false,
        skin: data.skin || 'cyan',
        color: getRandomColor(),
        dead: false,
        deadSince: null,
        spawnTime: Date.now()
      };
      game.players[socket.id] = player;
    }
    socket.emit('init', socket.id);
    console.log(`✅ Joueur ${socket.id} initialisé`);
  });

  socket.on('respawn', () => {
    const p = game.players[socket.id];
    if (p && p.dead) {
      p.dead = false;
      p.deadSince = null;
      p.x = Math.random()*3000 + 1000;
      p.y = Math.random()*3000 + 1000;
      p.angle = 0;
      p.targetAngle = 0;
      p.segments = [];
      p.size = 16;
      p.score = 150;
      p.boost = false;
      p.boostActive = false;
      p.speed = 12;
      console.log(`♻️ Respawn de ${socket.id}`);
    }
  });

  socket.on('move', (angle) => {
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.targetAngle = angle;
    }
  });

  socket.on('boost', (b) => {
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.boost = b;
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Déconnexion:', socket.id);
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.segments.forEach((seg, i) => { if (i % 2 === 0) game.orbs.push({ x: seg.x, y: seg.y, size: 8, color: p.color }); });
    }
    delete game.players[socket.id];
  });
});

// --- Boucle de jeu (30ms) ---
setInterval(() => {
  // Absorption des orbes par les joueurs humains
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;
    for (let idx = game.orbs.length - 1; idx >= 0; idx--) {
      const o = game.orbs[idx];
      const dist = Math.hypot(p.x - o.x, p.y - o.y);
      if (dist < p.size * 3.2) {
        o.x += (p.x - o.x) * 0.25;
        o.y += (p.y - o.y) * 0.25;
      }
      if (dist < p.size + o.size + 6) {
        p.score += 25;
        p.size += 0.35;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    }
  }

  // Déplacement des joueurs humains
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;

    if (p.boost && p.score > 50) {
      p.speed = 21;
      p.score -= 0.7;
      p.size = Math.max(16, p.size - 0.02);
      p.boostActive = true;
    } else {
      p.speed = 12.5;
      p.boostActive = false;
    }

    let angleDiff = p.targetAngle - p.angle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    p.angle += angleDiff * 0.25;

    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    manageSegments(p);
  }

  // Bots
  const BOT_VIEW_RANGE = 500;
  const BOT_EDGE_MARGIN = 300;
  const allEntities = { ...game.players, ...game.bots };

  for (let id in game.bots) {
    const b = game.bots[id];
    let overridden = false;

    // Fuir les plus gros
    for (let oid in allEntities) {
      if (oid === id) continue;
      const o = allEntities[oid];
      if (o.dead) continue;
      const dist = Math.hypot(b.x - o.x, b.y - o.y);
      if (dist < BOT_VIEW_RANGE && o.size > b.size * 1.25) {
        b.targetAngle = Math.atan2(b.y - o.y, b.x - o.x);
        overridden = true;
        break;
      }
    }

    // Chasser les plus petits
    if (!overridden) {
      for (let oid in allEntities) {
        if (oid === id) continue;
        const o = allEntities[oid];
        if (o.dead) continue;
        const dist = Math.hypot(b.x - o.x, b.y - o.y);
        if (dist < BOT_VIEW_RANGE * 0.6 && b.size > o.size * 1.3 && Math.random() < 0.5) {
          b.targetAngle = Math.atan2(o.y - b.y, o.x - b.x);
          overridden = true;
          break;
        }
      }
    }

    // Cibler l'orbe le plus proche
    if (!overridden && Math.random() < 0.06 && game.orbs.length > 0) {
      let nearest = null, nearestDist = Infinity;
      for (let i = 0; i < game.orbs.length; i += 4) {
        const o = game.orbs[i];
        const d = Math.hypot(b.x - o.x, b.y - o.y);
        if (d < nearestDist) { nearestDist = d; nearest = o; }
      }
      if (nearest) b.targetAngle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
    }

    // Évitement des bords
    if (b.x < BOT_EDGE_MARGIN) b.targetAngle = 0;
    else if (b.x > MAP_SIZE - BOT_EDGE_MARGIN) b.targetAngle = Math.PI;
    if (b.y < BOT_EDGE_MARGIN) b.targetAngle = Math.PI/2;
    else if (b.y > MAP_SIZE - BOT_EDGE_MARGIN) b.targetAngle = -Math.PI/2;

    let diff = b.targetAngle - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * 0.22;
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));

    // Manger les orbes
    for (let idx = game.orbs.length - 1; idx >= 0; idx--) {
      const o = game.orbs[idx];
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size + 8) {
        b.score += 15;
        b.size += 0.25;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    }
    manageSegments(b);
  }

  // Collisions (marge réduite)
  const toKill = [];
  const all = { ...game.players, ...game.bots };
  for (let id1 in all) {
    const p1 = all[id1];
    if (p1.dead) continue;
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2];
      if (p2.dead) continue;
      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.size + p2.size + 30) {
        for (let seg of p2.segments) {
          if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.85) {
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
      console.log(`💀 Joueur ${id} est mort`);
    }
  });

  // Nettoyage des joueurs morts trop vieux
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead && p.deadSince && Date.now() - p.deadSince > DEAD_PLAYER_TTL) {
      delete game.players[id];
      console.log(`🧹 Joueur mort ${id} supprimé (timeout)`);
    }
  }

  // Limiter le nombre d'orbes
  if (game.orbs.length > MAX_ORBS) {
    game.orbs.splice(0, game.orbs.length - MAX_ORBS);
  }

  // Envoyer l'état à tous
  const activePlayers = {};
  for (let id in game.players) activePlayers[id] = game.players[id];
  for (let id in game.bots) activePlayers[id] = game.bots[id];
  io.emit('state', { players: activePlayers, orbs: game.orbs });
}, 30);

// --- Gestion des segments (optimisée) ---
function manageSegments(p) {
  if (p.segments.length === 0) p.segments.push({x: p.x, y: p.y});
  const lastSeg = p.segments[p.segments.length - 1];
  if (Math.hypot(p.x - lastSeg.x, p.y - lastSeg.y) > p.size * 0.25) {
    p.segments.push({x: p.x, y: p.y});
  }
  const maxSegments = Math.floor(18 + (p.score * 0.1));
  while (p.segments.length > maxSegments) p.segments.shift();
}

http.listen(PORT, () => console.log(`🚀 Serveur amélioré sur le port ${PORT}`));
