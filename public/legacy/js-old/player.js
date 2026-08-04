/* ========================================
   AutoBazar — модуль: player.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 9. Керування персонажем */
let lastPlayerEmit = 0;
function emitPlayerUpdate(moving) { if (!user)
    return; const now = Date.now(); if (moving && now - lastPlayerEmit < 80)
    return; lastPlayerEmit = now; socket.emit('player:update', { x: pos.x, y: pos.y, moving: !!moving, faceLeft: $('#player')?.classList.contains('face-left') || false }); }
function setRunning(dx = 0) { const p = $('#player'); p.classList.add('running'); if (dx < -.02)
    p.classList.add('face-left'); if (dx > .02)
    p.classList.remove('face-left'); clearTimeout(runStopTimer); runStopTimer = setTimeout(stopRunning, 140); }
function stopRunning() { $('#player')?.classList.remove('running'); emitPlayerUpdate(false); }
function move(dx, dy) { pos.x = Math.max(45, Math.min(MAP_SIZE - 45, pos.x + dx)); pos.y = Math.max(70, Math.min(MAP_SIZE - 45, pos.y + dy)); updateCamera(); if (Math.abs(dx) + Math.abs(dy) > .01)
    setRunning(dx); emitPlayerUpdate(true); updateNearbyCars(); }
window.onkeydown = e => {
    const target = e.target;

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
    ) {
        return;
    }

    const key = e.key.toLowerCase();

    const controls = {
        arrowup: [0, -10],
        w: [0, -10],
        arrowdown: [0, 10],
        s: [0, 10],
        arrowleft: [-10, 0],
        a: [-10, 0],
        arrowright: [10, 0],
        d: [10, 0]
    };

    if (controls[key]) {
        e.preventDefault();
        move(...controls[key]);
    }
};
window.addEventListener('keyup', stopRunning);
window.addEventListener('resize', updateCamera);
