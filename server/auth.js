const crypto = require('node:crypto');
function validateTelegram(initData, token, now = Date.now()) {
  if (!token || typeof initData !== 'string' || initData.length > 16384) return null;
  try {
    const p = new URLSearchParams(initData), hash = p.get('hash');
    if (!/^[a-f0-9]{64}$/i.test(hash || '') || new Set(p.keys()).size !== [...p.keys()].length) return null;
    p.delete('hash');
    const data = [...p.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256','WebAppData').update(token).digest();
    const expected = crypto.createHmac('sha256',secret).update(data).digest();
    if (!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex'))) return null;
    const age = now/1000 - Number(p.get('auth_date'));
    if (!Number.isFinite(age) || age < -30 || age > 86400) return null;
    const u = JSON.parse(p.get('user'));
    if (!Number.isSafeInteger(u?.id) || u.id <= 0) return null;
    return { id: String(u.id), name: [u.first_name,u.last_name].filter(Boolean).join(' ').slice(0,80) || 'Гравець', username: u.username || '' };
  } catch { return null; }
}
module.exports = { validateTelegram };
