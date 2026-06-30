const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 350;
const BOT_COUNT = 15;

// COULEURS HEXADÉCIMALES PRÉGÉNÉRÉES POUR LES ORBES NÉON
const CYBER_COLORS = ['0x00ffcc', '0xff0055', '0x00f3ff', '0xff8800', '0xcc00ff', '0xffff00'];
function getRandomColor() { return CYBER_COLORS[Math.floor(Math.random()*CYBER_COLORS.length)]; }

let game = { players: {}, orbs: [], bots: {} };

// Génération initiale des orbes
for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({
    x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
    size: 5 + Math.random() * 5,
    color: getRandomColor()
  });
}

const BOT_NAMES = ['Cyber_Viper', 'Neon_Ghost', 'Glitch_Snake', 'Grid_Runner', 'Quantum', 'Vector', 'Pixel_Fang', 'Byte_Me', 'A_I_Cobra', 'Da_Bro', 'Proxy', 'Kernel', 'Daemon', 'Sync', 'Void'];
const SKIN_KEYS = ['cyan', 'magenta', 'purple', 'orange', 'green'];

for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = {
    id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28,
    segments: [], size: 15, score: 100,
    name: BOT_NAMES[i], speed: 7, isBot: true, skin: SKIN_KEYS[Math.floor(Math.random()*SKIN_KEYS.length)],
    color: getRandomColor(), dead: false
  };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    game.players[socket.id] = {
      id: socket.id, x: Math.random()*3000 + 1000, y: Math.random()*3000 + 1000, angle: 0, targetAngle: 0, segments: [],
      size: 15, score: 0, name: data.name?.substring(0,15) || 'Cyber_Anon',
      speed: 7, boost: false, skin: data.skin || 'cyan',
      color: getRandomColor(), dead: false
    };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => {
    // CORRECTION : On enregistre l'angle ciblé pour appliquer un virage fluide
    if (game.players[socket.id] && !game.players[socket.id].dead) {
      game.players[socket.id].targetAngle = angle;
    }
  });

  socket.on('boost', (b) => {
    if (game.players[socket.id]) game.players[socket.id].boost = b;
  });

  // CORRECTION SÉCURITÉ : La récolte d'orbe est maintenant validée aussi côté serveur (plus de triche possible)
  socket.on('eatOrb', (i) => {
    const p = game.players[socket.id];
    if (p && game.orbs[i] && !p.dead) {
      const dist = Math.hypot(p.x - game.orbs[i].x, p.y - game.orbs[i].y);
      if (dist < p.size + game.orbs[i].size + 10) { 
        p.score += 8;
        p.size += 0.16;
        game.orbs[i] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 5+Math.random()*5, color: getRandomColor() };
      }
    }
  });

  socket.on('disconnect', () => {
    const p = game.players[socket.id];
    if (p && !p.dead) {
      p.segments.forEach((seg, i) => {
        if (i % 3 === 0) game.orbs.push({ x: seg.x, y: seg.y, size: 8, color: p.color });
      });
    }
    delete game.players[socket.id];
  });
});

// LOGIQUE INTERNE DE COLLISION (AMÉLIORÉE)
function checkCollision() {
  const all = {...game.players, ...game.bots};
  for (let id1 in all) {
    const p1 = all[id1];
    if (p1.dead) continue;
    
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2];
      if (p2.dead) continue; // CORRECTION CRITIQUE : Les fantômes ne tuent plus !

      // On teste si la tête de p1 fonce dans le corps de p2
      for (let seg of p2.segments) {
        if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.85) {
          
          // Explosion en orbes de lumière
          p1.segments.forEach((s, idx) => {
            if (idx % 2 === 0) {
              game.orbs.push({ x: s.x + (Math.random()-0.5)*10, y: s.y + (Math.random()-0.5)*10, size: 7, color: p1.color });
            }
          });

          if (p1.isBot) {
            p2.score += 50; p2.size += 1;
            respawnBot(id1);
          } else {
            p1.dead = true;
            io.to(id1).emit('dead', { score: p1.score });
          }
          return;
        }
      }
    }
  }
}

function respawnBot(id) {
  game.bots[id] = {
    id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28, targetAngle: Math.random()*6.28,
    segments: [], size: 15, score: 100, name: BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)],
    speed: 7, isBot: true, skin: SKIN_KEYS[Math.floor(Math.random()*SKIN_KEYS.length)], color: getRandomColor(), dead: false
  };
}

// TIMING BOUCLE PRINCIPALE (50MS)
setInterval(() => {
  const all = {...game.players, ...game.bots};

  // 1. MISE À JOUR DES BOTS AI
  for (let id in game.bots) {
    const b = game.bots[id];
    if(Math.random() < 0.05) { // L'IA change de cible de temps en temps
      let target = game.orbs[Math.floor(Math.random()*game.orbs.length)];
      if(target) b.targetAngle = Math.atan2(target.y - b.y, target.x - b.x);
    }
    
    // Virage fluide pour le BOT
    let diff = b.targetAngle - b.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    b.angle += diff * 0.15;

    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));

    // Gestion de l'alimentation automatique des bots
    game.orbs.forEach((o, idx) => {
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size) {
        b.score += 8; b.size += 0.15;
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 5+Math.random()*5, color: getRandomColor() };
      }
    });

    // CORRECTION : Système d'empilement régulé à espacement fixe
    manageSegments(b);
  }

  // 2. MISE À JOUR DES JOUEURS HUMAINS
  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;

    if (p.boost && p.score > 20) {
      p.speed = 12;
      p.score -= 0.4;
      p.size = Math.max(15, p.size - 0.015);
    } else {
      p.speed = 6.5;
    }

    // CORRECTION CRITIQUE : Calcul du virage fluide (Inertie)
    let angleDiff = p.targetAngle - p.angle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff)); // Normalisation entre -PI et PI
    p.angle += angleDiff * 0.15; // Vitesse de rotation fluide

    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));

    // CORRECTION : Système d'empilement régulé à espacement fixe
    manageSegments(p);
  }

  checkCollision();
  
  // Tri et nettoyage pour ne pas envoyer de données inutiles
  const activePlayers = {};
  for(let id in game.players) if(!game.players[id].dead) activePlayers[id] = game.players[id];
  for(let id in game.bots) activePlayers[id] = game.bots[id];

  io.emit('state', { players: activePlayers, orbs: game.orbs });
}, 45);

// FONCTION MAÎTRESSE : CALCULE ET LIMITE L'ESPACEMENT DES ANNEAUX DU CORPS
function manageSegments(p) {
  if (p.segments.length === 0) {
    p.segments.unshift({x: p.x, y: p.y});
  }
  
  const lastSeg = p.segments[0];
  const dist = Math.hypot(p.x - lastSeg.x, p.y - lastSeg.y);
  const spacing = p.size * 0.35; // Espace parfait fixe entre chaque anneau

  if (dist > spacing) {
    p.segments.unshift({x: p.x, y: p.y});
  }

  // Limitation stricte de la queue selon le score réel
  const maxSegments = Math.floor(20 + (p.score * 0.15));
  while (p.segments.length > maxSegments) {
    p.segments.pop();
  }
}

http.listen(PORT, () => console.log('🔥 CYBER ARENA SERVEUR FINI ET FLUIDE SUR LE PORT ' + PORT));
