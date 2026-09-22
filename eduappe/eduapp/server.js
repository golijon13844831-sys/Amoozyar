/* ═══════════════════════════════════════════════════════
   🎓 آموزیار — سامانه آموزشی جامع | server.js نسخه ۲.۱
   اجرا:  npm install express  →  node server.js
   نیاز: Node 18+
   ═══════════════════════════════════════════════════════ */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');

const app = express();
const server = http.createServer(app);
const clients = new Map();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const UPLOADS = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

/* ═══════════════ DB ═══════════════ */
const DB_FILE = path.join(__dirname, 'data.json');
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      users: [], classes: [], lessons: [], assignments: [],
      submissions: [], quizzes: [], quizSubmissions: [],
      attendance: [], polls: [], pollVotes: [],
      chatRooms: [], messages: [], notifications: [],
      classSessions: [], classMessages: [], uploads: [],
      questionBank: [], studentNotes: [], badges: [], studentBadges: [],
      assignmentTemplates: [], quizTemplates: [],
      studentXP: [], studentStreaks: [], flashcardReviews: [],
      userPresence: [], roomUserPrefs: [],
      announcements: [], faqs: [], contactMessages: [], activityLog: [], settings: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(DB_FILE)); }
  catch { return {}; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const SECRET = 'edu_secret_2024_change_me';
function signToken(p) {
  const h = Buffer.from('{}').toString('base64');
  const b = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 86400000 * 7 })).toString('base64');
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64');
  return `${h}.${b}.${s}`;
}
function verifyToken(token) {
  if (!token) return null;
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    if (crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64') !== s) return null;
    const p = JSON.parse(Buffer.from(b, 'base64').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function hashPw(pw) { return crypto.createHash('sha256').update(pw + SECRET).digest('hex'); }

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const u = verifyToken(t);
  if (!u) return res.status(401).json({ error: 'لطفاً وارد شوید' });
  req.user = u; next();
}
function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'دسترسی ندارید' });
    next();
  };
}
function addNotif(db, userId, text, type = 'info') {
  if (!db.notifications) db.notifications = [];
  db.notifications.push({ id: uid(), userId, text, type, read: false, createdAt: new Date().toISOString() });
  if (db.notifications.length > 500) db.notifications = db.notifications.slice(-500);
  const sock = clients.get(userId);
  if (sock) wsSend(sock, { type: 'notification', text, notifType: type });
}
function ownsClass(req, db, classId) {
  if (req.user.role === 'admin') return true;
  const cls = (db.classes || []).find(c => c.id === classId);
  return cls && cls.teacherId === req.user.id;
}
function logActivity(db, userId, userName, userRole, action, details) {
  if (!db.activityLog) db.activityLog = [];
  db.activityLog.push({ id: uid(), userId, userName, userRole, action, details: details || '', createdAt: new Date().toISOString() });
  if (db.activityLog.length > 1000) db.activityLog = db.activityLog.slice(-1000);
}

/* ─── آپلود فایل ─── */
function saveUpload(name, dataUrl) {
  try {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    const mime = m[1];
    const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 25 * 1024 * 1024) return null;
    const fname = uid() + '.' + ext;
    fs.writeFileSync(path.join(UPLOADS, fname), buf);
    const fileType = mime.startsWith('video') ? 'video' : mime.startsWith('audio') ? 'audio' : 'document';
    return { url: '/uploads/' + fname, size: buf.length, fileType };
  } catch { return null; }
}

/* ─── XP / سطح / استریک / نشان ─── */
function xpForLevel(level) { return 100 * level * (level + 1) / 2; }
function levelFromXP(xp) { let level = 1; while (xpForLevel(level + 1) <= xp) level++; return level; }
function addXP(db, studentId, amount, reason) {
  if (!db.studentXP) db.studentXP = [];
  let rec = db.studentXP.find(x => x.studentId === studentId);
  if (!rec) { rec = { studentId, totalXP: 0, history: [] }; db.studentXP.push(rec); }
  const prevLevel = levelFromXP(rec.totalXP);
  rec.totalXP += amount;
  rec.history.push({ amount, reason, at: new Date().toISOString() });
  if (rec.history.length > 100) rec.history = rec.history.slice(-100);
  const newLevel = levelFromXP(rec.totalXP);
  if (newLevel > prevLevel) addNotif(db, studentId, `🎉 تبریک! به سطح ${newLevel} رسیدید!`, 'level_up');
  return rec;
}
function bumpStreak(db, studentId) {
  if (!db.studentStreaks) db.studentStreaks = [];
  let rec = db.studentStreaks.find(s => s.studentId === studentId);
  const today = new Date().toISOString().slice(0, 10);
  if (!rec) { rec = { studentId, currentStreak: 1, longestStreak: 1, lastActiveDate: today }; db.studentStreaks.push(rec); return rec; }
  if (rec.lastActiveDate === today) return rec;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (rec.lastActiveDate === yesterday) rec.currentStreak++;
  else rec.currentStreak = 1;
  rec.longestStreak = Math.max(rec.longestStreak, rec.currentStreak);
  rec.lastActiveDate = today;
  if ([3, 7, 14, 30].includes(rec.currentStreak)) addNotif(db, studentId, `🔥 ${rec.currentStreak} روز متوالی فعالیت! عالیه!`, 'streak');
  return rec;
}
const DEFAULT_BADGES = [
  { key: 'first_quiz', icon: '🎯', name: 'اولین قدم', description: 'اولین آزمون خود را بدهید' },
  { key: 'quiz_5', icon: '📋', name: 'آزمون‌باز', description: '۵ آزمون بدهید' },
  { key: 'perfect', icon: '🏆', name: 'نمره کامل', description: '۱۰۰٪ در یک آزمون بگیرید' },
  { key: 'streak_3', icon: '🔥', name: '۳ روز پیوسته', description: '۳ روز متوالی فعال باشید' },
  { key: 'streak_7', icon: '⚡', name: 'هفته آتشین', description: '۷ روز متوالی فعال باشید' },
  { key: 'xp_300', icon: '💎', name: '۳۰۰ XP', description: '۳۰۰ امتیاز جمع کنید' },
  { key: 'xp_1000', icon: '👑', name: 'افسانه', description: '۱۰۰۰ امتیاز جمع کنید' }
];
function evaluateBadges(db, studentId) {
  if (!db.badges || !db.badges.length) db.badges = JSON.parse(JSON.stringify(DEFAULT_BADGES));
  if (!db.studentBadges) db.studentBadges = [];
  const subs = (db.quizSubmissions || []).filter(s => s.studentId === studentId);
  const streak = (db.studentStreaks || []).find(s => s.studentId === studentId);
  const xp = (db.studentXP || []).find(x => x.studentId === studentId);
  const stats = { quizzes: subs.length, best: subs.length ? Math.max(...subs.map(s => s.score)) : 0, streak: streak ? streak.currentStreak : 0, xp: xp ? xp.totalXP : 0 };
  const conds = { first_quiz: stats.quizzes >= 1, quiz_5: stats.quizzes >= 5, perfect: stats.best >= 100, streak_3: stats.streak >= 3, streak_7: stats.streak >= 7, xp_300: stats.xp >= 300, xp_1000: stats.xp >= 1000 };
  db.badges.forEach(b => {
    if (conds[b.key] && !db.studentBadges.find(sb => sb.studentId === studentId && sb.badgeKey === b.key)) {
      db.studentBadges.push({ id: uid(), studentId, badgeKey: b.key, name: b.name, icon: b.icon, at: new Date().toISOString() });
      addNotif(db, studentId, `${b.icon} نشان «${b.name}» گرفتید!`, 'badge');
    }
  });
}

/* ═══════════════ WEBSOCKET ═══════════════ */
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const user = verifyToken(token);
  if (!user) { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.user = user;
  clients.set(user.id, socket);
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, offset = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      const total = offset + (masked ? 4 : 0) + len;
      if (buf.length < total) break;
      const mask = masked ? buf.slice(offset, offset + 4) : null;
      if (masked) offset += 4;
      const payload = buf.slice(offset, offset + len);
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.slice(total);
      try { handleWsMessage(socket, JSON.parse(payload.toString('utf8'))); } catch {}
    }
  });
  socket.on('close', () => { clients.delete(user.id); notifyLeave(socket); updateLastSeen(user.id); });
  socket.on('error', () => { clients.delete(user.id); notifyLeave(socket); updateLastSeen(user.id); });
});
function updateLastSeen(userId) {
  const db = loadDB();
  if (!db.userPresence) db.userPresence = [];
  let rec = db.userPresence.find(p => p.userId === userId);
  if (!rec) { rec = { userId, lastSeen: null }; db.userPresence.push(rec); }
  rec.lastSeen = new Date().toISOString();
  saveDB(db);
}
function notifyLeave(socket) {
  if (!socket.currentClassId) return;
  const db = loadDB();
  const session = (db.classSessions || []).find(s => s.id === socket.currentClassId);
  if (!session) return;
  const members = new Set([session.teacherId, ...session.students]);
  broadcast({ type: 'presence_leave', userId: socket.user.id, userName: socket.user.name, classId: socket.currentClassId }, id => members.has(id));
}
function encodeWsFrame(msg) {
  const payload = Buffer.from(msg, 'utf8');
  const len = payload.length;
  let frame;
  if (len < 126) { frame = Buffer.alloc(2 + len); frame[0] = 0x81; frame[1] = len; payload.copy(frame, 2); }
  else if (len < 65536) { frame = Buffer.alloc(4 + len); frame[0] = 0x81; frame[1] = 126; frame.writeUInt16BE(len, 2); payload.copy(frame, 4); }
  else { frame = Buffer.alloc(10 + len); frame[0] = 0x81; frame[1] = 127; frame.writeBigUInt64BE(BigInt(len), 2); payload.copy(frame, 10); }
  return frame;
}
function wsSend(socket, data) { try { if (socket && !socket.destroyed) socket.write(encodeWsFrame(JSON.stringify(data))); } catch {} }
function broadcast(data, filter) { clients.forEach((sock, uid) => { if (!filter || filter(uid)) wsSend(sock, data); }); }

