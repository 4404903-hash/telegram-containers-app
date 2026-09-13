const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {database,migrate}=require('../server/db');
test('Old schema migrates and data survives disk reopen',async()=>{
  const root=path.resolve('data');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'test-persistence-'));
  const env={DEMO_MODE:'true',DEMO_DATA_DIR:dir};let db;
  try {
    db=await database(env);
    await db.query(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,username TEXT NOT NULL DEFAULT '',
      crystals INT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await db.query(`INSERT INTO users(id,name,crystals) VALUES('old-user','Existing seller',47)`);
    await db.query(`CREATE TABLE listings(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,seller_name TEXT NOT NULL,
      brand TEXT NOT NULL,model TEXT NOT NULL,year INT NOT NULL,price NUMERIC NOT NULL,description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT NOW(),spot INT)`);
    await db.query(`INSERT INTO listings(id,seller_id,seller_name,brand,model,year,price,spot,created_at)
      VALUES('old','old-user','Existing seller','BMW','320',2020,15000,11,NOW()-INTERVAL '25 hours'),
      ('new','old-user','Existing seller','Audi','A4',2021,17000,12,NOW()-INTERVAL '2 hours')`);
    await migrate(db);await migrate(db);
    const rows=(await db.query('SELECT id,status,slot_id FROM listings ORDER BY id')).rows;
    assert.equal(rows.find(r=>r.id==='old').status,'expired');assert.equal(rows.find(r=>r.id==='new').status,'active');
    assert.equal(rows.find(r=>r.id==='new').slot_id,12);
    await db.query(`INSERT INTO messages(id,listing_id,listing_title,from_user_id,from_name,to_user_id,text)
      VALUES('saved-msg','new','Audi A4','buyer','Buyer','old-user','Persist this message')`);
    await db.end();db=await database(env);await migrate(db);
    assert.equal((await db.query('SELECT crystals FROM users')).rows[0].crystals,47);
    assert.equal((await db.query('SELECT text FROM messages')).rows[0].text,'Persist this message');
    assert.equal((await db.query('SELECT * FROM listings')).rows.length,2);
  } finally {
    if(db)await db.end();
    if(dir.startsWith(root+path.sep))fs.rmSync(dir,{recursive:true,force:true});
  }
});
