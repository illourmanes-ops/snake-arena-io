const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 450; 
const BOT_COUNT = 16;

const CYBER_COLORS = ['0x00ffcc', '0xff0055', '0x00f3ff', '0xff8800', '0xcc00ff', '0xffff00'];
function getRandomColor() { return CYBER_COLORS[Math.floor(Math.random()*CYBER_COLORS.length)]; }

let game = { players: {}, orbs: [], bots: {} };

for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, size: 6 + Math.random() * 5, color: getRandomColor() });
}

const BOT_NAMES = ['K1NG_SNAKE', 'N3ON_BLAD3', 'V3CTOR_X', 'CYB3R_VIP3R', 'GL1TCH_MONST3R', 'N00B_HUNTER', 'PULSE_CRAWL3R'];
const SKIN_KEYS = ['cyan', 'magenta', 'purple', 'orange', 'green'];

for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = { id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28, segments: [], size: 16, score: 200, name: BOT_NAMES[i%BOT_NAMES.length], speed: 12, isBot: true, skin: SKIN_KEYS[i%SKIN_KEYS.length], color: getRandomColor(), dead: false };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    game.players[socket.id] = { id: socket.id, x: Math.random()*3000 + 1000, y: Math.random()*3000 + 1000, angle: 0, targetAngle: 0, segments: [], size: 16, score: 0, name: data.name?.substring(0,15) || 'Cyber_Anon', speed: 12, boost: false, boostActive: false, skin: data.skin || 'cyan', color: getRandomColor(), dead: false };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => {
    if (game.players[socket.id] && !game.players[socket.id].dead) game.players[socket.id].targetAngle = angle;
  });

  socket.on('boost', (b) => {
    if (game.players[socket.id]) game.players[socket.id].boost = b;
  });

  socket.on('disconnect', () => {
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.segments.forEach((seg, i) => { if (i % 2 === 0) game.orbs.push({ x: seg.x + (Math.random()-0.5)*15, y: seg.y + (Math.random()-0.5)*15, size: 8, color: p.color }); });
    }
    delete game.players[socket.id];
  });
});

// LOGIQUE PHYSIQUE ULTRA RAPIDE ET NERVEUSE (BOUCLE DE 28MS)
setInterval(() => {
  
  // 1. SYSTÈME MAGNETIQUE D'ABSORPTION DES ORBES
  for (let id in game.players) {
    const p = game.players[id]; if (p.dead) continue;

    game.orbs.forEach((o, idx) => {
      const dist = Math.hypot(p.x - o.x, p.y - o.y);
      
      // Rayon d'aspiration magnétique (Les orbes foncent vers le serpent)
      if (dist < p.size * 3.5) {
        o.x += (p.x - o.x) * 0.28;
        o.y += (p.y - o.y) * 0.28;
      }
      
      // Rayon de contact réel pour manger
      if (dist < p.size + o.size + 8) {
        p.score += 20; // Récompense augmentée
        p.size += 0.3;  // Croissance nerveuse et visible
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    });
  }

  // 2. DÉPLACEMENT DES JOUEURS HUMAINS (AGILITÉ MAXIMUM)
  for (let id in game.players) {
    const p = game.players[id]; if (p.dead) continue;

    if (p.boost && p.score > 40) {
      p.speed = 22; // Véritable accélération fulgurante
      p.score -= 0.8;
      p.size = Math.max(16, p.size - 0.025);
      p.boostActive = true;
    } else {
      p.speed = 12.5; // Vitesse de croisière rapide et rythmée
      p.boostActive = false;
    }

    // Calcul de l'angle fluide haute sensibilité
    let angleDiff = p.targetAngle - p.angle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    p.angle += angleDiff * 0.26; // Virages extrêmement dynamiques

    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));

    manageSegments(p);
  }

  // 3. IA ENNEMIE AVANCÉE (Les BOTS cherchent à couper la route)
  for (let id in game.bots) {
    const b = game.bots[id];
    
    if(Math.random() < 0.05 && game.orbs.length > 0) {
      let target = game.orbs[Math.floor(Math.random()*game.orbs.length)];
      b.targetAngle = Math.atan2(target.y - b.y, target.x - b.x);
    }
    
    let diff = b.targetAngle - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * 0.22;

    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    
    game.orbs.forEach((o, idx) => {
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size + 10) {
        b.score += 15; b.size += 0.25;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*5, color: getRandomColor() };
      }
    });
    manageSegments(b);
  }

  // 4. MODULE DE COLLISION AVANCÉ (AVEC EXPLOSION PROPRE)
  const all = {...game.players, ...game.bots};
  for (let id1 in all) {
    const p1 = all[id1]; if (p1.dead) continue;
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2]; if (p2.dead) continue;

      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < p1.size + p2.size + 300) { // Large pré-calcul de zone
        for (let seg of p2.segments) {
          if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.88) {
            
            // On sème des orbes riches sur le lieu du crash
            p1.segments.forEach((s, idx) => { 
              if (idx % 2 === 0) game.orbs.push({ x: s.x + (Math.random()-0.5)*20, y: s.y + (Math.random()-0.5)*20, size: 8 + Math.random()*4, color: p1.color }); 
            });

            if (p1.isBot) { 
              p2.score += 100; p2.size += 1.5; // Récompense royale pour le tueur
              delete game.bots[id1]; respawnBot(id1); 
            } else { 
              p1.dead = true; io.to(id1).emit('dead', { score: p1.score }); 
            }
            return;
          }
        }
      }
    }
  }

  // Nettoyage et envoi global du paquet
  const activePlayers = {};
  for(let id in game.players) activePlayers[id] = game.players[id];
  for(let id in game.bots) activePlayers[id] = game.bots[id];
  io.emit('state', { players: activePlayers, orbs: game.orbs });
}, 28);

function respawnBot(id) {
  game.bots[id] = { id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28, segments: [], size: 16, score: 200, name: BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)], speed: 12, isBot: true, skin: SKIN_KEYS[Math.floor(Math.random()*SKIN_KEYS.length)], color: getRandomColor(), dead: false };
}

function manageSegments(p) {
  if (p.segments.length === 0) p.segments.unshift({x: p.x, y: p.y});
  const lastSeg = p.segments[0];
  const dist = Math.hypot(p.x - lastSeg.x, p.y - lastSeg.y);
  if (dist > p.size * 0.28) p.segments.unshift({x: p.x, y: p.y});
  const maxSegments = Math.floor(18 + (p.score * 0.11));
  while (p.segments.length > maxSegments) p.segments.pop();
}

http.listen(PORT, () => console.log('🚀 CONFIGURATION ÉLITE OPÉRATIONNELLE SUR LE PORT ' + PORT));
