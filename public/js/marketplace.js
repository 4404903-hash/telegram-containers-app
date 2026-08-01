/* ========================================
   AutoBazar — модуль: marketplace.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 2. Карта, паркомісця та автомобілі */
function marketplaceSlots() {
  const result = [];

  /*
    Розташування:

    Верхній ряд:
    1–5 ліворуч від офісу
    6–10 праворуч від офісу

    Середній ряд:
    11–20

    Нижній ряд:
    21–30
  */

  const topLeftX = [300, 420, 540, 660, 780];
  const topRightX = [1220, 1340, 1460, 1580, 1700];

  let id = 1;

  // Місця 1–5 — VIP зліва від офісу
  for (const x of topLeftX) {
    result.push({
      id: id++,
      x,
      y: 520,
      rotation: 0
    });
  }

  // Місця 6–10 — справа від офісу
  for (const x of topRightX) {
    result.push({
      id: id++,
      x,
      y: 520,
      rotation: 0
    });
  }

  // 10 місць у середньому ряду
  const regularX = [
    280, 440, 600, 760, 920,
    1080, 1240, 1400, 1560, 1720
  ];

  for (const x of regularX) {
    result.push({
      id: id++,
      x,
      y: 900,
      rotation: 0
    });
  }

  // 10 місць у нижньому ряду
  for (const x of regularX) {
    result.push({
      id: id++,
      x,
      y: 1280,
      rotation: 0
    });
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