function handleWsMessage(socket, data) {
  const { type } = data;

  /* ─── پیام‌رسان ─── */
  if (type === 'chat_message') {
    const db = loadDB();
    const room = (db.chatRooms || []).find(r => r.id === data.roomId);
    if (!room) return;
    const members = new Set(room.members);
    if (!members.has(socket.user.id)) return;
    clients.forEach((sock, uid) => { if (members.has(uid) && uid !== socket.user.id) wsSend(sock, data); });
  }
  if (type === 'typing') {
    const db = loadDB();
    const room = (db.chatRooms || []).find(r => r.id === data.roomId);
    if (!room) return;
    const members = new Set(room.members);
    if (!members.has(socket.user.id)) return;
    clients.forEach((sock, uid) => {
      if (members.has(uid) && uid !== socket.user.id)
        wsSend(sock, { type: 'typing', roomId: data.roomId, userId: socket.user.id, userName: socket.user.name, isTyping: !!data.isTyping });
    });
  }

  /* ─── کلاس مجازی ─── */
  if (type === 'class_message') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    const msg = { id: uid(), senderId: socket.user.id, senderName: socket.user.name, senderRole: socket.user.role, classId: data.classId, text: String(data.text || '').slice(0, 2000), createdAt: new Date().toISOString() };
    if (!db.classMessages) db.classMessages = [];
    db.classMessages.push(msg);
    if (!session.messages) session.messages = [];
    session.messages.push(msg);
    if (session.messages.length > 300) session.messages = session.messages.slice(-300);
    saveDB(db);
    clients.forEach((sock, uid) => { if (members.has(uid) && uid !== socket.user.id) wsSend(sock, { type: 'class_message', message: msg }); });
  }
  if (type === 'class_raise_hand') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    broadcast({ type: 'class_raise_hand', userId: socket.user.id, userName: socket.user.name, classId: data.classId, action: data.action || 'up' }, id => members.has(id));
  }
  if (type === 'whiteboard') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    broadcast({ ...data }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'webrtc_signal') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id) || !members.has(data.targetId)) return;
    const targetSock = clients.get(data.targetId);
    if (targetSock) wsSend(targetSock, { type: 'webrtc_signal', fromId: socket.user.id, fromName: socket.user.name, signal: data.signal, classId: data.classId });
  }
  if (type === 'media_state') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    broadcast({ type: 'media_state', userId: socket.user.id, userName: socket.user.name, classId: data.classId, mic: data.mic, cam: data.cam, screen: data.screen, screenStreamId: data.screenStreamId }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'force_mute') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id) return;
    const targetSock = clients.get(data.targetId);
    if (targetSock) wsSend(targetSock, { type: 'force_mute', classId: data.classId, kind: data.kind || 'mic' });
  }
  if (type === 'breakout_assign') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id) return;
    session.breakoutGroups = data.groups || [];
    session.breakoutActive = true;
    saveDB(db);
    const members = new Set([session.teacherId, ...session.students]);
    broadcast({ type: 'breakout_started', classId: data.classId, groups: session.breakoutGroups }, id => members.has(id));
  }
  if (type === 'breakout_end') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id) return;
    session.breakoutActive = false;
    saveDB(db);
    const members = new Set([session.teacherId, ...session.students]);
    broadcast({ type: 'breakout_ended', classId: data.classId }, id => members.has(id));
  }
  if (type === 'live_poll_start') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id) return;
    session.livePoll = { id: uid(), question: data.question, options: data.options, votes: {}, active: true };
    saveDB(db);
    const members = new Set([session.teacherId, ...session.students]);
    broadcast({ type: 'live_poll_start', classId: data.classId, poll: session.livePoll }, id => members.has(id));
  }
  if (type === 'live_poll_vote') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || !session.livePoll || !session.livePoll.active) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    session.livePoll.votes[socket.user.id] = data.option;
    saveDB(db);
    const counts = session.livePoll.options.map((_, i) => Object.values(session.livePoll.votes).filter(v => v === i).length);
    broadcast({ type: 'live_poll_update', classId: data.classId, counts }, id => members.has(id));
  }
  if (type === 'live_poll_end') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id || !session.livePoll) return;
    session.livePoll.active = false;
    saveDB(db);
    const members = new Set([session.teacherId, ...session.students]);
    broadcast({ type: 'live_poll_end', classId: data.classId }, id => members.has(id));
  }
  if (type === 'join_session') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    socket.currentClassId = data.classId;
    broadcast({ type: 'presence_join', userId: socket.user.id, userName: socket.user.name, userRole: socket.user.role, classId: data.classId }, id => members.has(id) && id !== socket.user.id);
    const online = [...members].filter(id => clients.has(id) && id !== socket.user.id).map(id => {
      const c = clients.get(id);
      return { userId: id, userName: c.user.name, userRole: c.user.role };
    });
    wsSend(socket, { type: 'presence_list', classId: data.classId, online });
  }

  /* ─── ارتقاهای Adobe-Connect ─── */
  if (type === 'layout_change') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || session.teacherId !== socket.user.id) return;
    session.currentLayout = data.layout || 'sharing';
    saveDB(db);
    const members = new Set([session.teacherId, ...session.students]);
    broadcast({ type: 'layout_change', classId: data.classId, layout: session.currentLayout }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'class_notes') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    session.notes = String(data.content || '').slice(0, 20000);
    saveDB(db);
    broadcast({ type: 'class_notes', classId: data.classId, content: session.notes }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'class_status') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    let targetId = socket.user.id, targetName = socket.user.name;
    if (data.targetUserId && session.teacherId === socket.user.id) {
      targetId = data.targetUserId;
      targetName = (db.users.find(u => u.id === targetId) || {}).name || '';
    }
    if (!session.userStatuses) session.userStatuses = {};
    if (data.status) session.userStatuses[targetId] = { status: data.status, at: Date.now() };
    else delete session.userStatuses[targetId];
    saveDB(db);
    broadcast({ type: 'class_status', classId: data.classId, userId: targetId, userName: targetName, targetUserId: data.targetUserId || null, status: data.status || null }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'class_private_message') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id) || !members.has(data.targetId)) return;
    const payload = { type: 'class_private_message', classId: data.classId, fromId: socket.user.id, fromName: socket.user.name, text: String(data.text || '').slice(0, 2000), createdAt: new Date().toISOString() };
    const targetSock = clients.get(data.targetId);
    if (targetSock) wsSend(targetSock, payload);
    wsSend(socket, { ...payload, toId: data.targetId });
  }
  if (type === 'class_qna') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    const q = { id: uid(), question: String(data.question || '').slice(0, 500), by: socket.user.id, byName: socket.user.name, votes: {}, answered: false, createdAt: new Date().toISOString() };
    if (!session.qna) session.qna = [];
    session.qna.push(q);
    if (session.qna.length > 200) session.qna = session.qna.slice(-200);
    saveDB(db);
    broadcast({ type: 'class_qna', classId: data.classId, question: q }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'class_qna_vote') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || !session.qna) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    const q = session.qna.find(x => x.id === data.qId);
    if (!q) return;
    if (q.votes[socket.user.id]) delete q.votes[socket.user.id]; else q.votes[socket.user.id] = 1;
    saveDB(db);
    broadcast({ type: 'class_qna_update', classId: data.classId, question: q }, id => members.has(id));
  }
  if (type === 'class_qna_answer') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session || !session.qna || session.teacherId !== socket.user.id) return;
    const q = session.qna.find(x => x.id === data.qId);
    if (!q) return;
    q.answered = !q.answered;
    saveDB(db);
    broadcast({ type: 'class_qna_update', classId: data.classId, question: q }, id => members.has(id));
  }
  if (type === 'class_files') {
    const db = loadDB();
    const session = (db.classSessions || []).find(s => s.id === data.classId);
    if (!session) return;
    const members = new Set([session.teacherId, ...session.students]);
    if (!members.has(socket.user.id)) return;
    const f = { id: uid(), name: String(data.name || 'فایل'), url: String(data.url || ''), by: socket.user.name, at: new Date().toISOString() };
    if (!session.files) session.files = [];
    session.files.push(f);
    saveDB(db);
    broadcast({ type: 'class_files', classId: data.classId, file: f }, id => members.has(id) && id !== socket.user.id);
  }
  if (type === 'ping') wsSend(socket, { type: 'pong' });
}

/* ═══════════════ AUTH ═══════════════ */
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'ایمیل و رمز عبور الزامی است' });
  const db = loadDB();
  const u = db.users.find(u => u.email === email && u.password === hashPw(password) && u.active !== false);
  if (!u) return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است' });
  const token = signToken({ id: u.id, name: u.name, email: u.email, role: u.role });
  logActivity(db, u.id, u.name, u.role, 'login', 'ورود به سامانه');
  saveDB(db);
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.post('/api/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'همه فیلدها الزامی است' });
  if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'نقش نامعتبر است — ثبت‌نام مدیر مجاز نیست' });
  if (String(name).trim().length < 3) return res.status(400).json({ error: 'نام باید حداقل ۳ کاراکتر باشد' });
  if (String(password).length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'ایمیل نامعتبر است' });
  const db = loadDB();
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'این ایمیل قبلاً ثبت شده است' });
  const u = { id: uid(), name: String(name).trim(), email, password: hashPw(password), role, classIds: [], active: true, createdAt: new Date().toISOString() };
  db.users.push(u);
  logActivity(db, u.id, u.name, u.role, 'register', `ثبت‌نام ${role === 'teacher' ? 'معلم' : 'دانش‌آموز'}: ${u.name}`);
  saveDB(db);
  const token = signToken({ id: u.id, name: u.name, email: u.email, role: u.role });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.get('/api/me', auth, (req, res) => {
  const db = loadDB();
  const u = db.users.find(u => u.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'یافت نشد' });
  const { password, ...safe } = u;
  res.json(safe);
});

