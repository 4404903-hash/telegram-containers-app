const {test}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,relocateListings}=require('../server/db');
const slots=require('../public/assets/models/slots.json');

test('30 large bays preserve overflow listings and reuse ordinary spaces',async()=>{
  assert.deepEqual(slots.map(s=>s.id),Array.from({length:30},(_,i)=>i+1));
  for(const a of slots)for(const b of slots)if(a.id!==b.id)
    assert.ok(Math.abs(a.x-b.x)>=4.4 || Math.abs(a.z-b.z)>=8,'Bays must not overlap');
  const db=await database({DEMO_MODE:'true',DEMO_DATA_DIR:'memory://'});
  try {
    await migrate(db);
    await db.query(`INSERT INTO listings(id,seller_id,seller_name,brand,model,year,price,slot_id,spot)
      SELECT 'car-'||s,'seller','Seller','BMW','320',2020,10000,s,s FROM generate_series(11,32) s`);
    const original=(await db.query("SELECT expires_at FROM listings WHERE id='car-31'")).rows[0].expires_at;
    await migrate(db);
    assert.equal((await db.query("SELECT count(*)::int n FROM listings WHERE status='active'")).rows[0].n,22);
    assert.equal(await relocateListings(db),0);
    await db.query("UPDATE listings SET status='removed' WHERE slot_id=15");
    assert.equal(await relocateListings(db),1);
    const moved=(await db.query("SELECT slot_id,spot,expires_at FROM listings WHERE id='car-31'")).rows[0];
    assert.equal(moved.slot_id,15);assert.equal(moved.spot,15);
    assert.equal(new Date(moved.expires_at).getTime(),new Date(original).getTime());
    assert.equal((await db.query("SELECT slot_id FROM listings WHERE id='car-32'")).rows[0].slot_id,32);
    assert.equal(await relocateListings(db),0);
  } finally {await db.end();}
});
