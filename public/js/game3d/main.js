import { GLTFLoader } from
  "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { OrbitControls } from
  "three/addons/controls/OrbitControls.js";

const container = document.getElementById("threeScene");
const loadingScreen =
  document.getElementById("loadingScreen");
const loadingStatus =
  document.getElementById("loadingStatus");

if (!container) {
  throw new Error("Не знайдено контейнер #threeScene");
}

/* Telegram */
const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
}

/* Three.js */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8faebc);

const camera = new THREE.OrthographicCamera(
  -10,
  10,
  10,
  -10,
  0.1,
  200
);

/*
 * Камера прямо перед парковкою.
 * Нахил до землі приблизно 55 градусів.
 */
camera.position.set(0, 15, 10.5);
camera.lookAt(0, 0, 0);
camera.zoom = 1;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 1.5)
);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

container.appendChild(renderer.domElement);

/* Освітлення */
scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x425447,
    2.2
  )
);

const sun = new THREE.DirectionalLight(
  0xffffff,
  3
);

sun.position.set(-10, 20, 12);
sun.castShadow = true;
scene.add(sun);

/* Керування картою */
const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.target.set(0, 0, 0);

controls.enableRotate = false;
controls.enablePan = true;
controls.enableZoom = true;
controls.enableDamping = true;

controls.dampingFactor = 0.08;
controls.panSpeed = 1.2;
controls.zoomSpeed = 0.8;

/*
 * false — карта рухається по землі,
 * а не піднімається вгору і вниз.
 */
controls.screenSpacePanning = false;

controls.minZoom = 0.55;
controls.maxZoom = 2.5;

controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

renderer.domElement.style.touchAction = "none";

controls.update();

const loader = new GLTFLoader();

loadingStatus.textContent = "Завантаження 3D-карти…";

loader.load(
  "/assets/models/market.glb",

  (gltf) => {
    const market = gltf.scene;

    centerAndScaleMarket(market);

    market.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    scene.add(market);

    camera.position.set(0, 15, 10.5);
    camera.zoom = 1;

    controls.target.set(0, 0, 0);

    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();

    loadingStatus.textContent = "Гра готова";

    setTimeout(() => {
      loadingScreen.classList.add("ready");
    }, 400);

    console.log("market.glb успішно завантажено");
  },

  (progress) => {
    if (!progress.total) {
      return;
    }

    const percent = Math.round(
      (progress.loaded / progress.total) * 100
    );

    loadingStatus.textContent =
      `Завантаження карти: ${percent}%`;
  },

  (error) => {
    console.error("Помилка market.glb:", error);

    loadingStatus.textContent =
      "Не вдалося завантажити карту";
  }
);

function centerAndScaleMarket(market) {
  market.updateMatrixWorld(true);

  /*
   * Спочатку знаходимо центр початкової моделі.
   */
  const originalBox =
    new THREE.Box3().setFromObject(market);

  const originalCenter =
    originalBox.getCenter(new THREE.Vector3());

  const originalSize =
    originalBox.getSize(new THREE.Vector3());

  /*
   * Переміщуємо центр карти в координату 0,0,0.
   */
  market.position.x -= originalCenter.x;
  market.position.y -= originalCenter.y;
  market.position.z -= originalCenter.z;

  /*
   * Масштабуємо карту приблизно до 18 одиниць.
   */
  const longestSide = Math.max(
    originalSize.x,
    originalSize.z
  );

  if (longestSide > 0) {
    const scale = 18 / longestSide;
    market.scale.setScalar(scale);
  }

  market.updateMatrixWorld(true);

  /*
   * Після масштабування ставимо нижню частину карти
   * точно на рівень землі Y = 0.
   */
  const scaledBox =
    new THREE.Box3().setFromObject(market);

  market.position.y -= scaledBox.min.y;

  market.updateMatrixWorld(true);
}

/* Нижнє меню */
const panels = {
  sellButton: "sellPanel",
  chatsButton: "chatsPanel",
  myListingsButton: "myListingsPanel"
};

function closePanels() {
  document
    .querySelectorAll(".panel")
    .forEach((panel) => {
      panel.classList.add("hidden");
    });
}

for (const [buttonId, panelId] of Object.entries(panels)) {
  document
    .getElementById(buttonId)
    ?.addEventListener("click", () => {
      closePanels();
      document
        .getElementById(panelId)
        ?.classList.remove("hidden");
    });
}

document
  .getElementById("buyButton")
  ?.addEventListener("click", closePanels);

document
  .querySelectorAll(".close-panel")
  .forEach((button) => {
    button.addEventListener("click", () => {
      document
        .getElementById(button.dataset.close)
        ?.classList.add("hidden");
    });
  });

/* Розмір сцени */
function resizeScene() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer.setSize(width, height, false);

  const aspect = width / height;
  const viewHeight = 20;

  camera.left = -(viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;

  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resizeScene);
resizeScene();

renderer.setAnimationLoop(() => {
  /*
   * Не дозволяємо панорамуванню підняти
   * центр камери над картою.
   */
  controls.target.y = 0;

  controls.update();
  renderer.render(scene, camera);
});

console.log("Чистий AutoBazar 3D запущено");