const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 400;
const MAX_ORBS = ORB_COUNT * 2; // plafond pour éviter l'accumulation infinie
const BOT_COUNT = 15;
const DEAD_PLAYER_TTL = 5000; // ms avant suppression d'un joueur mort du state

const CYBER_COLORS = ['0x00ffcc', '0xff0055', '0x00f3ff', '0xff8800', '0xcc00ff', '0xffff00'];
function getRandomColor() { return CYBER_COLORS[Math.floor(Math.random()*CYBER_COLORS.length)]; }

let game = { players: {}, orbs: [], bots: {} };

for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 6 + Math.random() * 5, color: getRandomColor() });
}

const BOT_NAMES = ['K1NG_SNAKE', 'N3ON_BLAD3', 'V3CTOR_X', 'CYB3R_VIP3R', 'GL1TCH_MONST3R', 'PULSE_CRAWL3R'];
const SKIN_KEYS = ['cyan', 'magenta', 'purple', 'orange', 'green'];

for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = { id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28, segments: [], size: 16, score: 200, name: BOT_NAMES[i%BOT_NAMES.length], speed: 11.5, isBot: true, skin: SKIN_KEYS[i%SKIN_KEYS.length], color: getRandomColor(), dead: false };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    // Nettoyage complet d'une ancienne session existante pour éviter le bug de taille 0
    game.players[socket.id] = { id: socket.id, x: Math.random()*3000 + 1000, y: Math.random()*3000 + 1000, angle: 0, targetAngle: 0, segments: [], size: 16, score: 150, name: data.name?.substring(0,15) || 'Cyber_Anon', speed: 12, boost: false, boostActive: false, skin: data.skin || 'cyan', color: getRandomColor(), dead: false, deadSince: null };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => {
    if (game.players[socket.id] && !game.players[socket.id].dead) {
      game.players[socket.id].targetAngle = angle;
    }
  });

  socket.on('boost', (b) => {
    if (game.players[socket.id] && !game.players[socket.id].dead) {
      game.players[socket.id].boost = b;
    }
  });

  socket.on('disconnect', () => {
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.segments.forEach((seg, i) => { if (i % 2 === 0) game.orbs.push({ x: seg.x, y: seg.y, size: 8, color: p.color }); });
    }
    delete game.players[socket.id];
  });
});

