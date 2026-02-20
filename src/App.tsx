import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Bell, 
  BellOff, 
  Clock, 
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Smartphone,
  Link,
  LogOut,
  Users,
  Wifi,
  WifiOff,
  Coffee,
  QrCode,
  Volume2,
  VolumeX,
  Menu,
  X,
  Upload,
  Music,
  Play,
  Pause,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Alarm {
  id: number;
  title: string;
  time: string;
  enabled: boolean;
  created_at: string;
}

export default function App() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [newAlarmTitle, setNewAlarmTitle] = useState('');
  const [newAlarmTime, setNewAlarmTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMainDevice, setIsMainDevice] = useState(() => {
    return localStorage.getItem('sync_alarm_role') === 'main';
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectedCount, setConnectedCount] = useState(1);
  const [connectedDevices, setConnectedDevices] = useState<{ role: string; id: string }[]>([]);
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: number; title: string; message: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [triggeringAlarms, setTriggeringAlarms] = useState<Set<number>>(new Set());
  const [warningAlarms, setWarningAlarms] = useState<Set<number>>(new Set());
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [customSound, setCustomSound] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [pendingSync, setPendingSync] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<{ type: 'CREATE' | 'UPDATE' | 'DELETE'; data: any }[]>([]);
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load alarms from local storage on init as fallback
  useEffect(() => {
    const saved = localStorage.getItem('sync_alarms_local');
    if (saved) {
      setAlarms(JSON.parse(saved));
    }
  }, []);

  // Persist alarms to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('sync_alarms_local', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.loop = true;
    audioRef.current.onplay = () => setIsAudioPlaying(true);
    audioRef.current.onpause = () => setIsAudioPlaying(false);
    audioRef.current.onended = () => setIsAudioPlaying(false);
  }, []);

  const togglePreview = () => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Preview failed:", e));
    }
  };

  const handleSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const url = URL.createObjectURL(file);
      setCustomSound(url);
      if (audioRef.current) {
        audioRef.current.src = url;
      }
      addNotification(Date.now(), "Sound Updated", "Custom alarm sound loaded successfully.");
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('sync_alarm_role', isMainDevice ? 'main' : 'receiver');
  }, [isMainDevice]);

  useEffect(() => {
    fetchAlarms();
    connectWebSocket();
    
    const interval = setInterval(checkAlarms, 1000);
    return () => {
      clearInterval(interval);
      socketRef.current?.close();
    };
  }, []);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      setIsConnected(true);
      const id = Math.random().toString(36).substring(7);
      setMyClientId(id);
      socket.send(JSON.stringify({ type: 'IDENTIFY', role: isMainDevice ? 'main' : 'receiver', clientId: id }));
    };
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'PRESENCE_UPDATE':
          setConnectedCount(data.count);
          setConnectedDevices(data.devices || []);
          break;
        case 'KICKED':
          if (data.targetId === myClientId) {
            disconnect();
            addNotification(Date.now(), "Disconnected", "You have been removed by the administrator.");
            localStorage.removeItem('sync_alarm_role');
            setTimeout(() => window.location.reload(), 3000);
          }
          break;
        case 'ALARM_CREATED':
          setAlarms(prev => [...prev, data.alarm].sort((a, b) => a.time.localeCompare(b.time)));
          break;
        case 'ALARM_UPDATED':
          setAlarms(prev => prev.map(a => a.id === data.alarm.id ? data.alarm : a));
          break;
        case 'ALARM_DELETED':
          setAlarms(prev => prev.filter(a => a.id !== data.id));
          break;
      }
    };
    socket.onclose = () => {
      setIsConnected(false);
      if (socketRef.current === socket) {
        setTimeout(connectWebSocket, 3000);
      }
    };

    socketRef.current = socket;
  };

  const disconnect = () => {
    socketRef.current?.close();
    socketRef.current = null;
    setIsConnected(false);
  };

  useEffect(() => {
    if (isConnected) {
      syncWithServer();
    }
  }, [isConnected]);

  const syncWithServer = async () => {
    setPendingSync(true);
    try {
      // Process offline queue
      if (offlineQueue.length > 0) {
        for (const action of offlineQueue) {
          try {
            if (action.type === 'CREATE') {
              await fetch('/api/alarms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.data),
              });
            } else if (action.type === 'UPDATE') {
              await fetch(`/api/alarms/${action.data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: action.data.enabled }),
              });
            } else if (action.type === 'DELETE') {
              await fetch(`/api/alarms/${action.data.id}`, { method: 'DELETE' });
            }
          } catch (e) {
            console.error("Failed to sync individual action:", e);
          }
        }
        setOfflineQueue([]);
      }

      await fetchAlarms();
      addNotification(Date.now(), "Synced", "Connection restored. Alarms updated.");
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setPendingSync(false);
    }
  };

  const fetchAlarms = async () => {
    try {
      const res = await fetch('/api/alarms');
      const data = await res.json();
      setAlarms(data);
    } catch (err) {
      console.error('Failed to fetch alarms:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAlarms = () => {
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5); // HH:mm
    const newTriggering = new Set<number>();
    const newWarning = new Set<number>();

    alarms.forEach(alarm => {
      if (!alarm.enabled) return;

      const [alarmH, alarmM] = alarm.time.split(':').map(Number);
      const alarmDate = new Date();
      alarmDate.setHours(alarmH, alarmM, 0, 0);

      const diffMs = alarmDate.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // Triggering now
      if (currentTimeStr === alarm.time) {
        newTriggering.add(alarm.id);
      }
      
      // Warning (5 mins ahead)
      if (diffMins >= 0 && diffMins <= 5) {
        newWarning.add(alarm.id);
      }

      // Notify 5 minutes ahead
      if (diffMins === 5 && diffMs > 0 && diffMs < 301000) {
        addNotification(alarm.id, alarm.title, "Starting in 5 minutes!");
      }
      
      // Notify at alarm time
      if (currentTimeStr === alarm.time && now.getSeconds() === 0) {
        addNotification(alarm.id, alarm.title, "ALARM NOW!");
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(e => console.error("Audio play failed:", e));
          // Stop after 30 seconds or when snoozed
          setTimeout(() => {
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.currentTime = 0;
          }, 30000);
        }
      }
    });

    setTriggeringAlarms(newTriggering);
    setWarningAlarms(newWarning);
  };

  const addNotification = (id: number, title: string, message: string) => {
    const notificationId = Date.now() + id;
    if (notifications.some(n => n.title === title && n.message === message)) return;
    
    setNotifications(prev => [...prev, { id: notificationId, title, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }, 10000);
  };

  const addAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlarmTitle.trim() || !newAlarmTime) return;

    const tempId = Date.now();
    const newAlarm = { id: tempId, time: newAlarmTime, title: newAlarmTitle, enabled: true };

    // Optimistic update
    setAlarms(prev => [...prev, newAlarm].sort((a, b) => a.time.localeCompare(b.time)));
    setNewAlarmTitle('');
    setNewAlarmTime('');

    try {
      const res = await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newAlarm.title, time: newAlarm.time }),
      });
      if (!res.ok) throw new Error("Server error");
    } catch (err) {
      console.error('Offline mode: Alarm saved locally', err);
      setOfflineQueue(prev => [...prev, { type: 'CREATE', data: { title: newAlarm.title, time: newAlarm.time } }]);
      addNotification(tempId, "Offline Mode", "Alarm saved locally. Will sync when online.");
    }
  };

  const toggleAlarm = async (id: number, enabled: boolean) => {
    const newEnabled = !enabled;
    // Optimistic update
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: newEnabled } : a));

    try {
      const res = await fetch(`/api/alarms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (!res.ok) throw new Error("Server error");
    } catch (err) {
      console.error('Offline mode: Change saved locally', err);
      setOfflineQueue(prev => [...prev, { type: 'UPDATE', data: { id, enabled: newEnabled } }]);
    }
  };

  const deleteAlarm = async (id: number) => {
    // Optimistic update
    setAlarms(prev => prev.filter(a => a.id !== id));

    try {
      const res = await fetch(`/api/alarms/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Server error");
    } catch (err) {
      console.error('Offline mode: Deletion saved locally', err);
      setOfflineQueue(prev => [...prev, { type: 'DELETE', data: { id } }]);
    }
  };

  const snoozeAlarm = async (id: number) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      await fetch(`/api/alarms/${id}/snooze`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to snooze alarm:', err);
    }
  };

  const kickDevice = (targetId: string) => {
    if (socketRef.current && isMainDevice) {
      socketRef.current.send(JSON.stringify({ type: 'KICK_DEVICE', targetId }));
    }
  };

  const getCountdown = (alarmTime: string) => {
    const now = currentTime;
    const [h, m] = alarmTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    if (target < now) {
      target.setDate(target.getDate() + 1);
    }

    const diff = target.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const themeStyles = React.useMemo(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const lerpColor = (c1: string, c2: string, t: number) => {
      const parse = (c: string) => {
        if (c.startsWith('#')) {
          const r = parseInt(c.slice(1, 3), 16);
          const g = parseInt(c.slice(3, 5), 16);
          const b = parseInt(c.slice(5, 7), 16);
          const a = c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
          return [r, g, b, a];
        }
        if (c.startsWith('rgba')) {
          return c.match(/[\d.]+/g)!.map(Number);
        }
        return [0, 0, 0, 1];
      };
      const [r1, g1, b1, a1] = parse(c1);
      const [r2, g2, b2, a2] = parse(c2);
      const r = Math.round(lerp(r1, r2, t));
      const g = Math.round(lerp(g1, g2, t));
      const b = Math.round(lerp(b1, b2, t));
      const a = lerp(a1, a2, t);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    const keyframes = [
      { h: 0, bg: '#020617', text: '#f8fafc', accent: '#6366f1', card: 'rgba(15, 23, 42, 0.6)', secondary: 'rgba(148, 163, 184, 0.8)', button: '#4338ca' },
      { h: 5, bg: '#020617', text: '#f8fafc', accent: '#6366f1', card: 'rgba(15, 23, 42, 0.6)', secondary: 'rgba(148, 163, 184, 0.8)', button: '#4338ca' },
      { h: 7, bg: '#2e1065', text: '#faf5ff', accent: '#fb923c', card: 'rgba(88, 28, 135, 0.4)', secondary: 'rgba(216, 180, 254, 0.7)', button: '#c2410c' },
      { h: 10, bg: '#064e3b', text: '#ecfdf5', accent: '#10b981', card: 'rgba(6, 78, 59, 0.5)', secondary: 'rgba(110, 231, 183, 0.7)', button: '#059669' },
      { h: 16, bg: '#064e3b', text: '#ecfdf5', accent: '#10b981', card: 'rgba(6, 78, 59, 0.5)', secondary: 'rgba(110, 231, 183, 0.7)', button: '#059669' },
      { h: 19, bg: '#450a0a', text: '#fef2f2', accent: '#f59e0b', card: 'rgba(127, 29, 29, 0.4)', secondary: 'rgba(252, 165, 165, 0.7)', button: '#b91c1c' },
      { h: 21, bg: '#020617', text: '#f8fafc', accent: '#6366f1', card: 'rgba(15, 23, 42, 0.6)', secondary: 'rgba(148, 163, 184, 0.8)', button: '#4338ca' },
      { h: 24, bg: '#020617', text: '#f8fafc', accent: '#6366f1', card: 'rgba(15, 23, 42, 0.6)', secondary: 'rgba(148, 163, 184, 0.8)', button: '#4338ca' }
    ];

    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    const nextIdx = keyframes.findIndex(k => k.h > hour);
    const prevIdx = nextIdx - 1;
    const prev = keyframes[prevIdx];
    const next = keyframes[nextIdx];
    const t = (hour - prev.h) / (next.h - prev.h);

    return {
      bg: lerpColor(prev.bg, next.bg, t),
      text: lerpColor(prev.text, next.text, t),
      accent: lerpColor(prev.accent, next.accent, t),
      card: lerpColor(prev.card, next.card, t),
      secondary: lerpColor(prev.secondary, next.secondary, t),
      button: lerpColor(prev.button, next.button, t),
      header: lerpColor(prev.text, next.text, t),
      input: lerpColor(prev.bg, next.bg, 0.5),
      glass: 'backdrop-blur-xl border border-white/10'
    };
  }, [currentTime]);

  return (
    <div 
      className="min-h-screen p-4 md:p-8 font-sans selection:bg-indigo-500/30 transition-colors duration-1000"
      style={{ backgroundColor: themeStyles.bg, color: themeStyles.text }}
    >
      <div className="max-w-xl mx-auto">
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleSoundUpload} 
          accept="audio/*" 
          className="hidden" 
        />

        {/* Menu Overlay */}
        <AnimatePresence>
          {showMenu && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`fixed inset-0 z-[110] p-8 flex flex-col gap-6 ${themeStyles.glass}`}
              style={{ backgroundColor: themeStyles.bg }}
            >
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-2xl font-black tracking-tighter">Settings</h2>
                <button onClick={() => setShowMenu(false)} className="p-3 rounded-full hover:bg-white/10 active:scale-90 transition-all">
                  <X size={28} />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-6 opacity-40" style={{ color: themeStyles.text }}>Device Controls</p>
                
                <button 
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    if (soundEnabled && audioRef.current) {
                      audioRef.current.pause();
                      audioRef.current.currentTime = 0;
                    }
                  }}
                  className="w-full flex items-center justify-between p-5 rounded-[2rem] border border-white/5 transition-all hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </div>
                    <span className="font-bold text-sm">Alarm Sound</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/5" style={{ color: soundEnabled ? themeStyles.accent : themeStyles.text + '44' }}>
                    {soundEnabled ? 'Enabled' : 'Muted'}
                  </span>
                </button>

                <div 
                  className="w-full flex items-center justify-between p-5 rounded-[2rem] border border-white/5 transition-all cursor-pointer hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      <Music size={20} />
                    </div>
                    <span className="font-bold text-sm">Custom Sound</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); togglePreview(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: themeStyles.accent, border: `1px solid ${themeStyles.accent}33` }}
                    >
                      {isAudioPlaying ? <Pause size={12} /> : <Play size={12} />}
                      {isAudioPlaying ? 'Stop' : 'Preview'}
                    </button>
                    <div className="p-2 rounded-lg" style={{ color: themeStyles.accent }}>
                      <Upload size={18} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => { setShowConnectModal(true); setShowMenu(false); }}
                  className="w-full flex items-center justify-between p-5 rounded-[2rem] border border-white/5 transition-all hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      <Link size={20} />
                    </div>
                    <span className="font-bold text-sm">Connect Device</span>
                  </div>
                  <div className="p-2 rounded-lg" style={{ color: themeStyles.accent }}>
                    <QrCode size={18} />
                  </div>
                </button>

                <button 
                  onClick={() => { isConnected ? disconnect() : connectWebSocket(); }}
                  className="w-full flex items-center justify-between p-5 rounded-[2rem] border border-white/5 transition-all hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      {isConnected ? <WifiOff size={20} /> : <Wifi size={20} />}
                    </div>
                    <span className="font-bold text-sm">Connection</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/5" style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </button>

                <button 
                  onClick={() => setIsMainDevice(!isMainDevice)}
                  className="w-full flex items-center justify-between p-5 rounded-[2rem] border border-white/5 transition-all hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      {isMainDevice ? <ShieldCheck size={20} /> : <Smartphone size={20} />}
                    </div>
                    <span className="font-bold text-sm">Device Role</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/5" style={{ color: themeStyles.accent }}>
                    {isMainDevice ? 'Main' : 'Receiver'}
                  </span>
                </button>

                <div className="pt-10">
                  <button 
                    onClick={() => {
                      localStorage.removeItem('sync_alarm_role');
                      window.location.reload();
                    }}
                    className="w-full flex items-center justify-center gap-3 p-5 rounded-[2rem] border transition-all text-red-400 border-red-400/20 bg-red-400/5 hover:bg-red-400/10 active:scale-[0.98]"
                  >
                    <LogOut size={20} />
                    <span className="font-black uppercase tracking-widest text-xs">Reset Session</span>
                  </button>
                </div>
              </div>

              <div className="mt-auto p-4 rounded-2xl flex items-center justify-between" style={{ backgroundColor: themeStyles.card }}>
                <div className="flex items-center gap-2">
                  <Users size={16} style={{ color: themeStyles.secondary }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: themeStyles.secondary }}>
                    {connectedCount} Device{connectedCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themeStyles.secondary }}>
                    {isConnected ? 'Live Sync' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Connect Modal */}
        <AnimatePresence>
          {showConnectModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
              onClick={() => setShowConnectModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className={`w-full max-w-sm p-10 rounded-[3rem] shadow-2xl ${themeStyles.glass}`}
                style={{ backgroundColor: themeStyles.card }}
                onClick={e => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-inner" style={{ backgroundColor: themeStyles.accent + '22', color: themeStyles.accent }}>
                    <QrCode size={40} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tighter mb-3">Connect Device</h3>
                  <p className="text-xs font-medium mb-8 opacity-50 uppercase tracking-widest leading-relaxed">
                    Scan this QR code or open the URL on another device to sync.
                  </p>
                  
                  <div className="bg-white p-6 rounded-[2rem] inline-block mb-8 shadow-2xl border-4 border-white/10">
                    <QRCodeSVG 
                      value={window.location.href} 
                      size={180}
                      level="H"
                      includeMargin={false}
                      fgColor="#020617"
                    />
                  </div>

                  <div className="p-4 rounded-2xl mb-8 font-mono text-[10px] break-all border border-white/5" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: themeStyles.text }}>
                    {window.location.href}
                  </div>

                  <button 
                    onClick={() => setShowConnectModal(false)}
                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: themeStyles.button, color: 'white' }}
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications Overlay */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                className="text-white p-4 rounded-2xl shadow-2xl border border-white/10 min-w-[240px] pointer-events-auto"
                style={{ backgroundColor: themeStyles.button }}
              >
                <div className="flex items-center gap-3">
                  <Bell className="animate-bounce" size={20} />
                  <div>
                    <h4 className="font-bold text-sm">{n.title}</h4>
                    <p className="text-xs opacity-90">{n.message}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <header className="mb-16 relative flex items-center justify-center h-12">
          <button 
            onClick={() => setShowMenu(true)}
            className="absolute left-0 p-3 rounded-2xl transition-all border border-white/10 flex items-center gap-2"
            style={{ backgroundColor: themeStyles.card, color: themeStyles.header }}
          >
            <Menu size={20} />
            {!isConnected && <CloudOff size={14} className="text-red-400" />}
            {pendingSync && <RefreshCw size={14} className="animate-spin text-emerald-400" />}
          </button>

          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              x: [0, -1, 1, -1, 1, 0, 0],
              scale: [1, 1, 1, 1, 1, 1, 1.05, 1]
            }}
            transition={{
              x: {
                repeat: 15, // Vibrate for ~3 seconds
                duration: 0.2,
                ease: "linear"
              },
              scale: {
                delay: 3.2, // Start after vibration
                duration: 0.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 2
              },
              opacity: { duration: 0.5 },
              y: { duration: 0.5 }
            }}
            className="text-4xl font-bold tracking-tighter"
            style={{ color: themeStyles.header }}
          >
            AlarmSync
          </motion.h1>
        </header>

        {isMainDevice && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-10 p-8 rounded-[2.5rem] ${themeStyles.glass}`}
            style={{ backgroundColor: themeStyles.card }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50" style={{ color: themeStyles.text }}>Device Management</h2>
              <button 
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 shadow-lg"
                style={{ backgroundColor: themeStyles.accent, color: themeStyles.bg }}
              >
                <Plus size={12} /> Add Device
              </button>
            </div>
            <div className="space-y-3">
              {connectedDevices.map((device, idx) => (
                <div 
                  key={device.id + idx}
                  className="flex items-center justify-between p-4 rounded-2xl border border-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      {device.role === 'main' ? <ShieldCheck size={16} style={{ color: themeStyles.accent }} /> : <Smartphone size={16} style={{ color: themeStyles.secondary }} />}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: themeStyles.header }}>
                        {device.role} {device.id === myClientId ? '(You)' : ''}
                      </p>
                      <p className="text-[8px] opacity-40 font-mono tracking-tighter">{device.id}</p>
                    </div>
                  </div>
                  
                  {isMainDevice && device.id !== myClientId && (
                    <button 
                      onClick={() => kickDevice(device.id)}
                      className="p-2.5 hover:bg-red-500/20 rounded-xl transition-all text-red-400/60 hover:text-red-400"
                      title="Remove Device"
                    >
                      <LogOut size={16} />
                    </button>
                  )}
                </div>
              ))}
              {connectedDevices.length <= 1 && (
                <p className="text-[10px] font-medium italic text-center py-4 opacity-40" style={{ color: themeStyles.text }}>No other devices connected.</p>
              )}
            </div>
          </motion.div>
        )}

        {isMainDevice && (
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={addAlarm} 
            className={`mb-10 p-8 rounded-[2.5rem] ${themeStyles.glass}`}
            style={{ backgroundColor: themeStyles.card }}
          >
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] mb-6 opacity-50" style={{ color: themeStyles.text }}>Set New Alarm</h2>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={newAlarmTitle}
                onChange={(e) => setNewAlarmTitle(e.target.value)}
                placeholder="Alarm Label (e.g. Morning Meeting)"
                className="rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm border border-white/5"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: themeStyles.text }}
              />
              <div className="flex gap-3">
                <input
                  type="time"
                  value={newAlarmTime}
                  onChange={(e) => setNewAlarmTime(e.target.value)}
                  className="flex-1 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm border border-white/5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: themeStyles.text }}
                />
                <button 
                  type="submit"
                  className="text-white px-8 rounded-2xl font-black transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                  style={{ backgroundColor: themeStyles.button }}
                >
                  <Plus size={18} /> SET
                </button>
              </div>
            </div>
          </motion.form>
        )}

        {alarms.filter(a => a.enabled).length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`mb-10 p-10 rounded-[3rem] flex flex-col items-center text-center relative overflow-hidden ${themeStyles.glass}`}
            style={{ 
              backgroundColor: themeStyles.card, 
              boxShadow: `0 30px 60px -12px ${themeStyles.bg}cc, 0 18px 36px -18px rgba(0,0,0,0.3)`
            }}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-50" style={{ color: themeStyles.text }}>
              Next Scheduled Alert
            </p>
            
            {(() => {
              const nextAlarm = [...alarms]
                .filter(a => a.enabled)
                .sort((a, b) => {
                  const getMs = (time: string) => {
                    const [h, m] = time.split(':').map(Number);
                    const d = new Date(currentTime);
                    d.setHours(h, m, 0, 0);
                    if (d < currentTime) d.setDate(d.getDate() + 1);
                    return d.getTime();
                  };
                  return getMs(a.time) - getMs(b.time);
                })[0];

              if (!nextAlarm) return null;

              return (
                <>
                  <h2 className="text-6xl font-mono font-bold tracking-tighter mb-1" style={{ color: themeStyles.header }}>
                    {getCountdown(nextAlarm.time)}
                  </h2>
                  <p className="text-sm font-medium opacity-60 uppercase tracking-widest">
                    UNTIL {nextAlarm.title} ({nextAlarm.time})
                  </p>
                </>
              );
            })()}
          </motion.div>
        )}

        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4 px-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50" style={{ color: themeStyles.text }}>Active Alarms</h2>
            <span className="text-[10px] px-3 py-1 rounded-full border border-white/10 font-black tracking-widest" style={{ backgroundColor: themeStyles.card, color: themeStyles.text }}>
              {alarms.length} TOTAL
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin opacity-20" size={32} style={{ color: themeStyles.text }} />
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {alarms.map((alarm) => {
                  const isTriggering = triggeringAlarms.has(alarm.id);
                  const isWarning = warningAlarms.has(alarm.id);
                  return (
                    <motion.div
                      key={alarm.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ 
                        opacity: 1, 
                        scale: 1,
                        boxShadow: isTriggering 
                          ? `0 0 25px ${themeStyles.accent}66` 
                          : isWarning 
                            ? `0 0 15px ${themeStyles.accent}22` 
                            : 'none'
                      }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group relative rounded-[2rem] p-6 transition-all ${themeStyles.glass} ${!alarm.enabled ? 'opacity-30 grayscale' : ''} ${isTriggering ? 'ring-4' : isWarning ? 'ring-2' : ''}`}
                      style={{ 
                        backgroundColor: themeStyles.card, 
                        ringColor: themeStyles.accent,
                        boxShadow: isTriggering ? `0 0 40px ${themeStyles.accent}44` : 'none'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <motion.div 
                            animate={isTriggering ? { 
                              x: [0, -2, 2, -2, 2, 0],
                              scale: [1, 1.1, 1]
                            } : isWarning ? {
                              scale: [1, 1.05, 1],
                              opacity: [1, 0.8, 1]
                            } : {}}
                            transition={isTriggering ? { 
                              x: { repeat: Infinity, duration: 0.2 },
                              scale: { repeat: Infinity, duration: 1 }
                            } : isWarning ? {
                              repeat: Infinity,
                              duration: 2
                            } : {}}
                            className="p-4 rounded-2xl shadow-inner" 
                            style={{ backgroundColor: alarm.enabled ? themeStyles.accent + '22' : 'rgba(0,0,0,0.2)', color: alarm.enabled ? themeStyles.accent : themeStyles.text + '44' }}
                          >
                            <Clock size={28} className={isTriggering ? 'animate-pulse' : ''} />
                          </motion.div>
                          <div>
                            <div className="flex items-baseline gap-3">
                              <h3 className="text-3xl font-mono font-black tracking-tighter" style={{ color: themeStyles.header }}>
                                {alarm.time}
                              </h3>
                              {alarm.enabled && !isTriggering && (
                                <span className="text-[10px] font-black font-mono opacity-40 tracking-widest" style={{ color: themeStyles.accent }}>
                                  IN {getCountdown(alarm.time)}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40" style={{ color: themeStyles.text }}>
                              {alarm.title}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {isTriggering && (
                            <button 
                              onClick={() => snoozeAlarm(alarm.id)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black tracking-widest transition-all hover:scale-105 shadow-xl"
                              style={{ backgroundColor: themeStyles.accent, color: themeStyles.bg }}
                            >
                              <Coffee size={14} /> SNOOZE
                            </button>
                          )}
                          {!isMainDevice && alarm.enabled && !isTriggering && (
                            <button 
                              onClick={() => toggleAlarm(alarm.id, true)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black tracking-widest transition-all hover:scale-105 border border-white/10"
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: themeStyles.accent }}
                            >
                              <BellOff size={14} /> SILENCE
                            </button>
                          )}
                          {isMainDevice ? (
                            <button 
                              onClick={() => toggleAlarm(alarm.id, alarm.enabled)}
                              className="p-3 rounded-xl transition-all hover:bg-white/10 active:scale-90"
                              style={{ color: alarm.enabled ? themeStyles.accent : themeStyles.text + '22' }}
                            >
                              {alarm.enabled ? <Bell size={22} /> : <BellOff size={22} />}
                            </button>
                          ) : (
                            <div className="p-3 opacity-20" style={{ color: alarm.enabled ? themeStyles.accent : themeStyles.text }}>
                              {alarm.enabled ? <Bell size={22} /> : <BellOff size={22} />}
                            </div>
                          )}
                          
                          {isMainDevice && (
                            <button 
                              onClick={() => deleteAlarm(alarm.id)}
                              className="p-3 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all active:scale-90"
                              style={{ color: themeStyles.text + '22' }}
                            >
                              <Trash2 size={22} />
                            </button>
                          )}
                        </div>
                      </div>
                      {isTriggering && (
                        <motion.div 
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          className="absolute bottom-0 left-0 right-0 h-1.5 origin-left rounded-b-[2rem]"
                          style={{ backgroundColor: themeStyles.accent }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {alarms.length === 0 && (
                <div className={`text-center py-24 rounded-[3rem] ${themeStyles.glass}`} style={{ backgroundColor: themeStyles.card }}>
                  <AlertTriangle className="mx-auto mb-4 opacity-20" size={48} style={{ color: themeStyles.text }} />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30" style={{ color: themeStyles.text }}>No alarms scheduled.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
