/* ═══════════════════════════════════════════════════════
   🤖 دستیار هوشمند — نسخه ۲
   • در همه صفحات کار می‌کند (مهمان = حالت پیش‌نمایش)
   • پیام‌ها مثل تلگرام: حباب + آواتار + بج زمان + دم
   • تصویر برندینگ + هدر زنده + چیپ‌های سریع + کپی
   افزودن: <script src="/ai-widget.js" defer></script>
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__AI_WIDGET__) return;
  window.__AI_WIDGET__ = 1;

  /* ═══ هویت ═══ */
  var token = localStorage.getItem('token');
  var user = null;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
  var isGuest = !token || !user;

  var THEME = {
    admin:   { pri: '#ff4d6d', pri2: '#ff8fa3', glow: 'rgba(255,77,109,.5)',  txt: '#fff',       dark: true },
    teacher: { pri: '#4d9fff', pri2: '#7cc0ff', glow: 'rgba(77,159,255,.5)',  txt: '#fff',       dark: true },
    student: { pri: '#2fd48c', pri2: '#7ce7b4', glow: 'rgba(47,212,140,.5)',  txt: '#05261a',    dark: true },
    guest:   { pri: '#8b5cf6', pri2: '#c084fc', glow: 'rgba(139,92,246,.5)',  txt: '#fff',       dark: true }
  };
  var T = THEME[user ? user.role : 'guest'] || THEME.guest;
  var ROLE_FA = { admin: 'مدیر', teacher: 'معلم', student: 'دانش‌آموز' };
  var userName = user ? user.name : 'مهمان';
  var userRoleFa = user ? (ROLE_FA[user.role] || user.role) : 'مهمان';
  var HIST_KEY = 'ai_hist_' + (user ? user.id : 'guest');

  /* ═══ استایل ═══ */
  var css = '' +
  ':root{--aiPri:' + T.pri + ';--aiPri2:' + T.pri2 + ';--aiGlow:' + T.glow + ';--aiTxt:' + T.txt + '}' +
  '#aiFab{position:fixed;bottom:22px;right:22px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));border:none;cursor:pointer;font-size:1.6rem;z-index:940;box-shadow:0 12px 34px -6px var(--aiGlow);display:flex;align-items:center;justify-content:center;transition:transform .25s;overflow:hidden}' +
  '#aiFab:hover{transform:scale(1.1) translateY(-3px)}' +
  '#aiFab .aiRing{position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--aiPri);opacity:0;animation:aiRingAnim 2.4s ease-out infinite;pointer-events:none}' +
  '@keyframes aiRingAnim{0%{transform:scale(.85);opacity:.7}70%{transform:scale(1.4);opacity:0}100%{opacity:0}}' +
  '#aiFab .aiBadge{position:absolute;top:-4px;left:-4px;min-width:20px;height:20px;border-radius:11px;background:#ff4d6d;color:#fff;font-size:.64rem;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 6px;box-shadow:0 0 0 3px #0b1120}' +
  '#aiPanel{position:fixed;bottom:94px;right:22px;width:min(414px,calc(100vw - 30px));height:min(620px,76vh);background:rgba(11,17,32,.96);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.14);border-radius:26px;z-index:945;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6);direction:rtl;color:#eef2f8;font-family:Vazirmatn,Tahoma,sans-serif}' +
  '#aiPanel.open{display:flex;animation:aiPopAnim .32s cubic-bezier(.2,1.3,.4,1)}' +
  '@keyframes aiPopAnim{from{opacity:0;transform:translateY(16px) scale(.96)}}' +

  /* ─── هدر با تصویر ─── */
  '#aiHero{position:relative;flex-shrink:0;height:132px;overflow:hidden}' +
  '#aiHeroImg{position:absolute;inset:0;width:100%;height:100%;background:linear-gradient(125deg,' + T.pri + '33,' + T.pri2 + '22 40%,rgba(34,211,238,.16) 75%,' + T.pri + '33),radial-gradient(circle at 78% 22%,' + T.pri + '44,transparent 55%),radial-gradient(circle at 18% 85%,' + T.pri2 + '33,transparent 50%)}' +
  '#aiHeroDots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.1) 1px,transparent 1px);background-size:22px 22px}' +
  '#aiHeroMesh{position:absolute;top:-30px;left:-30px;width:190px;height:190px;border-radius:50%;background:' + T.pri + ';filter:blur(60px);opacity:.3;animation:aiFloatAnim 7s ease-in-out infinite}' +
  '@keyframes aiFloatAnim{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,10px)}}' +
  '#aiHeroContent{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:0 56px;text-align:center;z-index:2}' +
  '#aiHeroContent .aiLogoBig{width:58px;height:58px;border-radius:18px;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));display:flex;align-items:center;justify-content:center;font-size:1.8rem;box-shadow:0 10px 26px -6px var(--aiGlow),0 0 0 4px rgba(11,17,32,.9);animation:aiLogoAnim 3.5s ease-in-out infinite}' +
  '@keyframes aiLogoAnim{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-3px) rotate(-4deg)}75%{transform:translateY(-1px) rotate(3deg)}}' +
  '#aiHeroContent b{font-size:.98rem;font-weight:800;text-shadow:0 2px 10px rgba(0,0,0,.4)}' +
  '#aiHeroContent small{font-size:.68rem;color:rgba(255,255,255,.75)}' +
  '#aiHead{display:flex;align-items:center;gap:10px;padding:10px 13px;border-bottom:1px solid rgba(255,255,255,.09);flex-shrink:0;background:rgba(0,0,0,.22)}' +
  '#aiHead .aiHAv{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));display:flex;align-items:center;justify-content:center;font-size:1.15rem;box-shadow:0 6px 14px -4px var(--aiGlow);flex-shrink:0;position:relative}' +
  '#aiHead .aiHAv::after{content:"";position:absolute;bottom:-2px;left:-2px;width:11px;height:11px;border-radius:50%;background:#2fd48c;border:2.5px solid #0b1120;box-shadow:0 0 8px #2fd48c}' +
  '#aiHead .aiHMid{flex:1;min-width:0}' +
  '#aiHead b{font-size:.88rem;display:block}' +
  '#aiHead small{font-size:.64rem;color:#8b94a7;display:block;margin-top:1px}' +
  '.aiHbtn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);width:31px;height:31px;border-radius:10px;color:#8b94a7;cursor:pointer;font-size:.82rem;display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}' +
  '.aiHbtn:hover{color:#fff;border-color:rgba(255,255,255,.25)}' +

  /* ─── پیام‌ها مثل تلگرام ─── */
  '#aiMsgs{flex:1;overflow-y:auto;padding:15px 13px;display:flex;flex-direction:column;gap:5px}' +
  '#aiMsgs::-webkit-scrollbar{width:5px}' +
  '#aiMsgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px}' +
  '.ai-row{display:flex;gap:8px;max-width:96%;animation:aiInAnim .22s ease;position:relative}' +
  '@keyframes aiInAnim{from{opacity:0;transform:translateY(6px)}}' +
  '.ai-row.bot{align-self:flex-start}' +
  '.ai-row.user{align-self:flex-end;flex-direction:row-reverse}' +
  '.ai-row .aiAvatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;align-self:flex-end;box-shadow:0 4px 12px -3px var(--aiGlow)}' +
  '.ai-row.user .aiAvatar{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);font-size:.72rem;font-weight:800;color:#c7cedb}' +
  '.ai-stack{display:flex;flex-direction:column;min-width:0;max-width:100%}' +
  '.ai-name{font-size:.68rem;color:' + T.pri2 + ';font-weight:700;margin-bottom:3px;padding-right:4px}' +
  '.ai-bub{position:relative;padding:10px 13px 8px;border-radius:17px;font-size:.87rem;line-height:1.8;word-break:break-word;min-width:120px}' +
  '.ai-row.bot .ai-bub{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-bottom-right-radius:5px;color:#e8edf4}' +
  '.ai-row.bot.group-end .ai-bub{border-bottom-right-radius:5px}' +
  '.ai-row.bot.group-end .ai-bub::after{content:"";position:absolute;bottom:0;right:-7px;width:9px;height:9px;background:rgba(255,255,255,.06);border-right:1px solid rgba(255,255,255,.09);clip-path:polygon(0 0,0 100%,100% 100%)}' +
  '.ai-row.user .ai-bub{background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));color:var(--aiTxt);border-bottom-left-radius:5px;box-shadow:0 6px 18px -6px var(--aiGlow)}' +
  '.ai-row.user.group-end .ai-bub::after{content:"";position:absolute;bottom:0;left:-7px;width:9px;height:9px;background:var(--aiPri2);clip-path:polygon(100% 0,100% 100%,0 100%)}' +
  '.ai-row:not(.group-end) .aiAvatar{opacity:0;pointer-events:none}' +
  '.ai-row:not(.group-end) .ai-bub{border-radius:17px 17px 17px 6px}' +
  '.ai-row.user:not(.group-end) .ai-bub{border-radius:17px 17px 6px 17px}' +
  '.ai-time{position:absolute;bottom:4px;left:9px;font-size:.6rem;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:4px;pointer-events:none}' +
  '.ai-row.bot .ai-time{color:rgba(255,255,255,.4)}' +
  '.ai-bub .ai-pad{padding-left:64px;display:inline}' +
  '.ai-bub .aiIn{display:inline}' +
  '.ai-gem{display:inline-flex;align-items:center;gap:4px;font-size:.6rem;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);color:#c4b0ff;border-radius:8px;padding:1px 7px;vertical-align:middle;margin-right:5px}' +
  '.ai-copy{opacity:0;background:none;border:none;color:rgba(255,255,255,.5);font-size:.66rem;cursor:pointer;padding:3px 8px;margin-top:4px;transition:.15s;border-radius:7px;align-self:flex-start;font-family:inherit}' +
  '.ai-row:hover .ai-copy{opacity:1}' +
  '.ai-copy:hover{color:#fff;background:rgba(255,255,255,.09)}' +
  '.ai-retry{opacity:0;background:none;border:none;color:#8b94a7;font-size:.66rem;cursor:pointer;padding:3px 8px;margin-top:4px;transition:.15s;border-radius:7px;align-self:flex-start;font-family:inherit}' +
  '.ai-row:hover .ai-retry{opacity:1}' +
  '.ai-retry:hover{color:#fff;background:rgba(255,255,255,.09)}' +

  /* ─── تایپینگ ─── */
  '.ai-typing{display:flex;gap:4px;padding:14px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:17px;border-bottom-right-radius:5px;width:fit-content;animation:aiInAnim .22s ease}' +
  '.ai-typing i{width:7px;height:7px;border-radius:50%;background:#8b94a7;animation:aiBAnim 1.2s infinite}' +
  '.ai-typing i:nth-child(2){animation-delay:.15s}' +
  '.ai-typing i:nth-child(3){animation-delay:.3s}' +
  '@keyframes aiBAnim{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}' +

  /* ─── ورودی و چیپ ─── */
  '#aiChips{display:flex;gap:7px;padding:9px 12px;overflow-x:auto;flex-shrink:0;border-top:1px solid rgba(255,255,255,.07)}' +
  '#aiChips::-webkit-scrollbar{height:0}' +
  '.ai-chip{white-space:nowrap;padding:7px 13px;border-radius:20px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04);color:#c7cedb;font-family:inherit;font-size:.73rem;cursor:pointer;transition:.15s;flex-shrink:0}' +
  '.ai-chip:hover{border-color:var(--aiPri);color:#fff;background:' + T.pri + '22}' +
  '#aiInputRow{display:flex;gap:9px;padding:11px 12px;border-top:1px solid rgba(255,255,255,.09);flex-shrink:0;align-items:flex-end;background:rgba(0,0,0,.18)}' +
  '#aiInput{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:17px;color:#eef2f8;padding:11px 14px;font-family:inherit;font-size:.88rem;direction:rtl;resize:none;min-height:44px;max-height:120px;line-height:1.6;outline:none;transition:border .15s}' +
  '#aiInput:focus{border-color:var(--aiPri)}' +
  '#aiInput::placeholder{color:#59627a}' +
  '#aiSend{width:44px;height:44px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));color:var(--aiTxt);cursor:pointer;font-size:1.05rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.15s;box-shadow:0 6px 18px -4px var(--aiGlow)}' +
  '#aiSend:hover{transform:scale(1.07)}' +
  '#aiSend:disabled{opacity:.45;cursor:not-allowed;transform:none}' +
  '#aiPower{display:flex;align-items:center;gap:5px;padding:6px 12px;border-top:1px solid rgba(255,255,255,.07);font-size:.6rem;color:#59627a;flex-shrink:0;justify-content:center}' +
  '#aiPower i{width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 6px #a78bfa;display:inline-block}' +

  /* ─── بنر مهمان ─── */
  '.ai-guest{margin:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,' + T.pri + '18,' + T.pri2 + '12);border:1px solid ' + T.pri + '40;text-align:center}' +
  '.ai-guest b{display:block;font-size:.85rem;margin-bottom:5px}' +
  '.ai-guest small{font-size:.72rem;color:#8b94a7;display:block;line-height:1.7;margin-bottom:10px}' +
  '.ai-guest a{display:block;padding:9px;border-radius:11px;background:linear-gradient(135deg,var(--aiPri),var(--aiPri2));color:var(--aiTxt);text-decoration:none;font-size:.8rem;font-weight:800;cursor:pointer}' +
  '.ai-guest a:hover{filter:brightness(1.1)}' +

  /* ─── کدها و markdown ─── */
  '.ai-bub pre{background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;margin:7px 0;overflow-x:auto;font-size:.78rem;direction:ltr;text-align:left;white-space:pre-wrap;color:#c7cedb}' +
  '.ai-bub code{background:rgba(255,255,255,.1);border-radius:5px;padding:1px 7px;font-size:.82rem;direction:ltr;display:inline-block;color:#c7cedb}' +
  '.ai-bub pre code{background:none;padding:0}' +
  '.ai-bub .ai-img{max-width:100%;border-radius:11px;margin:6px 0;display:block;border:1px solid rgba(255,255,255,.12)}' +

  '@media(max-width:480px){#aiPanel{right:10px;left:10px;width:auto;bottom:86px;height:min(600px,80vh)}#aiFab{right:14px;bottom:14px}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ═══ ساخت DOM ═══ */
  var fab = document.createElement('button');
  fab.id = 'aiFab';
  fab.title = 'دستیار هوشمند';
  fab.innerHTML = '🤖<span class="aiRing"></span><span class="aiBadge">1</span>';
  document.body.appendChild(fab);

  var panel = document.createElement('div');
  panel.id = 'aiPanel';
  panel.innerHTML =
    '<div id="aiHero">' +
    '<div id="aiHeroImg"></div><div id="aiHeroDots"></div><div id="aiHeroMesh"></div>' +
    '<div id="aiHeroContent"><div class="aiLogoBig">🤖</div><b>دستیار هوشمند</b><small>پاسخ‌گوی همیشگی شما</small></div>' +
    '</div>' +
    '<div id="aiHead">' +
    '<div class="aiHAv">🤖</div>' +
    '<div class="aiHMid"><b>دستیار آموزشی</b><small>آنلاین · Gemini</small></div>' +
    '<button class="aiHbtn" id="aiClearBtn" title="پاک کردن گفتگو">🗑️</button>' +
    '<button class="aiHbtn" id="aiCloseBtn" title="بستن">✕</button>' +
    '</div>' +
    '<div id="aiMsgs"></div>' +
    '<div id="aiChips"></div>' +
    '<div id="aiInputRow">' +
    '<textarea id="aiInput" rows="1" placeholder="' + (isGuest ? 'برای گفتگو با من، اول وارد شو...' : 'هر سوالی داری بپرس...') + '"' + (isGuest ? ' disabled' : '') + '></textarea>' +
    '<button id="aiSend"' + (isGuest ? ' disabled' : '') + '>➤</button>' +
    '</div>' +
    '<div id="aiPower"><i></i> قدرت‌گرفته از هوش مصنوعی Gemini</div>';
  document.body.appendChild(panel);

  var msgs = panel.querySelector('#aiMsgs');
  var input = panel.querySelector('#aiInput');
  var sendBtn = panel.querySelector('#aiSend');

  /* ═══ وضعیت ═══ */
  var hist = [];
  var busy = false;
  var loaded = false;
  try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || '[]') || []; } catch (e) { hist = []; }

  /* ═══ ابزارها ═══ */
  function esc(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function timeNow() {
    try { return new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }
  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
    else {
      var ta = document.createElement('textarea'); ta.value = t;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
  }

  /* ─── رندر markdown ساده ─── */
  function mdLite(t) {
    var s = esc(t);
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, function (m, lang, code) {
      return '<pre><code>' + code.trim() + '</code></pre>';
    });
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    s = s.replace(/^#{1,4}\s+(.+)$/gm, '<b style="display:block;margin:8px 0 4px;font-size:.92rem">$1</b>');
    s = s.replace(/^[\-\*•]\s+(.+)$/gm, '<div style="padding-right:12px;margin:3px 0">• $1</div>');
    s = s.replace(/^(\d+)[.)]\s+(.+)$/gm, '<div style="padding-right:12px;margin:3px 0"><b style="color:' + T.pri2 + '">$1.</b> $2</div>');
    s = s.replace(/\n/g, '<br>');
    s = s.replace(/(<\/(?:div|pre)>)(<br>)/g, '$1');
    return s;
  }

  /* ═══ پیام‌های تلگرامی ═══ */
  function setGroupClasses() {
    var rows = msgs.querySelectorAll('.ai-row');
    for (var i = 0; i < rows.length; i++) {
      var prev = rows[i - 1];
      var same = prev && prev.classList.contains(rows[i].classList.contains('user') ? 'user' : 'bot');
      rows[i].classList.toggle('group-end', !(rows[i + 1] && rows[i + 1].classList.contains(rows[i].classList.contains('user') ? 'user' : 'bot')));
      rows[i].classList.toggle('group-start', !same);
    }
  }

  function makeRow(who) {
    var d = document.createElement('div');
    d.className = 'ai-row ' + who;
    var av = document.createElement('div');
    av.className = 'aiAvatar';
    av.textContent = who === 'bot' ? '🤖' : (user ? user.name[0] : '؟');
    var stack = document.createElement('div');
    stack.className = 'ai-stack';
    d.appendChild(who === 'bot' ? av : av);
    d.appendChild(stack);
    if (who === 'bot') { d.insertBefore(av, stack); }
    msgs.appendChild(d);
    return { row: d, stack: stack };
  }

  function addUser(text) {
    var r = makeRow('user');
    var b = document.createElement('div');
    b.className = 'ai-bub';
    b.innerHTML = '<span class="aiIn">' + esc(text).replace(/\n/g, '<br>') + '</span><span class="ai-time">' + timeNow() + '</span>';
    r.stack.appendChild(b);
    setGroupClasses();
    scrollBottom();
  }

  function addBot(text, animate) {
    var r = makeRow('bot');
    var nameEl = document.createElement('div');
    nameEl.className = 'ai-name';
    nameEl.textContent = 'دستیار هوشمند';
    var b = document.createElement('div');
    b.className = 'ai-bub';
    r.stack.appendChild(nameEl);
    r.stack.appendChild(b);

    var lastText = text;
    function finalize(full) {
      lastText = full || lastText;
      b.innerHTML = '<span class="aiIn">' + mdLite(lastText) + '</span><span class="ai-time"><span class="ai-gem">✦ AI</span>' + timeNow() + '</span>';
      var cbtn = document.createElement('button');
      cbtn.className = 'ai-copy';
      cbtn.textContent = '📋 کپی';
      cbtn.onclick = function () { copyText(lastText); cbtn.textContent = '✅ کپی شد'; setTimeout(function () { cbtn.textContent = '📋 کپی'; }, 1600); };
      r.stack.appendChild(cbtn);
      setGroupClasses();
      scrollBottom();
    }

    if (animate) {
      b.textContent = '';
      var i = 0;
      var step = Math.max(1, Math.ceil(text.length / 140));
      var done = false;
      b.style.cursor = 'pointer';
      b.title = 'کلیک = نمایش کامل';
      var int = setInterval(function () {
        i += step;
        b.innerHTML = '<span class="aiIn">' + esc(text.slice(0, i)).replace(/\n/g, '<br>') + '</span><span class="ai-time">' + timeNow() + '</span>';
        scrollBottom();
        if (i >= text.length) { clearInterval(int); done = true; finalize(text); b.onclick = null; b.style.cursor = ''; b.title = ''; }
      }, 16);
      b.onclick = function () {
        if (!done) { clearInterval(int); done = true; finalize(text); b.onclick = null; b.style.cursor = ''; b.title = ''; }
      };
    } else {
      finalize(text);
    }
    return { row: r.row, getText: function () { return lastText; } };
  }

  function addTyping() {
    var d = document.createElement('div');
    d.className = 'ai-row bot';
    d.innerHTML = '<div class="aiAvatar">🤖</div><div class="ai-stack"><div class="ai-name">دستیار هوشمند</div><div class="ai-typing"><i></i><i></i><i></i></div></div>';
    msgs.appendChild(d);
    scrollBottom();
    return d;
  }

  /* ═══ سیستم‌پرامپت ═══ */
  function buildSystem() {
    var base = 'تو «دستیار هوشمند سامانه آموزشی» هستی و با کاربری فارسی‌زبان صحبت می‌کنی.' +
      ' قواعد: ۱) همیشه فارسی روان و خودمانی-محترمانه جواب بده ۲) کوتاه و ساختاریافته (تیتر و لیست در صورت نیاز) ۳) سوالات آموزشی را مرحله‌به‌مرحله و با مثال توضیح بده ۴) از markdown ساده مثل **پرنگ** و لیست با - استفاده کن ۵) دقیق باش و حدس نزن — اگر مطمئن نیستی صادقانه بگو.';
    if (user) {
      return base + ' کاربر فعلی «' + user.name + '» با نقش ' + userRoleFa + ' است و در صفحه «' + (document.title || '') + '» است.';
    }
    return base + ' کاربر فعلاً مهمان است و در صفحه «' + (document.title || '') + '» است.';
  }

  /* ═══ ارسال ═══ */
  function send() {
    var t = input.value.trim();
    if (!t || busy || isGuest) return;
    addUser(t);
    hist.push({ r: 'u', t: t });
    input.value = '';
    input.style.height = 'auto';
    saveHist();
    busy = true;
    sendBtn.disabled = true;
    var typ = addTyping();

    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ prompt: t, system: buildSystem() })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        typ.remove();
        busy = false;
        sendBtn.disabled = false;
        if (d && d.error) {
          addBot('⚠️ ' + d.error, false);
          return;
        }
        addBot(d.reply, true);
        hist.push({ r: 'a', t: d.reply });
        saveHist();
      })
      .catch(function () {
        typ.remove();
        busy = false;
        sendBtn.disabled = false;
        addBot('⚠️ ارتباط با سرور برقرار نشد — اتصال اینترنت را چک کن', false);
      });
  }

  /* ═══ تاریخچه ═══ */
  function saveHist() {
    try {
      if (hist.length > 40) hist = hist.slice(-40);
      localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    } catch (e) {}
  }

  var GUEST_MSG = 'سلام! 👋 من دستیار هوشمند سامانه آموزشی هستم.\n\nبرای گفتگو با من و استفاده از همه امکانات:\n- **سوال درسی بپرسی** و پاسخ مرحله‌به‌مرحله بگیری\n- **تولید سوال آزمون** با هوش مصنوعی\n- **برنامه مطالعه** شخصی بگیری\n\nفقط کافیه وارد حسابت بشی! 🚀';

  var GREET = user ? ({
    student: 'سلام ' + user.name + ' 👋\n\nمن دستیار هوشمندت هستم! می‌تونم:\n- **سوال درسی‌ات را حل کنم** و مرحله‌به‌مرحله توضیح بدم\n- مفهوم‌های سخت را **ساده** باز کنم\n- **سوال تمرینی** یا **برنامه مطالعه** بسازم\n\nچه کمکی لازم داری؟',
    teacher: 'سلام استاد ' + user.name + ' 👋\n\nمی‌تونم:\n- **سوال آزمون** با هر سطح دشواری بسازم\n- **محتوای درس** و جزوه بنویسم\n- **بازخورد دانش‌آموز** و ایده فعالیت کلاسی بدهم\n\nچیکار کنم برات؟',
    admin: 'سلام مدیر گرامی ' + user.name + ' 👋\n\nمی‌تونم:\n- **متن اطلاعیه** و ایمیل رسمی بنویسم\n- **گزارش تحلیلی** و خلاصه آمار بدهم\n- ایده‌ای برای بهبود سامانه پیشنهاد کنم\n\nچه کاری انجام دهم؟'
  }[user.role] || 'سلام! چیکار می‌تونم بکنم؟') : GUEST_MSG;

  function renderAll() {
    msgs.innerHTML = '';
    if (isGuest) {
      addBot(GUEST_MSG, false);
      var g = document.createElement('div');
      g.className = 'ai-guest';
      g.innerHTML = '<b>🚀 هم‌اکنون شروع کن!</b><small>گفتگو با هوش مصنوعی نیازمند ورود است — ثبت‌نام کمتر از ۳۰ ثانیه!</small><a href="/login?tab=register">ثبت‌نام رایگان</a>';
      msgs.appendChild(g);
      return;
    }
    if (!hist.length) { addBot(GREET, false); return; }
    hist.forEach(function (m) {
      if (m.r === 'u') addUser(m.t);
      else addBot(m.t, false);
    });
    scrollBottom();
  }

  /* ═══ چیپ‌های سریع ═══ */
  var CHIPS = isGuest
    ? ['✨ امکانات سامانه را بگو', '🎓 این سایت چیست؟']
    : ({
      student: ['📝 سوال تمرینی بساز و پاسخ را توضیح بده', '💡 مفهوم ... را ساده توضیح بده', '🎯 برنامه مطالعه ۷ روزه بگذار', '✨ چه کارهایی می‌توانی بکنی؟'],
      teacher: ['📋 ۵ سوال چهارگزینه‌ای درباره ... بساز', '📚 محتوای درس ... را بنویس', '💬 بازخورد سازنده بنویس', '✨ چه کارهایی می‌توانی بکنم؟'],
      admin: ['📢 متن اطلاعیه ... بنویس', '📊 گزارش تحلیلی بنویس', '✨ چه کارهایی می‌توانی بکنم؟']
    }[user.role] || ['✨ چه کارهایی می‌توانی بکنم؟']);

  panel.querySelector('#aiChips').innerHTML = CHIPS.map(function (c) {
    return '<button class="ai-chip"' + (isGuest ? '' : '') + '>' + c + '</button>';
  }).join('');
  panel.querySelector('#aiChips').addEventListener('click', function (e) {
    var ch = e.target.closest('.ai-chip');
    if (!ch) return;
    if (isGuest) {
      // مهمان: سوال پیش‌فرض درباره سایت بپرس بدون ارسال
      var q = ch.textContent;
      input.value = '';
      addBot('این سوال را بعد از ورود می‌توانی بپرسی! 😊 برای دسترسی فوری:\n- در صفحه **ورود** حساب بساز یا وارد شو\n- بعد دکمه 🤖 را دوباره بزن', false);
      return;
    }
    input.value = ch.textContent.replace('...', ' ');
    input.focus();
    autoResize();
  });

  /* ═══ رویدادها ═══ */
  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  input.addEventListener('input', autoResize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  fab.addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      if (!loaded) { loaded = true; renderAll(); }
      if (!isGuest) setTimeout(function () { input.focus(); }, 80);
    }
  });
  panel.querySelector('#aiCloseBtn').addEventListener('click', function () { panel.classList.remove('open'); });
  panel.querySelector('#aiClearBtn').addEventListener('click', function () {
    hist = [];
    saveHist();
    renderAll();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') panel.classList.remove('open');
  });

  /* ═══ حلقه توجه — فقط دفعات اول ═══ */
  try {
    var seen = parseInt(localStorage.getItem('ai_seen') || '0', 10);
    var ring = fab.querySelector('.aiRing');
    if (seen < 2) {
      localStorage.setItem('ai_seen', String(seen + 1));
      setTimeout(function () {
        if (!panel.classList.contains('open')) ring.style.display = 'block';
      }, 2500);
      fab.addEventListener('click', function () { ring.style.display = 'none'; });
    } else {
      ring.style.display = 'none';
    }
  } catch (e) { var r2 = fab.querySelector('.aiRing'); if (r2) r2.style.display = 'none'; }
})();