// BOUCLE COEUR RECALIBRÉE À 30MS POUR ÉVITER LES SAUTS DE TICK
setInterval(() => {

  // ABSORPTION ET MAGNETISME DES ALIMENTS
  for (let id in game.players) {
    const p = game.players[id]; if (p.dead) continue;
    game.orbs.forEach((o, idx) => {
      const dist = Math.hypot(p.x - o.x, p.y - o.y);
      if (dist < p.size * 3.2) { // Effet d'aspiration magnétique fluide
        o.x += (p.x - o.x) * 0.25; o.y += (p.y - o.y) * 0.25;
      }
      if (dist < p.size + o.size + 6) {
        p.score += 25; p.size += 0.35; // Grandit de façon stable
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    });
  }

  // DEPLACEMENT DES SESSIONS HUMAINES
  for (let id in game.players) {
    const p = game.players[id]; if (p.dead) continue;

    if (p.boost && p.score > 50) {
      p.speed = 21; p.score -= 0.7; p.size = Math.max(16, p.size - 0.02); p.boostActive = true;
    } else {
      p.speed = 12.5; p.boostActive = false;
    }

    let angleDiff = p.targetAngle - p.angle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    p.angle += angleDiff * 0.25;

    p.x += Math.cos(p.angle) * p.speed; p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    manageSegments(p);
  }

  // LOGIQUE TRAJECTOIRE BOTS — IA améliorée : évitement des bords, ciblage intelligent,
  // fuite face à un adversaire plus gros, chasse d'un adversaire plus petit à proximité
  const BOT_VIEW_RANGE = 500;
  const BOT_EDGE_MARGIN = 300;
  const allEntities = {...game.players, ...game.bots};

  for (let id in game.bots) {
    const b = game.bots[id];
    let overridden = false;

    // 1. Priorité absolue : fuir un adversaire nettement plus gros à proximité
    for (let oid in allEntities) {
      if (oid === id) continue;
      const o = allEntities[oid]; if (o.dead) continue;
      const dist = Math.hypot(b.x - o.x, b.y - o.y);
      if (dist < BOT_VIEW_RANGE && o.size > b.size * 1.25) {
        b.targetAngle = Math.atan2(b.y - o.y, b.x - o.x); // direction opposée
        overridden = true;
        break;
      }
    }

    // 2. Sinon, chasser un adversaire plus petit à proximité (comportement agressif)
    if (!overridden) {
      for (let oid in allEntities) {
        if (oid === id) continue;
        const o = allEntities[oid]; if (o.dead) continue;
        const dist = Math.hypot(b.x - o.x, b.y - o.y);
        if (dist < BOT_VIEW_RANGE * 0.6 && b.size > o.size * 1.3 && Math.random() < 0.5) {
          b.targetAngle = Math.atan2(o.y - b.y, o.x - b.x);
          overridden = true;
          break;
        }
      }
    }

    // 3. Sinon, viser l'orbe le plus proche plutôt qu'un orbe aléatoire
    if (!overridden && Math.random() < 0.06 && game.orbs.length > 0) {
      let nearest = null, nearestDist = Infinity;
      for (let i = 0; i < game.orbs.length; i += 4) { // échantillonnage pour rester léger en perf
        const o = game.orbs[i];
        const d = Math.hypot(b.x - o.x, b.y - o.y);
        if (d < nearestDist) { nearestDist = d; nearest = o; }
      }
      if (nearest) b.targetAngle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
    }

    // 4. Évitement des bords de map : force la direction vers le centre si trop proche du bord
    if (b.x < BOT_EDGE_MARGIN) b.targetAngle = 0;
    else if (b.x > MAP_SIZE - BOT_EDGE_MARGIN) b.targetAngle = Math.PI;
    if (b.y < BOT_EDGE_MARGIN) b.targetAngle = Math.PI / 2;
    else if (b.y > MAP_SIZE - BOT_EDGE_MARGIN) b.targetAngle = -Math.PI / 2;

    let diff = b.targetAngle - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * 0.22;
    b.x += Math.cos(b.angle) * b.speed; b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));

    game.orbs.forEach((o, idx) => {
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size + 8) {
        b.score += 15; b.size += 0.25;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    });
    manageSegments(b);
  }

  // ARBITRAGE GESTION DES COLLISIONS
  // FIX: on collecte les morts au lieu de "return" en plein milieu du tick,
  // ce qui coupait le reste de la boucle (déplacements + emit state) dès la 1ère collision.
  const all = {...game.players, ...game.bots};
  const toKill = [];
  for (let id1 in all) {
    const p1 = all[id1]; if (p1.dead) continue;
    let killed = false;
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2]; if (p2.dead) continue;

      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.size + p2.size + 150) {
        for (let seg of p2.segments) {
          if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.85) {
            toKill.push(id1);
            killed = true;
            break;
          }
        }
      }
      if (killed) break;
    }
  }

  toKill.forEach(id1 => {
    const p1 = all[id1];
    if (!p1 || p1.dead) return; // déjà traité dans ce même tick
    p1.segments.forEach((s, idx) => {
      if (idx % 2 === 0) game.orbs.push({ x: s.x + (Math.random()-0.5)*15, y: s.y + (Math.random()-0.5)*15, size: 8, color: p1.color });
    });
    if (p1.isBot) {
      delete game.bots[id1];
      respawnBot(id1);
    } else {
      p1.dead = true;
      p1.deadSince = Date.now();
      io.to(id1).emit('dead', { score: p1.score });
    }
  });

  // FIX: nettoyage des joueurs morts restés en mémoire (client qui ne relance pas de partie)
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead && p.deadSince && Date.now() - p.deadSince > DEAD_PLAYER_TTL) {
      delete game.players[id];
    }
  }

  // FIX: plafond sur le nombre d'orbes pour éviter que le tableau grossisse indéfiniment
  if (game.orbs.length > MAX_ORBS) {
    game.orbs.splice(0, game.orbs.length - MAX_ORBS);
  }

  const activePlayers = {};
  for(let id in game.players) activePlayers[id] = game.players[id];
  for(let id in game.bots) activePlayers[id] = game.bots[id];
  io.emit('state', { players: activePlayers, orbs: game.orbs });
}, 30);

function respawnBot(id) {
  game.bots[id] = { id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28, segments: [], size: 16, score: 200, name: BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)], speed: 11.5, isBot: true, skin: SKIN_KEYS[Math.floor(Math.random()*SKIN_KEYS.length)], color: getRandomColor(), dead: false };
}

function manageSegments(p) {
  if (p.segments.length === 0) p.segments.unshift({x: p.x, y: p.y});
  const lastSeg = p.segments[0];
  if (Math.hypot(p.x - lastSeg.x, p.y - lastSeg.y) > p.size * 0.25) p.segments.unshift({x: p.x, y: p.y});
  const maxSegments = Math.floor(18 + (p.score * 0.1));
  while (p.segments.length > maxSegments) p.segments.pop();
}

http.listen(PORT, () => console.log('🚀 SERVEUR NETTOYÉ ET CORRIGÉ PORT ' + PORT));
