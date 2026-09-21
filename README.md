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

The server loads saved alarms on startup and persists changes back to the file.

The frontend also uses browser storage to support offline usage and synchronization.

🛠️ Technology Stack
Frontend: React + TypeScript
Build: Vite
Backend: Node.js + Express
Real-time: WebSocket
PWA: Web App Manifest + Service Worker
Storage: JSON + browser local storage
Deployment: Railway
🚀 Run Locally
Requirements
Node.js
npm
Install
npm install
Development
npm run dev
Production
npm run build
npm start

The server uses the hosting provider's PORT environment variable when available and falls back to port 3000 for local development.

☁️ Railway Deployment

Deployment flow:

GitHub
   ↓
Railway
   ↓
AlarmSync
   ↓
HTTPS
Live application

https://alarmsync-production.up.railway.app

Railway provides the application port through:

process.env.PORT
🔌 API
Method	Endpoint	Purpose
GET	/api/health	Server health check
GET	/api/alarms	Get alarms
POST	/api/alarms	Create an alarm
PATCH	/api/alarms/:id	Update an alarm
DELETE	/api/alarms/:id	Delete an alarm
POST	/api/alarms/:id/snooze	Snooze an alarm
Health Check
/api/health
📁 Project Structure
AlarmSync/
├── data/
│   └── alarms.json
├── public/
│   ├── alarm.wav
│   ├── icons/
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── server.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
🔐 Environment Variables

Use .env.example as the starting point for local environment configuration.

Do not commit private credentials or secrets to GitHub.

🤝 Contributing
Fork the repository.
Create a feature branch.
Make your changes.
Test the application.
Open a pull request.
📄 License

See the repository for the current project licensing information.

AlarmSync — simple alarms, synchronized everywhere.


### How to paste it

On GitHub:

**AlarmSync → README.md → ✏️ Edit → Ctrl/Cmd+A → paste the code above → Commit changes.**

For the commit message, use:

```text
docs: update README for AlarmSync
