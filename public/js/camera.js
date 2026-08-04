/* AutoBazar — тимчасова камера без персонажа */

function updateCamera() {
  const camera = document.querySelector('#camera');
  const world = document.querySelector('#world');

  if (!camera || !world) {
    return;
  }

  /*
   * Тимчасово показуємо карту по центру.
   * Наступним кроком додамо рух пальцем.
   */
  world.style.transform = `
    perspective(2400px)
    translate3d(0, 0, 0)
    scale(0.5)
    rotateX(4deg)
    rotateZ(-1deg)
  `;

  const zoomValue = document.querySelector('#zoomValue');

  if (zoomValue) {
    zoomValue.textContent = '50%';
  }
}

function render() {
  if (!user) {
    return;
  }

  const crystalCount = document.querySelector('#crystalCount');

  if (crystalCount) {
    crystalCount.textContent = crystals;
  }

  const myCarsCount = document.querySelector('#myCarsCount');

  if (myCarsCount) {
    myCarsCount.textContent = myActiveCars().length;
  }

  renderSlots();
  renderConversations();
  updateCamera();
}