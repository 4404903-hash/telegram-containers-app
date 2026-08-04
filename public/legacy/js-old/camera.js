/* ========================================
   AutoBazar — рух карти без персонажа
======================================== */

let mapX = 0;
let mapY = 0;
let zoom = 0.55;

let draggingMap = false;
let startPointerX = 0;
let startPointerY = 0;
let startMapX = 0;
let startMapY = 0;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.2;

function updateCamera() {
  const world = document.getElementById("world");

  if (!world) {
    return;
  }

  world.style.transformOrigin = "0 0";

  world.style.transform = `
    translate3d(${mapX}px, ${mapY}px, 0)
    scale(${zoom})
    rotateX(4deg)
    rotateZ(-1deg)
  `;

  const zoomValue = document.getElementById("zoomValue");

  if (zoomValue) {
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  }
}

function centerMap() {
  const camera = document.getElementById("camera");
  const world = document.getElementById("world");

  if (!camera || !world) {
    return;
  }

  const worldWidth = world.offsetWidth || 2600;
  const worldHeight = world.offsetHeight || 2600;

  mapX = camera.clientWidth / 2 - (worldWidth * zoom) / 2;
  mapY = camera.clientHeight / 2 - (worldHeight * zoom) / 2;

  updateCamera();
}

function limitMapPosition() {
  const camera = document.getElementById("camera");
  const world = document.getElementById("world");

  if (!camera || !world) {
    return;
  }

  const padding = 150;
  const scaledWidth = world.offsetWidth * zoom;
  const scaledHeight = world.offsetHeight * zoom;

  const minX = camera.clientWidth - scaledWidth - padding;
  const maxX = padding;

  const minY = camera.clientHeight - scaledHeight - padding;
  const maxY = padding;

  if (scaledWidth <= camera.clientWidth) {
    mapX = (camera.clientWidth - scaledWidth) / 2;
  } else {
    mapX = Math.min(maxX, Math.max(minX, mapX));
  }

  if (scaledHeight <= camera.clientHeight) {
    mapY = (camera.clientHeight - scaledHeight) / 2;
  } else {
    mapY = Math.min(maxY, Math.max(minY, mapY));
  }
}

function beginMapDrag(event) {
  /*
   * Не рухаємо карту, якщо натиснули кнопку,
   * машину, меню, форму або модальне вікно.
   */
  if (
    event.target.closest(
      "button, input, textarea, select, .modal, .side-menu"
    )
  ) {
    return;
  }

  const camera = document.getElementById("camera");

  if (!camera) {
    return;
  }

  draggingMap = true;

  startPointerX = event.clientX;
  startPointerY = event.clientY;

  startMapX = mapX;
  startMapY = mapY;

  camera.setPointerCapture?.(event.pointerId);
}

function moveMap(event) {
  if (!draggingMap) {
    return;
  }

  mapX = startMapX + event.clientX - startPointerX;
  mapY = startMapY + event.clientY - startPointerY;

  limitMapPosition();
  updateCamera();
}

function stopMapDrag(event) {
  draggingMap = false;

  const camera = document.getElementById("camera");

  camera?.releasePointerCapture?.(event.pointerId);
}

function zoomMap(event) {
  event.preventDefault();

  const camera = document.getElementById("camera");

  if (!camera) {
    return;
  }

  const rect = camera.getBoundingClientRect();

  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;

  const worldXBefore = (pointerX - mapX) / zoom;
  const worldYBefore = (pointerY - mapY) / zoom;

  const direction = event.deltaY < 0 ? 1 : -1;
  const nextZoom = zoom + direction * 0.08;

  zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, nextZoom)
  );

  mapX = pointerX - worldXBefore * zoom;
  mapY = pointerY - worldYBefore * zoom;

  limitMapPosition();
  updateCamera();
}

function setupMapControls() {
  const camera = document.getElementById("camera");

  if (!camera) {
    return;
  }

  camera.style.touchAction = "none";

  camera.addEventListener("pointerdown", beginMapDrag);
  camera.addEventListener("pointermove", moveMap);
  camera.addEventListener("pointerup", stopMapDrag);
  camera.addEventListener("pointercancel", stopMapDrag);

  camera.addEventListener("wheel", zoomMap, {
    passive: false
  });

  window.addEventListener("resize", () => {
    limitMapPosition();
    updateCamera();
  });
}

function render() {
  if (!user) {
    return;
  }

  const myCarsCount =
    document.getElementById("myCarsCount");

  if (myCarsCount) {
    myCarsCount.textContent = myActiveCars().length;
  }

  renderSlots();
  renderConversations();
  updateCamera();
}

document.addEventListener("DOMContentLoaded", () => {
  setupMapControls();

  requestAnimationFrame(() => {
    centerMap();
  });
});