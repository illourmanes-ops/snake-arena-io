const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 200;

let rooms = {
  default: {
    players: {},
    orbs: []
  }
};

let currentRoom = 'default';

for (let i = 0; i < ORB_COUNT; i++) {
  rooms[currentRoom].orbs.push({
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    size: 5 + Math.random() * 5,
    color: `hsl(${Math.random()*360},100%,50%)`
  });
}

io.on('connection', (socket) => {
  console.log('Connecté:', socket.id);

  socket.on('join', (data) => {
    rooms[currentRoom].players[socket.id] = {
      id: socket.id,
      x: MAP_SIZE/2,
      y: MAP_SIZE/2,
      angle: 0,
      segments: [],
      size: 12,
      score: 0,
      name: data.name? data.name.substring(0,12) : 'Anon',
      speed: 2.5,
      color: data.color || `hsl(${Math.random()*360},100%,50%)`
    };
    socket.join(currentRoom);
    socket.emit('state', rooms[currentRoom]);
  });

  socket.on('move', (angle) => {
    const p = rooms[currentRoom].players[socket.id];
    if (p) p.angle = angle;
  });

  socket.on('boost', (boosting) => {
    const p = rooms[currentRoom].players[socket.id];
    if (p) p.speed = boosting? 5 : 2.5;
  });

  socket.on('eatOrb', (i) => {
    const p = rooms[currentRoom].players[socket.id];
    const orbs = rooms[currentRoom].orbs;
    if (p && orbs[i]) {
      p.score += 5;
      p.size += 0.3;
      orbs[i] = {
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        size: 5 + Math.random() * 5,
        color: `hsl(${Math.random()*360},100%,50%)`
      };
    }
  });

  socket.on('died', (killerId) => {
    const victim = rooms[currentRoom].players[socket.id];
    const killer = rooms[currentRoom].players[killerId];
    if (victim && killer) {
      io.to(currentRoom).emit('killFeed', {
        killer: killer.name,
        victim: victim.name,
        killerColor: killer.color
      });
      io.to(socket.id).emit('dead', { score: victim.score });
      delete rooms[currentRoom].players[socket.id];
    }
  });

  socket.on('disconnect', () => {
    delete rooms[currentRoom].players[socket.id];
  });
});

setInterval(() => {
  const room = rooms[currentRoom];
  for (let id in room.players) {
    const p = room.players[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));
    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 3) p.segments.pop();
  }
  io.to(currentRoom).emit('state', room);
}, 33);

http.listen(PORT, () => console.log(`🐍 LIVE on ${PORT}`));
