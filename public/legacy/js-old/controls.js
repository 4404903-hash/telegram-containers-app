/* ========================================
   AutoBazar — модуль: controls.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 10. Джойстик і масштабування */
const base = $('#joystickBase'), stick = $('#joystickStick');
let joy = { active: false, x: 0, y: 0, pointerId: null };
function updateJoystick(e) { const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const max = r.width * .34, len = Math.hypot(dx, dy) || 1; if (len > max) {
    dx = dx / len * max;
    dy = dy / len * max;
} joy.x = dx / max; joy.y = dy / max; stick.style.transform = `translate(${dx}px,${dy}px)`; }
function joystickLoop() { if (!joy.active)
    return; move(joy.x * 5.5, joy.y * 5.5); joystickFrame = requestAnimationFrame(joystickLoop); }
function stopJoystick() { joy.active = false; joy.x = joy.y = 0; stick.style.transform = 'translate(0,0)'; if (joystickFrame)
    cancelAnimationFrame(joystickFrame); stopRunning(); }
base.addEventListener('pointerdown', e => { e.preventDefault(); joy.active = true; joy.pointerId = e.pointerId; base.setPointerCapture(e.pointerId); updateJoystick(e); joystickLoop(); });
base.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.pointerId) {
    e.preventDefault();
    updateJoystick(e);
} });
base.addEventListener('pointerup', stopJoystick);
base.addEventListener('pointercancel', stopJoystick);
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
function setZoom(v) { zoom = Math.max(.38, Math.min(1.25, v)); updateCamera(); updateNearbyCars(); }
$('#zoomIn').onclick = () => setZoom(zoom + .1);
$('#zoomOut').onclick = () => setZoom(zoom - .1);
let pinch = null;
$('#camera').addEventListener('touchstart', e => { if (e.touches.length === 2) {
    pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: zoom };
} }, { passive: true });
$('#camera').addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) {
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    setZoom(pinch.z * d / pinch.d);
} }, { passive: false });
$('#camera').addEventListener('touchend', e => { if (e.touches.length < 2)
    pinch = null; }, { passive: true });
