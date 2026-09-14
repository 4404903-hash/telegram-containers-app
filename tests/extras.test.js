const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {io}=require('socket.io-client');
const {createGame}=require('../server');
const {migrateExtras}=require('../server/extras');

test('Photos, favorites, moderation and expiry reminders integrate with durable data',async t=>{
  const game=await createGame({DEMO_MODE:'true',DEMO_DATA_DIR:'memory://',ADMIN_TELEGRAM_IDS:'demo-admin-12345'});
  await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+game.server.address().port,sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close();});
  async function login(id){const s=io(url,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise(r=>s.on('connect',r));
    const auth=await s.timeout(10000).emitWithAck('auth',{demoUser:{id,name:id}});assert.equal(auth.ok,true);return {s,data:auth.data};}
  const {s:seller}=await login('demo-seller-12345'),{s:buyer}=await login('demo-buyer-12345'),{s:admin,data}=await login('demo-admin-12345');
  assert.equal(data.isAdmin,true);
  const req=(s,e,p={})=>s.timeout(10000).emitWithAck(e,p);
  const photo=await sharp({create:{width:200,height:120,channels:3,background:'#d52b33'}}).jpeg().toBuffer();
  const payload={brand:'Фото авто',model:'Тест',year:2022,price:15000,description:'Тестове оголошення',city:'Київ',mileage:123000,photos:[photo]};
  const result=await req(seller,'listing:create',payload);assert.equal(result.ok,true,JSON.stringify(result));const l=result.data;
  await t.test('Photos are decoded, re-encoded, served and included in public listing',async()=>{
    assert.equal(l.photoCount,1);assert.equal(l.city,'Київ');assert.equal(l.mileage,123000);
    const r=await fetch(`${url}/api/photos/${l.id}/0`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/webp/);
    const meta=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(meta.width,200);assert.equal(meta.exif,undefined);
    assert.equal((await game.publicListings()).find(x=>x.id===l.id).photoCount,1);
    assert.equal((await fetch(`${url}/api/photos/${l.id}/5`)).status,404);
  });
  await t.test('Invalid files and mileage fail before consuming slots',async()=>{
    for(const changes of [{photos:[Buffer.from('<svg/>')]},{photos:[photo,photo,photo,photo]},{mileage:-1},{city:'x'.repeat(61)}]){
      const r=await req(seller,'listing:create',{...payload,...changes});assert.equal(r.ok,false);
    }assert.equal((await game.publicListings()).length,1);
  });
  await t.test('Favorites persist across sessions and remain private',async()=>{
    assert.deepEqual((await req(buyer,'favorite:set',{id:l.id,saved:true})).data,[l.id]);
    assert.deepEqual((await login('demo-buyer-12345')).data.favorites,[l.id]);
    assert.deepEqual((await login('demo-seller-12345')).data.favorites,[]);
    assert.deepEqual((await req(buyer,'favorite:set',{id:l.id,saved:false})).data,[]);
  });
  await t.test('Reports can be resolved only by configured moderator',async()=>{
    assert.equal((await req(buyer,'listing:report',{id:l.id,reason:'Неправдивий опис автомобіля'})).ok,true);
    assert.equal((await req(buyer,'reports:list')).ok,false);
    assert.equal((await req(buyer,'reports:resolve',{id:l.id,action:'remove'})).ok,false);
    assert.equal((await req(admin,'reports:list')).data.length,1);
    assert.equal((await req(admin,'reports:resolve',{id:l.id,action:'remove'})).ok,true);
    assert.equal((await fetch(`${url}/api/photos/${l.id}/0`)).status,404);
    assert.equal((await game.publicListings()).length,0);
  });
  await t.test('Schema migration is repeatable and photo retention cleans old bytes',async()=>{
    await migrateExtras(game.pool);await migrateExtras(game.pool);
    await game.pool.query("UPDATE listings SET expires_at=NOW()-INTERVAL '31 days' WHERE id=$1",[l.id]);
    await game.maintain();assert.equal((await game.pool.query('SELECT * FROM listing_photos')).rowCount,0);
  });
});

test('Expiry warning queued once and never queued for already expired listing',async()=>{
  const env={DEMO_MODE:'true',DEMO_DATA_DIR:'memory://',BOT_TOKEN:'test-only'};
  const game=await createGame(env);
  try{
    await game.pool.query(`INSERT INTO listings(id,seller_id,seller_name,brand,model,year,price,slot_id,expires_at)
      VALUES('due','123','Seller','BMW','X3',2020,15000,11,NOW()+INTERVAL '30 minutes'),
      ('old','123','Seller','Audi','A4',2020,15000,12,NOW()-INTERVAL '1 minute')`);
    await game.maintain();await game.maintain();
    const r=await game.pool.query('SELECT * FROM notification_outbox');assert.equal(r.rowCount,1);assert.equal(r.rows[0].id,'expiry:due');
  }finally{await game.close();}
});
