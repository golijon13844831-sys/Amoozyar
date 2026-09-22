/* ═══════════════════════════════════════════════
   🤖 آموزبات — پاد هوش مصنوعی کلاس مجازی آموزیار
   فایل: public/classroom-ai.js
   افزودن به classroom.html (قبل از </body>):
   <script src="/classroom-ai.js" defer></script>
   ═══════════════════════════════════════════════ */
(function(){
  if(window.__CLASS_AI__)return; window.__CLASS_AI__=1;

  /* ویجت شناور را مخفی کن — پاد اختصاصی داریم */
  var hs=document.createElement('style');
  hs.textContent='#aiFab{display:none!important}';
  document.head.appendChild(hs);

  /* ─── استایل پاد ─── */
  var css=''+
  '.aiPodHead{padding:8px 12px;background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(34,211,238,.07));border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:9px;flex-shrink:0}'+
  '.aiPodHead .aiPAv{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#c084fc);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 4px 12px -3px rgba(139,92,246,.5)}'+
  '.aiPodHead .aiPInfo{flex:1;min-width:0}'+
  '.aiPodHead b{font-size:.8rem;display:block;color:#c084fc}'+
  '.aiPodHead small{font-size:.62rem;color:var(--muted);display:flex;align-items:center;gap:5px}'+
  '.aiPodHead small i{width:6px;height:6px;border-radius:50%;background:#2fd48c;box-shadow:0 0 6px #2fd48c;display:inline-block}'+
  '.aiPmsg{display:flex;gap:7px;margin-bottom:8px;max-width:95%;animation:aiPIn .18s ease}'+
  '@keyframes aiPIn{from{opacity:0;transform:translateY(4px)}}'+
  '.aiPmsg.me{align-self:flex-end;flex-direction:row-reverse}'+
  '.aiPav{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.78rem;flex-shrink:0;align-self:flex-end}'+
  '.aiPav.bot{background:linear-gradient(135deg,#8b5cf6,#c084fc)}'+
  '.aiPav.me{background:rgba(52,152,219,.2);color:#3498db;font-size:.62rem;font-weight:800}'+
  '.aiPbub{padding:8px 11px 6px;border-radius:11px;font-size:.8rem;line-height:1.7;word-break:break-word;max-width:100%;position:relative}'+
  '.aiPmsg .aiPbub{background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(34,211,238,.07));border:1px solid rgba(139,92,246,.3);border-bottom-right-radius:3px;color:#e8edf4}'+
  '.aiPmsg.me .aiPbub{background:rgba(52,152,219,.16);border:1px solid rgba(52,152,219,.3);border-bottom-left-radius:3px}'+
  '.aiPt{float:left;margin:3px 0 0 7px;font-size:.58rem;color:rgba(255,255,255,.4)}'+
  '.aiPtyp{display:flex;gap:4px;padding:10px 12px;background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(34,211,238,.07));border:1px solid rgba(139,92,246,.3);border-radius:11px;border-bottom-right-radius:3px;width:fit-content;margin-bottom:8px}'+
  '.aiPtyp i{width:5px;height:5px;border-radius:50%;background:#c084fc;animation:aiPB 1.2s infinite}'+
  '.aiPtyp i:nth-child(2){animation-delay:.15s}.aiPtyp i:nth-child(3){animation-delay:.3s}'+
  '@keyframes aiPB{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}'+
  '.aiPchips{display:flex;gap:5px;padding:6px 8px;overflow-x:auto;flex-shrink:0;border-top:1px solid var(--bd)}'+
  '.aiPchip{white-space:nowrap;padding:5px 11px;border-radius:15px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.1);color:#c4b0ff;font-family:inherit;font-size:.7rem;cursor:pointer;flex-shrink:0;transition:.15s}'+
  '.aiPchip:hover{background:rgba(139,92,246,.25);color:#fff}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  /* ─── ثبت پاد ─── */
  POD_DEFS.ai={title:'آموزبات ✦ ربات کلاس',icon:'🤖',minW:290,minH:240};

  var origBuild=buildPodContent;
  window.buildPodContent=function(key){
    if(key==='ai'){buildAIPod();return}
    return origBuild(key);
  };

  /* دکمه لانچر */
  var launcher=document.querySelector('.pod-launcher');
  if(launcher){
    var lb=document.createElement('button');
    lb.className='launcher-btn';
    lb.id='launch-ai';
    lb.setAttribute('onclick',"togglePod('ai')");
    lb.textContent='🤖 آموزبات';
    launcher.appendChild(lb);
  }

  /* ─── محتوا ─── */
  var podHist=[];
  var busy=false;

  function buildAIPod(){
    var body=document.getElementById('podbody-ai');if(!body)return;
    body.innerHTML=
      '<div class="aiPodHead">'+
        '<div class="aiPAv">🤖</div>'+
        '<div class="aiPInfo"><b>آموزبات</b><small><i></i> آنلاین · بدون ترک کلاس</small></div>'+
      '</div>'+
      '<div class="chat-msgs" id="aiPodMsgs"></div>'+
      '<div class="aiPchips" id="aiPodChips"></div>'+
      '<div class="chat-input">'+
        '<input id="aiPodInput" placeholder="سوالت را از آموزبات بپرس..." onkeydown="if(event.key===\'Enter\')window.__aiPodSend()"/>'+
        '<button onclick="window.__aiPodSend()">➤</button>'+
      '</div>';
    renderChips();
    renderWelcome();
  }

  function renderChips(){
    var el=document.getElementById('aiPodChips');if(!el)return;
    var chips=['💡 این درس را خلاصه کن','📝 یک سوال تمرینی بده','🔁 با مثال ساده توضیح بده','✨ چه کارهایی می‌کنی؟'];
    el.innerHTML=chips.map(function(c){return '<button class="aiPchip" data-pc="'+c+'">'+c+'</button>'}).join('');
    el.onclick=function(e){
      var c=e.target.closest('[data-pc]');if(!c)return;
      var inp=document.getElementById('aiPodInput');
      if(inp){inp.value=c.dataset.pc.replace('این درس','مبحثی از این درس');inp.focus()}
    };
  }

  function esc(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function nowT(){try{return new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}catch(e){return''}}
  function md(t){
    var s=esc(t);
    s=s.replace(/```([\s\S]*?)```/g,function(m,c){return '<pre style="background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px;margin:5px 0;overflow-x:auto;font-size:.72rem;direction:ltr;text-align:left;white-space:pre-wrap;color:#c7cedb">'+c.trim()+'</pre>'});
    s=s.replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
    s=s.replace(/^[\-\*•]\s+(.+)$/gm,'<div style="padding-right:10px;margin:2px 0">• $1</div>');
    s=s.replace(/\n/g,'<br>');
    return s;
  }
  function scrollPod(){var el=document.getElementById('aiPodMsgs');if(el)el.scrollTop=el.scrollHeight}

  function renderWelcome(){
    var el=document.getElementById('aiPodMsgs');if(!el)return;
    var isT=typeof isTeacher!=='undefined'&&isTeacher;
    var w=isT
      ?'سلام استاد! 👋 من **آموزبات**م — ربات آموزیار.\nوسط کلاس می‌تونم:\n- برایت **سوال/مثال** بسازم\n- خلاصه‌ای برای مرور بدهم\n- به سوالات دانش‌آموزها پاسخ بدهم\n\nاز پایین چیزی بپرس!'
      :'سلام! 👋 من **آموزبات**م — ربات آموزیار.\nمعلم داره تدریس می‌کنه و اگه چیزی رو نگرفتی، **از من بپرس** بدون اینکه کلاس رو از دست بدی! 🚀';
    addBot(w,false);
  }

  function addMe(t){
    var el=document.getElementById('aiPodMsgs');if(!el)return;
    var d=document.createElement('div');
    d.className='aiPmsg me';
    d.innerHTML='<div class="aiPav me">'+(typeof user!=='undefined'&&user?esc(user.name[0]):'؟')+'</div>'+
      '<div class="aiPbub">'+esc(t).replace(/\n/g,'<br>')+'<span class="aiPt">'+nowT()+'</span></div>';
    el.appendChild(d);scrollPod();
  }
  function addBot(t,animate){
    var el=document.getElementById('aiPodMsgs');if(!el)return;
    var d=document.createElement('div');
    d.className='aiPmsg';
    d.innerHTML='<div class="aiPav bot">🤖</div><div class="aiPbub"></div>';
    var b=d.querySelector('.aiPbub');
    var ts='<span class="aiPt">✦ '+nowT()+'</span>';
    function fin(){b.innerHTML=md(t)+ts;scrollPod()}
    if(animate){
      var i=0,step=Math.max(1,Math.ceil(t.length/110));
      var int=setInterval(function(){
        i+=step;
        b.innerHTML=esc(t.slice(0,i)).replace(/\n/g,'<br>')+ts;
        scrollPod();
        if(i>=t.length){clearInterval(int);fin()}
      },16);
    }else fin();
    el.appendChild(d);scrollPod();
  }
  function addTyp(){
    var el=document.getElementById('aiPodMsgs');if(!el)return;
    var d=document.createElement('div');
    d.className='aiPmsg';
    d.innerHTML='<div class="aiPav bot">🤖</div><div class="aiPtyp"><i></i><i></i><i></i></div>';
    el.appendChild(d);scrollPod();
    return d;
  }

  function sysPrompt(){
    var s='تو «آموزبات» هستی، ربات هوشمند پلتفرم آموزشی «آموزیار» و الان داخل یک کلاس مجازی زنده هستی.';
    if(typeof session!=='undefined'&&session){
      s+=' جلسه: «'+(session.title||'کلاس')+'» — مدرس: '+session.teacherName+' — حدود '+((session.students||[]).length+1)+' نفر حاضر.';
    }
    if(typeof user!=='undefined'&&user){
      s+=' کاربر فعلی با نقش '+(user.role==='teacher'?'معلم (مدرس همین جلسه)':'دانش‌آموز')+' است.';
    }
    s+=' قواعد: فارسی روان، خیلی کوتاه و سریع (وسط کلاس زنده است!)، سوالات را مستقیم و مرحله‌به‌مرحله جواب بده، از markdown ساده (**پرنگ** و لیست -) استفاده کن.';
    return s;
  }

  window.__aiPodSend=function(){
    var inp=document.getElementById('aiPodInput');
    if(!inp||busy)return;
    var t=inp.value.trim();
    if(!t)return;
    inp.value='';
    addMe(t);
    podHist.push({r:'u',t:t});
    if(podHist.length>20)podHist=podHist.slice(-20);
    busy=true;
    var typ=addTyp();
    fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({prompt:t,system:sysPrompt()})})
    .then(function(r){return r.json()})
    .then(function(d){
      typ.remove();busy=false;
      if(d&&d.error){addBot('⚠️ '+d.error,false);return}
      addBot(d.reply,true);
      podHist.push({r:'a',t:d.reply});
    })
    .catch(function(){
      typ.remove();busy=false;
      addBot('⚠️ ارتباط برقرار نشد',false);
    });
  };
})();