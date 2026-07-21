const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const DEMO_MODE = String(process.env.DEMO_MODE || 'true') === 'true';
const STORE_PATH = path.join(__dirname, 'data', 'store.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { etag:false,lastModified:false,setHeaders(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0')}}));

let store={listings:[],messages:[]};
try{if(fs.existsSync(STORE_PATH))store=JSON.parse(fs.readFileSync(STORE_PATH,'utf8'))}catch{}
if(!Array.isArray(store.listings))store.listings=[];
if(!Array.isArray(store.messages))store.messages=[];
const saveStore=()=>{fs.mkdirSync(path.dirname(STORE_PATH),{recursive:true});fs.writeFileSync(STORE_PATH,JSON.stringify(store,null,2))};
const zoneForPrice=p=>p<5000?1:p<10000?2:p<15000?3:p<20000?4:5;
function availableSpot(zone){const used=new Set(store.listings.filter(x=>x.zone===zone&&x.status==='active').map(x=>x.spot));for(let i=1;i<=20;i++)if(!used.has(i))return i;return null}
function validateTelegramInitData(initData){if(!BOT_TOKEN||!initData)return null;const params=new URLSearchParams(initData),hash=params.get('hash');if(!hash)return null;params.delete('hash');const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();const calculated=crypto.createHmac('sha256',secret).update(check).digest('hex');const a=Buffer.from(calculated,'hex'),b=Buffer.from(hash,'hex');if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;const authDate=Number(params.get('auth_date')||0);if(!authDate||Date.now()/1000-authDate>86400)return null;try{return JSON.parse(params.get('user')||'null')}catch{return null}}

const onlineUsers=new Map(),onlinePlayers=new Map();
const publicListings=()=>store.listings.filter(x=>x.status==='active').map(x=>({...x,sellerOnline:onlineUsers.has(String(x.sellerId))}));
const publicPlayers=()=>[...onlinePlayers.values()].map(({socketId,...p})=>p);
const emitWorld=()=>{io.emit('world:listings',publicListings());io.emit('world:players',publicPlayers())};
const userMessages=id=>store.messages.filter(m=>String(m.fromUserId)===id||String(m.toUserId)===id);

io.on('connection',socket=>{
 let user=null;
 socket.on('auth',payload=>{
  const tgUser=validateTelegramInitData(payload?.initData||'');
  if(tgUser)user={id:String(tgUser.id),name:[tgUser.first_name,tgUser.last_name].filter(Boolean).join(' '),username:tgUser.username||''};
  else if(DEMO_MODE)user={id:String(payload?.demoUser?.id||`demo-${socket.id}`),name:String(payload?.demoUser?.name||'Demo Player').slice(0,40),username:''};
  else return socket.emit('auth:error','Не вдалося підтвердити Telegram-користувача');
  onlineUsers.set(user.id,socket.id);onlinePlayers.set(user.id,{id:user.id,name:user.name,zone:1,x:50,y:50,moving:false,faceLeft:false,socketId:socket.id});socket.join(`user:${user.id}`);
  socket.emit('auth:ok',{user,listings:publicListings(),messages:userMessages(user.id),players:publicPlayers()});emitWorld();
 });
 socket.on('player:update',p=>{if(!user)return;const pl=onlinePlayers.get(user.id);if(!pl)return;const z=Number(p?.zone),x=Number(p?.x),y=Number(p?.y);if(!Number.isInteger(z)||z<1||z>5||!Number.isFinite(x)||!Number.isFinite(y))return;Object.assign(pl,{zone:z,x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y)),moving:!!p.moving,faceLeft:!!p.faceLeft});socket.broadcast.emit('player:updated',{id:pl.id,name:pl.name,zone:pl.zone,x:pl.x,y:pl.y,moving:pl.moving,faceLeft:pl.faceLeft})});
 socket.on('listing:create',p=>{if(!user)return;const price=Number(p.price),year=Number(p.year),brand=String(p.brand||'').trim().slice(0,30),model=String(p.model||'').trim().slice(0,30),description=String(p.description||'').trim().slice(0,700);if(!brand||!model||!Number.isFinite(price)||price<=0||!Number.isInteger(year)||year<1950||year>new Date().getFullYear()+1)return socket.emit('listing:error','Перевір марку, модель, рік і ціну');if(store.listings.some(x=>String(x.sellerId)===user.id&&x.status==='active'))return socket.emit('listing:error','Один гравець може продавати одну машину');const zone=zoneForPrice(price),spot=availableSpot(zone);if(spot===null)return socket.emit('listing:error','На цій площадці немає місць');const listing={id:crypto.randomUUID(),sellerId:user.id,sellerName:user.name,brand,model,year,price,description,zone,spot,status:'active',createdAt:new Date().toISOString()};store.listings.push(listing);saveStore();socket.emit('listing:created',listing);emitWorld()});
 socket.on('listing:remove',id=>{if(!user)return;const l=store.listings.find(x=>x.id===id);if(!l||String(l.sellerId)!==user.id)return;l.status='removed';saveStore();emitWorld()});
 socket.on('chat:send',p=>{if(!user)return;const listing=store.listings.find(x=>x.id===p?.listingId);const text=String(p?.text||'').trim().slice(0,700),toUserId=String(p?.toUserId||'');if(!listing||!text||!toUserId||toUserId===user.id)return;const participant=String(listing.sellerId)===user.id?toUserId:String(listing.sellerId);if(participant!==toUserId)return;const known=store.messages.some(m=>m.listingId===listing.id&&((String(m.fromUserId)===user.id&&String(m.toUserId)===toUserId)||(String(m.toUserId)===user.id&&String(m.fromUserId)===toUserId)));if(String(listing.sellerId)===user.id&&!known)return;const message={id:crypto.randomUUID(),listingId:listing.id,listingTitle:`${listing.brand} ${listing.model}`,fromUserId:user.id,fromName:user.name,toUserId,text,read:false,createdAt:new Date().toISOString()};store.messages.push(message);saveStore();io.to(`user:${toUserId}`).emit('chat:new',message);socket.emit('chat:sent',message)});
 socket.on('chat:read',p=>{if(!user)return;let changed=false;for(const m of store.messages){if(String(m.toUserId)===user.id&&String(m.fromUserId)===String(p?.partnerId)&&m.listingId===p?.listingId&&!m.read){m.read=true;changed=true}}if(changed)saveStore()});
 socket.on('disconnect',()=>{if(user&&onlineUsers.get(user.id)===socket.id){onlineUsers.delete(user.id);onlinePlayers.delete(user.id);socket.broadcast.emit('player:left',{id:user.id});emitWorld()}});
});
app.get('/health',(_q,r)=>r.json({ok:true}));
app.get('/{*splat}',(_q,r)=>r.sendFile(path.join(__dirname,'public','index.html')));
server.listen(PORT,()=>console.log(`AutoBazar v3.0: http://localhost:${PORT}`));
