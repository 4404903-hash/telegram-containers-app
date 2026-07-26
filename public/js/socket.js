/* ========================================
   AutoBazar — модуль: socket.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 4. Socket.IO: авторизація та події сервера */
socket.emit('auth', { initData: tg?.initData || '', demoUser: demo() });
socket.on('auth:ok', d => {
    user = d.user;
    listings = d.listings || [];
    messages = d.messages || [];
    players = d.players || [];
    crystals = Number(d.crystals || 0);
    dailyBonusAvailable = !!d.dailyBonusAvailable;
    const officeBonusDot = $('#officeBonusDot');
    if (officeBonusDot)
        officeBonusDot.classList.toggle('hidden', !dailyBonusAvailable);
    updateOfficeBonusState();
    const displayName = user.name || telegramDisplayName();
    const playerName = $('#playerName');
    const headerPlayerName = $('#headerPlayerName');
    if (playerName)
        playerName.textContent = displayName;
    if (headerPlayerName)
        headerPlayerName.textContent = displayName;
    const own = listings.find(l => String(l.sellerId) === String(user.id));
    const headerRating = $('#headerRating');
    if (headerRating)
        headerRating.textContent = Number(own?.sellerRating || 0).toFixed(1);
    show('marketScreen');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            updateCamera();
            updateNearbyCars();
        });
    });
    emitPlayerUpdate(false);
});
socket.on('auth:error', toast);
socket.on('listing:error', toast);
socket.on('vip:purchase-required', d => { pendingSale = d?.payload || pendingSale; $('#vipModal').classList.remove('hidden'); });
socket.on('balance:update', d => { crystals = Number(d.crystals || 0); $('#crystalCount').textContent = crystals; });
socket.on('listing:created', x => { pendingSale = null; lastCreatedListingId = x.id; listings.push(x); show('marketScreen'); resetWizard(); toast(`Авто поставлено на місце №${x.slotId ?? x.spot}`); render(); });
socket.on('world:listings', x => { listings = x || []; renderSlots(); if (user) {
    $('#myCarsCount').textContent = myActiveCars().length;
    if (!$('#myCarsModal').classList.contains('hidden'))
        renderMyCars();
} });
socket.on('world:players', x => { players = x || []; renderRemotePlayers(); });
socket.on('player:updated', p => { const i = players.findIndex(x => String(x.id) === String(p.id)); i >= 0 ? players[i] = p : players.push(p); renderRemotePlayers(); });
socket.on('player:left', p => { players = players.filter(x => String(x.id) !== String(p.id)); renderRemotePlayers(); });
socket.on('chat:new', m => { messages.push(m); toast(`Нове повідомлення від ${m.fromName}`); renderConversations(); if (activeChat && sameChatMessage(m, activeChat)) {
    markChatRead();
    renderChat();
} });
socket.on('chat:sent', m => { messages.push(m); $('#chatText').value = ''; renderConversations(); renderChat(); });
socket.on('daily:result', d => { if (d.ok) {
    crystals = Number(d.crystals);
    dailyBonusAvailable = false;
    $('#officeBonusDot').classList.add('hidden');
    updateOfficeBonusState();
    $('#crystalCount').textContent = crystals;
    toast(`Щоденний бонус: +${d.reward} 💎`);
}
else
    toast(d.message); });
socket.on('seller:rating-updated', d => { listings.forEach(l => { if (String(l.sellerId) === String(d.sellerId)) {
    l.sellerRating = d.rating;
    l.ratingCount = d.ratingCount;
} }); if (selected && String(selected.sellerId) === String(d.sellerId))
    updateRatingPanel(selected); renderSlots(); });
