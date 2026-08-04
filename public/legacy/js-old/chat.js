/* ========================================
   AutoBazar — модуль: chat.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 8. Чати та повідомлення */
function conversationKey(m) { const partner = String(m.fromUserId) === String(user.id) ? String(m.toUserId) : String(m.fromUserId); return `${m.listingId}|${partner}`; }
function sameChatMessage(m, c) { return m.listingId === c.listingId && (String(m.fromUserId) === c.partnerId || String(m.toUserId) === c.partnerId); }
function getConversations() { const map = new Map(); messages.forEach(m => { const partnerId = String(m.fromUserId) === String(user.id) ? String(m.toUserId) : String(m.fromUserId), partnerName = String(m.fromUserId) === String(user.id) ? (m.toName || 'Користувач') : m.fromName, key = `${m.listingId}|${partnerId}`, old = map.get(key); const conv = { key, listingId: m.listingId, listingTitle: m.listingTitle || 'Автомобіль', partnerId, partnerName, last: m, unread: messages.filter(x => x.listingId === m.listingId && String(x.fromUserId) === partnerId && String(x.toUserId) === String(user.id) && !x.read).length }; if (!old || new Date(m.createdAt) > new Date(old.last.createdAt))
    map.set(key, conv); }); return [...map.values()].sort((a, b) => new Date(b.last.createdAt) - new Date(a.last.createdAt)); }
function renderConversations() { if (!user)
    return; const convs = getConversations(), box = $('#conversations'), unread = messages.filter(m => String(m.toUserId) === String(user.id) && !m.read).length; $('#badge').textContent = unread; $('#badge').classList.toggle('hidden', !unread); box.innerHTML = convs.length ? '' : '<div class="empty-list">Повідомлень ще немає</div>'; convs.forEach(c => { const b = document.createElement('button'); b.className = `conversation ${activeChat?.key === c.key ? 'active' : ''}`; b.innerHTML = `<span class="avatar">${esc(c.partnerName[0] || '?')}</span><span><b>${esc(c.partnerName)}</b><small>${esc(c.listingTitle)}</small><em>${esc(c.last.text)}</em></span>${c.unread ? `<i>${c.unread}</i>` : ''}`; b.onclick = () => openConversation(c); box.appendChild(b); }); }
function showInbox() { activeChat = null; $('#chatActive').classList.add('hidden'); $('#chatEmpty').classList.remove('hidden'); renderConversations(); show('inboxScreen'); }
function openConversation(c) { activeChat = c; show('inboxScreen'); markChatRead(); renderConversations(); renderChat(); }
function markChatRead() { if (!activeChat)
    return; messages.forEach(m => { if (m.listingId === activeChat.listingId && String(m.fromUserId) === activeChat.partnerId && String(m.toUserId) === String(user.id))
    m.read = true; }); socket.emit('chat:read', { listingId: activeChat.listingId, partnerId: activeChat.partnerId }); }
function renderChat() { if (!activeChat)
    return; $('#chatEmpty').classList.add('hidden'); $('#chatActive').classList.remove('hidden'); $('#chatName').textContent = activeChat.partnerName; $('#chatCar').textContent = activeChat.listingTitle; const arr = messages.filter(m => sameChatMessage(m, activeChat)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), box = $('#chatMessages'); box.innerHTML = ''; arr.forEach(m => { const mine = String(m.fromUserId) === String(user.id), d = document.createElement('div'); d.className = `bubble ${mine ? 'mine' : 'theirs'}`; d.innerHTML = `<p>${esc(m.text)}</p><small>${new Date(m.createdAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>`; box.appendChild(d); }); requestAnimationFrame(() => box.scrollTop = box.scrollHeight); }
function startChatWithListing(l) { const existing = getConversations().find(c => c.listingId === l.id && c.partnerId === String(l.sellerId)); activeChat = existing || { key: `${l.id}|${l.sellerId}`, listingId: l.id, listingTitle: `${l.brand} ${l.model}`, partnerId: String(l.sellerId), partnerName: l.sellerName }; closeCarModal(); openConversation(activeChat); }
$('#inboxBtn').onclick = showInbox;
$('#backMarket').onclick = () => show('marketScreen');
$('#closeChat').onclick = () => { activeChat = null; $('#chatActive').classList.add('hidden'); $('#chatEmpty').classList.remove('hidden'); renderConversations(); };
$('#sendChat').onclick = () => { const text = $('#chatText').value.trim(); if (activeChat && text)
    socket.emit('chat:send', { listingId: activeChat.listingId, toUserId: activeChat.partnerId, text }); };
$('#chatText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#sendChat').click();
} });
$('#openChatBtn').onclick = () => selected && startChatWithListing(selected);
$('#removeBtn').onclick = () => { if (selected) {
    socket.emit('listing:remove', selected.id);
    closeCarModal();
    toast('Оголошення знято');
} };
$$('.close-car-modal').forEach(x => x.onclick = closeCarModal);
