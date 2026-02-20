import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

dotenv.config();

const db = new Database('alarms.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    time TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  const clients = new Map<string, { role: string; id: string }>();

  app.use(express.json());

  // WebSocket broadcast helper
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(7);
    
    ws.on('message', (message) => {
      const data = JSON.parse(message.toString());
      if (data.type === 'IDENTIFY') {
        clients.set(clientId, { role: data.role, id: clientId });
        broadcast({ 
          type: 'PRESENCE_UPDATE', 
          count: wss.clients.size,
          devices: Array.from(clients.values())
        });
      }
      if (data.type === 'KICK_DEVICE' && clients.get(clientId)?.role === 'main') {
        broadcast({ type: 'KICKED', targetId: data.targetId });
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      broadcast({ 
        type: 'PRESENCE_UPDATE', 
        count: wss.clients.size,
        devices: Array.from(clients.values())
      });
    });

    // Send initial presence
    ws.send(JSON.stringify({ 
      type: 'PRESENCE_UPDATE', 
      count: wss.clients.size,
      devices: Array.from(clients.values())
    }));
  });

  // API Routes
  app.get('/api/alarms', (req, res) => {
    const alarms = db.prepare('SELECT * FROM alarms ORDER BY time ASC').all();
    res.json(alarms);
  });

  app.post('/api/alarms', (req, res) => {
    const { title, time } = req.body;
    const result = db.prepare('INSERT INTO alarms (title, time) VALUES (?, ?)').run(title, time);
    const alarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(result.lastInsertRowid);
    broadcast({ type: 'ALARM_CREATED', alarm });
    res.json(alarm);
  });

  app.patch('/api/alarms/:id', (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (enabled !== undefined) {
      db.prepare('UPDATE alarms SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    }
    
    const alarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    broadcast({ type: 'ALARM_UPDATED', alarm });
    res.json({ success: true });
  });

  app.delete('/api/alarms/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM alarms WHERE id = ?').run(id);
    broadcast({ type: 'ALARM_DELETED', id: parseInt(id) });
    res.json({ success: true });
  });

  app.post('/api/alarms/:id/snooze', (req, res) => {
    const { id } = req.params;
    const alarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id) as any;
    
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });

    const [h, m] = alarm.time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + 5, 0, 0);
    
    const newTime = date.toTimeString().slice(0, 5);
    db.prepare('UPDATE alarms SET time = ? WHERE id = ?').run(newTime, id);
    
    const updatedAlarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    broadcast({ type: 'ALARM_UPDATED', alarm: updatedAlarm });
    res.json(updatedAlarm);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
