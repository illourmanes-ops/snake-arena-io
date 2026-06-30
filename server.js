const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
let game = { players: {}, orbs: [], bots: {} };

// 200 ORBES
for (let i = 0; i < 200; i++) {
  game.orbs.push({
    x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
    size: 6 + Math.random() * 6,
    color: `hsl(${Math.random()*360},100%,50%)`
  });
}

// 10 BOTS pour que ça ait l'air plein
const BOT_NAMES = ['Bot1','SnakeAI','Noob','ProGamer','CrazyBot','Hungry','Fast','Ghost','King','God'];
for (let i = 0; i < 10; i++) {
  const id = 'bot_' + i;
  game.bots[id] = {
    id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: 0,
    segments: [], size: 15 + Math.random()*20, score: Math.floor(Math.random()*500),
    name: BOT_NAMES[i], speed: 2 + Math.random(), isBot: true,
    color: `hsl(${Math.random()*360},100%,50%)`
  };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    game.players[socket.id] = {
      id: socket.id, x: 2500, y: 2500, angle: 0, segments: [],
      size: 15, score: 0, name: data.name || 'Anon', speed: 3,
      color: data.color || `hsl(${Math.random()*360},100%,50%)`,
      skin: data.skin || 'cyan'
    };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => { if (game.players[socket.id]) game.players[socket.id].angle = angle; });
  socket.on('boost', (b) => { if (game.players[socket.id]) game.players[socket.id].speed = b? 6 : 3; });

  socket.on('eatOrb', (i) => {
    const p = game.players[socket.id];
    if (p && game.orbs[i]) {
      p.score += 10; p.size += 0.3;
      game.orbs[i] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*6, color: `hsl(${Math.random()*360},100%,50%)` };
    }
  });

  socket.on('revive', () => {
    if (game.players[socket.id]) {
      game.players[socket.id].size += 10;
      game.players[socket.id].score += 300;
    }
  });

  socket.on('disconnect', () => delete game.players[socket.id]);
});

setInterval(() => {
  // IA des BOTS
  for (let id in game.bots) {
    const b = game.bots[id];
    // Cherche l'orbe le plus proche
    let closest = null, minDist = 99999;
    game.orbs.forEach((o, i) => {
      const d = Math.hypot(b.x - o.x, b.y - o.y);
      if (d < minDist) { minDist = d; closest = o; }
    });
    if (closest) b.angle = Math.atan2(closest.y - b.y, closest.x - b.x);
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));
    b.segments.unshift({x: b.x, y: b.y});
    if (b.segments.length > b.size * 2) b.segments.pop();
  }

  // Joueurs
  for (let id in game.players) {
    const p = game.players[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 2) p.segments.pop();
  }

  io.emit('state', { players: {...game.players,...game.bots}, orbs: game.orbs });
}, 50);

http.listen(PORT, () => console.log('LIVE'));