/* ─── پروفایل ─── */
app.get('/api/profile', auth, (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'یافت نشد' });
  const stats = {};
  if (u.role === 'student') {
    const xp = (db.studentXP || []).find(x => x.studentId === u.id);
    stats.totalXP = xp ? xp.totalXP : 0;
    const streak = (db.studentStreaks || []).find(s => s.studentId === u.id);
    stats.streak = streak ? streak.currentStreak : 0;
    const subs = (db.quizSubmissions || []).filter(s => s.studentId === u.id);
    stats.quizzesTaken = subs.length;
    stats.avgScore = subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : null;
    stats.badges = (db.studentBadges || []).filter(b => b.studentId === u.id).length;
    stats.classesCount = (db.classes || []).filter(c => (c.studentIds || []).includes(u.id)).length;
    stats.assignmentsSubmitted = (db.submissions || []).filter(s => s.studentId === u.id).length;
  }
  if (u.role === 'teacher') {
    const myClasses = (db.classes || []).filter(c => c.teacherId === u.id);
    stats.classesCount = myClasses.length;
    stats.studentsCount = new Set(myClasses.flatMap(c => c.studentIds || [])).size;
    const ids = myClasses.map(c => c.id);
    stats.lessonsCount = (db.lessons || []).filter(l => ids.includes(l.classId)).length;
    stats.quizzesCount = (db.quizzes || []).filter(q => ids.includes(q.classId)).length;
    stats.sessionsCount = (db.classSessions || []).filter(s => ids.includes(s.classId)).length;
  }
  if (u.role === 'admin') {
    stats.usersCount = db.users.length;
    stats.teachersCount = db.users.filter(x => x.role === 'teacher').length;
    stats.studentsCount = db.users.filter(x => x.role === 'student').length;
    stats.classesCount = (db.classes || []).length;
    stats.lessonsCount = (db.lessons || []).length;
    stats.quizzesCount = (db.quizzes || []).length;
  }
  res.json({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, active: u.active !== false, stats });
});
app.patch('/api/profile', auth, (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'یافت نشد' });
  const { name } = req.body;
  if (name !== undefined) {
    if (String(name).trim().length < 3) return res.status(400).json({ error: 'نام باید حداقل ۳ کاراکتر باشد' });
    u.name = String(name).trim();
    (db.classes || []).forEach(c => { if (c.teacherId === u.id) c.teacherName = u.name; });
    (db.submissions || []).forEach(s => { if (s.studentId === u.id) s.studentName = u.name; });
    (db.quizSubmissions || []).forEach(s => { if (s.studentId === u.id) s.studentName = u.name; });
    logActivity(db, u.id, u.name, u.role, 'update_profile', 'تغییر نام پروفایل');
  }
  saveDB(db);
  const { password, ...safe } = u;
  res.json(safe);
});
app.post('/api/profile/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'هر دو رمز الزامی است' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: 'رمز جدید باید حداقل ۶ کاراکتر باشد' });
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'یافت نشد' });
  if (u.password !== hashPw(currentPassword)) return res.status(400).json({ error: 'رمز فعلی اشتباه است' });
  u.password = hashPw(newPassword);
  logActivity(db, u.id, u.name, u.role, 'change_password', 'تغییر رمز عبور');
  saveDB(db);
  res.json({ ok: true });
});

/* ═══════════════ ADMIN ═══════════════ */
app.get('/api/admin/users', auth, role('admin'), (req, res) => {
  const db = loadDB();
  res.json((db.users || []).map(u => { const { password, ...s } = u; return s; }));
});
app.post('/api/admin/users', auth, role('admin'), (req, res) => {
  const { name, email, password, role: r, classIds } = req.body;
  if (!name || !email || !password || !r) return res.status(400).json({ error: 'همه فیلدها الزامی است' });
  const db = loadDB();
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'ایمیل تکراری است' });
  const u = { id: uid(), name, email, password: hashPw(password), role: r, classIds: classIds || [], active: true, createdAt: new Date().toISOString() };
  db.users.push(u);
  logActivity(db, req.user.id, req.user.name, req.user.role, 'create_user', `کاربر جدید: ${name} (${r})`);
  saveDB(db);
  const { password: _, ...safe } = u;
  res.json(safe);
});
app.patch('/api/admin/users/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const u = db.users.find(u => u.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'یافت نشد' });
  const { name, email, password, active, classIds } = req.body;
  if (name) u.name = name;
  if (email) u.email = email;
  if (password) u.password = hashPw(password);
  if (active !== undefined) u.active = active;
  if (classIds && u.role === 'student') {
    const oldIds = u.classIds || [];
    u.classIds = classIds;
    (db.classes || []).forEach(cls => {
      const wasIn = oldIds.includes(cls.id), nowIn = classIds.includes(cls.id);
      if (nowIn && !cls.studentIds.includes(u.id)) cls.studentIds.push(u.id);
      if (!nowIn && cls.studentIds.includes(u.id)) cls.studentIds = cls.studentIds.filter(id => id !== u.id);
      const room = (db.chatRooms || []).find(r => r.classId === cls.id);
      if (room) room.members = [cls.teacherId, ...(cls.studentIds || [])];
    });
  } else if (classIds) u.classIds = classIds;
  saveDB(db);
  const { password: _, ...safe } = u;
  res.json(safe);
});
app.delete('/api/admin/users/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  const u = db.users[idx];
  if (u.role === 'admin') return res.status(400).json({ error: 'نمیتوان ادمین را حذف کرد' });
  if (u.role === 'teacher' && (db.classes || []).some(c => c.teacherId === u.id))
    return res.status(400).json({ error: 'ابتدا کلاس‌های این معلم را به معلم دیگری منتقل یا حذف کنید' });
  if (u.role === 'student') {
    (db.classes || []).forEach(cls => { cls.studentIds = (cls.studentIds || []).filter(id => id !== u.id); });
    (db.chatRooms || []).forEach(room => { room.members = (room.members || []).filter(id => id !== u.id); });
  }
  db.users.splice(idx, 1);
  logActivity(db, req.user.id, req.user.name, req.user.role, 'delete_user', `کاربر حذف شد: ${u.name} (${u.role})`);
  saveDB(db);
  res.json({ ok: true });
});
app.get('/api/admin/stats', auth, role('admin'), (req, res) => {
  const db = loadDB();
  res.json({
    users: db.users.length,
    teachers: db.users.filter(u => u.role === 'teacher').length,
    students: db.users.filter(u => u.role === 'student').length,
    classes: (db.classes || []).length,
    lessons: (db.lessons || []).length,
    quizzes: (db.quizzes || []).length
  });
});
app.get('/api/admin/advanced-stats', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const now = new Date();
  const last7 = [...Array(7)].map((_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
  res.json({
    signupsByDay: last7.map(date => ({ date, count: db.users.filter(u => u.createdAt && u.createdAt.slice(0, 10) === date).length })),
    loginsByDay: last7.map(date => ({ date, count: (db.activityLog || []).filter(a => a.action === 'login' && a.createdAt.slice(0, 10) === date).length })),
    submissionsByDay: last7.map(date => ({ date, count: (db.quizSubmissions || []).filter(s => s.submittedAt && s.submittedAt.slice(0, 10) === date).length })),
    totalMessages: (db.messages || []).length + (db.classMessages || []).length,
    totalSubmissions: (db.quizSubmissions || []).length + (db.submissions || []).length,
    activeUsersToday: new Set((db.activityLog || []).filter(a => a.createdAt.slice(0, 10) === now.toISOString().slice(0, 10)).map(a => a.userId)).size
  });
});

/* ─── اطلاعیه‌ها ─── */
app.get('/api/announcements', (req, res) => {
  const db = loadDB();
  res.json((db.announcements || []).filter(a => a.active !== false).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.get('/api/admin/announcements', auth, role('admin'), (req, res) => {
  const db = loadDB();
  res.json((db.announcements || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.post('/api/admin/announcements', auth, role('admin'), (req, res) => {
  const { title, body } = req.body;
  if (!title) return res.status(400).json({ error: 'عنوان الزامی است' });
  const db = loadDB();
  const a = { id: uid(), title, body: body || '', active: true, createdAt: new Date().toISOString() };
  if (!db.announcements) db.announcements = [];
  db.announcements.push(a);
  logActivity(db, req.user.id, req.user.name, req.user.role, 'create_announcement', title);
  saveDB(db);
  res.json(a);
});
app.patch('/api/admin/announcements/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const a = (db.announcements || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'یافت نشد' });
  Object.assign(a, req.body);
  saveDB(db);
  res.json(a);
});
app.delete('/api/admin/announcements/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.announcements || []).findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  db.announcements.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

/* ─── FAQ ─── */
app.get('/api/faqs', (req, res) => { const db = loadDB(); res.json((db.faqs || []).filter(f => f.active !== false)); });
app.get('/api/admin/faqs', auth, role('admin'), (req, res) => { const db = loadDB(); res.json(db.faqs || []); });
app.post('/api/admin/faqs', auth, role('admin'), (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'سوال و پاسخ الزامی است' });
  const db = loadDB();
  const f = { id: uid(), question, answer, active: true, order: (db.faqs || []).length, createdAt: new Date().toISOString() };
  if (!db.faqs) db.faqs = [];
  db.faqs.push(f);
  saveDB(db);
  res.json(f);
});
app.patch('/api/admin/faqs/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const f = (db.faqs || []).find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'یافت نشد' });
  Object.assign(f, req.body);
  saveDB(db);
  res.json(f);
});
app.delete('/api/admin/faqs/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.faqs || []).findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  db.faqs.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

/* ─── لاگ / بک‌آپ / تماس / بالک / تنظیمات ─── */
app.get('/api/admin/activity-log', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const { action, limit } = req.query;
  let log = (db.activityLog || []).slice().reverse();
  if (action) log = log.filter(l => l.action === action);
  res.json(log.slice(0, parseInt(limit) || 100));
});
app.get('/api/admin/backup', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const safeDb = { ...db, users: db.users.map(u => { const { password, ...s } = u; return s; }) };
  logActivity(db, req.user.id, req.user.name, req.user.role, 'backup_export', 'دانلود پشتیبان دیتابیس');
  saveDB(db);
  res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(safeDb);
});
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'همه فیلدها الزامی است' });
  const db = loadDB();
  const m = { id: uid(), name, email, message, read: false, createdAt: new Date().toISOString() };
  if (!db.contactMessages) db.contactMessages = [];
  db.contactMessages.push(m);
  saveDB(db);
  res.json({ ok: true });
});
app.get('/api/admin/contact-messages', auth, role('admin'), (req, res) => {
  const db = loadDB();
  res.json((db.contactMessages || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.patch('/api/admin/contact-messages/:id/read', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const m = (db.contactMessages || []).find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'یافت نشد' });
  m.read = true;
  saveDB(db);
  res.json(m);
});
app.delete('/api/admin/contact-messages/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.contactMessages || []).findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  db.contactMessages.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/admin/users/bulk', auth, role('admin'), (req, res) => {
  const { userIds, action } = req.body;
  if (!userIds?.length || !action) return res.status(400).json({ error: 'اطلاعات ناقص است' });
  const db = loadDB();
  let affected = 0;
  userIds.forEach(id => {
    const u = db.users.find(x => x.id === id);
    if (!u || u.role === 'admin') return;
    if (action === 'activate') { u.active = true; affected++; }
    if (action === 'deactivate') { u.active = false; affected++; }
    if (action === 'delete') {
      const idx = db.users.findIndex(x => x.id === id);
      if (idx !== -1) {
        if (u.role === 'teacher' && (db.classes || []).some(c => c.teacherId === u.id)) return;
        if (u.role === 'student') {
          (db.classes || []).forEach(cls => { cls.studentIds = (cls.studentIds || []).filter(sid => sid !== u.id); });
          (db.chatRooms || []).forEach(room => { room.members = (room.members || []).filter(mid => mid !== u.id); });
        }
        db.users.splice(idx, 1);
        affected++;
      }
    }
  });
  logActivity(db, req.user.id, req.user.name, req.user.role, 'bulk_user_action', `${action} روی ${affected} کاربر`);
  saveDB(db);
  res.json({ ok: true, affected });
});
app.get('/api/settings', (req, res) => { const db = loadDB(); res.json(db.settings || {}); });
app.patch('/api/admin/settings', auth, role('admin'), (req, res) => {
  const db = loadDB();
  db.settings = { ...(db.settings || {}), ...req.body };
  logActivity(db, req.user.id, req.user.name, req.user.role, 'update_settings', 'تنظیمات سامانه ویرایش شد');
  saveDB(db);
  res.json(db.settings);
});
app.get('/api/admin/storage', auth, role('admin'), (req, res) => {
  let totalSize = 0, fileCount = 0;
  try {
    fs.readdirSync(UPLOADS).forEach(f => {
      if (f === '.gitkeep') return;
      const stat = fs.statSync(path.join(UPLOADS, f));
      if (stat.isFile()) { totalSize += stat.size; fileCount++; }
    });
  } catch {}
  const dbSize = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
  res.json({ uploadsSizeBytes: totalSize, uploadsFileCount: fileCount, dbSizeBytes: dbSize, totalSizeBytes: totalSize + dbSize });
});
app.post('/api/admin/restore', auth, role('admin'), (req, res) => {
  const backup = req.body;
  if (!backup || typeof backup !== 'object' || !Array.isArray(backup.users))
    return res.status(400).json({ error: 'فایل پشتیبان نامعتبر است' });
  const db = loadDB();
  const restoredUsers = backup.users.map(bu => {
    const existing = db.users.find(u => u.id === bu.id);
    return { ...bu, password: existing ? existing.password : hashPw('changeme123') };
  });
  const merged = { ...db, ...backup, users: restoredUsers };
  logActivity(merged, req.user.id, req.user.name, req.user.role, 'backup_restore', 'دیتابیس از فایل پشتیبان بازیابی شد');
  saveDB(merged);
  res.json({ ok: true, usersRestored: restoredUsers.length });
});
app.get('/api/feature-flags', (req, res) => {
  const db = loadDB();
  res.json(db.settings?.featureFlags || { chat: true, virtualClass: true, quizzes: true, polls: true, questionBank: true, leaderboard: true });
});
app.patch('/api/admin/feature-flags', auth, role('admin'), (req, res) => {
  const db = loadDB();
  if (!db.settings) db.settings = {};
  db.settings.featureFlags = { ...(db.settings.featureFlags || {}), ...req.body };
  logActivity(db, req.user.id, req.user.name, req.user.role, 'update_feature_flags', JSON.stringify(req.body));
  saveDB(db);
  res.json(db.settings.featureFlags);
});
app.get('/api/teacher/students', auth, role('teacher'), (req, res) => {
  const db = loadDB();
  const myClasses = (db.classes || []).filter(c => c.teacherId === req.user.id);
  const ids = new Set();
  myClasses.forEach(c => (c.studentIds || []).forEach(id => ids.add(id)));
  res.json(db.users.filter(u => ids.has(u.id)).map(u => ({ id: u.id, name: u.name })));
});

/* ═══════════════ کلاس‌ها ═══════════════ */
app.get('/api/classes', auth, (req, res) => {
  const db = loadDB();
  let classes = db.classes || [];
  if (req.user.role === 'teacher') classes = classes.filter(c => c.teacherId === req.user.id);
  if (req.user.role === 'student') classes = classes.filter(c => (c.studentIds || []).includes(req.user.id));
  res.json(classes);
});
app.post('/api/classes', auth, role('admin'), (req, res) => {
  const { name, teacherId, studentIds, subject } = req.body;
  if (!name || !teacherId) return res.status(400).json({ error: 'نام و معلم الزامی است' });
  const db = loadDB();
  const teacher = db.users.find(u => u.id === teacherId && u.role === 'teacher');
  if (!teacher) return res.status(400).json({ error: 'معلم یافت نشد' });
  const cls = { id: uid(), name, subject: subject || '', teacherId, teacherName: teacher.name, studentIds: studentIds || [], createdAt: new Date().toISOString() };
  if (!db.classes) db.classes = [];
  db.classes.push(cls);
  if (!db.chatRooms) db.chatRooms = [];
  db.chatRooms.push({ id: 'room_' + cls.id, classId: cls.id, name: `گروه ${cls.name}`, type: 'class', members: [teacherId, ...(studentIds || [])], createdAt: new Date().toISOString() });
  logActivity(db, req.user.id, req.user.name, req.user.role, 'create_class', `کلاس جدید: ${name} (معلم: ${teacher.name})`);
  saveDB(db);
  res.json(cls);
});
app.patch('/api/classes/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const cls = (db.classes || []).find(c => c.id === req.params.id);
  if (!cls) return res.status(404).json({ error: 'یافت نشد' });
  if (req.body.teacherId && req.body.teacherId !== cls.teacherId) {
    const newTeacher = db.users.find(u => u.id === req.body.teacherId && u.role === 'teacher');
    if (!newTeacher) return res.status(400).json({ error: 'معلم یافت نشد' });
    req.body.teacherName = newTeacher.name;
  }
  Object.assign(cls, req.body);
  const room = (db.chatRooms || []).find(r => r.classId === cls.id);
  if (room) room.members = [cls.teacherId, ...(cls.studentIds || [])];
  saveDB(db);
  res.json(cls);
});
app.delete('/api/classes/:id', auth, role('admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.classes || []).findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  const classId = req.params.id;
  db.classes.splice(idx, 1);
  db.lessons = (db.lessons || []).filter(l => l.classId !== classId);
  db.assignments = (db.assignments || []).filter(a => a.classId !== classId);
  db.quizzes = (db.quizzes || []).filter(q => q.classId !== classId);
  db.polls = (db.polls || []).filter(p => p.classId !== classId);
  db.attendance = (db.attendance || []).filter(a => a.classId !== classId);
  db.classSessions = (db.classSessions || []).filter(s => s.classId !== classId);
  db.chatRooms = (db.chatRooms || []).filter(r => r.classId !== classId);
  saveDB(db);
  res.json({ ok: true });
});

