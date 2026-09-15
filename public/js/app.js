import { createMarket } from './scene.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tg=window.Telegram?.WebApp;
tg?.ready();tg?.expand();if(tg?.isVersionAtLeast?.('7.7'))tg.disableVerticalSwipes();
const colors={black:['Чорний','#202629'],white:['Білий','#e9eeeb'],silver:['Срібний','#8c9b9d'],red:['Червоний','#be2833'],blue:['Синій','#216fc2'],green:['Зелений','#26744e'],yellow:['Жовтий','#efbe26'],purple:['Фіолетовий','#754ca0']};
let favorites=[],isAdmin=false,refreshCatalog=null;
let user,config,market,listings=[],messages=[],balance=0,bonus=false,activeChat=null,view='',selectedId=null,connected=false;
const socket=io({autoConnect:false});
const money=n=>'$ '+Number(n).toLocaleString('uk-UA');
const timeLeft=l=>{const m=Math.max(0,Math.ceil((new Date(l.expiresAt)-Date.now())/60000));return m?`${Math.floor(m/60)} год ${m%60} хв`:'Термін завершився';};
function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
async function request(event,payload={}) {
  if(!connected)throw Error('Немає з’єднання. Зачекайте відновлення');
  const r=await socket.timeout(15000).emitWithAck(event,payload);
  if(!r.ok)throw Error(r.error||'Не вдалося виконати дію');return r.data;
}
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message==='operation has timed out'?'Сервер не відповів. Перевірте з’єднання':e.message);}};
function modal(title,html,kind='',eyebrow='ЄДИНИЙ АВТОБАЗАР') {
  view=kind;$('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalBody').innerHTML=html;
  if(!$('#modal').open)$('#modal').showModal();
  $('#modalBody').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
}
function close(){ $('#modal').close();view='';activeChat=null;selectedId=null; }
$('#closeModal').onclick=close;$('#modal').addEventListener('cancel',()=>{view='';activeChat=null;selectedId=null;});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
function mergeMessages(arr){const map=new Map(messages.map(m=>[m.id,m]));arr.forEach(m=>map.set(m.id,m));messages=[...map.values()];}
function updateHUD(){
  $('#balance').textContent=balance;$('#myCount').textContent=listings.filter(l=>l.sellerId===user?.id).length;
  $('#occupancy').textContent=`${listings.length} авто на продажу · ${100-listings.length} вільних місць`;
  $('#dailyLabel').textContent=bonus?'Отримати +5 💎':'До завтра ✓';
  const unread=messages.filter(m=>m.toUserId===user?.id&&!m.read).length;$('#unread').textContent=unread;$('#unread').classList.toggle('hidden',!unread);
  const mine=listings.find(l=>l.sellerId===user?.id);$('#playerRating').textContent=mine?.ratingCount?`Рейтинг: ★ ${mine.sellerRating.toFixed(1)}`:'Рейтинг: новий продавець';
}
const photo=(l,i=0)=>l.photoCount?`/api/photos/${encodeURIComponent(l.id)}/${i}`:`/assets/cars/${colors[l.color]?l.color:'black'}.png`;
function card(l){return `<button class="listing-card" data-id="${esc(l.id)}"><img src="${photo(l)}" alt="${esc(colors[l.color]?.[0]||'Автомобіль')}"><span><b>${esc(l.brand)} ${esc(l.model)}</b><small>${l.year} · ${esc(l.city||'Місто не вказано')} · ${l.mileage==null?'Пробіг не вказано':Number(l.mileage).toLocaleString('uk-UA')+' км'}<br><span data-expires="${esc(l.expiresAt)}">${timeLeft(l)}</span> · ${favorites.includes(l.id)?'♥':'№'+l.slotId}</small><em>${money(l.price)}</em></span></button>`;}
function bindCards(){document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openCar(b.dataset.id));}
function catalog(own=false,saved=false,query=''){
  modal(own?'Мої авто':saved?'Обрані авто':'Авто на площадці',`<input id="searchCars" class="catalog-search" value="${esc(query)}" placeholder="Марка або модель" aria-label="Пошук авто"><div class="filter-grid"><label>Рік від<input id="filterYear" type="number" min="1950" max="2100" placeholder="Будь-який"></label><label>Ціна до, $<input id="filterPrice" type="number" min="1" placeholder="Без обмежень"></label><label>Сортування<select id="filterSort"><option value="new">Нові спочатку</option><option value="cheap">Дешевші спочатку</option><option value="year">Новіший рік</option></select></label></div><p id="filterCount" class="muted"></p><div id="carList" class="cards"></div>${own?'<button class="primary full" data-action="sell">＋ Виставити авто</button>':''}`,own?'garage':saved?'favorites':'catalog');
  const render=()=>{const q=$('#searchCars').value.trim().toLowerCase(),year=Number($('#filterYear').value)||0,price=Number($('#filterPrice').value)||Infinity;
    const arr=listings.filter(l=>(!own||l.sellerId===user.id)&&(!saved||favorites.includes(l.id))&&`${l.brand} ${l.model}`.toLowerCase().includes(q)&&l.year>=year&&l.price<=price);
    const sort=$('#filterSort').value;arr.sort((a,b)=>sort==='cheap'?a.price-b.price:sort==='year'?b.year-a.year:new Date(b.createdAt)-new Date(a.createdAt));
    $('#filterCount').textContent=`Знайдено: ${arr.length}`;
    $('#carList').innerHTML=arr.length?arr.map(card).join(''):'<div class="empty">Авто не знайдено.<br>Змініть фільтри або додайте авто до обраного.</div>';bindCards();};
  render();refreshCatalog=render;for(const id of ['searchCars','filterYear','filterPrice','filterSort'])$('#'+id).oninput=render;
}
function openCar(id){
  const l=listings.find(x=>x.id===id);if(!l)return toast('Оголошення вже завершилося');selectedId=id;market?.select(id);
  const mine=l.sellerId===user.id;
  modal(`${l.brand} ${l.model}`,`<div class="photo-gallery">${Array.from({length:Math.max(1,l.photoCount)},(_,i)=>`<img src="${photo(l,i)}" alt="${esc(l.brand)} · фото ${i+1}" loading="lazy">`).join('')}</div><div class="price">${money(l.price)}</div>
    <div class="specs"><div><small>МІСТО</small>${esc(l.city||'Не вказано')}</div><div><small>ПРОБІГ</small>${l.mileage==null?'Не вказано':Number(l.mileage).toLocaleString('uk-UA')+' км'}</div><div><small>РІК ВИПУСКУ</small>${l.year}</div><div><small>КОЛІР</small>${colors[l.color]?.[0]||esc(l.color)}</div><div><small>ПРОДАВЕЦЬ</small>${esc(l.sellerName)}</div><div><small>ЗАЛИШИЛОСЯ</small><span id="expiresLabel">${timeLeft(l)}</span></div></div>
    <div class="actions"><button id="saveCar" class="secondary">${favorites.includes(id)?'♥ В обраному':'♡ До обраного'}</button>${mine?'':'<button id="reportCar" class="text-button">Поскаржитися</button>'}</div><p class="description">${esc(l.description)}</p><p class="muted">${l.ratingCount?`★ ${l.sellerRating.toFixed(1)} · ${l.ratingCount} оцінок`:'Новий продавець'}</p>
    ${mine?'':`<div class="stars" aria-label="Оцінити продавця">${[1,2,3,4,5].map(n=>`<button data-rate="${n}" title="${n} з 5">★</button>`).join('')}</div>`}
    <div class="actions"><button id="carPrimary" class="${mine?'danger':'primary'}">${mine?'Зняти з продажу':'Купити · відкрити чат'}</button><button id="locateCar" class="secondary">На карті</button></div><p class="muted">Кнопка «Купити» відкриває діалог із продавцем. Гра не списує гроші за автомобіль.</p>`, 'car',`${l.slotId<=10?'VIP · ':''}МІСЦЕ №${l.slotId}`);
  $('#saveCar').onclick=safe(async()=>{favorites=await request('favorite:set',{id,saved:!favorites.includes(id)});$('#saveCar').textContent=favorites.includes(id)?'♥ В обраному':'♡ До обраного';});
  if($('#reportCar'))$('#reportCar').onclick=()=>reportCar(id);
  $('#carPrimary').onclick=safe(async()=>{if(mine){await request('listing:remove',id);close();toast('Авто знято з продажу');}else await openChat({listingId:l.id,partnerId:l.sellerId,partnerName:l.sellerName,listingTitle:`${l.brand} ${l.model}`});});
  $('#locateCar').onclick=()=>{market?.focus(id);close();};
  document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=safe(async()=>{await request('seller:rate',{sellerId:l.sellerId,rating:Number(b.dataset.rate)});toast('Оцінку збережено');}));
}
function sell(){
  modal('Виставити автомобіль',`<form id="sellForm"><div class="form-grid"><label>Марка<input name="brand" list="brands" maxlength="30" required placeholder="BMW"></label><label>Модель<input name="model" maxlength="30" required placeholder="320i"></label><label>Рік випуску<input name="year" type="number" min="1950" max="${new Date().getFullYear()+1}" required placeholder="2020"></label><label>Ціна, $<input name="price" type="number" min="1" max="100000000" step="0.01" required placeholder="18500"></label></div>
    <datalist id="brands">${['Audi','BMW','Mercedes-Benz','Volkswagen','Toyota','Skoda','Renault','Ford','Honda','Hyundai','Kia','Nissan','Peugeot','Tesla','Volvo'].map(b=>`<option value="${b}">`).join('')}</datalist>
    <label>Тип кузова<select name="bodyType"><option value="sedan">Седан</option><option value="suv">Позашляховик</option><option value="hatchback">Хетчбек</option></select></label>
    <label>Колір автомобіля</label><div class="colors">${Object.entries(colors).map(([k,v])=>`<label title="${v[0]}"><input type="radio" name="color" value="${k}" ${k==='black'?'checked':''} aria-label="${v[0]}"><span style="--swatch:${v[1]}"></span></label>`).join('')}</div>
    <div class="form-grid"><label>Місто<input name="city" maxlength="60" placeholder="Київ" required></label><label>Пробіг, км<input name="mileage" type="number" min="0" max="3000000" step="1" required placeholder="120000"></label></div>
    <label>Фото автомобіля · до 3<input id="carPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="photoPreview" class="photo-preview"></div><p class="muted">Фото стискаються перед завантаженням. Без фото буде умовне зображення кузова.</p>
    <label>Опис<textarea name="description" required maxlength="700" placeholder="Пробіг, стан, комплектація, місто…"></textarea></label>
    <label class="check"><input type="checkbox" name="vip">VIP біля офісу · 10 💎 / 24 години</label><p class="muted">Звичайне місце — безкоштовне. Вільне місце призначається автоматично на 24 години. Зображення кузова — умовне, марка й модель наведені в оголошенні.</p>
    <button id="publishCar" class="primary full">Виставити на 168 години</button></form>`,'sell');
  $('#carPhotos').onchange=()=>{const f=$('#carPhotos').files;$('#photoPreview').textContent=f.length>3?'Оберіть не більше 3 фото':Array.from(f).map(x=>x.name).join(' · ');};
  $('#sellForm').onsubmit=safe(async e=>{e.preventDefault();const btn=$('#publishCar');btn.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));btn.textContent='Обробляємо фото…';data.photos=await compressPhotos($('#carPhotos').files);btn.textContent='Публікуємо…';const l=await request('listing:create',data);close();market?.focus(l.id);toast(`Авто на місці №${l.slotId}. Оголошення діє 168 години`);}finally{btn.disabled=false;btn.textContent='Виставити на 168 години';}});
}
function conversations(){const map=new Map();for(const m of messages){const partnerId=m.fromUserId===user.id?m.toUserId:m.fromUserId,key=`${m.listingId}|${partnerId}`;
  let c=map.get(key);if(!c)c={key,listingId:m.listingId,listingTitle:m.listingTitle,partnerId,partnerName:messages.find(x=>x.fromUserId===partnerId)?.fromName||'Співрозмовник',last:m};
  if(new Date(m.createdAt)>new Date(c.last.createdAt))c.last=m;map.set(key,c);}return [...map.values()].sort((a,b)=>new Date(b.last.createdAt)-new Date(a.last.createdAt));}
