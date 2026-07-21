const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";
const STORE_PATH = path.join(__dirname, "data", "store.json");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: res => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));

let store = { listings: [], messages: [] };
try {
  if (fs.existsSync(STORE_PATH)) store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
} catch {}

function saveStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function zoneForPrice(price) {
  if (price < 5000) return 1;
  if (price < 10000) return 2;
  if (price < 15000) return 3;
  if (price < 20000) return 4;
  return 5;
}

function availableSpot(zone) {
  const occupied = new Set(store.listings.filter(x => x.zone === zone && x.status === "active").map(x => x.spot));
  for (let i = 1; i <= 20; i++) if (!occupied.has(i)) return i;
  return null;
}

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;
  params.delete("hash");

  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(receivedHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try { return JSON.parse(params.get("user") || "null"); } catch { return null; }
}

const onlineUsers = new Map();
const onlinePlayers = new Map();

function publicListings() {
  return store.listings.filter(x => x.status === "active").map(x => ({
    ...x,
    sellerOnline: onlineUsers.has(String(x.sellerId))
  }));
}

function publicPlayers() {
  return [...onlinePlayers.values()].map(p => ({
    id: p.id,
    name: p.name,
    zone: p.zone,
    x: p.x,
    y: p.y,
    moving: Boolean(p.moving),
    faceLeft: Boolean(p.faceLeft)
  }));
}

function emitWorld() {
  io.emit("world:listings", publicListings());
  io.emit("world:players", publicPlayers());
}

io.on("connection", socket => {
  let user = null;

  socket.on("auth", payload => {
    const tgUser = validateTelegramInitData(payload?.initData || "");
    if (tgUser) {
      user = {
        id: String(tgUser.id),
        name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" "),
        username: tgUser.username || ""
      };
    } else if (DEMO_MODE) {
      user = {
        id: String(payload?.demoUser?.id || `demo-${socket.id}`),
        name: String(payload?.demoUser?.name || "Demo Player").slice(0, 40),
        username: ""
      };
    } else {
      socket.emit("auth:error", "Не вдалося підтвердити Telegram-користувача");
      return;
    }

    onlineUsers.set(user.id, socket.id);
    onlinePlayers.set(user.id, {
      id: user.id,
      name: user.name,
      zone: 1,
      x: 50,
      y: 50,
      moving: false,
      faceLeft: false,
      socketId: socket.id
    });
    socket.join(`user:${user.id}`);

    socket.emit("auth:ok", {
      user,
      listings: publicListings(),
      messages: store.messages.filter(m =>
        String(m.toUserId) === user.id || String(m.fromUserId) === user.id
      ),
      players: publicPlayers()
    });
    emitWorld();
  });


  socket.on("player:update", payload => {
    if (!user) return;
    const player = onlinePlayers.get(user.id);
    if (!player) return;

    const zone = Number(payload?.zone);
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (!Number.isInteger(zone) || zone < 1 || zone > 5) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    player.zone = zone;
    player.x = Math.max(0, Math.min(100, x));
    player.y = Math.max(0, Math.min(100, y));
    player.moving = Boolean(payload?.moving);
    player.faceLeft = Boolean(payload?.faceLeft);

    socket.broadcast.emit("player:updated", {
      id: player.id,
      name: player.name,
      zone: player.zone,
      x: player.x,
      y: player.y,
      moving: player.moving,
      faceLeft: player.faceLeft
    });
  });

  socket.on("listing:create", payload => {
    if (!user) return;

    const price = Number(payload.price);
    const year = Number(payload.year);
    const brand = String(payload.brand || "").trim().slice(0, 30);
    const model = String(payload.model || "").trim().slice(0, 30);
    const description = String(payload.description || "").trim().slice(0, 700);

    if (!brand || !model || !Number.isFinite(price) || price <= 0 ||
        !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) {
      socket.emit("listing:error", "Перевір марку, модель, рік і ціну");
      return;
    }

    if (store.listings.some(x => String(x.sellerId) === user.id && x.status === "active")) {
      socket.emit("listing:error", "У MVP один гравець може продавати одну машину");
      return;
    }

    const zone = zoneForPrice(price);
    const spot = availableSpot(zone);
    if (spot === null) {
      socket.emit("listing:error", "У цій території всі 20 місць зайняті");
      return;
    }

    const listing = {
      id: crypto.randomUUID(),
      sellerId: user.id,
      sellerName: user.name,
      brand, model, year, price, description,
      zone, spot,
      status: "active",
      createdAt: new Date().toISOString()
    };

    store.listings.push(listing);
    saveStore();
    socket.emit("listing:created", listing);
    emitWorld();
  });

  socket.on("listing:remove", listingId => {
    if (!user) return;
    const listing = store.listings.find(x => x.id === listingId);
    if (!listing || String(listing.sellerId) !== user.id) return;
    listing.status = "removed";
    saveStore();
    emitWorld();
  });

  socket.on("message:send", payload => {
    if (!user) return;
    const listing = store.listings.find(x => x.id === payload.listingId && x.status === "active");
    const text = String(payload.text || "").trim().slice(0, 500);
    if (!listing || !text || String(listing.sellerId) === user.id) return;

    const message = {
      id: crypto.randomUUID(),
      listingId: listing.id,
      fromUserId: user.id,
      fromName: user.name,
      toUserId: String(listing.sellerId),
      text,
      read: false,
      createdAt: new Date().toISOString()
    };

    store.messages.push(message);
    saveStore();
    io.to(`user:${message.toUserId}`).emit("message:new", message);
    socket.emit("message:sent", message);
  });

  socket.on("message:read", messageId => {
    if (!user) return;
    const message = store.messages.find(x => x.id === messageId);
    if (message && String(message.toUserId) === user.id) {
      message.read = true;
      saveStore();
    }
  });

  socket.on("disconnect", () => {
    if (user && onlineUsers.get(user.id) === socket.id) {
      onlineUsers.delete(user.id);
      onlinePlayers.delete(user.id);
      socket.broadcast.emit("player:left", { id: user.id });
      emitWorld();
    }
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

server.listen(PORT, () => console.log(`AutoBazar: http://localhost:${PORT}`));
