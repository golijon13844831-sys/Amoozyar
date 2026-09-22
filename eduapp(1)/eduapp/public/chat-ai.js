/* ═══════════════════════════════════════════════
   🤖 آموزبات — ربات هوشمند پیام‌رسان آموزیار
   فایل: public/chat-ai.js
   افزودن به chat.html (قبل از </body>):
   <script src="/chat-ai.js" defer></script>
   ═══════════════════════════════════════════════ */
(function(){
  if(window.__CHAT_AI__)return; window.__CHAT_AI__=1;

  var AI_ID='__ai__';
  var HIST_KEY='ai_bot_chat_'+(typeof user!=='undefined'&&user?user.id:'guest');
  var aiActive=false;
  var busy=false;
  var hist=[];
  try{hist=JSON.parse(localStorage.getItem(HIST_KEY)||'[]')||[]}catch(e){hist=[]}
  function saveHist(){try{localStorage.setItem(HIST_KEY,JSON.stringify(hist.slice(-60)))}catch(e){}}
  function esc(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function nowTime(){try{return new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}catch(e){return''}}

  /* ─── استایل ─── */
  var css=''+
  '.aib-row{display:flex;gap:8px;margin-bottom:10px;max-width:min(520px,100%);animation:aibIn .2s ease}'+
  '@keyframes aibIn{from{opacity:0;transform:translateY(5px)}}'+
  '.aib-row.bot{align-self:flex-start}'+
  '.aib-row.user{align-self:flex-end;flex-direction:row-reverse}'+
  '.aib-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;align-self:flex-end}'+
  '.aib-av.bot{background:linear-gradient(135deg,#8b5cf6,#c084fc);box-shadow:0 4px 12px -3px rgba(139,92,246,.5)}'+
  '.aib-av.me{background:rgba(255,255,255,.12);font-size:.72rem;font-weight:800;color:#c7cedb}'+
  '.aib-stack{display:flex;flex-direction:column;min-width:0;max-width:100%}'+
  '.aib-name{font-size:.7rem;color:#c084fc;font-weight:700;margin-bottom:3px}'+
  '.aib-bub{position:relative;padding:9px 13px 7px;border-radius:14px;font-size:.9rem;line-height:1.75;word-break:break-word;max-width:100%}'+
  '.aib-row.bot .aib-bub{background:linear-gradient(135deg,rgba(139,92,246,.16),rgba(34,211,238,.08));border:1px solid rgba(139,92,246,.3);border-bottom-right-radius:4px}'+
  '.aib-row.user .aib-bub{background:#2b5278;border-bottom-left-radius:4px}'+
  '.aib-time{float:left;margin:4px 0 0 8px;font-size:.62rem;color:rgba(255,255,255,.45)}'+
  '.aib-gem{display:inline-flex;gap:3px;font-size:.58rem;background:rgba(139,92,246,.22);border:1px solid rgba(139,92,246,.4);color:#c4b0ff;border-radius:7px;padding:1px 6px;margin-right:5px;vertical-align:middle}'+
  '.aib-copy{opacity:0;background:none;border:none;color:rgba(255,255,255,.5);font-size:.64rem;cursor:pointer;padding:2px 8px;margin-top:4px;border-radius:6px;font-family:inherit;transition:.15s;align-self:flex-start}'+
  '.aib-row:hover .aib-copy{opacity:1}'+
  '.aib-copy:hover{color:#fff;background:rgba(255,255,255,.1)}'+
  '.aib-md b{color:#fff}'+
  '.aib-md code{background:rgba(255,255,255,.12);border-radius:5px;padding:1px 6px;font-size:.8rem;direction:ltr;display:inline-block}'+
  '.aib-md pre{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px;margin:7px 0;overflow-x:auto;font-size:.78rem;direction:ltr;text-align:left;white-space:pre-wrap;color:#c7cedb}'+
  '.aib-chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 14px}'+
  '.aib-chip{padding:7px 13px;border-radius:18px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.1);color:#c4b0ff;font-family:inherit;font-size:.74rem;cursor:pointer;transition:.15s}'+
  '.aib-chip:hover{background:rgba(139,92,246,.25);color:#fff}'+
  '.aib-typ{display:flex;gap:4px;padding:12px 14px;background:linear-gradient(135deg,rgba(139,92,246,.16),rgba(34,211,238,.08));border:1px solid rgba(139,92,246,.3);border-radius:14px;border-bottom-right-radius:4px;width:fit-content}'+
  '.aib-typ i{width:6px;height:6px;border-radius:50%;background:#c084fc;animation:aibB 1.2s infinite}'+
  '.aib-typ i:nth-child(2){animation-delay:.15s}.aib-typ i:nth-child(3){animation-delay:.3s}'+
  '@keyframes aibB{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  function md(t){
    var s=esc(t);
    s=s.replace(/```([\s\S]*?)```/g,function(m,c){return '<pre>'+c.trim()+'</pre>'});
    s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
    s=s.replace(/^[\-\*•]\s+(.+)$/gm,'<div style="padding-right:11px;margin:2px 0">• $1</div>');
    s=s.replace(/^(\d+)[.)]\s+(.+)$/gm,'<div style="padding-right:11px;margin:2px 0"><b>$1.</b> $2</div>');
    s=s.replace(/\n/g,'<br>');
    return '<span class="aib-md">'+s+'</span>';
  }

  /* ─── رندر پیام‌ها ─── */
  function userNode(t,at){
    var d=document.createElement('div');
    d.className='aib-row user';
    d.innerHTML='<div class="aib-av me">'+(typeof user!=='undefined'&&user?esc(user.name[0]):'؟')+'</div>'+
      '<div class="aib-stack"><div class="aib-bub">'+esc(t).replace(/\n/g,'<br>')+
      '<span class="aib-time">'+(at||nowTime())+'</span></div></div>';
    return d;
  }
  function botNode(t,at,animate){
    var d=document.createElement('div');
    d.className='aib-row bot';
    d.innerHTML='<div class="aib-av bot">🤖</div>'+
      '<div class="aib-stack"><div class="aib-name">آموزبات</div><div class="aib-bub"></div></div>';
    var b=d.querySelector('.aib-bub');
    var timeStr='<span class="aib-time"><span class="aib-gem">✦ AI</span>'+(at||nowTime())+'</span>';
    function fin(){
      b.innerHTML=md(t)+timeStr;
      var cbtn=document.createElement('button');
      cbtn.className='aib-copy';cbtn.textContent='📋 کپی';
      cbtn.onclick=function(){copyText(t);cbtn.textContent='✅ کپی شد';setTimeout(function(){cbtn.textContent='📋 کپی'},1600)};
      d.querySelector('.aib-stack').appendChild(cbtn);
      scrollBottom();
    }
    if(animate){
      var i=0,step=Math.max(1,Math.ceil(t.length/120)),done=false;
      b.style.cursor='pointer';b.title='کلیک = نمایش کامل';
      var int=setInterval(function(){
        i+=step;
        b.innerHTML=esc(t.slice(0,i)).replace(/\n/g,'<br>')+timeStr;
        scrollBottom();
        if(i>=t.length){clearInterval(int);done=true;fin();b.onclick=null;b.style.cursor='';b.title=''}
      },16);
      b.onclick=function(){if(!done){clearInterval(int);done=true;fin();b.onclick=null;b.style.cursor='';b.title=''}};
    }else fin();
    return d;
  }
  function copyText(t){
    if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){});
    else{var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove()}
  }

  var CHIPS=['💡 مفهوم ... را ساده توضیح بده','📝 ۳ سوال تمرینی از ... بساز','🎯 برنامه مطالعه امروزم را بگذار','✨ چه کارهایی می‌توانی بکنی؟'];
  function chipsHTML(){
    return '<div class="aib-chips">'+CHIPS.map(function(c){return '<button class="aib-chip" data-aic="1">'+c+'</button>'}).join('')+'</div>';
  }

  function renderAIAll(){
    var el=document.getElementById('messages');
    var html='<div style="align-self:center;margin:6px 0 14px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:14px;padding:14px 16px;text-align:center;max-width:340px">'+
      '<div style="font-size:1.7rem;margin-bottom:6px">🤖</div>'+
      '<b style="font-size:.95rem;color:#c084fc">آموزبات</b>'+
      '<div style="font-size:.74rem;color:var(--muted);margin-top:5px;line-height:1.8">ربات هوشمند آموزیار — سوال درسی بپرس، مفهومی را ساده کن یا تمرین بخواه 🚀</div></div>';
    html+=chipsHTML();
    el.innerHTML=html;
    hist.forEach(function(m){
      el.appendChild(m.r==='u'?userNode(m.t,m.at):botNode(m.t,m.at,false));
    });
    scrollBottom();
  }

  /* ─── پچ‌ها ─── */
  var origRender=renderRooms;
  window.renderRooms=function(){
    origRender();
    var list=document.getElementById('roomsList');if(!list)return;
    var lastT='ربات هوشمند آموزیار — همیشه آنلاین';
    for(var i=hist.length-1;i>=0;i--){if(hist[i].r==='a'){lastT=(hist[i].t||'').replace(/\n/g,' ').slice(0,44);break}}
    var card=document.createElement('div');
    card.className='room-item';
    card.setAttribute('data-room',AI_ID);
    card.style.cssText='background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(34,211,238,.07));margin:8px;border-radius:12px;border:1px solid '+(aiActive?'#8b5cf6':'rgba(139,92,246,.3)');
    card.innerHTML='<div class="room-avatar" style="background:linear-gradient(135deg,#8b5cf6,#c084fc)">🤖</div>'+
      '<div class="room-info"><div class="room-top"><span class="room-name">آموزبات <span style="font-size:.6rem;color:#c084fc">✦ ربات</span></span><span class="room-time">AI</span></div>'+
      '<div class="room-last">'+esc(lastT)+'</div></div>'+
      '<span class="unread-badge" style="background:linear-gradient(135deg,#8b5cf6,#c084fc)">✦</span>';
    list.insertBefore(card,list.firstChild);
  };

  var origUHP=updateHeaderPresence;
  window.updateHeaderPresence=function(){
    if(activeRoomId===AI_ID){
      var sub=document.getElementById('chatSub');
      if(sub.classList.contains('typing'))return;
      sub.textContent='ربات هوشمند آموزیار · همیشه آنلاین';
      sub.classList.add('online');
      return;
    }
    return origUHP();
  };

  var origSync=syncMessages;
  window.syncMessages=function(){
    if(activeRoomId===AI_ID)return;
    return origSync();
  };

  var origOpen=openRoom;
  window.openRoom=function(id){
    if(id===AI_ID){openAI();return}
    aiActive=false;
    return origOpen(id);
  };

  function openAI(){
    aiActive=true;
    saveDraft();
    activeRoomId=AI_ID;
    activeRoom={id:AI_ID,name:'آموزبات',type:'ai',members:[]};
    selectionOff();cancelReply();cancelEdit();
    document.body.classList.add('room-open');
    document.getElementById('noChat').style.display='none';
    document.getElementById('chatMain').style.display='flex';
    var av=document.getElementById('chatAvatar');
    av.textContent='🤖';
    av.style.background='linear-gradient(135deg,#8b5cf6,#c084fc)';
    document.getElementById('chatTitle').textContent='آموزبات ✦';
    othersTyping.clear();renderTyping();
    document.getElementById('messages').innerHTML='';
    messages=[];renderedFrom=0;newBelow=0;
    document.getElementById('searchBar').classList.remove('show');
    document.getElementById('pinnedBar').classList.remove('show');
    renderAIAll();
    renderRooms();
    restoreDraft();
  }

  function aiSystem(){
    var ctx='';
    var recent=hist.slice(-11,-1);
    if(recent.length){
      ctx='\n\nمکالمه اخیر برای درک زمینه:\n';
      recent.forEach(function(m){ctx+=(m.r==='u'?'کاربر: ':'آموزبات: ')+String(m.t||'').slice(0,300)+'\n'});
    }
    return 'تو «آموزبات» هستی، ربات هوشمند پلتفرم آموزشی «آموزیار»، و در پیام‌رسان داخلی آن گفتگو می‌کنی.'+
      ' قواعد: ۱) فارسی روان و خودمانی-محترمانه ۲) کوتاه و ساختاریافته ۳) سوال آموزشی را مرحله‌به‌مرحله با مثال توضیح بده ۴) از markdown ساده (**پرنگ** و لیست با -) استفاده کن ۵) دقیق باش و حدس نزن.'+ctx;
  }

  var origSend=sendMsg;
  window.sendMsg=function(){
    if(activeRoomId===AI_ID){sendAI();return}
    return origSend();
  };

  function sendAI(){
    var inp=document.getElementById('msgInput');
    var t=inp.value.trim();
    if(!t||busy)return;
    if(pendingFiles.length){pendingFiles.length=0;renderFilePreview();toast('آموزبات فعلاً فقط پیام متنی می‌فهمد 🙂')}
    inp.value='';autoResize(inp);saveDraft();
    var at=nowTime();
    var el=document.getElementById('messages');
    el.appendChild(userNode(t,at));
    hist.push({r:'u',t:t,at:at});saveHist();
    scrollBottom();
    busy=true;
    var typ=document.createElement('div');
    typ.className='aib-row bot';
    typ.innerHTML='<div class="aib-av bot">🤖</div><div class="aib-stack"><div class="aib-name">آموزبات</div><div class="aib-typ"><i></i><i></i><i></i></div></div>';
    el.appendChild(typ);scrollBottom();
    othersTyping.set('ai','آموزبات');renderTyping();
    fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({prompt:t,system:aiSystem()})})
    .then(function(r){return r.json()})
    .then(function(d){
      typ.remove();
      othersTyping.delete('ai');renderTyping();
      busy=false;
      if(d&&d.error){el.appendChild(botNode('⚠️ '+d.error,nowTime(),false));scrollBottom();return}
      var at2=nowTime();
      el.appendChild(botNode(d.reply,at2,true));
      hist.push({r:'a',t:d.reply,at:at2});saveHist();
      renderRooms();
    })
    .catch(function(){
      typ.remove();
      othersTyping.delete('ai');renderTyping();
      busy=false;
      el.appendChild(botNode('⚠️ ارتباط برقرار نشد — دوباره تلاش کن',nowTime(),false));
      scrollBottom();
    });
  }

  var origRec=startRecording;
  window.startRecording=function(){
    if(activeRoomId===AI_ID){toast('🎤 پیام صوتی برای آموزبات در دسترس نیست — تایپ کن 🙂');return}
    return origRec();
  };

  document.getElementById('messages').addEventListener('click',function(e){
    var c=e.target.closest('[data-aic]');
    if(!c||activeRoomId!==AI_ID)return;
    var inp=document.getElementById('msgInput');
    inp.value=c.textContent.replace('...',' ');
    inp.focus();autoResize(inp);
  });

  renderRooms();
})();