/* ═══════════════ درس‌ها ═══════════════ */
app.get('/api/lessons', auth, (req, res) => {
  const db = loadDB();
  let lessons = db.lessons || [];
  if (req.query.classId) lessons = lessons.filter(l => l.classId === req.query.classId);
  res.json(lessons);
});
app.post('/api/lessons', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, title, content, files } = req.body;
  if (!classId || !title) return res.status(400).json({ error: 'کلاس و عنوان الزامی است' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'شما معلم این کلاس نیستید' });
  const lesson = { id: uid(), classId, title, content: content || '', files: files || [], teacherId: req.user.id, createdAt: new Date().toISOString() };
  if (!db.lessons) db.lessons = [];
  db.lessons.push(lesson);
  const cls = (db.classes || []).find(c => c.id === classId);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `درس جدید: "${title}" در کلاس ${cls.name}`, 'lesson'));
  saveDB(db);
  res.json(lesson);
});
app.patch('/api/lessons/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const lesson = (db.lessons || []).find(l => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, lesson.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  Object.assign(lesson, req.body);
  saveDB(db);
  res.json(lesson);
});
app.delete('/api/lessons/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.lessons || []).findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, db.lessons[idx].classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  db.lessons.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/lessons/:id/copy', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const lesson = (db.lessons || []).find(l => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'درس یافت نشد' });
  const { targetClassId } = req.body;
  if (!targetClassId || !ownsClass(req, db, targetClassId)) return res.status(403).json({ error: 'کلاس مقصد نامعتبر است' });
  const copy = { ...JSON.parse(JSON.stringify(lesson)), id: uid(), classId: targetClassId, createdAt: new Date().toISOString() };
  db.lessons.push(copy);
  const cls = (db.classes || []).find(c => c.id === targetClassId);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `درس جدید: "${copy.title}" در کلاس ${cls.name}`, 'lesson'));
  saveDB(db);
  res.json(copy);
});

/* ═══════════════ تکالیف ═══════════════ */
app.get('/api/assignments', auth, (req, res) => {
  const db = loadDB();
  let list = db.assignments || [];
  if (req.query.classId) list = list.filter(a => a.classId === req.query.classId);
  res.json(list);
});
app.post('/api/assignments', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, title, description, dueDate } = req.body;
  if (!classId || !title) return res.status(400).json({ error: 'کلاس و عنوان الزامی است' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'شما معلم این کلاس نیستید' });
  const a = { id: uid(), classId, title, description: description || '', dueDate: dueDate || '', teacherId: req.user.id, createdAt: new Date().toISOString() };
  if (!db.assignments) db.assignments = [];
  db.assignments.push(a);
  const cls = (db.classes || []).find(c => c.id === classId);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `تکلیف جدید: "${title}"`, 'assignment'));
  saveDB(db);
  res.json(a);
});
app.delete('/api/assignments/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.assignments || []).findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, db.assignments[idx].classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const assignmentId = db.assignments[idx].id;
  db.assignments.splice(idx, 1);
  db.submissions = (db.submissions || []).filter(s => s.assignmentId !== assignmentId);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/assignments/:id/submit', auth, role('student'), (req, res) => {
  const { text, files } = req.body;
  const db = loadDB();
  if (!db.submissions) db.submissions = [];
  if (db.submissions.find(s => s.assignmentId === req.params.id && s.studentId === req.user.id))
    return res.status(400).json({ error: 'قبلاً ارسال کرده‌اید' });
  const sub = { id: uid(), assignmentId: req.params.id, studentId: req.user.id, studentName: req.user.name, text: text || '', files: files || [], grade: null, feedback: '', submittedAt: new Date().toISOString() };
  db.submissions.push(sub);
  saveDB(db);
  res.json(sub);
});
app.get('/api/assignments/:id/submissions', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const assignment = (db.assignments || []).find(a => a.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, assignment.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.json((db.submissions || []).filter(s => s.assignmentId === req.params.id));
});
app.patch('/api/submissions/:id/grade', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const sub = (db.submissions || []).find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'یافت نشد' });
  const assignment = (db.assignments || []).find(a => a.id === sub.assignmentId);
  if (!assignment || !ownsClass(req, db, assignment.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  sub.grade = req.body.grade;
  sub.feedback = req.body.feedback || '';
  addNotif(db, sub.studentId, `نمره تکلیف شما ثبت شد: ${sub.grade}`, 'grade');
  saveDB(db);
  res.json(sub);
});
app.get('/api/student/submissions', auth, role('student'), (req, res) => {
  const db = loadDB();
  res.json((db.submissions || []).filter(s => s.studentId === req.user.id));
});

