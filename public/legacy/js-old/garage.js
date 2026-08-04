/* ========================================
   AutoBazar — модуль: garage.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 7. Мої автомобілі */
function myActiveCars() { return listings.filter(l => String(l.sellerId) === String(user?.id) && l.status !== 'removed'); }
function renderMyCars() {
    const cars = myActiveCars(), box = $('#myCarsList');
    $('#myCarsCount').textContent = cars.length;
    if (!cars.length) {
        box.innerHTML = '<div class="empty-list">Ви ще не виставили жодного автомобіля.</div>';
        return;
    }
    box.innerHTML = cars.map(l => `<div class="my-car-item" data-id="${esc(l.id)}"><div class="my-car-thumb"><img src="${carImage(l.color)}" alt="${esc(l.brand)}"></div><div><h3>${esc(l.brand)} ${esc(l.model)}</h3><p>$${Number(l.price).toLocaleString()} · місце №${Number(l.slotId ?? l.spot)}</p><p>На продажу</p></div><div class="my-car-actions"><button class="details-btn" data-details="${esc(l.id)}">Деталі</button><button class="remove-car" data-remove="${esc(l.id)}">Зняти</button></div></div>`).join('');
    box.querySelectorAll('[data-details]').forEach(b => b.onclick = () => { const l = listings.find(x => x.id === b.dataset.details); if (l) {
        closeMyCars();
        openCar(l);
    } });
    box.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { if (confirm('Зняти це авто з продажу?')) {
        socket.emit('listing:remove', b.dataset.remove);
        toast('Оголошення знято');
    } });
}
function openMyCars() { renderMyCars(); $('#myCarsModal').classList.remove('hidden'); }
function closeMyCars() { $('#myCarsModal').classList.add('hidden'); }
$$('.close-my-cars').forEach(x => x.onclick = closeMyCars);
$('#addAnotherCar').onclick = () => { closeMyCars(); show('sellScreen'); };
$('#sendDeveloper').onclick = () => { const text = $('#developerText').value.trim(); if (!text)
    return toast('Напишіть повідомлення'); const username = 's_5994'; const url = `https://t.me/${username}?text=${encodeURIComponent(text)}`; tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank'); };
