/* ========================================
   AutoBazar — модуль: core.js
   Усі модулі завантажуються послідовно через index.html.
======================================== */

/* 1. Підключення та глобальні налаштування */
const socket = io();
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.disableVerticalSwipes?.();
const MAP_SIZE = 2600, CENTER = 1300, INTERACTION_RADIUS = 175, VIP_PRICE = 10, VIP_SLOTS = 5, TOTAL_SLOTS = 50;
const COLOR_NAMES = { black: 'Чорний', white: 'Білий', silver: 'Срібний', red: 'Червоний', blue: 'Синій', green: 'Зелений', yellow: 'Жовтий', purple: 'Фіолетовий' };
let user = null, listings = [], messages = [], players = [], selected = null, activeChat = null, pos = { x: 1300, y: 760 }, crystals = 0, runStopTimer = null, joystickFrame = null, pendingSale = null, zoom = .5, dailyBonusAvailable = false, lastCreatedListingId = null;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
function show(id) { $$('.screen').forEach(x => x.classList.toggle('active', x.id === id)); }
function toast(text) { $('#toast').textContent = text; $('#toast').classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => $('#toast').classList.add('hidden'), 2600); }
function telegramDisplayName() { const u = tg?.initDataUnsafe?.user; return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || 'Гравець'; }
function demo() { let id = localStorage.getItem('abId'); if (!id) {
    id = 'demo-' + crypto.randomUUID();
    localStorage.setItem('abId', id);
} return { id, name: telegramDisplayName() }; }