/* ═══════════════ آزمون‌ها (نسخه گامایی + پچ‌ها) ═══════════════ */
app.get('/api/quizzes', auth, (req, res) => {
  const db = loadDB();
  let list = db.quizzes || [];
  if (req.query.classId) list = list.filter(q => q.classId === req.query.classId);
  if (req.user.role === 'student') {
    const done = (db.quizSubmissions || []).filter(s => s.studentId === req.user.id).map(s => s.quizId);
    list = list.map(q => ({ ...q, done: done.includes(q.id) }));
  }
  res.json(list);
});
app.post('/api/quizzes', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, title, questions, timeLimit, shuffle, showResults, negativeMark } = req.body;
  if (!classId || !title || !questions?.length) return res.status(400).json({ error: 'اطلاعات ناقص است' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'شما معلم این کلاس نیستید' });
  const quiz = {
    id: uid(), classId, title, questions, teacherId: req.user.id, active: true,
    timeLimit: Math.max(0, +timeLimit || 0),
    shuffle: !!shuffle,
    showResults: showResults !== false,
    negativeMark: [0, 0.25, 0.33, 0.5].includes(+negativeMark) ? +negativeMark : 0,
    createdAt: new Date().toISOString()
  };
  if (!db.quizzes) db.quizzes = [];
  db.quizzes.push(quiz);
  const cls = (db.classes || []).find(c => c.id === classId);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `آزمون جدید: "${title}"${timeLimit ? ` (${timeLimit} دقیقه)` : ''}`, 'quiz'));
  saveDB(db);
  res.json(quiz);
});
app.get('/api/quizzes/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, quiz.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.json(quiz);
});
app.patch('/api/quizzes/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, quiz.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { title, questions, timeLimit, shuffle, showResults, negativeMark } = req.body;
  if (title !== undefined) quiz.title = title;
  if (questions !== undefined) quiz.questions = questions;
  if (timeLimit !== undefined) quiz.timeLimit = Math.max(0, +timeLimit || 0);
  if (shuffle !== undefined) quiz.shuffle = !!shuffle;
  if (showResults !== undefined) quiz.showResults = showResults !== false;
  if (negativeMark !== undefined) quiz.negativeMark = [0, 0.25, 0.33, 0.5].includes(+negativeMark) ? +negativeMark : 0;
  saveDB(db);
  res.json(quiz);
});
app.delete('/api/quizzes/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const idx = (db.quizzes || []).findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, db.quizzes[idx].classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const quizId = db.quizzes[idx].id;
  db.quizzes.splice(idx, 1);
  db.quizSubmissions = (db.quizSubmissions || []).filter(s => s.quizId !== quizId);
  saveDB(db);
  res.json({ ok: true });
});
/* نتایج آزمون برای معلم (پچ باگ ۳) */
app.get('/api/quizzes/:id/submissions', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, quiz.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.json((db.quizSubmissions || []).filter(s => s.quizId === quiz.id)
    .map(s => ({ id: s.id, studentName: s.studentName, score: s.score,
      grade: s.score, text: `امتیاز: ${s.score} از ۱۰۰ — ${s.correct} از ${s.total} صحیح`,
      feedback: '', submittedAt: s.submittedAt })));
});
/* دریافت آزمون دانش‌آموز — با کلید قطعی (پچ باگ ۲) */
app.get('/api/student/quizzes/:id', auth, role('student'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id && q.active);
  if (!quiz) return res.status(404).json({ error: 'آزمون یافت نشد' });
  const already = (db.quizSubmissions || []).find(s => s.quizId === req.params.id && s.studentId === req.user.id);
  if (already) return res.status(400).json({ error: 'قبلاً این آزمون را داده‌اید', submission: already });
  let questions = quiz.questions.map((q, i) => {
    const { answer, explanation, ...safe } = q;
    return { ...safe, id: q.id || (quiz.id + '_' + i) };
  });
  if (quiz.shuffle && questions.length > 1) {
    let seed = 0; for (const c of req.user.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  res.json({ id: quiz.id, title: quiz.title, questions, timeLimit: quiz.timeLimit || 0, negativeMark: quiz.negativeMark || 0, showResults: quiz.showResults !== false });
});
app.get('/api/student/quizzes/:id/mysubmission', auth, role('student'), (req, res) => {
  const db = loadDB();
  const sub = (db.quizSubmissions || []).find(s => s.quizId === req.params.id && s.studentId === req.user.id);
  res.json(sub || null);
});
/* ثبت پاسخ — دو فرمت + کلید قطعی (پچ باگ ۲) */
app.post('/api/student/quizzes/:id/submit', auth, role('student'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'آزمون یافت نشد' });
  if ((db.quizSubmissions || []).find(s => s.quizId === req.params.id && s.studentId === req.user.id))
    return res.status(400).json({ error: 'قبلاً این آزمون را داده‌اید' });
  let answersArr;
  if (Array.isArray(req.body.answers)) answersArr = req.body.answers;
  else {
    const obj = req.body.answers || {};
    answersArr = quiz.questions.map((q, i) => {
      const key = q.id || (quiz.id + '_' + i);
      return obj[key] !== undefined ? obj[key] : '';
    });
  }
  let correct = 0, wrong = 0, empty = 0, penalty = 0;
  const neg = quiz.negativeMark || 0;
  const results = quiz.questions.map((q, i) => {
    const userAns = String(answersArr[i] || '').trim().toLowerCase();
    const correctAns = String(q.answer || '').trim().toLowerCase();
    let isCorrect = false;
    if (q.type === 'mc' || q.type === 'tf') isCorrect = userAns === correctAns;
    else if (q.type === 'fill') isCorrect = userAns !== '' && (userAns === correctAns || correctAns.includes(userAns));
    else isCorrect = userAns.length > 5;
    if (isCorrect) correct++;
    else if (userAns === '') empty++;
    else { wrong++; if (neg > 0 && q.type !== 'essay') penalty += neg; }
    return { question: q.question, userAnswer: answersArr[i] || '', correctAnswer: q.answer, isCorrect, explanation: q.explanation || '' };
  });
  const total = quiz.questions.length;
  const score = Math.max(0, Math.round(((correct - penalty) / total) * 100));
  const sub = {
    id: uid(), quizId: quiz.id, quizTitle: quiz.title,
    studentId: req.user.id, studentName: req.user.name,
    score, correct, wrong, empty, total,
    timeSpent: req.body.timeSpent || null,
    results, submittedAt: new Date().toISOString()
  };
  if (!db.quizSubmissions) db.quizSubmissions = [];
  db.quizSubmissions.push(sub);
  const all = db.quizSubmissions.filter(s => s.quizId === quiz.id);
  const scores = all.map(s => s.score);
  sub.classAvg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  sub.totalStudents = scores.length;
  sub.rank = scores.filter(s => s > sub.score).length + 1;
  sub.percentile = scores.length > 1 ? Math.round((1 - (sub.rank - 1) / scores.length) * 100) : null;
  evaluateBadges(db, req.user.id);
  addXP(db, req.user.id, 15 + Math.round(score / 10), 'quiz_submit');
  bumpStreak(db, req.user.id);
  saveDB(db);
  res.json(sub);
});
app.get('/api/quizzes/:id/analysis', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const quiz = (db.quizzes || []).find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, quiz.classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const subs = (db.quizSubmissions || []).filter(s => s.quizId === quiz.id);
  if (!subs.length) return res.status(400).json({ error: 'هنوز کسی آزمون نداده' });
  const items = quiz.questions.map((q, i) => {
    let correct = 0;
    subs.forEach(s => { if (s.results?.[i]?.isCorrect) correct++; });
    return { question: q.question, correct, total: subs.length, correctPct: Math.round(correct / subs.length * 100) };
  });
  res.json({ items, submissions: subs.length, avg: Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) });
});

