/* 一二布布 · 小熊日志 - 云端 WebSocket 后端
 * 仅处理实时消息，不托管静态文件
 */
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');

const PORT = process.env.PORT || 10000;

// ============ Web Push VAPID Keys ============
// 生產環境建議用固定 keys，可通過環境變量注入
let vapidKeys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  };
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  console.log('[VAPID] 已自动生成临时密钥（重启后会变）');
}

webpush.setVapidDetails(
  'mailto:contact@bubu.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ============ 数据结构 ============
const rooms = {};        // pairCode -> { clients: Set<ws>, subscriptions: [] }
const wsInfo = new Map(); // ws -> { roomCode, name, gender }

// ============ HTTP Server (health check) ============
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), wsClients: wss.clients.size, service: 'bubu-server' }));
    return;
  }
  if (req.url === '/api/vapid-public') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: vapidKeys.publicKey }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

// ============ WebSocket Server ============
// Render free tier 對 /ws 子路徑支持有問題，改用根路徑
const wss = new WebSocketServer({ server, path: '/' });

wss.on('connection', (ws) => {
  wsInfo.set(ws, { roomCode: null, name: '', gender: '' });

  // 心跳：防止雲端代理/負載均衡斷開空閒連線
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'join': {
        const info = wsInfo.get(ws);
        info.roomCode = msg.roomCode;
        info.name = msg.name || '';
        info.gender = msg.gender || '';

        if (!rooms[msg.roomCode]) rooms[msg.roomCode] = { clients: new Set(), subscriptions: [] };
        rooms[msg.roomCode].clients.add(ws);

        broadcast(ws, msg.roomCode, {
          type: 'peer-joined',
          name: info.name,
          gender: info.gender,
        });

        const peers = [...rooms[msg.roomCode].clients].filter(c => c !== ws).map(c => wsInfo.get(c));
        ws.send(JSON.stringify({
          type: 'room-status',
          peerCount: peers.length,
          peers: peers.map(p => ({ name: p.name, gender: p.gender })),
        }));
        break;
      }

      case 'missyou': {
        const info = wsInfo.get(ws);
        if (!info.roomCode) return;
        const payload = {
          type: 'missyou-received',
          text: msg.text,
          img: msg.img,
          alt: msg.alt,
          senderName: info.name,
          senderGender: info.gender,
          timestamp: new Date().toISOString(),
        };
        broadcast(ws, info.roomCode, payload);

        const room = rooms[info.roomCode];
        if (room && room.subscriptions.length > 0) {
          room.subscriptions.forEach(sub => {
            webpush.sendNotification(sub, JSON.stringify({
              title: info.name + '想你啦',
              body: msg.text,
              icon: msg.img,
              data: { url: '/' }
            })).catch(err => console.log('[Push] 推送失败:', err.message));
          });
        }
        ws.send(JSON.stringify({ type: 'missyou-sent', ok: true }));
        break;
      }

      case 'subscribe-push': {
        const info = wsInfo.get(ws);
        if (!info.roomCode || !rooms[info.roomCode]) return;
        rooms[info.roomCode].subscriptions.push(msg.subscription);
        ws.send(JSON.stringify({ type: 'subscribed', ok: true }));
        break;
      }

      case 'status-sync': {
        const info = wsInfo.get(ws);
        if (!info.roomCode) return;
        broadcast(ws, info.roomCode, {
          type: 'status-update',
          mood: msg.mood,
          name: info.name,
        });
        break;
      }

      case 'profile-sync': {
        const info = wsInfo.get(ws);
        if (!info.roomCode) return;
        broadcast(ws, info.roomCode, {
          type: 'profile-sync',
          name: info.name,
          gender: info.gender,
        });
        break;
      }

      case 'message': {
        const info = wsInfo.get(ws);
        if (!info.roomCode) return;
        broadcast(ws, info.roomCode, {
          type: 'message-received',
          text: msg.text || '',
          images: msg.images || [],
          senderName: info.name || msg.senderName || 'TA',
          senderGender: info.gender,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'photo-swap': {
        const info = wsInfo.get(ws);
        if (!info.roomCode) return;
        broadcast(ws, info.roomCode, {
          type: 'photo-swap-received',
          swapId: msg.swapId,
          action: msg.action,
          photo: msg.photo || '',
          senderName: info.name || 'TA',
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    const info = wsInfo.get(ws);
    if (info && info.roomCode && rooms[info.roomCode]) {
      rooms[info.roomCode].clients.delete(ws);
      broadcast(ws, info.roomCode, { type: 'peer-left', name: info.name });
      if (rooms[info.roomCode].clients.size === 0) {
        delete rooms[info.roomCode];
      }
    }
    wsInfo.delete(ws);
  });
});

// 心跳檢測：每 30 秒 ping 一次，未響應則斷開
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeat);
});

// 广播给房间内除了自己以外的所有人
function broadcast(selfWs, roomCode, data) {
  const room = rooms[roomCode];
  if (!room) return;
  const msg = JSON.stringify(data);
  room.clients.forEach(client => {
    if (client !== selfWs && client.readyState === 1) {
      client.send(msg);
    }
  });
}

server.listen(PORT, () => {
  console.log(`一二布布云端服务器已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  WebSocket 路径: /`);
});
