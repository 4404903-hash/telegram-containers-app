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
 * Камера прямо перед парковкою,
 * із нахилом приблизно 55°.
 */
camera.position.set(0, 18, 12);
camera.lookAt(0, 0, 0);

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
controls.screenSpacePanning = true;

controls.minZoom = 0.6;
controls.maxZoom = 2.5;

controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

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

  const box = new THREE.Box3().setFromObject(market);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  market.position.x -= center.x;
  market.position.z -= center.z;
  market.position.y -= box.min.y;

  const longestSide = Math.max(size.x, size.z);

  if (longestSide > 0) {
    const targetSize = 18;
    const scale = targetSize / longestSide;

    market.scale.setScalar(scale);
  }
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
  controls.update();
  renderer.render(scene, camera);
});

console.log("Чистий AutoBazar 3D запущено");