/* ═══════════════ XP / استریک / فلش‌کارت / عملکرد ═══════════════ */
app.get('/api/students/me/xp', auth, role('student'), (req, res) => {
  const db = loadDB();
  const rec = (db.studentXP || []).find(x => x.studentId === req.user.id) || { totalXP: 0, history: [] };
  const level = levelFromXP(rec.totalXP);
  res.json({
    totalXP: rec.totalXP, level,
    progressInLevel: rec.totalXP - xpForLevel(level),
    neededForNext: xpForLevel(level + 1) - xpForLevel(level),
    recentHistory: (rec.history || []).slice(-10).reverse()
  });
});
app.get('/api/students/me/streak', auth, role('student'), (req, res) => {
  const db = loadDB();
  const rec = (db.studentStreaks || []).find(s => s.studentId === req.user.id) || { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const isActive = rec.lastActiveDate === today || rec.lastActiveDate === yesterday;
  res.json({ currentStreak: isActive ? rec.currentStreak : 0, longestStreak: rec.longestStreak, lastActiveDate: rec.lastActiveDate });
});
app.post('/api/students/me/activity-ping', auth, role('student'), (req, res) => {
  const db = loadDB();
  bumpStreak(db, req.user.id);
  addXP(db, req.user.id, 2, 'daily_activity');
  saveDB(db);
  res.json({ ok: true });
});
app.get('/api/students/me/motivation', auth, role('student'), (req, res) => {
  const msgs = [
    { emoji: '🚀', message: 'امروز روز توست — یک آزمون بزن!' },
    { emoji: '💪', message: 'هر قدم کوچک، پیشرفت بزرگ است.' },
    { emoji: '🔥', message: 'استریکت را حفظ کن!' },
    { emoji: '🎯', message: 'تمرکز، کلید موفقیت است.' },
    { emoji: '⭐', message: 'بهتر از دیروز باش، نه بهتر از دیگران.' },
    { emoji: '📚', message: 'مرور فلش‌کارت‌ها مغزت را قوی می‌کند!' }
  ];
  res.json(msgs[Math.floor(Math.random() * msgs.length)]);
});
app.get('/api/students/me/flashcards', auth, role('student'), (req, res) => {
  const db = loadDB();
  const mySubs = (db.quizSubmissions || []).filter(s => s.studentId === req.user.id);
  const cards = [];
  mySubs.forEach(sub => {
    const quiz = (db.quizzes || []).find(q => q.id === sub.quizId);
    if (!quiz) return;
    if (req.query.classId && quiz.classId !== req.query.classId) return;
    sub.results.forEach((r, i) => {
      if (quiz.questions[i]?.type === 'essay') return;
      cards.push({ id: `${sub.id}_${i}`, question: r.question, answer: r.correctAnswer, wasCorrect: r.isCorrect, quizTitle: quiz.title, classId: quiz.classId });
    });
  });
  cards.sort((a, b) => (a.wasCorrect === b.wasCorrect) ? 0 : (a.wasCorrect ? 1 : -1));
  res.json(cards);
});
app.post('/api/students/me/flashcards/review', auth, role('student'), (req, res) => {
  const { cardId, knewIt } = req.body;
  const db = loadDB();
  if (!db.flashcardReviews) db.flashcardReviews = [];
  db.flashcardReviews.push({ id: uid(), studentId: req.user.id, cardId, knewIt: !!knewIt, reviewedAt: new Date().toISOString() });
  if (knewIt) addXP(db, req.user.id, 1, 'flashcard_review');
  saveDB(db);
  res.json({ ok: true });
});
app.get('/api/students/me/performance', auth, role('student'), (req, res) => {
  const db = loadDB();
  const subs = (db.quizSubmissions || []).filter(s => s.studentId === req.user.id)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  const trend = subs.map(s => ({ label: s.quizTitle?.slice(0, 12) || 'آزمون', title: s.quizTitle, score: s.score }));
  const avgScore = subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : 0;
  const byType = {};
  subs.forEach(s => s.results.forEach((r, i) => {
    const quiz = (db.quizzes || []).find(q => q.id === s.quizId);
    const type = quiz?.questions?.[i]?.type || 'mc';
    if (type === 'essay') return;
    byType[type] = byType[type] || { correct: 0, total: 0 };
    byType[type].total++;
    if (r.isCorrect) byType[type].correct++;
  }));
  const weaknesses = Object.entries(byType).map(([type, v]) => ({ type, total: v.total, correctPct: Math.round(v.correct / v.total * 100) }))
    .sort((a, b) => a.correctPct - b.correctPct);
  res.json({ avgScore, trend, weaknesses, quizzesTaken: subs.length });
});
app.get('/api/students/:id/performance', auth, (req, res) => {
  if (req.user.role === 'student' && req.user.id !== req.params.id) return res.status(403).json({ error: 'دسترسی ندارید' });
  const db = loadDB();
  const subs = (db.quizSubmissions || []).filter(s => s.studentId === req.params.id);
  const avgScore = subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : null;
  res.json({ avgScore, quizzesTaken: subs.length, trend: subs.map(s => ({ score: s.score, label: s.quizTitle })) });
});
app.get('/api/students/:id/badges', auth, (req, res) => {
  const db = loadDB();
  res.json((db.studentBadges || []).filter(b => b.studentId === req.params.id));
});
app.get('/api/badge-defs', auth, (req, res) => {
  const db = loadDB();
  if (!db.badges || !db.badges.length) db.badges = JSON.parse(JSON.stringify(DEFAULT_BADGES));
  res.json(db.badges);
});
app.get('/api/students/me/today', auth, role('student'), (req, res) => {
  const db = loadDB();
  const myClasses = (db.classes || []).filter(c => (c.studentIds || []).includes(req.user.id));
  const classIds = myClasses.map(c => c.id);
  const doneQuizIds = (db.quizSubmissions || []).filter(s => s.studentId === req.user.id).map(s => s.quizId);
  const pendingQuizzes = (db.quizzes || []).filter(q => classIds.includes(q.classId) && q.active !== false && !doneQuizIds.includes(q.id))
    .map(q => ({ id: q.id, title: q.title }));
  const mySubs = (db.submissions || []).filter(s => s.studentId === req.user.id).map(s => s.assignmentId);
  const dueSoonAssignments = (db.assignments || []).filter(a => {
    if (!classIds.includes(a.classId) || mySubs.includes(a.id) || !a.dueDate) return false;
    const days = (new Date(a.dueDate) - Date.now()) / 86400000;
    return days >= -1 && days <= 5;
  }).map(a => ({ id: a.id, title: a.title, dueDate: a.dueDate }));
  const activeSessions = (db.classSessions || []).filter(s => classIds.includes(s.classId) && s.active)
    .map(s => ({ id: s.id, title: s.title, startedAt: s.startedAt }));
  res.json({ pendingQuizzes, dueSoonAssignments, activeSessions });
});
app.get('/api/students/me/calendar', auth, role('student'), (req, res) => {
  const db = loadDB();
  const myClasses = (db.classes || []).filter(c => (c.studentIds || []).includes(req.user.id));
  const classIds = myClasses.map(c => c.id);
  const events = [];
  (db.assignments || []).forEach(a => { if (classIds.includes(a.classId) && a.dueDate) events.push({ date: a.dueDate, title: a.title, type: 'assignment' }); });
  (db.classSessions || []).forEach(s => { if (classIds.includes(s.classId)) events.push({ date: (s.startedAt || '').slice(0, 10), title: s.title, type: 'session' }); });
  res.json(events);
});
app.get('/api/classes/:id/my-rank', auth, role('student'), (req, res) => {
  const db = loadDB();
  const cls = (db.classes || []).find(c => c.id === req.params.id);
  if (!cls) return res.status(404).json({ error: 'یافت نشد' });
  const quizIds = (db.quizzes || []).filter(q => q.classId === cls.id).map(q => q.id);
  const stats = {};
  (cls.studentIds || []).forEach(sid => {
    const subs = (db.quizSubmissions || []).filter(s => s.studentId === sid && quizIds.includes(s.quizId));
    stats[sid] = subs.length ? subs.reduce((a, s) => a + s.score, 0) / subs.length : 0;
  });
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  const idx = entries.findIndex(([sid]) => sid === req.user.id);
  res.json({
    rank: idx + 1, totalStudents: entries.length,
    myAvg: Math.round(stats[req.user.id] || 0),
    percentile: entries.length > 1 ? Math.round((1 - idx / entries.length) * 100) : 100
  });
});
app.get('/api/classes/:id/leaderboard', auth, (req, res) => {
  const db = loadDB();
  const cls = (db.classes || []).find(c => c.id === req.params.id);
  if (!cls) return res.status(404).json({ error: 'یافت نشد' });
  const rows = (cls.studentIds || []).map(sid => {
    const u = db.users.find(x => x.id === sid);
    const xp = (db.studentXP || []).find(x => x.studentId === sid);
    return { id: sid, name: u ? u.name : '؟', totalXP: xp ? xp.totalXP : 0, level: levelFromXP(xp ? xp.totalXP : 0) };
  }).sort((a, b) => b.totalXP - a.totalXP);
  res.json(rows);
});
app.get('/api/classes/:id/analytics', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const cls = (db.classes || []).find(c => c.id === req.params.id);
  if (!cls) return res.status(404).json({ error: 'یافت نشد' });
  if (!ownsClass(req, db, cls.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const quizzes = (db.quizzes || []).filter(q => q.classId === cls.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const trend = quizzes.map(q => {
    const subs = (db.quizSubmissions || []).filter(s => s.quizId === q.id);
    return { label: q.title.slice(0, 12), title: q.title, avg: subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : 0 };
  });
  const students = (cls.studentIds || []).map(sid => {
    const u = db.users.find(x => x.id === sid);
    const subs = (db.quizSubmissions || []).filter(s => s.studentId === sid);
    return { id: sid, name: u ? u.name : '؟', avg: subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : 0 };
  });
  const atRisk = students.filter(s => s.avg > 0 && s.avg < 40).map(s => ({ ...s, reason: 'میانگین زیر ۴۰٪' }));
  res.json({ trend, students, atRisk });
});

/* ═══════════════ بانک سوال / الگوها / یادداشت ═══════════════ */
app.get('/api/question-bank', auth, role('teacher', 'admin'), (req, res) => { const db = loadDB(); res.json(db.questionBank || []); });
app.post('/api/question-bank', auth, role('teacher', 'admin'), (req, res) => {
  const { type, question, options, answer, tags, explanation } = req.body;
  if (!type || !question || !answer) return res.status(400).json({ error: 'نوع، سوال و پاسخ الزامی است' });
  const db = loadDB();
  const q = { id: uid(), type, question, options: options || [], answer, tags: tags || [], explanation: explanation || '', usageCount: 0, createdAt: new Date().toISOString() };
  if (!db.questionBank) db.questionBank = [];
  db.questionBank.push(q);
  saveDB(db);
  res.json(q);
});
app.delete('/api/question-bank/:id', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  db.questionBank = (db.questionBank || []).filter(q => q.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/question-bank/:id/use', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const q = (db.questionBank || []).find(x => x.id === req.params.id);
  if (q) { q.usageCount = (q.usageCount || 0) + 1; saveDB(db); }
  res.json({ ok: true });
});
app.get('/api/templates/assignments', auth, role('teacher', 'admin'), (req, res) => { const db = loadDB(); res.json(db.assignmentTemplates || []); });
app.post('/api/templates/assignments', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const t = { id: uid(), title: req.body.title || '', description: req.body.description || '', createdAt: new Date().toISOString() };
  if (!db.assignmentTemplates) db.assignmentTemplates = [];
  db.assignmentTemplates.push(t);
  saveDB(db);
  res.json(t);
});
app.get('/api/templates/quizzes', auth, role('teacher', 'admin'), (req, res) => { const db = loadDB(); res.json(db.quizTemplates || []); });
app.post('/api/templates/quizzes', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const t = { id: uid(), title: req.body.title || '', questions: req.body.questions || [], createdAt: new Date().toISOString() };
  if (!db.quizTemplates) db.quizTemplates = [];
  db.quizTemplates.push(t);
  saveDB(db);
  res.json(t);
});
app.get('/api/teacher/calendar', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const myClasses = (db.classes || []).filter(c => c.teacherId === req.user.id);
  const events = [];
  myClasses.forEach(cls => {
    (db.assignments || []).forEach(a => { if (a.classId === cls.id && a.dueDate) events.push({ date: a.dueDate, title: a.title, type: 'assignment', className: cls.name }); });
    (db.quizzes || []).forEach(q => { if (q.classId === cls.id) events.push({ date: q.createdAt.slice(0, 10), title: q.title, type: 'quiz', className: cls.name }); });
    (db.classSessions || []).forEach(s => { if (s.classId === cls.id) events.push({ date: (s.startedAt || '').slice(0, 10), title: s.title, type: 'session', className: cls.name }); });
  });
  res.json(events);
});
app.get('/api/teacher/students/:id/notes', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  res.json((db.studentNotes || []).filter(n => n.studentId === req.params.id && n.teacherId === req.user.id));
});
app.post('/api/teacher/students/:id/notes', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const note = { id: uid(), studentId: req.params.id, teacherId: req.user.id, text: String(req.body.text || '').slice(0, 1000), createdAt: new Date().toISOString() };
  if (!db.studentNotes) db.studentNotes = [];
  db.studentNotes.push(note);
  saveDB(db);
  res.json({ note });
});
app.delete('/api/teacher/students/:id/notes', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const mine = (db.studentNotes || []).filter(n => n.studentId === req.params.id && n.teacherId === req.user.id);
  const idx = +req.body.index;
  if (mine[idx]) {
    db.studentNotes.splice(db.studentNotes.indexOf(mine[idx]), 1);
    saveDB(db);
  }
  res.json({ ok: true });
});

