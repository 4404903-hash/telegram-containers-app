/* ========================================
   AutoBazar — модуль: interactions.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 5. Взаємодія з автомобілями та офісом */
function distanceToElement(el) { const r = el.getBoundingClientRect(), c = $('#camera').getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - (c.left + c.width / 2), r.top + r.height / 2 - (c.top + c.height / 2)); }
function tryOpenCar(l, car) { if (distanceToElement(car) > INTERACTION_RADIUS) {
    car.classList.add('too-far');
    setTimeout(() => car.classList.remove('too-far'), 450);
    return toast('Підійдіть ближче до автомобіля');
} openCar(l); }
function updateNearbyCars() { $$('.car').forEach(c => c.classList.toggle('nearby', distanceToElement(c) <= INTERACTION_RADIUS)); const nearOffice = distanceToElement($('#office')) <= 190; $('#office').style.filter = nearOffice ? 'drop-shadow(0 0 18px #58ff9a)' : ''; }
function updateRatingPanel(l) { const avg = Number(l.sellerRating || 0), count = Number(l.ratingCount || 0); $('#mRating').textContent = count ? `${avg.toFixed(1)} ★ · ${count} оцінок` : 'Новий продавець'; const mine = String(l.sellerId) === String(user.id); $('#ratingStars').innerHTML = mine ? '<small>Власний профіль</small>' : [1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" title="${n} з 5">★</button>`).join(''); $$('#ratingStars [data-rate]').forEach(b => b.onclick = () => socket.emit('seller:rate', { sellerId: l.sellerId, rating: Number(b.dataset.rate) })); }
function openCar(l) { selected = l; const slot = Number(l.slotId ?? l.spot); $('#mSlot').textContent = `${slot <= VIP_SLOTS ? 'VIP · ' : ''}місце №${slot}`; $('#mTitle').textContent = `${l.brand} ${l.model}`; $('#mYear').textContent = l.year; $('#mPrice').textContent = '$' + Number(l.price).toLocaleString(); $('#mColor').textContent = COLOR_NAMES[l.color] || l.color || 'Не вказано'; $('#mSeller').textContent = l.sellerName; $('#mDescription').textContent = l.description || 'Без опису'; updateRatingPanel(l); $('#showcaseCar').className = 'showcase-car'; $('#showcaseCar').style.backgroundImage = `url(${carImage(l.color)})`; const mine = String(l.sellerId) === String(user.id); $('#openChatBtn').classList.toggle('hidden', mine); $('#removeBtn').classList.toggle('hidden', !mine); $('#carModal').classList.remove('hidden'); }
function closeCarModal() { $('#carModal').classList.add('hidden'); selected = null; }
function updateOfficeBonusState() { const text = $('#officeDailyText'), btn = $('#officeDaily'); if (!text || !btn)
    return; text.textContent = dailyBonusAvailable ? 'Нагорода готова — забрати' : 'Сьогодні вже отримано'; btn.classList.toggle('available', dailyBonusAvailable); }
function showOffice() { updateOfficeBonusState(); $('#officeModal').classList.remove('hidden'); }
function closeOffice() { $('#officeModal').classList.add('hidden'); }
function openOffice() { if (distanceToElement($('#office')) > 235)
    return toast('Підійдіть ближче до офісу'); showOffice(); }
function openMenu() { $('#gameMenu').classList.remove('hidden'); }
function closeMenu() { $('#gameMenu').classList.add('hidden'); }
$('#office').onclick = openOffice;
$('#menuBtn').onclick = openMenu;
$$('[data-close-menu]').forEach(x => x.onclick = closeMenu);
$('#menuOffice').onclick = () => { closeMenu(); showOffice(); };
$('#menuSell').onclick = () => { closeMenu(); show('sellScreen'); };
$('#menuMyCars').onclick = () => { closeMenu(); openMyCars(); };
$('#menuDeveloper').onclick = () => { closeMenu(); show('developerScreen'); };
$('#menuChats').onclick = () => { closeMenu(); showInbox(); };
$$('.back-market').forEach(x => x.onclick = () => show('marketScreen'));
$$('.close-office-modal').forEach(x => x.onclick = closeOffice);
$('#officeDaily').onclick = () => socket.emit('daily:claim');
$('#officeSell').onclick = () => { closeOffice(); show('sellScreen'); };
$('#officeMyCars').onclick = () => { closeOffice(); openMyCars(); };
$('#officeRating').onclick = () => toast('Рейтинг продавців показується в картці автомобіля');
