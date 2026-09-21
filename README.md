# 🔔 AlarmSync

### A modern, offline-capable alarm and reminder web app

AlarmSync provides scheduled alarms, real-time synchronization between connected devices, persistent alarm storage, and Progressive Web App support.

**Live App:** https://alarmsync-production.up.railway.app

---

## 📸 App Preview

![AlarmSync](https://raw.githubusercontent.com/gikenn/AlarmSync/main/public/icons/icon-512.png)

The AlarmSync dashboard is designed around the next scheduled alert and a clear list of active alarms, with countdowns and quick controls.

---

## ✨ Features

- ⏰ Create, edit, enable, disable, and delete alarms
- 🔔 Alarm notifications and sound support
- 🔄 Real-time synchronization between connected devices
- 🌐 Offline-capable web application
- 📱 Progressive Web App (PWA) support
- 💾 Persistent alarm storage
- 💤 Alarm snooze functionality
- 🔌 WebSocket-based device presence and synchronization
- 📱 Responsive dashboard
- 🚀 Railway deployment support

---

## 📱 Progressive Web App

AlarmSync includes:

- Web app manifest
- Service worker
- PWA icons
- Offline asset caching
- Browser local storage
- Reconnection and synchronization support

> **Browser limitation:** exact alarm delivery can depend on browser and operating-system background restrictions. A native application is generally more reliable when the browser is completely closed.

---

## 🔄 Real-Time Synchronization

AlarmSync uses WebSockets to keep connected clients synchronized.

Alarm creation, updates, deletion, and snoozing can be broadcast to connected devices.

---

## 💾 Data Persistence

Alarm data is stored in:

```text
data/alarms.json

