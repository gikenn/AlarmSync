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
  RefreshCw,
  GitMerge,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Check,
  AlertCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Alarm {
  id: number;
  title: string;
  time: string;
  enabled: boolean;
  created_at?: string;
}

export interface SyncConflict {
  id: string;
  type: 'TIMING_COLLISION' | 'CONCURRENT_EDIT' | 'UNMERGED_OFFLINE_ACTION';
  description: string;
  detectedAt: string;
  localData: {
    tempId?: number;
    title: string;
    time: string;
    enabled: boolean;
    timestamp?: string;
  };
  serverData: {
    id?: number;
    title: string;
    time: string;
    enabled: boolean;
    updatedAt?: string;
  };
  suggestedShiftTime: string;
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
  const [offlineQueue, setOfflineQueue] = useState<{ type: 'CREATE' | 'UPDATE' | 'DELETE'; data: any }[]>(() => {
    const saved = localStorage.getItem('sync_offline_queue');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>(() => {
    const saved = localStorage.getItem('sync_alarm_conflicts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [customShiftTimes, setCustomShiftTimes] = useState<Record<string, string>>({});
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [diagnosticScanMessage, setDiagnosticScanMessage] = useState<string | null>(null);
  const [snoozeDuration, setSnoozeDuration] = useState<number>(() => {
    const saved = localStorage.getItem('sync_alarm_snooze_interval');
    return saved ? parseInt(saved, 10) || 5 : 5;
  });
  const [snoozedAlarms, setSnoozedAlarms] = useState<Record<number, { snoozedAt: number; durationMs: number; endAt: number; minutes: number }>>(() => {
    const saved = localStorage.getItem('sync_snoozed_alarms');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const now = Date.now();
        const valid: Record<number, { snoozedAt: number; durationMs: number; endAt: number; minutes: number }> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if ((v as any).endAt > now) {
            valid[Number(k)] = v as any;
          }
        }
        return valid;
      } catch {
        return {};
      }
    }
    return {};
  });
  const [simulatedTriggers, setSimulatedTriggers] = useState<Set<number>>(new Set());
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist snoozed alarms, offline queue, and conflicts
  useEffect(() => {
    localStorage.setItem('sync_snoozed_alarms', JSON.stringify(snoozedAlarms));
  }, [snoozedAlarms]);

  useEffect(() => {
    localStorage.setItem('sync_offline_queue', JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  useEffect(() => {
    localStorage.setItem('sync_alarm_conflicts', JSON.stringify(syncConflicts));
  }, [syncConflicts]);

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
      audioRef.current.play().catch(e => console.warn("Audio playback delayed until user interaction:", e));
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

  const calculateShiftTime = (timeStr: string, minutes: number = 5): string => {
    if (!timeStr || !timeStr.includes(':')) return '08:00';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '08:00';
    const totalMins = (h * 60 + m + minutes) % (24 * 60);
    const newH = Math.floor(totalMins / 60);
    const newM = totalMins % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  };

  const syncWithServer = async () => {
    setPendingSync(true);
    try {
      // 1. Fetch current server alarms first to detect any collisions
      const serverRes = await fetch('/api/alarms');
      let serverAlarms: Alarm[] = [];
      if (serverRes.ok) {
        const json = await serverRes.json();
        if (Array.isArray(json)) serverAlarms = json;
      }

      // Process offline queue
      if (offlineQueue.length > 0) {
        const remainingQueue: typeof offlineQueue = [];
        const detectedConflicts: SyncConflict[] = [];

        for (const action of offlineQueue) {
          try {
            if (action.type === 'CREATE') {
              // Check if server already has an alarm with this exact time
              const colliding = serverAlarms.find(sa => sa.time === action.data.time);
              if (colliding) {
                // Detected timing collision between offline alarm and server alarm
                detectedConflicts.push({
                  id: `conflict-${Date.now()}-${Math.random().toString(36).substring(5)}`,
                  type: 'TIMING_COLLISION',
                  description: `Timing conflict: Offline alarm "${action.data.title}" at ${action.data.time} clashes with server alarm "${colliding.title}" (${colliding.time}).`,
                  detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  localData: {
                    tempId: action.data.tempId,
                    title: action.data.title,
                    time: action.data.time,
                    enabled: action.data.enabled !== false,
                    timestamp: action.data.timestamp || 'Offline session'
                  },
                  serverData: {
                    id: colliding.id,
                    title: colliding.title,
                    time: colliding.time,
                    enabled: colliding.enabled,
                    updatedAt: colliding.created_at
                  },
                  suggestedShiftTime: calculateShiftTime(action.data.time, 5)
                });
                continue; // Hold in conflict state for manual resolution
              } else {
                const res = await fetch('/api/alarms', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(action.data),
                });
                if (!res.ok) throw new Error("Failed to create alarm on server");
                const created = await res.json();
                serverAlarms.push(created);
              }
            } else if (action.type === 'UPDATE') {
              const serverAlarm = serverAlarms.find(sa => sa.id === action.data.id);
              if (!serverAlarm) {
                // Alarm was deleted on server while offline
                detectedConflicts.push({
                  id: `conflict-${Date.now()}-${Math.random().toString(36).substring(5)}`,
                  type: 'UNMERGED_OFFLINE_ACTION',
                  description: `Offline modification for alarm #${action.data.id} failed: target alarm was removed on server.`,
                  detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  localData: {
                    tempId: action.data.id,
                    title: action.data.title || `Alarm #${action.data.id}`,
                    time: action.data.time || '--:--',
                    enabled: action.data.enabled !== false,
                    timestamp: 'Offline modification'
                  },
                  serverData: {
                    id: action.data.id,
                    title: '[Deleted on Server]',
                    time: '--:--',
                    enabled: false
                  },
                  suggestedShiftTime: calculateShiftTime(action.data.time || '08:00', 5)
                });
                continue;
              }

              // Check if updated time collides with another alarm
              if (action.data.time && action.data.time !== serverAlarm.time) {
                const colliding = serverAlarms.find(sa => sa.id !== action.data.id && sa.time === action.data.time);
                if (colliding) {
                  detectedConflicts.push({
                    id: `conflict-${Date.now()}-${Math.random().toString(36).substring(5)}`,
                    type: 'TIMING_COLLISION',
                    description: `Timing conflict: Offline change to ${action.data.time} clashes with server alarm "${colliding.title}" at ${colliding.time}.`,
                    detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    localData: {
                      title: action.data.title || serverAlarm.title,
                      time: action.data.time,
                      enabled: action.data.enabled !== undefined ? action.data.enabled : serverAlarm.enabled,
                      timestamp: 'Offline update'
                    },
                    serverData: {
                      id: colliding.id,
                      title: colliding.title,
                      time: colliding.time,
                      enabled: colliding.enabled,
                      updatedAt: colliding.created_at
                    },
                    suggestedShiftTime: calculateShiftTime(action.data.time, 5)
                  });
                  continue;
                }
              }

              const res = await fetch(`/api/alarms/${action.data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.data),
              });
              if (!res.ok) throw new Error("Failed to update alarm");
            } else if (action.type === 'DELETE') {
              await fetch(`/api/alarms/${action.data.id}`, { method: 'DELETE' });
            }
          } catch (e) {
            console.warn("Failed to sync individual action, will retry later:", e);
            remainingQueue.push(action);
          }
        }
        setOfflineQueue(remainingQueue);

        if (detectedConflicts.length > 0) {
          setSyncConflicts(prev => {
            const combined = [...prev, ...detectedConflicts];
            return combined.filter((item, index, self) =>
              index === self.findIndex(t => t.id === item.id || (t.localData.time === item.localData.time && t.localData.title === item.localData.title))
            );
          });
          addNotification(
            Date.now(), 
            "Sync Issues Detected", 
            `${detectedConflicts.length} timing conflict(s) require manual resolution in Settings.`
          );
        }
      }

      await fetchAlarms();
      addNotification(Date.now(), "Synced", "Connection restored. Alarms updated.");
    } catch (err) {
      console.warn("Sync temporarily deferred:", err);
    } finally {
      setPendingSync(false);
    }
  };

  const resolveKeepLocal = async (conflict: SyncConflict) => {
    setResolvingConflictId(conflict.id);
    try {
      if (conflict.serverData.id && conflict.type === 'CONCURRENT_EDIT') {
        await fetch(`/api/alarms/${conflict.serverData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: conflict.localData.title,
            time: conflict.localData.time,
            enabled: conflict.localData.enabled
          })
        });
      } else {
        await fetch('/api/alarms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: conflict.localData.title,
            time: conflict.localData.time
          })
        });
      }
      setSyncConflicts(prev => prev.filter(c => c.id !== conflict.id));
      await fetchAlarms();
      addNotification(Date.now(), "Conflict Resolved", `Kept local alarm "${conflict.localData.title}" at ${conflict.localData.time}`);
    } catch (err) {
      console.warn("Failed to resolve conflict with local version:", err);
    } finally {
      setResolvingConflictId(null);
    }
  };

  const resolveKeepServer = async (conflict: SyncConflict) => {
    setResolvingConflictId(conflict.id);
    try {
      setSyncConflicts(prev => prev.filter(c => c.id !== conflict.id));
      await fetchAlarms();
      addNotification(Date.now(), "Conflict Resolved", `Accepted server alarm "${conflict.serverData.title}"`);
    } catch (err) {
      console.warn("Failed to resolve conflict:", err);
    } finally {
      setResolvingConflictId(null);
    }
  };

  const resolveShiftTime = async (conflict: SyncConflict, newTime: string) => {
    setResolvingConflictId(conflict.id);
    try {
      await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: conflict.localData.title,
          time: newTime
        })
      });
      setSyncConflicts(prev => prev.filter(c => c.id !== conflict.id));
      await fetchAlarms();
      addNotification(Date.now(), "Conflict Resolved", `Shifted "${conflict.localData.title}" to ${newTime}`);
    } catch (err) {
      console.warn("Failed to shift conflicting alarm:", err);
    } finally {
      setResolvingConflictId(null);
    }
  };

  const resolveAllAutoShift = async () => {
    for (const conflict of syncConflicts) {
      const shiftTime = customShiftTimes[conflict.id] || conflict.suggestedShiftTime;
      try {
        await fetch('/api/alarms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: conflict.localData.title,
            time: shiftTime
          })
        });
      } catch (e) {
        console.warn("Failed to shift conflict:", e);
      }
    }
    setSyncConflicts([]);
    await fetchAlarms();
    addNotification(Date.now(), "All Conflicts Resolved", "Shifted conflicting alarms to safe intervals.");
  };

  const resolveAllKeepLocal = async () => {
    for (const conflict of [...syncConflicts]) {
      await resolveKeepLocal(conflict);
    }
    setSyncConflicts([]);
    await fetchAlarms();
  };

  const resolveAllKeepServer = async () => {
    setSyncConflicts([]);
    await fetchAlarms();
    addNotification(Date.now(), "All Conflicts Resolved", "Kept server alarm schedules.");
  };

  const simulateSyncConflict = () => {
    const targetAlarm = alarms[0] || { id: 999, time: '08:30', title: 'Morning Standup', enabled: true };
    const conflictId = `conflict-sim-${Date.now()}`;
    const simConflict: SyncConflict = {
      id: conflictId,
      type: 'TIMING_COLLISION',
      description: `Timing conflict: Offline change for "Gym Workout" set at ${targetAlarm.time} collides with server alarm "${targetAlarm.title}" at ${targetAlarm.time}.`,
      detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      localData: {
        title: 'Gym Workout (Offline)',
        time: targetAlarm.time,
        enabled: true,
        timestamp: 'Offline queue (Simulated)'
      },
      serverData: {
        id: targetAlarm.id,
        title: targetAlarm.title,
        time: targetAlarm.time,
        enabled: targetAlarm.enabled,
        updatedAt: new Date().toISOString()
      },
      suggestedShiftTime: calculateShiftTime(targetAlarm.time, 5)
    };

    setSyncConflicts(prev => [simConflict, ...prev.filter(c => c.id !== conflictId)]);
    setShowConflictModal(true);
    addNotification(Date.now(), "Sync Issue Simulated", `Generated timing collision at ${targetAlarm.time}.`);
  };

  const runTimingDiagnostics = () => {
    const collisions: SyncConflict[] = [];
    const timeMap: Record<string, Alarm[]> = {};

    alarms.forEach(a => {
      if (!timeMap[a.time]) timeMap[a.time] = [];
      timeMap[a.time].push(a);
    });

    for (const [time, list] of Object.entries(timeMap)) {
      if (list.length > 1) {
        collisions.push({
          id: `diag-${time}-${Date.now()}`,
          type: 'TIMING_COLLISION',
          description: `Duplicate schedule detected: ${list.length} alarms share exact time ${time} ("${list.map(l => l.title).join('", "')}").`,
          detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          localData: {
            title: list[1].title,
            time: list[1].time,
            enabled: list[1].enabled,
            timestamp: 'Local duplicate'
          },
          serverData: {
            id: list[0].id,
            title: list[0].title,
            time: list[0].time,
            enabled: list[0].enabled
          },
          suggestedShiftTime: calculateShiftTime(time, 5)
        });
      }
    }

    if (collisions.length > 0) {
      setSyncConflicts(prev => [...prev, ...collisions]);
      setDiagnosticScanMessage(`Found ${collisions.length} timing collision(s).`);
      setShowConflictModal(true);
    } else {
      setDiagnosticScanMessage(`Diagnostic check passed: All ${alarms.length} alarms have distinct unique timing.`);
      setTimeout(() => setDiagnosticScanMessage(null), 4000);
    }
  };

  const fetchAlarms = async (retryCount = 0) => {
    try {
      const res = await fetch('/api/alarms');
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setAlarms(data);
        localStorage.setItem('sync_alarms_local', JSON.stringify(data));
      }
    } catch (err) {
      console.warn(`Could not reach server alarms (attempt ${retryCount + 1}):`, err);
      // Fallback to local storage if available
      const saved = localStorage.getItem('sync_alarms_local');
      if (saved && alarms.length === 0) {
        try {
          setAlarms(JSON.parse(saved));
        } catch {
          // ignore corrupted local storage
        }
      }
      // Exponential backoff retry up to 4 attempts if server was starting up
      if (retryCount < 4) {
        setTimeout(() => {
          fetchAlarms(retryCount + 1);
        }, 1000 * Math.pow(1.5, retryCount));
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAlarms = () => {
    const now = new Date();
    const nowMs = now.getTime();
    const currentTimeStr = now.toTimeString().slice(0, 5); // HH:mm
    const newTriggering = new Set<number>();
    const newWarning = new Set<number>();

    // Prune expired snoozes
    setSnoozedAlarms(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, val] of Object.entries(next)) {
        if (val.endAt <= nowMs) {
          delete next[Number(key)];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    alarms.forEach(alarm => {
      if (!alarm.enabled) return;

      const isSnoozed = Boolean(snoozedAlarms[alarm.id] && snoozedAlarms[alarm.id].endAt > nowMs);

      const [alarmH, alarmM] = alarm.time.split(':').map(Number);
      const alarmDate = new Date();
      alarmDate.setHours(alarmH, alarmM, 0, 0);

      const diffMs = alarmDate.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // Triggering now
      if (currentTimeStr === alarm.time && !isSnoozed) {
        newTriggering.add(alarm.id);
      }
      
      // Warning (5 mins ahead)
      if (diffMins >= 0 && diffMins <= 5 && !isSnoozed) {
        newWarning.add(alarm.id);
      }

      // Notify 5 minutes ahead
      if (diffMins === 5 && diffMs > 0 && diffMs < 301000 && !isSnoozed) {
        addNotification(alarm.id, alarm.title, "Starting in 5 minutes!");
      }
      
      // Notify at alarm time
      if (currentTimeStr === alarm.time && now.getSeconds() === 0 && !isSnoozed) {
        addNotification(alarm.id, alarm.title, "ALARM NOW!");
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(e => console.warn("Audio play blocked by browser policy:", e));
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
    const newAlarm = { id: tempId, time: newAlarmTime, title: newAlarmTitle, enabled: true, created_at: new Date().toISOString() };

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
      console.warn('Offline mode: Alarm saved locally', err);
      setOfflineQueue(prev => [...prev, { 
        type: 'CREATE', 
        data: { 
          tempId,
          title: newAlarm.title, 
          time: newAlarm.time,
          enabled: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } 
      }]);
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
      console.warn('Offline mode: Change saved locally', err);
      const target = alarms.find(a => a.id === id);
      setOfflineQueue(prev => [...prev, { 
        type: 'UPDATE', 
        data: { 
          id, 
          enabled: newEnabled,
          title: target?.title,
          time: target?.time,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } 
      }]);
    }
  };

  const deleteAlarm = async (id: number) => {
    // Optimistic update
    setAlarms(prev => prev.filter(a => a.id !== id));

    try {
      const res = await fetch(`/api/alarms/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Server error");
    } catch (err) {
      console.warn('Offline mode: Deletion saved locally', err);
      setOfflineQueue(prev => [...prev, { type: 'DELETE', data: { id } }]);
    }
  };

  const snoozeAlarm = async (id: number, minutes: number = snoozeDuration) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Immediately clear triggered state on this device
      setTriggeringAlarms(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSimulatedTriggers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      // Record active snooze countdown
      const now = Date.now();
      const durationMs = minutes * 60 * 1000;
      const endAt = now + durationMs;
      setSnoozedAlarms(prev => ({
        ...prev,
        [id]: {
          snoozedAt: now,
          durationMs,
          endAt,
          minutes
        }
      }));

      await fetch(`/api/alarms/${id}/snooze`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes })
      });
      addNotification(id, "Alarm Snoozed", `Snoozed for ${minutes} minutes.`);
    } catch (err) {
      console.warn('Failed to snooze alarm:', err);
    }
  };

  const cancelSnooze = (id: number) => {
    setSnoozedAlarms(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addNotification(id, "Snooze Cleared", "Snooze timer cleared.");
  };

  const toggleTestTrigger = (id: number) => {
    setSimulatedTriggers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      } else {
        next.add(id);
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(e => console.warn("Audio play blocked by browser policy:", e));
        }
      }
      return next;
    });
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

                <div className="p-5 rounded-[2rem] border border-white/5 space-y-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-white/5">
                        <Coffee size={20} />
                      </div>
                      <div>
                        <span className="font-bold text-sm block">Snooze Interval</span>
                        <span className="text-[10px] opacity-50 uppercase tracking-wider">Duration added on snooze</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-white/10" style={{ color: themeStyles.accent }}>
                      {snoozeDuration} min
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[5, 10, 15].map((mins) => (
                      <button
                        key={mins}
                        id={`settings-snooze-${mins}m`}
                        onClick={() => {
                          setSnoozeDuration(mins);
                          localStorage.setItem('sync_alarm_snooze_interval', mins.toString());
                        }}
                        className={`py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                          snoozeDuration === mins 
                            ? 'shadow-sm' 
                            : 'border-white/5 hover:bg-white/5 opacity-50'
                        }`}
                        style={{
                          backgroundColor: snoozeDuration === mins ? themeStyles.accent + '22' : 'transparent',
                          borderColor: snoozeDuration === mins ? themeStyles.accent : 'rgba(255,255,255,0.05)',
                          color: snoozeDuration === mins ? themeStyles.accent : themeStyles.text
                        }}
                      >
                        {mins} Min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Diagnostic Sync Issues Indicator */}
                <div className="space-y-2">
                  <button 
                    id="settings-sync-issues-btn"
                    onClick={() => { setShowConflictModal(true); }}
                    className={`w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all text-left ${
                      syncConflicts.length > 0
                        ? 'border-amber-500/50 hover:bg-amber-500/15 animate-pulse shadow-lg'
                        : 'border-white/5 hover:bg-white/5'
                    }`}
                    style={{ backgroundColor: syncConflicts.length > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(0,0,0,0.2)' }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${
                        syncConflicts.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-emerald-400'
                      }`}>
                        {syncConflicts.length > 0 ? (
                          <AlertTriangle size={20} className="animate-bounce" />
                        ) : (
                          <GitMerge size={20} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${syncConflicts.length > 0 ? 'text-amber-200' : ''}`}>
                            Sync Issues
                          </span>
                          {syncConflicts.length > 0 && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-black uppercase tracking-wider">
                              Action Required
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider block ${
                          syncConflicts.length > 0 ? 'text-amber-300/80 font-medium' : 'opacity-50'
                        }`}>
                          {syncConflicts.length > 0 
                            ? `${syncConflicts.length} timing conflict${syncConflicts.length > 1 ? 's' : ''} detected`
                            : 'All alarms merged & synchronized'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                        syncConflicts.length > 0 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {syncConflicts.length > 0 ? 'Resolve' : 'Clean'}
                      </span>
                      <ArrowRight size={16} className={syncConflicts.length > 0 ? 'text-amber-400' : 'opacity-40'} />
                    </div>
                  </button>

                  <div className="flex items-center justify-between px-2 pt-0.5">
                    <button
                      id="simulate-conflict-btn"
                      onClick={simulateSyncConflict}
                      className="text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1.5 py-1 text-amber-300"
                    >
                      <Sparkles size={12} />
                      Simulate timing conflict
                    </button>
                    <button
                      id="scan-timing-btn"
                      onClick={runTimingDiagnostics}
                      className="text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1.5 py-1"
                      style={{ color: themeStyles.accent }}
                    >
                      <RefreshCw size={12} />
                      Scan collisions
                    </button>
                  </div>
                  {diagnosticScanMessage && (
                    <p className="text-[11px] text-center font-mono py-1 px-3 rounded-lg bg-white/5 text-emerald-400 border border-emerald-500/20">
                      {diagnosticScanMessage}
                    </p>
                  )}
                </div>

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

        {/* Sync Issues & Timing Conflict Resolution Modal */}
        <AnimatePresence>
          {showConflictModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg overflow-y-auto"
              onClick={() => setShowConflictModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                className={`w-full max-w-xl max-h-[90vh] flex flex-col p-6 md:p-8 rounded-[2.5rem] shadow-2xl ${themeStyles.glass} overflow-hidden`}
                style={{ backgroundColor: themeStyles.card }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl md:text-2xl font-black tracking-tight">Sync Issues & Timing</h3>
                        {syncConflicts.length > 0 ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {syncConflicts.length} Unmerged
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Synchronized
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-60 mt-0.5">
                        Manual resolution interface for offline changes and timing collisions.
                      </p>
                    </div>
                  </div>
                  <button 
                    id="close-conflict-modal-btn"
                    onClick={() => setShowConflictModal(false)}
                    className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all"
                  >
                    <X size={22} />
                  </button>
                </div>

                {/* Quick Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl mb-4 bg-white/5 border border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      id="batch-auto-shift-btn"
                      disabled={syncConflicts.length === 0}
                      onClick={resolveAllAutoShift}
                      className="px-3 py-1.5 rounded-xl font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                    >
                      <Sparkles size={13} />
                      Auto-Shift All (+5m)
                    </button>
                    <button
                      id="batch-keep-local-btn"
                      disabled={syncConflicts.length === 0}
                      onClick={resolveAllKeepLocal}
                      className="px-3 py-1.5 rounded-xl font-medium bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      Keep All Local
                    </button>
                    <button
                      id="batch-keep-server-btn"
                      disabled={syncConflicts.length === 0}
                      onClick={resolveAllKeepServer}
                      className="px-3 py-1.5 rounded-xl font-medium bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      Keep All Server
                    </button>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      id="modal-simulate-conflict-btn"
                      onClick={simulateSyncConflict}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all flex items-center gap-1"
                    >
                      + Test Conflict
                    </button>
                  </div>
                </div>

                {/* Conflicts Scroll Area */}
                <div className="overflow-y-auto space-y-4 pr-1 custom-scrollbar flex-1 max-h-[55vh]">
                  {syncConflicts.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center justify-center p-6 rounded-3xl border border-white/5 bg-white/5">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                        <CheckCircle2 size={32} />
                      </div>
                      <h4 className="font-bold text-base mb-1">No Active Timing Conflicts</h4>
                      <p className="text-xs opacity-50 max-w-md mb-5 leading-relaxed">
                        All offline changes have merged cleanly or no conflicting alarms exist at identical times. Use the simulation button to test the conflict resolver.
                      </p>
                      <button
                        onClick={simulateSyncConflict}
                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all flex items-center gap-2"
                      >
                        <Sparkles size={14} />
                        Generate Sample Timing Conflict
                      </button>
                    </div>
                  ) : (
                    syncConflicts.map((conflict, idx) => {
                      const shiftVal = customShiftTimes[conflict.id] || conflict.suggestedShiftTime;
                      const isBusy = resolvingConflictId === conflict.id;

                      return (
                        <div 
                          key={conflict.id}
                          className="p-5 rounded-3xl border border-white/10 bg-black/30 space-y-4 relative overflow-hidden"
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-mono font-bold">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="text-xs font-bold tracking-wide uppercase text-amber-300">
                                  {conflict.type.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] opacity-40 ml-2 font-mono">
                                  Detected {conflict.detectedAt}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/70">
                              Time Clash: {conflict.localData.time}
                            </span>
                          </div>

                          <p className="text-xs text-white/80 leading-relaxed bg-white/5 p-3 rounded-2xl border border-white/5">
                            {conflict.description}
                          </p>

                          {/* Side-by-side comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Local / Offline version */}
                            <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-amber-300 flex items-center gap-1">
                                  <CloudOff size={11} />
                                  Offline / Local Version
                                </span>
                                <span className="text-[10px] font-mono opacity-50">Local</span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-2xl font-black font-mono tracking-tight text-amber-200">
                                  {conflict.localData.time}
                                </span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${conflict.localData.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                                  {conflict.localData.enabled ? 'Enabled' : 'Muted'}
                                </span>
                              </div>
                              <div className="text-xs font-medium truncate text-white/90">
                                "{conflict.localData.title}"
                              </div>
                            </div>

                            {/* Server / Existing version */}
                            <div className="p-3.5 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-300 flex items-center gap-1">
                                  <Wifi size={11} />
                                  Server / Remote Version
                                </span>
                                <span className="text-[10px] font-mono opacity-50">
                                  {conflict.serverData.id ? `ID #${conflict.serverData.id}` : 'Server'}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-2xl font-black font-mono tracking-tight text-cyan-200">
                                  {conflict.serverData.time}
                                </span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${conflict.serverData.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                                  {conflict.serverData.enabled ? 'Enabled' : 'Muted'}
                                </span>
                              </div>
                              <div className="text-xs font-medium truncate text-white/90">
                                "{conflict.serverData.title}"
                              </div>
                            </div>
                          </div>

                          {/* Resolution Actions */}
                          <div className="pt-2 border-t border-white/10 space-y-2.5">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 block">
                              Select Timing Resolution
                            </span>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                id={`resolve-keep-local-${conflict.id}`}
                                disabled={isBusy}
                                onClick={() => resolveKeepLocal(conflict)}
                                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 transition-all flex items-center justify-center gap-1.5"
                              >
                                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Keep Local ({conflict.localData.time})
                              </button>

                              <button
                                id={`resolve-keep-server-${conflict.id}`}
                                disabled={isBusy}
                                onClick={() => resolveKeepServer(conflict)}
                                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 transition-all flex items-center justify-center gap-1.5"
                              >
                                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                                Keep Server ({conflict.serverData.time})
                              </button>
                            </div>

                            {/* Shift Option to keep both */}
                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2">
                                <Clock size={16} className="text-amber-400 shrink-0" />
                                <div>
                                  <span className="text-xs font-bold block text-white/90">Shift Local to Avoid Clash</span>
                                  <span className="text-[10px] opacity-60">Keeps both alarms by adjusting offline alarm time</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="time"
                                  id={`custom-shift-input-${conflict.id}`}
                                  value={shiftVal}
                                  onChange={(e) => setCustomShiftTimes(prev => ({ ...prev, [conflict.id]: e.target.value }))}
                                  className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-black/40 border border-white/20 text-white outline-none focus:border-amber-400"
                                />
                                <button
                                  id={`resolve-shift-btn-${conflict.id}`}
                                  disabled={isBusy || !shiftVal}
                                  onClick={() => resolveShiftTime(conflict, shiftVal)}
                                  className="py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all whitespace-nowrap"
                                >
                                  Apply Shift
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Modal Footer */}
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="opacity-50 text-[11px]">
                    {syncConflicts.length} item{syncConflicts.length !== 1 ? 's' : ''} in conflict buffer
                  </span>
                  <button
                    onClick={() => setShowConflictModal(false)}
                    className="px-4 py-2 rounded-xl font-bold bg-white/10 hover:bg-white/15 transition-all"
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
            {syncConflicts.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-black animate-pulse shadow">
                <AlertTriangle size={10} />
                {syncConflicts.length}
              </span>
            )}
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
                  const isTriggering = triggeringAlarms.has(alarm.id) || simulatedTriggers.has(alarm.id);
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
                        boxShadow: isTriggering ? `0 0 40px ${themeStyles.accent}44` : 'none',
                        ['--tw-ring-color' as any]: themeStyles.accent,
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

                            {/* Live Snoozed Active Countdown Progress Bar */}
                            {snoozedAlarms[alarm.id] && (
                              <div className="mt-2.5 p-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col gap-1.5 max-w-[250px] shadow-sm">
                                <div className="flex items-center justify-between text-[9px] font-mono font-bold text-amber-300">
                                  <span className="flex items-center gap-1.5">
                                    <Coffee size={12} className="animate-spin text-amber-400" />
                                    SNOOZED ({Math.max(1, Math.ceil((snoozedAlarms[alarm.id].endAt - currentTime.getTime()) / 60000))}m left)
                                  </span>
                                  <button 
                                    onClick={() => cancelSnooze(alarm.id)}
                                    className="text-[8px] uppercase tracking-wider text-amber-200/70 hover:text-red-300 underline cursor-pointer"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-400 rounded-full transition-all duration-1000"
                                    style={{ 
                                      width: `${Math.max(0, Math.min(100, ((snoozedAlarms[alarm.id].endAt - currentTime.getTime()) / snoozedAlarms[alarm.id].durationMs) * 100))}%` 
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between text-[7.5px] font-mono opacity-60 text-amber-200">
                                  <span>0m</span>
                                  <span>{snoozedAlarms[alarm.id].minutes}m Interval</span>
                                  <span>+{snoozedAlarms[alarm.id].minutes}m</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                          {isTriggering && (
                            <div className="flex flex-col items-end gap-1.5">
                              {/* Snooze button with embedded visual progress bar */}
                              <button 
                                id={`snooze-btn-${alarm.id}`}
                                onClick={() => snoozeAlarm(alarm.id, snoozeDuration)}
                                className="group/snooze relative flex flex-col justify-center px-4 py-2.5 rounded-2xl transition-all hover:scale-[1.03] active:scale-[0.98] shadow-xl overflow-hidden min-w-[175px] border border-white/20"
                                style={{ backgroundColor: themeStyles.accent, color: themeStyles.bg }}
                                title={`Snooze alarm for ${snoozeDuration} minutes`}
                              >
                                {/* Animated shimmer on hover */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover/snooze:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

                                {/* Upper row: Coffee icon, SNOOZE label, and duration badge */}
                                <div className="flex items-center justify-between gap-3 w-full relative z-10 mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Coffee size={13} className="animate-bounce" />
                                    <span className="font-extrabold tracking-widest text-[11px]">SNOOZE</span>
                                  </div>
                                  <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded-md bg-black/20 text-current flex items-center gap-0.5 shadow-sm">
                                    +{snoozeDuration}m
                                  </span>
                                </div>

                                {/* Visual Progress Bar representing snooze interval */}
                                <div className="w-full relative z-10 flex flex-col gap-1">
                                  <div 
                                    className="h-2 w-full bg-black/25 rounded-full overflow-hidden p-[1px] relative shadow-inner"
                                    role="progressbar"
                                    aria-valuenow={snoozeDuration}
                                    aria-valuemin={0}
                                    aria-valuemax={snoozeDuration}
                                    aria-label={`Snooze interval: ${snoozeDuration} minutes`}
                                  >
                                    <motion.div 
                                      className="h-full rounded-full bg-current relative overflow-hidden"
                                      initial={{ width: "0%" }}
                                      animate={{ width: "100%" }}
                                      transition={{ duration: 0.8, ease: "easeOut" }}
                                    >
                                      <motion.div
                                        className="absolute inset-0 bg-white/40"
                                        animate={{ x: ['-100%', '100%'] }}
                                        transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
                                      />
                                    </motion.div>

                                    {/* Segment markers for each minute */}
                                    <div className="absolute inset-0 flex justify-between pointer-events-none px-1">
                                      {Array.from({ length: Math.max(1, snoozeDuration - 1) }).map((_, idx) => (
                                        <div key={idx} className="w-[1px] h-full bg-black/30" />
                                      ))}
                                    </div>
                                  </div>

                                  {/* Interval scale indicators */}
                                  <div className="flex items-center justify-between text-[7.5px] font-mono font-bold tracking-tight opacity-80 px-0.5">
                                    <span>0m</span>
                                    <span className="text-[7px] uppercase tracking-wider opacity-90 font-sans">
                                      {snoozeDuration}m Interval
                                    </span>
                                    <span>+{snoozeDuration}m</span>
                                  </div>
                                </div>
                              </button>

                              {/* Quick interval switcher pills */}
                              <div className="flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                                <span className="text-[7.5px] font-mono uppercase tracking-wider opacity-60" style={{ color: themeStyles.text }}>
                                  Interval:
                                </span>
                                {[5, 10, 15].map((mins) => (
                                  <button
                                    key={mins}
                                    id={`snooze-duration-${mins}m-${alarm.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSnoozeDuration(mins);
                                      localStorage.setItem('sync_alarm_snooze_interval', mins.toString());
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition-all ${
                                      snoozeDuration === mins 
                                        ? 'shadow-xs ring-1 ring-white/30' 
                                        : 'hover:bg-white/10 opacity-60'
                                    }`}
                                    style={{
                                      backgroundColor: snoozeDuration === mins ? themeStyles.accent + '33' : 'rgba(255,255,255,0.05)',
                                      color: snoozeDuration === mins ? themeStyles.accent : themeStyles.text,
                                    }}
                                    title={`Set snooze duration to ${mins} minutes`}
                                  >
                                    {mins}m
                                  </button>
                                ))}
                              </div>
                            </div>
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
                          {/* Test Trigger Button for instantly testing ringing & snooze button */}
                          <button 
                            id={`test-trigger-${alarm.id}`}
                            onClick={() => toggleTestTrigger(alarm.id)}
                            className="p-3 rounded-xl transition-all hover:bg-white/10 active:scale-90"
                            style={{ color: isTriggering ? themeStyles.accent : themeStyles.text + '33' }}
                            title={isTriggering ? "Stop ringing alarm" : "Trigger alarm now to test snooze button"}
                          >
                            {isTriggering ? <Pause size={20} className="animate-pulse text-amber-400" /> : <Play size={20} />}
                          </button>
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
