// test-ai.js  →  اجرا:  node test-ai.js
const TOKEN = 'd658e8f2d2fd08673c8205416617700c996ddb4ee92750b0';   // ⬅️ توکن خودت
const API = 'https://amooz-bat.vercel.app/api/gemini';

const tries = [
  ['POST | Bearer + message',    { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, body:JSON.stringify({message:'سلام'}) }],
  ['POST | Bearer + prompt',     { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, body:JSON.stringify({prompt:'سلام'}) }],
  ['POST | توکن خالی (بدون Bearer)', { method:'POST', headers:{'Content-Type':'application/json','Authorization':TOKEN}, body:JSON.stringify({message:'سلام'}) }],
  ['POST | x-api-key',           { method:'POST', headers:{'Content-Type':'application/json','x-api-key':TOKEN}, body:JSON.stringify({message:'سلام'}) }],
  ['POST | x-auth-token',        { method:'POST', headers:{'Content-Type':'application/json','x-auth-token':TOKEN}, body:JSON.stringify({message:'سلام'}) }],
  ['POST | x-goog-api-key ( Gemini native )', { method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':TOKEN}, body:JSON.stringify({contents:[{parts:[{text:'سلام'}]}]}) }],
  ['POST | توکن داخل body',     { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:TOKEN, message:'سلام'}) }],
  ['POST | apiKey داخل body',   { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({apiKey:TOKEN, message:'سلام'}) }],
  ['GET  | ?message + ?token',   'GET1'],
];

(async () => {
  console.log('نسخه Node:', process.version);
  if (typeof fetch !== 'function') { console.log('\n❌ fetch نداری! Node 18+ نصب کن'); return; }
  for (const [name, opts] of tries) {
    try {
      let url = API, o = opts;
      if (opts === 'GET1') {
        url = API + '?message=' + encodeURIComponent('سلام') + '&token=' + encodeURIComponent(TOKEN);
        o = { headers: { 'Authorization': 'Bearer ' + TOKEN } };
      }
      const r = await fetch(url, o);
      const t = await r.text();
      const mark = (r.status === 200 && !/error|unauthorized|invalid/i.test(t)) ? '✅✅✅ اینا!) ' : '⛔';
      console.log('\n──── ' + name + ' → ' + r.status + ' ' + mark);
      console.log(t.slice(0, 400));
    } catch (e) {
      console.log('\n──── ' + name + ' → خطای شبکه: ' + e.message);
    }
  }
  console.log('\n🎯 هر کدام ✅ داشت، خروجی‌اش را برایم بفرست');
})();