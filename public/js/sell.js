/* ========================================
   AutoBazar — модуль: sell.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 6. Майстер створення оголошення */
function setStep(step) { $$('.wizard-step').forEach(x => x.classList.toggle('active', Number(x.dataset.step) === step)); $$('.step-indicator i').forEach((x, i) => x.classList.toggle('active', i < step)); }
$$('.next-step').forEach(btn => btn.onclick = () => { const current = btn.closest('.wizard-step'), inputs = [...current.querySelectorAll('input[required],textarea[required]')]; if (inputs.some(x => !x.reportValidity()))
    return; setStep(Number(current.dataset.step) + 1); });
$$('.prev-step').forEach(btn => btn.onclick = () => setStep(Number(btn.closest('.wizard-step').dataset.step) - 1));
function resetWizard() { $('#sellForm').reset(); setStep(1); }
$('#sellForm').onsubmit = e => { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); payload.requestVip = payload.requestVip === 'true'; pendingSale = payload; socket.emit('listing:create', payload); };
$('#continueFreeBtn').onclick = () => { if (!pendingSale)
    return; pendingSale.requestVip = false; $('#vipModal').classList.add('hidden'); socket.emit('listing:create', pendingSale); };
$('#buyVipBtn').onclick = () => { socket.emit('vip:buy-crystals'); toast('Покупка кристалів буде підключена через Telegram Payments'); };
$$('.close-vip-modal').forEach(x => x.onclick = () => $('#vipModal').classList.add('hidden'));
