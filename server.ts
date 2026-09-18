import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

dotenv.config();

interface AlarmRecord {
  id: number;
  title: string;
  time: string;
  enabled: boolean | number;
  created_at: string;
}

// In-memory data store replacing native sqlite3 for cloud container compatibility
let alarmsTable: AlarmRecord[] = [
  { id: 1, title: 'Morning Wakeup', time: '07:30', enabled: 1, created_at: new Date().toISOString() },
  { id: 2, title: 'Daily Standup', time: '09:30', enabled: 1, created_at: new Date().toISOString() }
];
let nextAlarmId = 3;

const db = {
  exec: (_sql: string) => {},
  prepare: (sql: string) => {
    return {
      all: (..._args: any[]) => {
        if (sql.includes('SELECT * FROM alarms')) {
          return [...alarmsTable]
            .map(a => ({ ...a, enabled: Boolean(a.enabled) }))
            .sort((a, b) => a.time.localeCompare(b.time));
        }
        return [];
      },
      get: (id: any) => {
        const numId = Number(id);
        const item = alarmsTable.find(a => a.id === numId);
        return item ? { ...item, enabled: Boolean(item.enabled) } : null;
      },
      run: (...args: any[]) => {
        if (sql.includes('INSERT INTO alarms')) {
          const [title, time] = args;
          const newAlarm: AlarmRecord = {
            id: nextAlarmId++,
            title,
            time,
            enabled: 1,
            created_at: new Date().toISOString()
          };
          alarmsTable.push(newAlarm);
          return { lastInsertRowid: newAlarm.id, changes: 1 };
        }
        if (sql.includes('UPDATE alarms SET enabled = ?')) {
          const [enabled, id] = args;
          const target = alarmsTable.find(a => a.id === Number(id));
          if (target) {
            target.enabled = enabled ? 1 : 0;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (sql.includes('UPDATE alarms SET time = ?')) {
          const [time, id] = args;
          const target = alarmsTable.find(a => a.id === Number(id));
          if (target) {
            target.time = time;
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (sql.includes('DELETE FROM alarms')) {
          const [id] = args;
          const countBefore = alarmsTable.length;
          alarmsTable = alarmsTable.filter(a => a.id !== Number(id));
          return { changes: countBefore - alarmsTable.length };
        }
        return { changes: 0, lastInsertRowid: 0 };
      }
    };
  }
};

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  const clients = new Map<string, { role: string; id: string }>();

  app.use(express.json());

  // Enable CORS for all incoming client requests
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
    const { enabled, time, title } = req.body;
    
    if (enabled !== undefined) {
      db.prepare('UPDATE alarms SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    }
    if (time !== undefined) {
      db.prepare('UPDATE alarms SET time = ? WHERE id = ?').run(time, id);
    }
    if (title !== undefined) {
      db.prepare('UPDATE alarms SET title = ? WHERE id = ?').run(title, id);
    }
    
    const alarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    broadcast({ type: 'ALARM_UPDATED', alarm });
    res.json(alarm || { success: true });
  });

  app.delete('/api/alarms/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM alarms WHERE id = ?').run(id);
    broadcast({ type: 'ALARM_DELETED', id: parseInt(id) });
    res.json({ success: true });
  });

  app.post('/api/alarms/:id/snooze', (req, res) => {
    const { id } = req.params;
    const snoozeMinutes = typeof req.body?.minutes === 'number' && req.body.minutes > 0 ? req.body.minutes : 5;
    const alarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id) as any;
    
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });

    const [h, m] = alarm.time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + snoozeMinutes, 0, 0);
    
    const newTime = date.toTimeString().slice(0, 5);
    db.prepare('UPDATE alarms SET time = ? WHERE id = ?').run(newTime, id);
    
    const updatedAlarm = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    broadcast({ type: 'ALARM_UPDATED', alarm: updatedAlarm });
    res.json({ ...updatedAlarm, snoozeMinutes });
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
