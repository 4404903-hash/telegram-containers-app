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

let currentViewSize = 50;

loader.load(
  "/assets/models/market.glb",

  (gltf) => {
    const market = gltf.scene;

    prepareAndFrameMarket(market);

    market.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    scene.add(market);

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

function prepareAndFrameMarket(market) {
  market.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(market);

  if (box.isEmpty()) {
    throw new Error("У market.glb немає видимої геометрії");
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  /*
   * Правильно центруємо модель через її геометрію.
   */
  market.position.set(
    -center.x,
    -box.min.y,
    -center.z
  );

  market.updateMatrixWorld(true);

  /*
   * Підганяємо камеру під реальні розміри карти.
   */
  const mapWidth = Math.max(size.x, 1);
  const mapDepth = Math.max(size.z, 1);
  const mapSize = Math.max(mapWidth, mapDepth);

  const viewSize = mapSize * 1.15; currentViewSize = viewSize;
  const aspect =
    container.clientWidth / container.clientHeight;

  camera.left = -(viewSize * aspect) / 2;
  camera.right = (viewSize * aspect) / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;

  /*
   * Камера прямо перед парковкою,
   * із нахилом приблизно 55°.
   */
  const distance = mapSize * 0.85;

  camera.position.set(
    0,
    distance,
    distance * 0.7
  );

  camera.near = 0.1;
  camera.far = mapSize * 10;
  camera.zoom = 1;

  controls.target.set(0, 0, 0);

  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();

  console.log("Розмір карти:", size);
  console.log("Центр карти:", center);
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
  const width =
    container.clientWidth || window.innerWidth;

  const height =
    container.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);

  const aspect = width / Math.max(height, 1);

  camera.left = -(currentViewSize * aspect) / 2;
  camera.right = (currentViewSize * aspect) / 2;
  camera.top = currentViewSize / 2;
  camera.bottom = -currentViewSize / 2;

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

const debugGrid = new THREE.GridHelper(
  60,
  30,
  0xffffff,
  0x607d8b
);

debugGrid.position.y = -0.01;
scene.add(debugGrid);