const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 300;
const BOT_COUNT = 15;

let game = { players: {}, orbs: [], bots: {} };

for (let i = 0; i < ORB_COUNT; i++) {
  game.orbs.push({
    x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
    size: 6 + Math.random() * 6,
    color: `hsl(${Math.random()*360},100%,60%)`
  });
}

const BOT_NAMES = ['Bot','SnakeAI','Noob','Pro','King','Ghost','Venom','Fang','Viper','Cobra','Python','Anaconda','Mamba','Adder','Rattle'];
for (let i = 0; i < BOT_COUNT; i++) {
  const id = 'bot_' + i;
  game.bots[id] = {
    id, x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, angle: Math.random()*6.28,
    segments: [], size: 15 + Math.random()*25, score: Math.floor(Math.random()*1000),
    name: BOT_NAMES[i], speed: 2.5, isBot: true, skin: 'cyan',
    color: `hsl(${Math.random()*360},100%,50%)`, target: null
  };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    game.players[socket.id] = {
      id: socket.id, x: MAP_SIZE/2, y: MAP_SIZE/2, angle: 0, segments: [],
      size: 15, score: 0, name: data.name?.substring(0,12) || 'Anon',
      speed: 3, boost: false, skin: data.skin || 'cyan',
      color: `hsl(${Math.random()*360},100%,50%)`, dead: false
    };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => {
    if (game.players[socket.id] &&!game.players[socket.id].dead) game.players[socket.id].angle = angle;
  });

  socket.on('boost', (b) => {
    if (game.players[socket.id]) game.players[socket.id].boost = b;
  });

  socket.on('eatOrb', (i) => {
    const p = game.players[socket.id];
    if (p && game.orbs[i] &&!p.dead) {
      p.score += 10;
      p.size += 0.25;
      game.orbs[i] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*6, color: `hsl(${Math.random()*360},100%,60%)` };
    }
  });

  socket.on('revive', () => {
    const p = game.players[socket.id];
    if (p) {
      p.size += 15; p.score += 500; p.dead = false;
      p.x = MAP_SIZE/2; p.y = MAP_SIZE/2; p.segments = [];
    }
  });

  socket.on('disconnect', () => {
    const p = game.players[socket.id];
    if (p) {
      p.segments.forEach((seg, i) => {
        if (i % 3 === 0) game.orbs.push({ x: seg.x, y: seg.y, size: 8, color: p.color });
      });
      delete game.players[socket.id];
    }
  });
});

function checkCollision() {
  const all = {...game.players,...game.bots};
  for (let id1 in all) {
    const p1 = all[id1];
    if (p1.dead) continue;
    for (let id2 in all) {
      if (id1 === id2) continue;
      const p2 = all[id2];
      for (let seg of p2.segments) {
        if (Math.hypot(p1.x - seg.x, p1.y - seg.y) < p1.size * 0.8) {
          if (p1.isBot) {
            p2.score += Math.floor(p1.score * 0.5);
            p2.size += p1.size * 0.3;
            delete game.bots[id1];
          } else {
            p1.dead = true;
            io.to(id1).emit('dead', { score: p1.score, killer: p2.name });
            io.emit('killFeed', { killer: p2.name, victim: p1.name, killerColor: p2.color });
            p1.segments.forEach((seg, i) => {
              if (i % 2 === 0) game.orbs.push({ x: seg.x, y: seg.y, size: 10, color: p1.color });
            });
          }
          return;
        }
      }
    }
  }
}

setInterval(() => {
  for (let id in game.bots) {
    const b = game.bots[id];
    let target = null, minDist = 99999;
    game.orbs.forEach(o => {
      const d = Math.hypot(b.x - o.x, b.y - o.y);
      if (d < minDist) { minDist = d; target = o; }
    });
    if (target) {
      b.angle = Math.atan2(target.y - b.y, target.x - b.x);
      if (minDist < b.size + target.size) {
        b.score += 10; b.size += 0.25;
        const idx = game.orbs.indexOf(target);
        game.orbs[idx] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 6+Math.random()*6, color: `hsl(${Math.random()*360},100%,60%)` };
      }
    }
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.x = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.x));
    b.y = Math.max(b.size, Math.min(MAP_SIZE - b.size, b.y));
    b.segments.unshift({x: b.x, y: b.y});
    if (b.segments.length > b.size * 2.5) b.segments.pop();
  }

  for (let id in game.players) {
    const p = game.players[id];
    if (p.dead) continue;
    if (p.boost && p.score > 10) {
      p.speed = 6;
      p.score -= 0.3;
      p.size = Math.max(15, p.size - 0.01);
    } else {
      p.speed = 3;
    }
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 2.5) p.segments.pop();
  }

  checkCollision();
  io.emit('state', { players: {...game.players,...game.bots}, orbs: game.orbs });
}, 50);

http.listen(PORT, () => console.log('🔥 SNAKE ARENA V3 LIVE'));