/* ═══════════════ جلسات زنده ═══════════════ */
app.get('/api/sessions', auth, (req, res) => {
  const db = loadDB();
  let list = db.classSessions || [];
  if (req.query.classId) list = list.filter(s => s.classId === req.query.classId);
  if (req.user.role === 'teacher') list = list.filter(s => s.teacherId === req.user.id);
  res.json(list);
});
app.post('/api/sessions', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, title, meetLink } = req.body;
  if (!classId) return res.status(400).json({ error: 'کلاس الزامی است' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'شما معلم این کلاس نیستید' });
  const cls = (db.classes || []).find(c => c.id === classId);
  const s = {
    id: uid(), classId, title: title || 'جلسه کلاسی', meetLink: meetLink || '',
    teacherId: req.user.id, teacherName: req.user.name,
    students: cls ? cls.studentIds : [],
    active: true, startedAt: new Date().toISOString(),
    currentLayout: 'sharing', notes: '', whiteboard: [[], [], []],
    messages: [], qna: [], files: [], userStatuses: {}
  };
  if (!db.classSessions) db.classSessions = [];
  db.classSessions.push(s);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `🔴 کلاس زنده شروع شد: ${s.title}`, 'class'));
  saveDB(db);
  res.json(s);
});
app.get('/api/sessions/:id', auth, (req, res) => {
  const db = loadDB();
  const s = (db.classSessions || []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'جلسه یافت نشد' });
  const members = new Set([s.teacherId, ...(s.students || [])]);
  if (!members.has(req.user.id)) return res.status(403).json({ error: 'عضو این کلاس نیستید' });
  res.json(s);
});
app.post('/api/sessions/:id/end', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const s = (db.classSessions || []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'یافت نشد' });
  if (s.teacherId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'فقط معلم' });
  s.active = false;
  saveDB(db);
  broadcast({ type: 'session_ended' }, id => new Set([s.teacherId, ...(s.students || [])]).has(id));
  res.json({ ok: true });
});
app.post('/api/sessions/:id/whiteboard', auth, (req, res) => {
  const db = loadDB();
  const s = (db.classSessions || []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'یافت نشد' });
  s.whiteboard = req.body.data || [];
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/sessions/:id/notes', auth, (req, res) => {
  const db = loadDB();
  const s = (db.classSessions || []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'یافت نشد' });
  const members = new Set([s.teacherId, ...s.students]);
  if (!members.has(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  s.notes = String(req.body.content || '').slice(0, 20000);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/sessions/:id/recording', auth, role('teacher', 'admin'), (req, res) => {
  const db = loadDB();
  const s = (db.classSessions || []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'یافت نشد' });
  const up = saveUpload(req.body.name, req.body.data);
  if (!up) return res.status(400).json({ error: 'فایل نامعتبر' });
  if (!s.files) s.files = [];
  s.files.push({ id: uid(), name: req.body.name, url: up.url, by: req.user.name, at: new Date().toISOString() });
  saveDB(db);
  res.json(up);
});

/* ═══════════════ حضور و غیاب ═══════════════ */
app.get('/api/attendance', auth, (req, res) => {
  const db = loadDB();
  let list = db.attendance || [];
  if (req.query.classId) list = list.filter(a => a.classId === req.query.classId);
  if (req.query.date) list = list.filter(a => a.date === req.query.date);
  res.json(list);
});
app.post('/api/attendance', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, date, records } = req.body;
  if (!classId || !date || !records) return res.status(400).json({ error: 'اطلاعات ناقص' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (!db.attendance) db.attendance = [];
  let rec = db.attendance.find(a => a.classId === classId && a.date === date);
  if (rec) rec.records = records;
  else { rec = { id: uid(), classId, date, records }; db.attendance.push(rec); }
  saveDB(db);
  res.json(rec);
});

/* ═══════════════ نظرسنجی ═══════════════ */
app.get('/api/polls', auth, (req, res) => {
  const db = loadDB();
  let list = db.polls || [];
  if (req.query.classId) list = list.filter(p => p.classId === req.query.classId);
  const enriched = list.map(p => {
    const votes = (db.pollVotes || []).filter(v => v.pollId === p.id);
    const results = p.options.map((_, i) => ({ count: votes.filter(v => v.option === i).length }));
    const myVote = votes.find(v => v.studentId === req.user.id);
    return { ...p, results, myVote: myVote ? myVote.option : null };
  });
  res.json(enriched);
});
app.post('/api/polls', auth, role('teacher', 'admin'), (req, res) => {
  const { classId, question, options } = req.body;
  if (!classId || !question || options?.length < 2) return res.status(400).json({ error: 'سوال و حداقل ۲ گزینه لازم است' });
  const db = loadDB();
  if (!ownsClass(req, db, classId)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const p = { id: uid(), classId, question, options, createdAt: new Date().toISOString() };
  if (!db.polls) db.polls = [];
  db.polls.push(p);
  const cls = (db.classes || []).find(c => c.id === classId);
  if (cls) (cls.studentIds || []).forEach(sid => addNotif(db, sid, `📊 نظرسنجی جدید: ${question}`, 'poll'));
  saveDB(db);
  res.json(p);
});
app.post('/api/polls/:id/vote', auth, role('student'), (req, res) => {
  const db = loadDB();
  const p = (db.polls || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'یافت نشد' });
  if (!db.pollVotes) db.pollVotes = [];
  let v = db.pollVotes.find(x => x.pollId === p.id && x.studentId === req.user.id);
  if (v) v.option = req.body.option;
  else { v = { pollId: p.id, studentId: req.user.id, option: req.body.option }; db.pollVotes.push(v); }
  saveDB(db);
  res.json({ ok: true });
});

/* ═══════════════ پیام‌رسان ═══════════════ */
app.get('/api/contacts', auth, (req, res) => {
  const db = loadDB();
  res.json(db.users.filter(u => u.id !== req.user.id && u.active !== false).map(u => ({ id: u.id, name: u.name, role: u.role })));
});
app.get('/api/chat/rooms', auth, (req, res) => {
  const db = loadDB();
  const myRooms = (db.chatRooms || []).filter(r => (r.members || []).includes(req.user.id));
  res.json(myRooms.map(r => {
    const msgs = (db.messages || []).filter(m => m.roomId === r.id && !m.deleted);
    const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
    const prefs = (db.roomUserPrefs || []).find(p => p.roomId === r.id && p.userId === req.user.id) || {};
    const lastRead = prefs.lastReadAt ? new Date(prefs.lastReadAt).getTime() : 0;
    const unreadCount = msgs.filter(m => m.senderId !== req.user.id && new Date(m.createdAt).getTime() > lastRead).length;
    return { ...r, lastMsg, unreadCount, pinned: !!prefs.pinned, archived: !!prefs.archived };
  }));
});
app.post('/api/chat/rooms', auth, (req, res) => {
  const { targetId, name } = req.body;
  if (!targetId) return res.status(400).json({ error: 'مخاطب الزامی است' });
  const db = loadDB();
  const existing = (db.chatRooms || []).find(r => r.type === 'private' &&
    (r.members || []).length === 2 && r.members.includes(req.user.id) && r.members.includes(targetId));
  if (existing) return res.json(existing);
  const target = db.users.find(u => u.id === targetId);
  const room = { id: uid(), name: name || `چت با ${target ? target.name : 'کاربر'}`, type: 'private', members: [req.user.id, targetId], createdAt: new Date().toISOString() };
  if (!db.chatRooms) db.chatRooms = [];
  db.chatRooms.push(room);
  saveDB(db);
  res.json(room);
});
app.post('/api/chat/rooms/:id/pin', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (!db.roomUserPrefs) db.roomUserPrefs = [];
  let p = db.roomUserPrefs.find(x => x.roomId === room.id && x.userId === req.user.id);
  if (!p) { p = { roomId: room.id, userId: req.user.id, pinned: false, archived: false }; db.roomUserPrefs.push(p); }
  p.pinned = !p.pinned;
  saveDB(db);
  res.json({ pinned: p.pinned });
});
app.post('/api/chat/rooms/:id/archive', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (!db.roomUserPrefs) db.roomUserPrefs = [];
  let p = db.roomUserPrefs.find(x => x.roomId === room.id && x.userId === req.user.id);
  if (!p) { p = { roomId: room.id, userId: req.user.id, pinned: false, archived: false }; db.roomUserPrefs.push(p); }
  p.archived = !p.archived;
  saveDB(db);
  res.json({ archived: p.archived });
});
app.get('/api/chat/rooms/:id/messages', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const msgs = (db.messages || []).filter(m => m.roomId === room.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(m => {
      const replyTo = m.replyToId ? (db.messages || []).find(x => x.id === m.replyToId) : null;
      return { ...m, replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text, fileName: replyTo.fileName, voiceUrl: replyTo.voiceUrl } : null };
    });
  res.json(msgs);
});
app.post('/api/chat/rooms/:id/messages', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const { text, replyToId, fileUrl, fileName, fileType, fileSize, voiceUrl, voiceDuration, forwardedFrom } = req.body;
  if (!text && !fileUrl && !voiceUrl) return res.status(400).json({ error: 'پیام خالی است' });
  const msg = {
    id: uid(), roomId: room.id, senderId: req.user.id, senderName: req.user.name,
    text: String(text || '').slice(0, 4000),
    replyToId: replyToId || null, forwardedFrom: forwardedFrom || null,
    fileUrl: fileUrl || null, fileName: fileName || null, fileType: fileType || null, fileSize: fileSize || null,
    voiceUrl: voiceUrl || null, voiceDuration: voiceDuration || null,
    deleted: false, edited: false, pinned: false, reactions: {},
    readBy: [req.user.id], createdAt: new Date().toISOString()
  };
  if (!db.messages) db.messages = [];
  db.messages.push(msg);
  saveDB(db);
  room.members.forEach(m => {
    if (m === req.user.id) return;
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'chat_message', message: msg });
  });
  res.json(msg);
});
app.post('/api/chat/rooms/:id/read', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const now = new Date().toISOString();
  if (!db.roomUserPrefs) db.roomUserPrefs = [];
  let p = db.roomUserPrefs.find(x => x.roomId === room.id && x.userId === req.user.id);
  if (!p) { p = { roomId: room.id, userId: req.user.id }; db.roomUserPrefs.push(p); }
  p.lastReadAt = now;
  const roomMsgs = (db.messages || []).filter(m => m.roomId === room.id);
  const ids = (req.body.messageIds?.length ? req.body.messageIds : roomMsgs.map(m => m.id));
  roomMsgs.forEach(m => { if (ids.includes(m.id) && !m.readBy.includes(req.user.id)) m.readBy.push(req.user.id); });
  saveDB(db);
  room.members.forEach(m => {
    if (m === req.user.id) return;
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'messages_read', roomId: room.id, messageIds: ids });
  });
  res.json({ ok: true });
});
app.patch('/api/chat/messages/:id', auth, (req, res) => {
  const db = loadDB();
  const msg = (db.messages || []).find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'یافت نشد' });
  if (msg.senderId !== req.user.id) return res.status(403).json({ error: 'فقط فرستنده می‌تواند ویرایش کند' });
  msg.text = String(req.body.text || '').slice(0, 4000);
  msg.edited = true;
  saveDB(db);
  const room = (db.chatRooms || []).find(r => r.id === msg.roomId);
  if (room) room.members.forEach(m => {
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'message_edited', message: msg });
  });
  res.json(msg);
});
app.delete('/api/chat/messages/:id', auth, (req, res) => {
  const db = loadDB();
  const msg = (db.messages || []).find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'یافت نشد' });
  if (msg.senderId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی ندارید' });
  msg.deleted = true;
  saveDB(db);
  const room = (db.chatRooms || []).find(r => r.id === msg.roomId);
  if (room) room.members.forEach(m => {
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'message_deleted', messageId: msg.id });
  });
  res.json({ ok: true });
});
app.post('/api/chat/messages/:id/react', auth, (req, res) => {
  const db = loadDB();
  const msg = (db.messages || []).find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'یافت نشد' });
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'ایموجی الزامی است' });
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  if (msg.reactions[emoji].includes(req.user.id)) msg.reactions[emoji] = msg.reactions[emoji].filter(u => u !== req.user.id);
  else msg.reactions[emoji].push(req.user.id);
  if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
  saveDB(db);
  const room = (db.chatRooms || []).find(r => r.id === msg.roomId);
  if (room) room.members.forEach(m => {
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'reaction_update', roomId: msg.roomId, messageId: msg.id, reactions: msg.reactions });
  });
  res.json({ reactions: msg.reactions });
});
app.post('/api/chat/messages/:id/pin', auth, (req, res) => {
  const db = loadDB();
  const msg = (db.messages || []).find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'یافت نشد' });
  msg.pinned = !msg.pinned;
  saveDB(db);
  const room = (db.chatRooms || []).find(r => r.id === msg.roomId);
  if (room) room.members.forEach(m => {
    const sock = clients.get(m);
    if (sock) wsSend(sock, { type: 'pin_update', roomId: msg.roomId });
  });
  res.json({ pinned: msg.pinned });
});
app.get('/api/chat/rooms/:id/pinned', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.json((db.messages || []).filter(m => m.roomId === room.id && m.pinned && !m.deleted));
});
app.get('/api/chat/rooms/:id/search', auth, (req, res) => {
  const db = loadDB();
  const room = (db.chatRooms || []).find(r => r.id === req.params.id);
  if (!room || !room.members.includes(req.user.id)) return res.status(403).json({ error: 'دسترسی ندارید' });
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  res.json((db.messages || []).filter(m => m.roomId === room.id && !m.deleted && (m.text || '').toLowerCase().includes(q)).slice(-30).reverse());
});
app.get('/api/chat/presence', auth, (req, res) => {
  const db = loadDB();
  const ids = String(req.query.userIds || '').split(',').filter(Boolean);
  const out = {};
  ids.forEach(id => {
    const rec = (db.userPresence || []).find(p => p.userId === id);
    out[id] = { online: clients.has(id), lastSeen: rec ? rec.lastSeen : null };
  });
  res.json(out);
});
app.post('/api/chat/upload', auth, (req, res) => {
  const up = saveUpload(req.body.name, req.body.data);
  if (!up) return res.status(400).json({ error: 'فایل نامعتبر یا بیش از حد بزرگ' });
  res.json(up);
});
app.post('/api/upload', auth, (req, res) => {
  const up = saveUpload(req.body.name, req.body.data);
  if (!up) return res.status(400).json({ error: 'فایل نامعتبر' });
  res.json(up);
});

