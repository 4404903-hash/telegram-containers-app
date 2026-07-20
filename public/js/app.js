const socket = io();
const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();

const zones = [
  [1,"До $5 000",0,4999],[2,"$5–10 тис.",5000,9999],[3,"$10–15 тис.",10000,14999],
  [4,"$15–20 тис.",15000,19999],[5,"Від $20 000",20000,Infinity]
];

let user=null, currentZone=1, mode="buy", listings=[], messages=[], selected=null;
let pos={x:50,y:50};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function show(id){$$(".screen").forEach(x=>x.classList.toggle("active",x.id===id))}
function toast(t){$("#toast").textContent=t;$("#toast").classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>$("#toast").classList.add("hidden"),2500)}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function demo(){let id=localStorage.getItem("abId");if(!id){id="demo-"+crypto.randomUUID();localStorage.setItem("abId",id)}return{id,name:"Гравець"}}

socket.emit("auth",{initData:tg?.initData||"",demoUser:demo()});
socket.on("auth:ok",d=>{user=d.user;listings=d.listings;messages=d.messages;$("#playerName").textContent=user.name;render();renderMessages()});
socket.on("auth:error",toast);socket.on("listing:error",toast);
socket.on("listing:created",x=>{mode="sell";currentZone=x.zone;show("marketScreen");toast(`Місце №${x.spot}`);render()});
socket.on("world:listings",x=>{listings=x;render()});
socket.on("message:new",x=>{messages.push(x);toast(`Нове повідомлення від ${x.fromName}`);renderMessages()});
socket.on("message:sent",x=>{messages.push(x);$("#messageText").value="";toast("Надіслано");renderMessages()});

function render(){
  if(!user)return;
  $("#tabs").innerHTML="";
  zones.forEach(z=>{
    const b=document.createElement("button");b.className=`tab ${z[0]===currentZone?"active":""}`;b.textContent=`${z[0]}. ${z[1]}`;
    b.onclick=()=>{currentZone=z[0];render()};$("#tabs").appendChild(b)
  });
  $("#zoneTitle").textContent=`Територія ${currentZone}: ${zones[currentZone-1][1]}`;
  $("#modeText").textContent=mode==="sell"?"Режим продавця":"Режим покупця";

  const grid=$("#grid");grid.innerHTML="";
  for(let i=1;i<=20;i++){
    const spot=document.createElement("div");spot.className="spot";spot.innerHTML=`<small>${i}</small>`;
    const l=listings.find(x=>x.zone===currentZone&&x.spot===i);
    if(l){
      const car=document.createElement("div");car.className="car";
      car.innerHTML=`<div class="car-icon">🚗</div><div class="car-info"><b>${esc(l.brand)} ${esc(l.model)}</b><br>${l.year} · $${Number(l.price).toLocaleString()}</div><div class="seller ${l.sellerOnline?"":"offline"}">🧍</div>`;
      car.onclick=()=>openCar(l);spot.appendChild(car)
    }
    grid.appendChild(spot)
  }
}

function openCar(l){
  selected=l;$("#mZone").textContent=`Територія ${l.zone} · місце ${l.spot}`;$("#mTitle").textContent=`${l.brand} ${l.model}`;
  $("#mYear").textContent=l.year;$("#mPrice").textContent="$"+Number(l.price).toLocaleString();$("#mSeller").textContent=l.sellerName;
  $("#mStatus").textContent=l.sellerOnline?"🟢 Онлайн":"⚫ Офлайн";$("#mDescription").textContent=l.description||"Без опису";
  const mine=String(l.sellerId)===String(user.id);$("#messageForm").classList.toggle("hidden",mine);$("#removeBtn").classList.toggle("hidden",!mine);$("#modal").classList.remove("hidden")
}
function closeModal(){$("#modal").classList.add("hidden");selected=null}

function renderMessages(){
  if(!user)return;
  const arr=messages.filter(m=>String(m.toUserId)===String(user.id)||String(m.fromUserId)===String(user.id)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const unread=arr.filter(m=>String(m.toUserId)===String(user.id)&&!m.read).length;$("#badge").textContent=unread;$("#badge").classList.toggle("hidden",!unread);
  $("#messages").innerHTML=arr.length?"":"<div class='panel'>Повідомлень немає</div>";
  arr.forEach(m=>{const incoming=String(m.toUserId)===String(user.id),d=document.createElement("div");d.className=`message ${incoming&&!m.read?"unread":""}`;
    d.innerHTML=`<b>${incoming?esc(m.fromName):"Ви → продавцю"}</b><p>${esc(m.text)}</p><small>${new Date(m.createdAt).toLocaleString("uk-UA")}</small>`;
    d.onclick=()=>{if(incoming&&!m.read){m.read=true;socket.emit("message:read",m.id);renderMessages()}};$("#messages").appendChild(d)})
}

$("#buyBtn").onclick=()=>{mode="buy";currentZone=1;show("marketScreen");render()};
$("#sellBtn").onclick=()=>show("sellScreen");$$(".back").forEach(b=>b.onclick=()=>show("startScreen"));$("#exitMarket").onclick=()=>show("startScreen");
$("#sellForm").price.oninput=e=>{const p=Number(e.target.value),z=zones.find(x=>p>=x[2]&&p<=x[3]);$("#zoneHint").textContent=z?`Територія ${z[0]}: ${z[1]}`:"Вкажи ціну"};
$("#sellForm").onsubmit=e=>{e.preventDefault();socket.emit("listing:create",Object.fromEntries(new FormData(e.currentTarget).entries()))};
$("#messageForm").onsubmit=e=>{e.preventDefault();if(selected)socket.emit("message:send",{listingId:selected.id,text:$("#messageText").value})};
$("#removeBtn").onclick=()=>{if(selected){socket.emit("listing:remove",selected.id);closeModal();toast("Оголошення знято")}};
$$(".close-modal").forEach(x=>x.onclick=closeModal);$("#inboxBtn").onclick=()=>{renderMessages();show("inboxScreen")};$("#backMarket").onclick=()=>show("marketScreen");

function move(dx,dy){pos.x=Math.max(3,Math.min(97,pos.x+dx));pos.y=Math.max(4,Math.min(94,pos.y+dy));$("#player").style.left=pos.x+"%";$("#player").style.top=pos.y+"%"}
const mv={up:[0,-3],down:[0,3],left:[-3,0],right:[3,0]};$$("[data-move]").forEach(b=>b.onclick=()=>move(...mv[b.dataset.move]));
window.onkeydown=e=>{const k={ArrowUp:[0,-2],w:[0,-2],ArrowDown:[0,2],s:[0,2],ArrowLeft:[-2,0],a:[-2,0],ArrowRight:[2,0],d:[2,0]};if(k[e.key]){e.preventDefault();move(...k[e.key])}}
