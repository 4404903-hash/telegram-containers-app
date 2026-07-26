/* ========================================
   AutoBazar — модуль: camera.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 3. Гравці та камера */
function renderRemotePlayers() { const layer = $('#remotePlayers'); if (!layer || !user)
    return; layer.innerHTML = ''; players.filter(p => String(p.id) !== String(user.id)).forEach(p => { const el = document.createElement('div'); el.className = `player remote-player ${p.moving ? 'running' : ''} ${p.faceLeft ? 'face-left' : ''}`; el.style.left = Number(p.x) + 'px'; el.style.top = Number(p.y) + 'px'; el.innerHTML = `<span class="person-sprite"><i></i><b></b></span><small>${esc(p.name || 'Гравець')}</small>`; layer.appendChild(el); }); }
function updateCamera() { const camera = $('#camera'), world = $('#world'); if (!camera || !world)
    return; const w = camera.clientWidth, h = camera.clientHeight; const tx = Math.round(w / 2 - pos.x * zoom), ty = Math.round(h / 2 - pos.y * zoom); world.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${zoom})`; $('#player').style.left = pos.x + 'px'; $('#player').style.top = pos.y + 'px'; $('#zoomValue').textContent = Math.round(zoom * 100) + '%'; }
function render() { if (!user)
    return; $('#crystalCount').textContent = crystals; $('#myCarsCount').textContent = myActiveCars().length; renderSlots(); renderRemotePlayers(); renderConversations(); updateCamera(); }
