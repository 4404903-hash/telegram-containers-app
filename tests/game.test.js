const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {io}=require('socket.io-client');
const {createGame}=require('../server');
const {validateTelegram}=require('../server/auth');
const {deliverNotifications}=require('../server/notifications');
const token='123456:test-token-only';
function signed(id=101,date=Math.floor(Date.now()/1000)) {
  const p=new URLSearchParams({auth_date:String(date),user:JSON.stringify({id,first_name:'User '+id})});
  const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
  const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  p.set('hash',crypto.createHmac('sha256',secret).update(data).digest('hex'));return p.toString();
}
test('Telegram signatures reject tampering, stale/future dates and fake ids',()=>{
  assert.equal(validateTelegram(signed(),token).id,'101');
  assert.equal(validateTelegram(signed().replace('User','Admin'),token),null);
  assert.equal(validateTelegram(signed(101,1),token),null);
  assert.equal(validateTelegram(signed(101,Math.floor(Date.now()/1000)+300),token),null);
  assert.equal(validateTelegram(signed(-1),token),null);
  assert.equal(validateTelegram(signed(),token+'bad'),null);
});
test('Marketplace integration with PostgreSQL engine and two live socket clients',async t=>{
  const game=await createGame({DEMO_MODE:'true',DEMO_DATA_DIR:'memory://',BOT_TOKEN:token});
  await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+game.server.address().port,sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close();});
  async function login(id){const s=io(url,{transports:['websocket'],forceNew:true});sockets.push(s);
    await new Promise(r=>s.on('connect',r));const auth=await s.timeout(8000).emitWithAck('auth',{initData:signed(id)});assert.equal(auth.ok,true);return s;}
  const [seller,buyer,outsider]=await Promise.all([login(101),login(202),login(303)]);
  const req=(s,e,p)=>s.timeout(8000).emitWithAck(e,p);
  const payload={brand:'BMW',model:'320i',year:2020,price:18000,description:'Good condition',color:'red',bodyType:'sedan'};
  let l;
  await t.test('Concurrent listings get different slots and exactly 24 hours',async()=>{
    const results=await Promise.all([req(seller,'listing:create',payload),req(buyer,'listing:create',{...payload,model:'X5'})]);
    results.forEach(r=>assert.equal(r.ok,true));assert.notEqual(results[0].data.slotId,results[1].data.slotId);
    l=results[0].data;assert.equal(new Date(l.expiresAt)-new Date(l.createdAt),86400000);
  });
  await t.test('Invalid input and unauthorized removal rejected',async()=>{
    assert.equal((await req(seller,'listing:create',{...payload,price:-1})).ok,false);
    assert.equal((await req(buyer,'listing:remove',l.id)).ok,false);
  });
  await t.test('Private chat, durable outbox, idempotency, replies and read receipt',async()=>{
    const p={listingId:l.id,toUserId:'101',text:'Авто ще продається?',clientId:crypto.randomUUID()};
    const first=await req(buyer,'chat:send',p);assert.equal(first.ok,true);
    const repeat=await req(buyer,'chat:send',p);assert.equal(repeat.data.id,first.data.id);
    assert.equal((await game.pool.query('SELECT * FROM notification_outbox')).rows.length,1);
    const reply=await req(seller,'chat:send',{listingId:l.id,toUserId:'202',text:'Так, вітаю!',clientId:crypto.randomUUID()});assert.equal(reply.ok,true);
    const denied=await req(outsider,'chat:send',{listingId:l.id,toUserId:'202',text:'Intrusion',clientId:crypto.randomUUID()});assert.equal(denied.ok,false);
    assert.deepEqual((await req(outsider,'chat:history',{listingId:l.id,partnerId:'101'})).data,[]);
    assert.equal((await req(seller,'chat:read',{listingId:l.id,partnerId:'202'})).ok,true);
    const history=await req(seller,'chat:history',{listingId:l.id,partnerId:'202'});assert.equal(history.data.length,2);assert.equal(history.data[0].read,true);
  });
  await t.test('Telegram delivery and blocked-user handling via fake transport',async()=>{
    let calls=0;await deliverNotifications(game.pool,{BOT_TOKEN:token,APP_URL:'https://example.org'},async(_url,opts)=>{
      const body=JSON.parse(opts.body);assert.ok(body.text.includes('У вас нове повідомлення'));assert.equal(body.reply_markup.inline_keyboard[0][0].web_app.url,'https://example.org');
      calls++;return {json:async()=>calls===1?{ok:true}:{ok:false,error_code:403,description:'Forbidden'}};
    });
    assert.equal(calls,2);const statuses=(await game.pool.query('SELECT status FROM notification_outbox')).rows.map(r=>r.status).sort();assert.deepEqual(statuses,['failed','sent']);
  });
  await t.test('Bonus atomic once per day, VIP charged once and self rating rejected',async()=>{
    const r=await Promise.all([req(seller,'daily:claim',{}),req(seller,'daily:claim',{})]);assert.equal(r.filter(x=>x.ok).length,1);
    const vip=await req(seller,'listing:create',{...payload,vip:true});assert.equal(vip.ok,true);assert.ok(vip.data.slotId<=10);
    assert.equal((await game.pool.query("SELECT crystals FROM users WHERE id='101'")).rows[0].crystals,25);
    assert.equal((await req(seller,'seller:rate',{sellerId:'101',rating:5})).ok,false);
    assert.equal((await req(buyer,'seller:rate',{sellerId:'101',rating:5})).ok,true);
    assert.equal((await req(outsider,'seller:rate',{sellerId:'101',rating:5})).ok,false);
  });
  await t.test('Expired listings disappear and free slot reused; old conversation remains',async()=>{
    await game.pool.query("UPDATE listings SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[l.id]);
    assert.equal((await game.publicListings()).some(x=>x.id===l.id),false);await game.expire();
    assert.equal((await game.pool.query('SELECT status FROM listings WHERE id=$1',[l.id])).rows[0].status,'expired');
    const next=await req(seller,'listing:create',payload);assert.equal(next.data.slotId,l.slotId);
    assert.equal((await req(outsider,'chat:send',{listingId:l.id,toUserId:'101',text:'New',clientId:crypto.randomUUID()})).ok,false);
    assert.equal((await req(buyer,'chat:send',{listingId:l.id,toUserId:'101',text:'Continue',clientId:crypto.randomUUID()})).ok,true);
  });
  await t.test('Unauthenticated users cannot publish and broken sessions rejected',async()=>{
    const s=io(url,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise(r=>s.on('connect',r));
    assert.equal((await req(s,'listing:create',payload)).ok,false);
    assert.equal((await req(s,'auth',{initData:'invalid'})).ok,false);
  });
  await t.test('Health and all application assets resolve',async()=>{
    for(const route of ['/health','/','/js/app.js','/js/scene.js','/vendor/three/build/three.module.js','/assets/models/market.glb','/assets/models/sedan.glb','/assets/models/slots.json'])assert.equal((await fetch(url+route)).status,200,route);
  });
});
