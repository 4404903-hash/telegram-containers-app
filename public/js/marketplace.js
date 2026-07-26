/* ========================================
   AutoBazar — модуль: marketplace.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 2. Карта, паркомісця та автомобілі */
function marketplaceSlots() {
    const result = [];
    let id = 1;
    // 5 великих VIP-місць прямо перед офісом
    for (const x of [660, 980, 1300, 1620, 1940])
        result.push({ id: id++, x, y: 610, rotation: 0 });
    // 45 повнорозмірних місць: 5 рядів по 9
    const xs = [340, 580, 820, 1060, 1300, 1540, 1780, 2020, 2260];
    for (const y of [930, 1240, 1550, 1860, 2170]) {
        for (const x of xs)
            result.push({ id: id++, x, y, rotation: 0 });
    }
    return result;
}
const slots = marketplaceSlots();
function carImage(color) { return `/assets/cars/${COLOR_NAMES[color] ? color : 'black'}.png`; }
function renderSlots() {
    const layer = $('#slotLayer');
    layer.innerHTML = '';
    slots.forEach(s => {
        const spot = document.createElement('div');
        spot.className = `parking-slot ${s.id <= VIP_SLOTS ? 'vip' : ''}`;
        spot.dataset.slotId = s.id;
        spot.style.left = s.x + 'px';
        spot.style.top = s.y + 'px';
        spot.innerHTML = `<small>${s.id}</small>`;
        const l = listings.find(x => Number(x.slotId ?? x.spot) === s.id && x.status !== 'removed');
        if (l) {
            const car = document.createElement('button');
            car.type = 'button';
            car.className = 'car';
            car.dataset.listingId = l.id;
            car.innerHTML = `<span class="car-label"><b>${esc(l.brand)} ${esc(l.model)}</b><small>$${Number(l.price).toLocaleString()}</small></span><img src="${carImage(l.color)}" alt="${esc(l.brand)} ${esc(l.model)}"><em class="online-dot ${l.sellerOnline ? '' : 'offline'}"></em>`;
            if (l.id === lastCreatedListingId)
                car.classList.add('drive-in');
            car.onclick = () => tryOpenCar(l, car);
            spot.appendChild(car);
        }
        layer.appendChild(spot);
    });
    requestAnimationFrame(updateNearbyCars);
}
