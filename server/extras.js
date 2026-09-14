const sharp = require('sharp');
sharp.concurrency(2);
let processing = 0;

async function prepareDetails(p) {
  const city = String(p?.city || '').trim();
  const mileage = p?.mileage === '' || p?.mileage == null ? null : Number(p.mileage);
  if (city.length > 60 || (mileage !== null && (!Number.isInteger(mileage) || mileage < 0 || mileage > 3000000)))
    throw Error('Перевірте місто та пробіг (0–3 000 000 км)');
  const input = p?.photos || [];
  if (!Array.isArray(input) || input.length > 3) throw Error('Можна додати до 3 фото');
  if (processing >= 4) throw Error('Фото обробляються. Спробуйте за кілька секунд');
  processing++;
  try {
    const photos = [];
    for (const raw of input) {
      if (!Buffer.isBuffer(raw) || raw.length > 450000 || !raw.length) throw Error('Фото має бути до 450 КБ');
      try {
        const pipeline = sharp(raw, {limitInputPixels: 12000000, animated: false, failOn: 'warning'});
        const meta = await pipeline.metadata();
        if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw Error('format');
        const data = await pipeline.rotate().resize(1000, 1000, {fit: 'inside', withoutEnlargement: true})
          .webp({quality: 78}).toBuffer();
        if (data.length > 450000) throw Error('size');
        photos.push(data);
      } catch { throw Error('Не вдалося прочитати фото. Оберіть JPEG, PNG або WebP'); }
    }
    return {city, mileage, photos};
  } finally { processing--; }
}

async function migrateExtras(pool) {
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS mileage INTEGER`);
  await pool.query(`CREATE TABLE IF NOT EXISTS listing_photos (
    listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE, position INTEGER CHECK(position BETWEEN 0 AND 2),
    data BYTEA NOT NULL, PRIMARY KEY(listing_id,position))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE, listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,listing_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS listing_reports (
    listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE, reporter_id TEXT REFERENCES users(id),
    reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(listing_id,reporter_id))`);
}

function extras({pool,app,env,io,broadcast}) {
  const admins = new Set((env.ADMIN_TELEGRAM_IDS || '').split(',').map(x=>x.trim()).filter(Boolean));
  const favorites = async id => (await pool.query('SELECT listing_id FROM favorites WHERE user_id=$1',[id])).rows.map(r=>r.listing_id);
  app.get('/api/photos/:id/:position', async(q,r)=>{
    if (!/^[0-2]$/.test(q.params.position)) return r.sendStatus(404);
    try {
      const result = await pool.query(`SELECT p.data FROM listing_photos p JOIN listings l ON l.id=p.listing_id
        WHERE l.id=$1 AND p.position=$2 AND l.status='active' AND l.expires_at>NOW()`,[q.params.id,Number(q.params.position)]);
      if (!result.rowCount) return r.sendStatus(404);
      r.setHeader('Cache-Control','private, no-cache');r.type('webp').send(Buffer.from(result.rows[0].data));
    } catch {r.sendStatus(503);}
  });
  return {
    favorites, isAdmin: id=>admins.has(id),
    async maintain() {
      if (env.BOT_TOKEN) await pool.query(`INSERT INTO notification_outbox(id,recipient,text)
        SELECT 'expiry:'||id,seller_id,'Ваше оголошення '||brand||' '||model||' завершиться менш ніж за годину. Перевірте повідомлення покупців у грі.'
        FROM listings WHERE status='active' AND expires_at>NOW() AND expires_at<=NOW()+INTERVAL '1 hour'
        AND seller_id ~ '^[0-9]+$' ON CONFLICT(id) DO NOTHING`);
      await pool.query(`DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE expires_at<NOW()-INTERVAL '30 days')`);
    },
    bind(event,getUser) {
      event('favorite:set',async p=>{
        const id=String(p?.id||''),user=getUser();
        if(typeof p?.saved!=='boolean') throw Error('Некоректний запит');
        if(p.saved){
          const r=await pool.query(`INSERT INTO favorites(user_id,listing_id) SELECT $1,id FROM listings
            WHERE id=$2 AND status='active' AND expires_at>NOW() ON CONFLICT DO NOTHING RETURNING listing_id`,[user.id,id]);
          if(!r.rowCount && !(await favorites(user.id)).includes(id)) throw Error('Оголошення вже завершилося');
        }else await pool.query('DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2',[user.id,id]);
        const ids=await favorites(user.id);io.to(`user:${user.id}`).emit('favorites:update',ids);return ids;
      });
      event('listing:report',async p=>{
        if(!admins.size) throw Error('Модератор ще не налаштований. Зверніться до розробника');
        const reason=String(p?.reason||'').trim();
        if(reason.length<5||reason.length>500) throw Error('Опишіть причину: 5–500 символів');
        const r=await pool.query(`INSERT INTO listing_reports(listing_id,reporter_id,reason)
          SELECT id,$2,$3 FROM listings WHERE id=$1 AND seller_id<>$2 AND status='active' AND expires_at>NOW()
          ON CONFLICT DO NOTHING RETURNING listing_id`,[String(p?.id),getUser().id,reason]);
        if(!r.rowCount) throw Error('Скаргу вже подано або оголошення недоступне');return {};
      },5);
      event('reports:list',async()=>{
        if(!admins.has(getUser().id)) throw Error('Доступ лише для модератора');
        return (await pool.query(`SELECT r.*,l.brand,l.model,l.description FROM listing_reports r JOIN listings l ON l.id=r.listing_id
          WHERE r.status='pending' ORDER BY r.created_at LIMIT 100`)).rows;
      });
      event('reports:resolve',async p=>{
        if(!admins.has(getUser().id)) throw Error('Доступ лише для модератора');
        if(!['dismiss','remove'].includes(p?.action)) throw Error('Некоректна дія');
        const c=await pool.connect();try{
          await c.query('BEGIN');
          const r=await c.query(`UPDATE listing_reports SET status=$2 WHERE listing_id=$1 AND status='pending' RETURNING listing_id`,[String(p.id),p.action]);
          if(!r.rowCount) throw Error('Скаргу вже розглянуто');
          if(p.action==='remove') await c.query(`UPDATE listings SET status='removed' WHERE id=$1`,[String(p.id)]);
          await c.query('COMMIT');
        }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
        await broadcast();return {};
      });
    }
  };
}
module.exports={prepareDetails,migrateExtras,extras};