/* ═══════════════ اعلان‌ها ═══════════════ */
app.get('/api/notifications', auth, (req, res) => {
  const db = loadDB();
  res.json((db.notifications || []).filter(n => n.userId === req.user.id).slice(-50).reverse());
});
app.patch('/api/notifications/read', auth, (req, res) => {
  const db = loadDB();
  (db.notifications || []).forEach(n => { if (n.userId === req.user.id) n.read = true; });
  saveDB(db);
  res.json({ ok: true });
});

/* ═══════════════ عمومی ═══════════════ */
app.get('/api/public/stats', (req, res) => {
  const db = loadDB();
  res.json({
    teachers: db.users.filter(u => u.role === 'teacher').length,
    students: db.users.filter(u => u.role === 'student').length,
    classes: (db.classes || []).length,
    lessons: (db.lessons || []).length
  });
});
app.get('/api/public/status', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/api/public/changelog', (req, res) => {
  res.json([
    { version: '۲.۱', date: new Date().toLocaleDateString('fa-IR'), items: ['🤖 آموزبات: دستیار هوشمند در همه صفحات', '🤖 آموزبات در پیام‌رسان و کلاس مجازی', 'سازنده آزمون با تولید سوال AI', 'برندینگ جدید: آموزیار'] },
    { version: '۲.۰', date: '—', items: ['طراحی جدید تمام پنل‌ها', 'ثبت‌نام عمومی و پروفایل کاربری', 'آزمون‌ساز گامایی با تایمر و پرچم', 'کلاس مجازی Adobe Connect', 'پیام‌رسان تلگرامی'] },
    { version: '۱.۰', date: '—', items: ['پنل مدیر، معلم و دانش‌آموز', 'پیام‌رسان و کلاس مجازی اولیه', 'آزمون‌ساز و بانک سوال'] }
  ]);
});
app.get('/api/public/weather', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) throw new Error();
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`);
    const d = await r.json();
    res.json({ temp: Math.round(d.current.temperature_2m), humidity: d.current.relative_humidity_2m, code: d.current.weather_code });
  } catch { res.status(500).json({ error: 'خطا' }); }
});

/* ═════════════════════════════════════
   🤖 آموزبات — پروکسی هوش مصنوعی (با توکن)
   ═════════════════════════════════════ */
/* ═════════════════════════════════════
   🤖 آموزبات — پروکسی هوش مصنوعی
   فرمت قطعی (تست‌شده): POST + Bearer + {prompt}
   ═════════════════════════════════════ */
const AI_ENDPOINT = 'https://amooz-bat.vercel.app/api/gemini';
const AI_TOKEN = process.env.AI_TOKEN || 'd658e8f2d2fd08673c8205416617700c996ddb4ee92750b0';   // ⬅️ توکن خودت

async function callAI(prompt) {
  const r = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AI_TOKEN          // ← فقط همین هدر — هیچ چیز اضافه نه!
    },
    body: JSON.stringify({ prompt: String(prompt).slice(0, 8000) })   // ← فقط کلید prompt
  });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).slice(0, 200); } catch {}
    throw new Error('API ' + r.status + (detail ? ' — ' + detail : ''));
  }
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    if (raw.trim()) return raw.trim();
    throw new Error('پاسخ خالی');
  }
  /* پاسخ API شما: {"text":"...", "raw":{...}} */
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
  for (const k of ['response', 'reply', 'result', 'answer', 'output', 'content']) {
    if (typeof data[k] === 'string' && data[k].trim()) return data[k].trim();
  }
  if (data.candidates?.[0]?.content?.parts) {
    const t = data.candidates[0].content.parts.map(p => p.text || '').join('').trim();
    if (t) return t;
  }
  throw new Error('فرمت پاسخ شناسایی نشد');
}

/* محدودیت: ۱۵ درخواست در دقیقه برای هر کاربر */
const aiHits = new Map();
function aiLimited(id) {
  const now = Date.now();
  const arr = (aiHits.get(id) || []).filter(t => now - t < 60000);
  if (arr.length >= 15) { aiHits.set(id, arr); return true; }
  arr.push(now); aiHits.set(id, arr);
  return false;
}

app.post('/api/ai', auth, async (req, res) => {
  if (aiLimited(req.user.id)) return res.status(429).json({ error: 'سرعت زیاد! چند لحظه صبر کن 🙏' });
  const prompt = String(req.body.prompt || req.body.message || '').slice(0, 4000);
  if (!prompt.trim()) return res.status(400).json({ error: 'متن خالی است' });
  try {
    const full = req.body.system ? req.body.system + '\n\n' + prompt : prompt;
    const reply = await callAI(full);
    res.json({ reply });
  } catch (e) {
    console.error('[آموزبات]', e.message);
    /* حالا خطای واقعی API در پیام هست — دیباگ آینده آسان */
    res.status(502).json({ error: 'ارتباط با آموزبات برقرار نشد — ' + String(e.message).slice(0, 80) });
  }
});

app.post('/api/ai/test', async (req, res) => {
  try {
    const reply = await callAI('فقط بنویس: تست موفق ✅');
    res.json({ ok: true, reply });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* ═══════════════ صفحات ═══════════════ */
const PAGES = {
  '/': 'home.html', '/login': 'login.html', '/admin': 'admin.html',
  '/teacher': 'teacher.html', '/student': 'student.html',
  '/chat': 'chat.html', '/classroom': 'classroom.html',
  '/profile': 'profile.html', '/quiz': 'quiz.html', '/quizbuilder': 'quizbuilder.html'
};
Object.entries(PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
});

/* ═══════════════ شروع ═══════════════ */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🎓 آموزیار — سامانه آموزشی جامع | نسخه ۲.۱');
  console.log('  ─────────────────────────────────────────');
  console.log(`  🚀 سرور:   http://localhost:${PORT}`);
  console.log('  🔑 ادمین:  admin@school.ir / admin123');
  console.log('  🤖 آموزبات: ' + (AI_TOKEN === 'YOUR_TOKEN_HERE' ? '⚠️  توکن تنظیم نشده! AI_TOKEN را در server.js بگذار' : 'فعال ✅'));
  console.log('  📁 صفحات:  public/ (۱۰ صفحه + ai-widget + chat-ai + classroom-ai)');
  console.log('');
});
