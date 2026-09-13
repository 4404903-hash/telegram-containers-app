async function deliverNotifications(pool, env, transport = fetch) {
  if (!env.BOT_TOKEN) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(`SELECT * FROM notification_outbox WHERE status='pending' AND next_at<=NOW()
      ORDER BY next_at LIMIT 10 FOR UPDATE SKIP LOCKED`);
    for (const n of rows) {
      try {
        const body = { chat_id:n.recipient, text:n.text };
        if (env.APP_URL) body.reply_markup = { inline_keyboard:[[{text:'Відкрити автобазар',web_app:{url:env.APP_URL}}]] };
        const response = await transport(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000) });
        const result = await response.json();
        if (result.ok) await c.query(`UPDATE notification_outbox SET status='sent',last_error=NULL WHERE id=$1`,[n.id]);
        else {
          const permanent = [400,403].includes(result.error_code);
          const delay = Math.max(30,Number(result.parameters?.retry_after)||Math.min(3600,30 * 2**n.attempts));
          await c.query(`UPDATE notification_outbox SET attempts=attempts+1,status=$2,
            next_at=NOW()+($3 * INTERVAL '1 second'),last_error=$4 WHERE id=$1`,
            [n.id,permanent || n.attempts>=7 ? 'failed':'pending',delay,String(result.description||'Telegram error').slice(0,300)]);
        }
      } catch {
        await c.query(`UPDATE notification_outbox SET attempts=attempts+1,status=$2,
          next_at=NOW()+INTERVAL '1 minute',last_error='Network timeout' WHERE id=$1`,[n.id,n.attempts>=7?'failed':'pending']);
      }
    }
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
module.exports={deliverNotifications};
