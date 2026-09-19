require('dotenv').config();
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { database, migrate } = require('./server/db');
const { validateTelegram } = require('./server/auth');
const { deliverNotifications } = require('./server/notifications');
const {prepareDetails,migrateExtras,extras}=require('./server/extras');
const COLORS = ['black','white','silver','red','blue','green','yellow','purple'];
const TOTAL_SLOTS = 100;
const fail = text => { throw new Error(text); };
const listing = r => ({id:r.id,sellerId:r.seller_id,sellerName:r.seller_name,brand:r.brand,model:r.model,
  year:Number(r.year),price:Number(r.price),description:r.description,color:r.color,bodyType:r.body_type,
  city:r.city||'',mileage:r.mileage,photoCount:Number(r.photo_count||0),slotId:r.slot_id,status:r.status,createdAt:r.created_at,expiresAt:r.expires_at,
  sellerRating:Number(r.seller_rating||0),ratingCount:Number(r.rating_count||0)});
const message = r => ({id:r.id,listingId:r.listing_id,listingTitle:r.listing_title,fromUserId:r.from_user_id,
  fromName:r.from_name,toUserId:r.to_user_id,text:r.text,read:r.is_read,createdAt:r.created_at});

async function createGame(env=process.env, suppliedPool) {
  const demo = env.DEMO_MODE === 'true';
  const durationHours = Number(env.LISTING_DURATION_HOURS || 168);
  if (!demo && !env.BOT_TOKEN) throw Error('BOT_TOKEN is required');
  if (!demo && !/^https:\/\//.test(env.APP_URL||'')) throw Error('HTTPS APP_URL is required');
  if (demo && env.NODE_ENV === 'production') throw Error('DEMO_MODE must be false in production');
  const pool = suppliedPool || await database(env); await migrate(pool); await migrateExtras(pool);
  const app = express(), server=http.createServer(app);
  const io=new Server(server,{maxHttpBufferSize:1500000});
  app.disable('x-powered-by');
  app.use((_q,r,next)=>{r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','same-origin');next();});
  app.get('/api/config',(_q,r)=>r.json({demo,totalSlots:TOTAL_SLOTS,vipPrice:10,durationHours,
  developer:env.DEVELOPER_USERNAME||'s_5994',notifications:!!env.BOT_TOKEN}));
  app.get('/version',(_q,r)=>r.json({version:'9.0.0',build:'blender-market-100'}));
  app.get('/health',async(_q,r)=>{try {await pool.query('SELECT 1');r.json({ok:true,slots:TOTAL_SLOTS});}catch{r.status(503).json({ok:false});}});
  app.use('/vendor/three',express.static(path.join(__dirname,'node_modules/three')));
  app.use(express.static(path.join(__dirname,'public'),{maxAge:0}));
  const publicListings=async()=> (await pool.query(`SELECT l.*,(SELECT COUNT(*) FROM listing_photos WHERE listing_id=l.id) photo_count,
    COALESCE((SELECT AVG(rating) FROM seller_ratings WHERE seller_id=l.seller_id),0) seller_rating,
    (SELECT COUNT(*) FROM seller_ratings WHERE seller_id=l.seller_id) rating_count
    FROM listings l WHERE status='active' AND expires_at>NOW() ORDER BY slot_id`)).rows.map(listing);
  const broadcast=async()=>io.emit('world:listings',await publicListings());
  const extra=extras({pool,app,env,io,broadcast});
  if(demo) app.post('/api/demo/populate',async(_q,res)=>{
    const c=await pool.connect();
    try {
      await c.query('BEGIN');await c.query('LOCK TABLE listings IN SHARE ROW EXCLUSIVE MODE');
      await c.query(`INSERT INTO users(id,name,crystals) VALUES('demo-showcase-2026','Демо продавець',30) ON CONFLICT(id) DO NOTHING`);
      const names=[['BMW','320i'],['Audi','A4'],['Volkswagen','Golf'],['Toyota','Camry'],['Mercedes-Benz','C 200'],['Skoda','Octavia'],['Renault','Megane'],['Volvo','XC60']];
      for(let i=1;i<=30;i++) {
        const [brand,model]=names[(i-1)%names.length];
        await c.query(`INSERT INTO listings(id,seller_id,seller_name,brand,model,year,price,description,color,body_type,slot_id,spot)
          SELECT $1,'demo-showcase-2026','Демо продавець',$2,$3,$4,$5,'Демонстраційне оголошення для перевірки гри. Це не реальний продаж.',$6,$7,$8,$8
          WHERE NOT EXISTS(SELECT 1 FROM listings WHERE status='active' AND slot_id=$8)
          ON CONFLICT(id) DO NOTHING`,['example-'+i,brand,model,2015+i%9,9500+i*800,COLORS[(i-1)%8],['sedan','sedan','hatchback','suv'][i%4],i]);
      }
      await c.query('COMMIT');res.json({ok:true});
    } catch(e){await c.query('ROLLBACK');res.status(500).json({ok:false});} finally {c.release();}
    await broadcast();
  });
  async function expire() {
    const r=await pool.query(`UPDATE listings SET status='expired' WHERE status='active' AND expires_at<=NOW() RETURNING id`);
    if(r.rowCount) await broadcast();
  }
  io.on('connection',socket=>{
    let user=null,authenticating=false;
    const limits=new Map();
    function event(name,handler,limit=30) {
      socket.on(name,async(payload,ack)=>{
        const respond=typeof ack==='function'?ack:()=>{};
        try {
          if(!user) fail('Спочатку увійдіть у гру');
          const now=Date.now(); let bucket=limits.get(name);
          if(!bucket || now-bucket.time>60000) {bucket={time:now,count:0};limits.set(name,bucket);}
          if(++bucket.count>limit) fail('Забагато запитів. Зачекайте хвилину');
          respond({ok:true,data:await handler(payload)});
        } catch(e) {console.error(name,e.code||e.message);respond({ok:false,error:e.code?'Помилка бази даних. Спробуйте ще раз':e.message});}
      });
    }
    socket.on('auth',async(p,ack)=>{
      if(authenticating || user) return;
      authenticating=true;
      try {
        let candidate=validateTelegram(p?.initData,env.BOT_TOKEN);
        if(!candidate && demo && !p?.initData) {
          const id=String(p?.demoUser?.id||'');
          if(!/^demo-[a-zA-Z0-9-]{8,70}$/.test(id)) fail('Некоректний демо-профіль');
          candidate={id,name:String(p?.demoUser?.name||'Демо гравець').slice(0,60),username:''};
        }
        if(!candidate) fail('Відкрийте гру через Telegram. Сеанс недійсний або завершився');
        const result=await pool.query(`INSERT INTO users(id,name,username,crystals) VALUES($1,$2,$3,$4)
          ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,username=EXCLUDED.username,updated_at=NOW()
          RETURNING crystals,last_daily_bonus IS DISTINCT FROM (NOW() AT TIME ZONE 'UTC')::date AS bonus`,
          [candidate.id,candidate.name,candidate.username,demo?30:0]);
        user=candidate;socket.join(`user:${user.id}`);
        const msgs=await pool.query(`SELECT * FROM messages WHERE from_user_id=$1 OR to_user_id=$1
          ORDER BY created_at`,[user.id]);
        const data={favorites:await extra.favorites(user.id),isAdmin:extra.isAdmin(user.id),user,listings:await publicListings(),messages:msgs.rows.map(message),crystals:result.rows[0].crystals,dailyBonusAvailable:result.rows[0].bonus};
        socket.emit('auth:ok',data);if(typeof ack==='function') ack({ok:true,data});
      }catch(e){socket.emit('auth:error',e.code?'Помилка входу':e.message);if(typeof ack==='function')ack({ok:false,error:e.message});}
      finally{authenticating=false;}
    });
    extra.bind(event,()=>user);
    event('listing:create',async p=>{
      const brand=String(p?.brand||'').trim(),model=String(p?.model||'').trim(),description=String(p?.description||'').trim();
      const year=Number(p?.year),price=Number(p?.price),color=p?.color||'black',body=p?.bodyType||'sedan';
      if(!brand || brand.length>30 || !model || model.length>30 || !description || description.length>700 ||
        !Number.isInteger(year)||year<1950||year>new Date().getFullYear()+1||!Number.isFinite(price)||price<1||price>100000000||
        !COLORS.includes(color)||!['sedan','suv','hatchback'].includes(body)) fail('Перевірте марку, модель, рік, ціну, колір та опис');
      const details=await prepareDetails(p);
      const vip=p.vip===true||p.vip==='true';
      const c=await pool.connect();let value;
      try {
        await c.query('BEGIN');
        await c.query('LOCK TABLE listings IN SHARE ROW EXCLUSIVE MODE');
        await c.query(`UPDATE listings SET status='expired' WHERE status='active' AND expires_at<=NOW()`);
        const free=await c.query(`SELECT s FROM generate_series($1::int,$2::int) s WHERE NOT EXISTS
          (SELECT 1 FROM listings WHERE status='active' AND slot_id=s) ORDER BY s LIMIT 1`,[vip?1:11,vip?10:100]);
        if(!free.rows.length) fail(vip?'Усі VIP-місця зайняті':'Усі звичайні місця зайняті');
        if(vip) {
          const balance=await c.query(`UPDATE users SET crystals=crystals-10 WHERE id=$1 AND crystals>=10 RETURNING crystals`,[user.id]);
          if(!balance.rowCount) fail('Для VIP потрібно 10 кристалів. Отримайте щоденний бонус');
        }
        const r=await c.query(`INSERT INTO listings(id,seller_id,seller_name,brand,model,year,price,description,color,body_type,slot_id,spot,zone,status,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,1,'active',NOW() + $12::int * INTERVAL '1 hour') RETURNING *`,
          [,user.id,user.name,brand,model,year,price,description,color,body,free.rows[0].s]);
        await c.query('UPDATE listings SET city=$2,mileage=$3 WHERE id=$1',[r.rows[0].id,details.city,details.mileage]);
        for(let i=0;i<details.photos.length;i++) await c.query('INSERT INTO listing_photos(listing_id,position,data) VALUES($1,$2,$3)',[r.rows[0].id,i,details.photos[i]]);
        value=listing({...r.rows[0],city:details.city,mileage:details.mileage,photo_count:details.photos.length});await c.query('COMMIT');
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
      await broadcast();
      const b=await pool.query('SELECT crystals FROM users WHERE id=$1',[user.id]);
      io.to(`user:${user.id}`).emit('balance:update',{crystals:b.rows[0].crystals});
      return value;
    },10);
    event('listing:remove',async id=>{
      const r=await pool.query(`UPDATE listings SET status='removed' WHERE id=$1 AND seller_id=$2 AND status='active' RETURNING id`,[String(id),user.id]);
      if(!r.rowCount) fail('Оголошення вже неактивне або належить іншому продавцю');
      await broadcast();return {id};
    });
    event('daily:claim',async()=>{
      const r=await pool.query(`UPDATE users SET crystals=crystals+5,last_daily_bonus=(NOW() AT TIME ZONE 'UTC')::date
        WHERE id=$1 AND last_daily_bonus IS DISTINCT FROM (NOW() AT TIME ZONE 'UTC')::date RETURNING crystals`,[user.id]);
      if(!r.rowCount) fail('Сьогодні бонус уже отримано. Новий — о 00:00 UTC');
      io.to(`user:${user.id}`).emit('balance:update',{crystals:r.rows[0].crystals,claimed:true});return r.rows[0];
    },5);
    event('seller:rate',async p=>{
      const rating=Number(p?.rating),seller=String(p?.sellerId||'');
      if(seller===user.id||!Number.isInteger(rating)||rating<1||rating>5) fail('Некоректна оцінка');
      const known=await pool.query(`SELECT 1 FROM messages m JOIN listings l ON l.id=m.listing_id
        WHERE l.seller_id=$1 AND m.from_user_id=$2 AND m.to_user_id=$1 LIMIT 1`,[seller,user.id]);
      if(!known.rowCount) fail('Оцінити продавця можна після початку діалогу');
      await pool.query(`INSERT INTO seller_ratings(seller_id,rater_id,rating) VALUES($1,$2,$3)
        ON CONFLICT(seller_id,rater_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()`,[seller,user.id,rating]);
      await broadcast();return {};
    },10);
    event('chat:history',async p=>{
      const r=await pool.query(`SELECT * FROM messages WHERE listing_id=$1 AND
        ((from_user_id=$2 AND to_user_id=$3) OR (from_user_id=$3 AND to_user_id=$2)) ORDER BY created_at`,
        [String(p?.listingId),user.id,String(p?.partnerId)]);return r.rows.map(message);
    });
    event('chat:send',async p=>{
      const text=String(p?.text||'').trim(),to=String(p?.toUserId||''),clientId=String(p?.clientId||'');
      if(!text||text.length>700||to===user.id||!to||!/^[a-zA-Z0-9-]{8,80}$/.test(clientId)) fail('Некоректне повідомлення');
      const c=await pool.connect();let value;
      try {
        await c.query('BEGIN');
        const existing=await c.query('SELECT * FROM messages WHERE from_user_id=$1 AND client_id=$2',[user.id,clientId]);
        if(existing.rowCount){await c.query('COMMIT');return message(existing.rows[0]);}
        const r=await c.query('SELECT * FROM listings WHERE id=$1',[String(p?.listingId)]);
        if(!r.rowCount) fail('Оголошення не знайдено');const l=r.rows[0];
        const known=await c.query(`SELECT 1 FROM messages WHERE listing_id=$1 AND
          ((from_user_id=$2 AND to_user_id=$3) OR (from_user_id=$3 AND to_user_id=$2)) LIMIT 1`,[l.id,user.id,to]);
        if(l.seller_id===user.id ? !known.rowCount : to!==l.seller_id) fail('Цей діалог вам недоступний');
        if(!known.rowCount && (l.status!=='active'||new Date(l.expires_at)<=new Date())) fail('Термін оголошення завершився');
        const result=await c.query(`INSERT INTO messages(id,listing_id,listing_title,from_user_id,from_name,to_user_id,text,client_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(from_user_id,client_id) DO UPDATE SET client_id=EXCLUDED.client_id RETURNING *`,
          [,l.id,`${l.brand} ${l.model}`,user.id,user.name,to,text,clientId]);
        value=message(result.rows[0]);
        if(/^\d+$/.test(to) && env.BOT_TOKEN) await c.query(`INSERT INTO notification_outbox(id,recipient,text) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,
          [value.id,to,`У вас нове повідомлення від ${user.name}\n${l.brand} ${l.model}\n\n${text}`]);
        await c.query('COMMIT');
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
      io.to(`user:${to}`).to(`user:${user.id}`).emit('chat:new',value);return value;
    },30);
    event('chat:read',async p=>{
      await pool.query(`UPDATE messages SET is_read=TRUE WHERE to_user_id=$1 AND from_user_id=$2 AND listing_id=$3`,[user.id,String(p?.partnerId),String(p?.listingId)]);
      io.to(`user:${user.id}`).emit('chat:read',p);return {};
    });
  });
  let busy=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await expire();await extra.maintain();await deliverNotifications(pool,env);}catch(e){console.error('Background job:',e.message);}finally{busy=false;}},15000);
  timer.unref();
  return {app,server,io,pool,expire,publicListings,maintain:extra.maintain,close:async()=>{clearInterval(timer);await new Promise(r=>io.close(r));while(busy)await new Promise(r=>setTimeout(r,10));await pool.end();}};
}
if(require.main===module) createGame().then(game=>{
  game.server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('AutoBazar 9.0 started'));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>game.close().then(()=>process.exit(0)));
}).catch(e=>{console.error('Startup:',e.message);process.exit(1);});
module.exports={createGame};
data.vip = Boolean(e.target.elements.vip?.checked);