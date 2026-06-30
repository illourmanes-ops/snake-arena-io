const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
let game = { players: {}, orbs: [] };

for (let i = 0; i < 200; i++) {
  game.orbs.push({
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    size: 8,
    color: `hsl(${Math.random()*360},100%,50%)`
  });
}

io.on('connection', (socket) => {
  console.log('New player:', socket.id);

  socket.on('join', (data) => {
    game.players[socket.id] = {
      id: socket.id, x: 2500, y: 2500, angle: 0, segments: [],
      size: 15, score: 0, name: data.name || 'Anon', speed: 3,
      color: `hsl(${Math.random()*360},100%,50%)`
    };
    socket.emit('init', socket.id);
  });

  socket.on('move', (angle) => {
    if (game.players[socket.id]) game.players[socket.id].angle = angle;
  });

  socket.on('eatOrb', (i) => {
    const p = game.players[socket.id];
    if (p && game.orbs[i]) {
      p.score += 10;
      p.size += 0.5;
      game.orbs[i] = { x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, size: 8, color: `hsl(${Math.random()*360},100%,50%)` };
    }
  });

  socket.on('disconnect', () => delete game.players[socket.id]);
});

setInterval(() => {
  for (let id in game.players) {
    const p = game.players[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 2) p.segments.pop();
  }
  io.emit('state', game);
}, 50);

http.listen(PORT, () => console.log('LIVE'));
