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
    const crystalCount = $('#crystalCount');

if (crystalCount) {
    crystalCount.textContent = crystals;
}
    dailyBonusAvailable = !!d.dailyBonusAvailable;
    const officeBonusDot = $('#officeBonusDot');
    if (officeBonusDot)
        officeBonusDot.classList.toggle('hidden', !dailyBonusAvailable);
    updateOfficeBonusState();
    const displayName = user.name || telegramDisplayName();
    const headerPlayerName = $('#headerPlayerName');
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
});
socket.on('auth:error', toast);
socket.on('listing:error', toast);
socket.on('listing:created', x => { pendingSale = null; lastCreatedListingId = x.id; listings.push(x); show('marketScreen'); resetWizard(); toast(`Авто поставлено на місце №${x.slotId ?? x.spot}`); render(); });
socket.on('world:listings', x => { listings = x || []; renderSlots(); if (user) {
    $('#myCarsCount').textContent = myActiveCars().length;
    if (!$('#myCarsModal').classList.contains('hidden'))
        renderMyCars();
} });
socket.on('chat:new', m => { messages.push(m); toast(`Нове повідомлення від ${m.fromName}`); renderConversations(); if (activeChat && sameChatMessage(m, activeChat)) {
    markChatRead();
    renderChat();
} });

    toast(d.message); ;
socket.on('seller:rating-updated', d => { listings.forEach(l => { if (String(l.sellerId) === String(d.sellerId)) {
    l.sellerRating = d.rating;
    l.ratingCount = d.ratingCount;
} }); if (selected && String(selected.sellerId) === String(d.sellerId))
    updateRatingPanel(selected); renderSlots(); });
