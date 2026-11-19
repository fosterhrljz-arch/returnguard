(function(root){
  'use strict';
  const STATUSES=['Keeping','Considering Return','Returning','Returned','Refunded'];
  const CURRENCIES=['USD','EUR','GBP','CAD','AUD','JPY','CNY','INR'];
  const DAY=86400000;
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||s>'2200-12-31')return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
  const days=(s,base=today())=>Math.round((Date.parse(s+'T00:00:00Z')-Date.parse(base+'T00:00:00Z'))/DAY);
  const addDays=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
  const active=p=>!['Returned','Refunded'].includes(p.status);
  const id=()=>globalThis.crypto?.randomUUID?.()||'rg-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function date(s){return s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set';}
  function money(p){return new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency}).format(p.price);}
  function countdown(s){if(!s)return 'Not set';const n=days(s);return n<0?`Closed ${Math.abs(n)}d ago`:n===0?'Due today':n===1?'1 day left':`${n} days left`;}
  function stats(items){const a=items.filter(active);return {active:a.length,soon:a.filter(p=>p.returnDate&&days(p.returnDate)>=0&&days(p.returnDate)<=7).length,expired:a.filter(p=>p.returnDate&&days(p.returnDate)<0).length,warranty:a.filter(p=>p.warrantyDate&&days(p.warrantyDate)>=0).length};}
  function filter(items,{search='',filter='all',status='all',sort='newest'}={}){let a=items.filter(p=>(p.name+' '+p.store+' '+p.notes).toLowerCase().includes(search.toLowerCase())&&(status==='all'||p.status===status));
    a=a.filter(p=>filter==='all'||filter==='active'&&active(p)||filter==='soon'&&active(p)&&p.returnDate&&days(p.returnDate)>=0&&days(p.returnDate)<=7||filter==='expired'&&active(p)&&p.returnDate&&days(p.returnDate)<0||filter==='warranty'&&active(p)&&p.warrantyDate&&days(p.warrantyDate)>=0);
    return a.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='return'?(a.returnDate||'9999').localeCompare(b.returnDate||'9999'):sort==='warranty'?(a.warrantyDate||'9999').localeCompare(b.warrantyDate||'9999'):sort==='oldest'?a.purchaseDate.localeCompare(b.purchaseDate):b.purchaseDate.localeCompare(a.purchaseDate));
  }
  function events(items,type='both'){return items.filter(active).flatMap(p=>['return','warranty'].filter(t=>type==='both'||type===t).map(t=>({purchase:p,type:t,date:p[t+'Date']})).filter(e=>e.date&&days(e.date)>=0)).sort((a,b)=>a.date.localeCompare(b.date));}
  function validateAsset(f,photo=false){if(!f||typeof f!=='object'||typeof f.name!=='string'||f.name.length>240||!f.name.trim()||typeof f.data!=='string'||f.data.length>17000000)throw Error('An attachment is invalid or too large.');
    const m=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(f.data);
    if(!m||photo&&m[1]==='application/pdf'||m[2].length%4)throw Error('Only PNG, JPEG, WebP images and PDF receipts are supported.');
    const head=atob(m[2].slice(0,32));const valid=m[1]==='image/png'?head.startsWith('\x89PNG\r\n\x1a\n'):m[1]==='image/jpeg'?head.startsWith('\xff\xd8\xff'):m[1]==='image/webp'?head.startsWith('RIFF')&&head.slice(8,12)==='WEBP':head.startsWith('%PDF-');
    if(!valid)throw Error('The attachment contents do not match its file type.');return {id:typeof f.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(f.id)?f.id:id(),name:f.name,type:m[1],data:f.data};
  }
  function validatePurchase(p){if(!p||typeof p!=='object')throw Error('Invalid purchase record.');
    if(typeof p.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(p.id))throw Error('Invalid purchase ID.');
    for(const key of ['name','store'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>160)throw Error('Product name and store are required (up to 160 characters).');
    if(typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<0||p.price>999999999)throw Error('Enter a valid non-negative price.');
    if(!CURRENCIES.includes(p.currency)||!STATUSES.includes(p.status))throw Error('Invalid currency or return status.');
    if(!validDate(p.purchaseDate))throw Error('Enter a valid purchase date.');
    for(const key of ['returnDate','warrantyDate'])if(p[key]&&(!validDate(p[key])||p[key]<p.purchaseDate))throw Error('Return and warranty dates must be on or after the purchase date.');
    if(p.notes!=null&&(typeof p.notes!=='string'||p.notes.length>5000))throw Error('Notes must be 5,000 characters or fewer.');
    if(!Array.isArray(p.receipts)||p.receipts.length>30)throw Error('A purchase can contain up to 30 receipts.');
    const receipts=p.receipts.map(f=>validateAsset(f));if(new Set(receipts.map(f=>f.id)).size!==receipts.length)throw Error('Duplicate receipt IDs.');
    return {id:p.id,name:p.name.trim(),store:p.store.trim(),price:p.price,currency:p.currency,purchaseDate:p.purchaseDate,returnDate:p.returnDate||'',warrantyDate:p.warrantyDate||'',status:p.status,notes:p.notes||'',photo:p.photo?validateAsset(p.photo,true):null,receipts,demo:p.demo===true,demoImage:[0,1,2].includes(p.demoImage)?p.demoImage:null};
  }
  function validateBackup(b){if(!b||b.app!=='ReturnGuard'||b.version!==1||!Array.isArray(b.purchases)||b.purchases.length>5000)throw Error('This is not a supported ReturnGuard backup (version 1).');const list=b.purchases.map(validatePurchase);if(new Set(list.map(p=>p.id)).size!==list.length)throw Error('The backup contains duplicate purchase IDs.');return list;}
  function calendar(items,type='both'){
    const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ReturnGuard//Purchase Reminders//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const e of events(items,type)){const p=e.purchase;lines.push('BEGIN:VEVENT',`UID:${p.id}-${e.type}@returnguard.local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${e.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${addDays(e.date,1).replace(/-/g,'')}`,`SUMMARY:${esc((e.type==='return'?'Return deadline: ':'Warranty expires: ')+p.name)}`,`DESCRIPTION:${esc(`Store: ${p.store}\n${e.type==='return'?'Return deadline':'Warranty expiration'} entered by you: ${e.date}. Confirm terms with the store.\n${p.notes}`)}`,'TRANSP:TRANSPARENT','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-P1D',`DESCRIPTION:${esc('Reminder: '+p.name)}`,'END:VALARM','END:VEVENT');}
    lines.push('END:VCALENDAR');return lines.map(l=>{let chunks=[''],len=0;for(const ch of l){const n=new TextEncoder().encode(ch).length;if(len+n>75){chunks.push(' ');len=1;}chunks[chunks.length-1]+=ch;len+=n;}return chunks.join('\r\n');}).join('\r\n')+'\r\n';
  }
  function demo(){const t=today();return [
    ['Studio Headphones','Sound & Co.',349.99,-8,18,353,'Keeping',0],
    ['Everyday Sneakers','The Everyday Store',99,-12,5,345,'Considering Return',1],
    ['Morning Espresso','Home Supply',249,-15,26,722,'Keeping',2],
    ['Weekend Carryall','Field Goods',89,-25,2,340,'Returning',null],
    ['Reading Light','Home Supply',65,-50,-10,315,'Keeping',null],
    ['Linen Overshirt','The Everyday Store',79,-18,15,null,'Keeping',null]
    ].map(([name,store,price,b,r,w,status,demoImage])=>({id:id(),name,store,price,currency:'USD',purchaseDate:addDays(t,b),returnDate:addDays(t,r),warrantyDate:w===null?'':addDays(t,w),status,notes:'Example purchase. These dates are fictional, not store policies.',photo:null,receipts:[],demo:true,demoImage}));}
  const api={STATUSES,CURRENCIES,today,validDate,days,addDays,active,id,escape,date,money,countdown,stats,filter,events,validateAsset,validatePurchase,validateBackup,calendar,demo};
  if(typeof module!=='undefined')module.exports=api;root.RG=api;
})(globalThis);
