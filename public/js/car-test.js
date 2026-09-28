import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const container = document.getElementById("carScene");
const statusElement = document.getElementById("status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x888888);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);

camera.position.set(5, 8, 8);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

renderer.setSize(
  container.clientWidth,
  container.clientHeight
);

renderer.shadowMap.enabled = false;

container.appendChild(renderer.domElement);

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.target.set(0, 0.8, 0);

const hemisphereLight = new THREE.HemisphereLight(
  0xffffff,
  0x263238,
  1.5
);

scene.add(hemisphereLight);

const sunLight = new THREE.DirectionalLight(
  0xffffff,
  2
);

sunLight.position.set(6, 10, 8);
sunLight.castShadow = true;

scene.add(sunLight);

const loader = new GLTFLoader();

loader.load(
  "/assets/models/sedan.glb",

  (gltf) => {
    const car = gltf.scene;

    car.position.set(0, 0, 0);
    car.scale.setScalar(1);
    car.rotation.y = 0;

    car.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      object.castShadow = true;
      object.receiveShadow = true;
    });

    scene.add(car);

    statusElement.textContent = "Машину завантажено";
  },

  undefined,

  (error) => {
    console.error("Помилка завантаження GLB:", error);

    statusElement.textContent =
      "Не вдалося завантажити sedan.glb";
  }
);

function resizeScene() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
}

window.addEventListener("resize", resizeScene);

function animate() {
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