function inbox(){activeChat=null;const list=conversations();modal('Мої чати',`<div class="cards">${list.length?list.map((c,i)=>`<button class="listing-card" data-chat="${i}"><span>💬</span><span><b>${esc(c.partnerName)}</b><small>${esc(c.listingTitle)}</small><small>${esc(c.last.text.slice(0,75))}</small></span></button>`).join(''):'<div class="empty">Повідомлень ще немає.<br>Оберіть авто та натисніть «Купити».</div>'}</div>`,'chats');document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=safe(()=>openChat(list[Number(b.dataset.chat)])));}
const inChat=(m,c)=>m.listingId===c.listingId&&((m.fromUserId===user.id&&m.toUserId===c.partnerId)||(m.toUserId===user.id&&m.fromUserId===c.partnerId));
async function markRead(){if(!activeChat)return;const c=activeChat;await request('chat:read',{listingId:c.listingId,partnerId:c.partnerId});messages.forEach(m=>{if(inChat(m,c)&&m.toUserId===user.id)m.read=true;});updateHUD();}
function renderChat(){if(!activeChat||!$('#chatMessages'))return;$('#chatMessages').innerHTML=messages.filter(m=>inChat(m,activeChat)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map(m=>`<div class="bubble ${m.fromUserId===user.id?'mine':''}"><p>${esc(m.text)}</p><small>${new Date(m.createdAt).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div>`).join('');$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;}
async function openChat(c){
  activeChat=c;modal(c.partnerName,`<button id="chatBack" class="chat-back">← Усі діалоги</button><p class="muted">${esc(c.listingTitle)}</p><div id="chatMessages" class="chat-messages"></div><form id="chatForm" class="chat-compose"><textarea id="chatText" maxlength="700" required aria-label="Повідомлення" placeholder="Напишіть продавцю…"></textarea><button id="sendMessage" class="primary">Надіслати</button></form>`,'chat','ПРИВАТНИЙ ДІАЛОГ');
  $('#chatBack').onclick=inbox;renderChat();
  let pending=null;
  $('#chatForm').onsubmit=safe(async e=>{e.preventDefault();const text=$('#chatText').value.trim();if(!text)return;const btn=$('#sendMessage');btn.disabled=true;
    if(!pending||pending.text!==text)pending={listingId:c.listingId,toUserId:c.partnerId,text,clientId:crypto.randomUUID()};
    try{const m=await request('chat:send',pending);mergeMessages([m]);pending=null;if(view==='chat'&&activeChat===c){$('#chatText').value='';renderChat();}}finally{btn.disabled=false;}});
  $('#chatText').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#chatForm').requestSubmit();}};
  const history=await request('chat:history',{listingId:c.listingId,partnerId:c.partnerId});mergeMessages(history);if(activeChat===c){renderChat();await markRead();}
}
function action(name){
  if(!user)return toast('Зачекайте входу в гру');
  if(name==='favorites')return catalog(false,true);if(name==='reports')return safe(moderation)();if(name==='sell')return sell();if(name==='garage')return catalog(true);if(name==='catalog')return catalog();if(name==='chats')return inbox();
  if(name==='office')return modal('Ласкаво просимо в офіс',`<p class="muted">Тут починається наступна угода. Виставляйте авто, спілкуйтеся та знаходьте свого покупця.</p><div class="office-grid"><button data-action="sell"><span>🚘</span>Продати авто</button><button data-action="garage"><span>▦</span>Мої оголошення</button><button data-action="chats"><span>💬</span>Повідомлення</button><button data-action="rating"><span>♛</span>Рейтинг продавців</button></div>`,'office');
  if(name==='crystals'){modal('Ваші кристали',`<div class="price">💎 ${balance}</div><p class="muted">Щоденний бонус: 5 кристалів. VIP-місце біля офісу: 10 кристалів на 24 години. Кристали заробляються у грі та не мають грошової вартості.</p><button id="claimInside" class="primary full">${bonus?'Отримати щоденний бонус':'Бонус уже отримано'}</button>`,'crystals');$('#claimInside').onclick=claim;return;}
  if(name==='rating'){const ranked=[...new Map(listings.map(l=>[l.sellerId,l])).values()].sort((a,b)=>b.sellerRating-a.sellerRating);return modal('Рейтинг продавців',`<p class="muted">Продавці з активними оголошеннями. Оцінку можна залишити в картці авто після початку діалогу.</p>${ranked.length?ranked.map((l,i)=>`<div class="ranking"><span>${i+1}. ${esc(l.sellerName)}</span><strong>${l.ratingCount?'★ '+l.sellerRating.toFixed(1):'Новий'}</strong></div>`).join(''):'<div class="empty">Продавців поки немає</div>'}`,'rating');}
  if(name==='developer'){const url=`https://t.me/${config.developer}`;return modal('Зв’язок із розробником',`<p class="muted">Ідеї, питання та повідомлення про помилки.</p><a href="${esc(url)}" target="_blank" rel="noopener">@${esc(config.developer)}</a>`,'developer');}
  if(name==='settings'){modal('Налаштування',`<label class="check"><input id="quality" type="checkbox" ${localStorage.getItem('abLowQuality')==='true'?'':'checked'}>Тіні та висока якість</label><button id="allowNotifications" class="primary full">Увімкнути Telegram-сповіщення</button><p class="muted">Дозвольте боту писати вам. Нові повідомлення з гри надходитимуть у Telegram. Звук і показ на телефоні налаштовуються у Telegram та системі телефона.</p>${isAdmin?'<button data-action="reports" class="secondary full">Скарги · модерація</button>':''}<button id="resetView" class="secondary full">Повернути камеру до входу</button>`,'settings');
    $('#quality').onchange=e=>{localStorage.setItem('abLowQuality',String(!e.target.checked));market?.setQuality(e.target.checked);};$('#resetView').onclick=()=>{market?.reset();close();};
    $('#allowNotifications').onclick=()=>{if(!tg?.initData||!tg.isVersionAtLeast?.('6.9'))return toast('Відкрийте гру в актуальній версії Telegram');tg.requestWriteAccess(allowed=>toast(allowed?'Сповіщення від бота дозволені':'Дозвіл не надано. Також можна відкрити бота й натиснути Start'));};
  }
}
const claim=safe(async()=>{const r=await request('daily:claim');balance=r.crystals;bonus=false;updateHUD();if(view==='crystals')action('crystals');toast('Отримано 5 кристалів');});
$('#daily').onclick=claim;document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
$('#retry').onclick=()=>location.reload();
socket.on('connect',()=>{let id=localStorage.getItem('abDemoId');if(!id){id='demo-'+crypto.randomUUID();localStorage.setItem('abDemoId',id);}socket.emit('auth',{initData:tg?.initData||'',demoUser:{id,name:'Гравець '+id.slice(-4)}});});
socket.on('auth:ok',d=>{connected=true;favorites=d.favorites||[];isAdmin=!!d.isAdmin;user=d.user;listings=d.listings;messages=d.messages;balance=d.crystals;bonus=d.dailyBonusAvailable;$('#playerName').textContent=user.name;$('#connection').textContent=config.demo?'Демо-режим':'● На зв’язку';market?.update(listings);updateHUD();$('#loading').classList.add('hidden');if(activeChat)safe(()=>openChat(activeChat))();});
socket.on('auth:error',e=>{connected=false;$('#loading').classList.remove('hidden');$('#loadingText').textContent=e;$('#retry').classList.remove('hidden');});
socket.on('disconnect',()=>{connected=false;$('#connection').textContent='Відновлюємо зв’язок…';});
socket.on('connect_error',()=>{$('#loadingText').textContent='Не вдалося підключитися до сервера. Перевірте інтернет.';$('#retry').classList.remove('hidden');});
socket.on('world:listings',arr=>{listings=arr;market?.update(listings);updateHUD();if(['garage','catalog','favorites'].includes(view))refreshCatalog?.();if(view==='car'&&!listings.some(l=>l.id===selectedId)){close();toast('Оголошення завершилося або зняте');}});
socket.on('favorites:update',ids=>{favorites=ids;if(view==='favorites')catalog(false,true);});
socket.on('balance:update',d=>{balance=d.crystals;if(d.claimed)bonus=false;updateHUD();});
socket.on('chat:new',m=>{mergeMessages([m]);if(view==='chat'&&activeChat&&inChat(m,activeChat)){renderChat();safe(markRead)();}else if(m.toUserId===user?.id)toast(`Нове повідомлення від ${m.fromName}`);if(view==='chats')inbox();updateHUD();});
socket.on('chat:read',c=>{messages.forEach(m=>{if(m.listingId===c.listingId&&m.fromUserId===c.partnerId&&m.toUserId===user?.id)m.read=true;});updateHUD();});
setInterval(()=>{document.querySelectorAll('[data-expires]').forEach(e=>e.textContent=timeLeft({expiresAt:e.dataset.expires}));if($('#expiresLabel')){const l=listings.find(x=>x.id===selectedId);if(l)$('#expiresLabel').textContent=timeLeft(l);}},30000);
try{
  const r=await fetch('/api/config');if(!r.ok)throw Error('Не вдалося завантажити налаштування');config=await r.json();
  config.developer=/^[a-zA-Z0-9_]{5,32}$/.test(config.developer)?config.developer:'s_5994';$('#developerName').textContent='@'+config.developer;
  $('#demoBanner').classList.toggle('hidden',!config.demo);
  try {market=await createMarket(id=>openCar(id),()=>action('office'));if(localStorage.getItem('abLowQuality')==='true')market.setQuality(false);}
  catch(e){console.error('3D scene:',e);$('#hint').textContent='3D недоступне. Переглядайте авто через «Весь автобазар»';toast('Не завантажено 3D. Каталог і чати залишаються доступними.');}
  socket.connect();
}catch(e){$('#loadingText').textContent=e.message;$('#retry').classList.remove('hidden');}
// Explicit, local-demo-only seed operation. Never available in a production server.
$('#demoPopulate').onclick=safe(async()=>{
  if(!config.demo)return;const b=$('#demoPopulate');b.disabled=true;
  try {const r=await fetch('/api/demo/populate',{method:'POST'});if(!r.ok)throw Error('Не вдалося додати приклади');toast('Демонстраційні авто додано');}finally{b.disabled=false;}
});

$('#quickSearchForm').onsubmit=e=>{e.preventDefault();if(user)catalog(false,false,$('#quickSearch').value);};
$('#openFilters').onclick=()=>{if(user)catalog(false,false,$('#quickSearch').value);};
async function compressPhotos(files){
  if(files.length>3)throw Error('Оберіть до 3 фото');const result=[];
  for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Оберіть JPEG, PNG або WebP до 15 МБ');
    const image=await createImageBitmap(file);try{
      const scale=Math.min(1,1000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      let blob;for(const quality of [.8,.65,.45]){blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=450000)break;}
      if(!blob||blob.size>450000)throw Error('Фото завелике. Оберіть інше');result.push(await blob.arrayBuffer());
    }finally{image.close();}
  }return result;
}
function reportCar(id){
  modal('Скарга на оголошення',`<form id="reportForm"><label>Причина<textarea id="reportReason" minlength="5" maxlength="500" required placeholder="Опишіть проблему з оголошенням"></textarea></label><button class="primary full">Надіслати модератору</button></form>`,'report');
  $('#reportForm').onsubmit=safe(async e=>{e.preventDefault();await request('listing:report',{id,reason:$('#reportReason').value});close();toast('Скаргу передано модератору');});
}
async function moderation(){
  const rows=await request('reports:list');modal('Скарги на оголошення',rows.length?rows.map((r,i)=>`<article class="report-card"><b>${esc(r.brand)} ${esc(r.model)}</b><p>${esc(r.reason)}</p><p class="muted">${esc(r.description)}</p><div class="actions"><button class="danger" data-review="${i}" data-decision="remove">Зняти оголошення</button><button class="secondary" data-review="${i}" data-decision="dismiss">Відхилити скарги</button></div></article>`).join(''):'<div class="empty">Нових скарг немає</div>','reports');
  document.querySelectorAll('[data-review]').forEach(b=>b.onclick=safe(async()=>{await request('reports:resolve',{id:rows[Number(b.dataset.review)].listing_id,action:b.dataset.decision});await moderation();}));
}
