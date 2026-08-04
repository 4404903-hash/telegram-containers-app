import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const container = document.getElementById("threeMarket");

if (!container) {
  throw new Error("Не знайдено #threeMarket");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7c4);

const camera = new THREE.OrthographicCamera(
  -10,
  10,
  10,
  -10,
  0.1,
  200
);

/*
 * Камера дивиться прямо на передню частину парковки.
 * Кут до землі приблизно 56 градусів.
 */
camera.position.set(0, 18, 12);
camera.lookAt(0, 0, 0);
controls.target.set(0, 0, 0);

controls.enableRotate = false;
controls.enablePan = true;
controls.enableZoom = true;
controls.enableDamping = true;

controls.screenSpacePanning = true;

controls.minZoom = 0.65;
controls.maxZoom = 2.4;

controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

controls.update();

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

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x425444,
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

/* Рух карти пальцем і мишкою */
const controls = new OrbitControls(
  camera,
  renderer.domElement
);

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

const loader = new GLTFLoader();

loader.load(
  "/assets/models/market.glb",

  (gltf) => {
    const market = gltf.scene;

    prepareMarket(market);
    scene.add(market);

    console.log("Власну 3D-карту AutoBazar завантажено");
  },

  undefined,

  (error) => {
    console.error(
      "Не вдалося завантажити market.glb:",
      error
    );
  }
);

function prepareMarket(market) {
  market.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(market);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  market.position.x -= center.x;
  market.position.z -= center.z;
  market.position.y -= box.min.y;

  const longestSide = Math.max(size.x, size.z);

  if (longestSide > 0) {
    const scale = 18 / longestSide;
    market.scale.setScalar(scale);
  }

  market.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function resize() {
  const width =
    container.clientWidth || window.innerWidth;

  const height =
    container.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);

  const aspect = width / height;
  const viewHeight = 20;

  camera.left = -(viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;

  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});