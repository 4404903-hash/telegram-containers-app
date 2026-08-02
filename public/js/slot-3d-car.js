import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("testCar3dSlot11");

if (!container) {
  console.warn("Не знайдено контейнер #testCar3dSlot11");
} else {
  createTestCar(container);
}

function createTestCar(container) {
  const width = container.clientWidth || 120;
  const height = container.clientHeight || 210;

  const scene = new THREE.Scene();

  /*
   * Прозорий фон, щоб було видно паркомісце під машиною.
   */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 1.5)
  );

  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  container.appendChild(renderer.domElement);

  /*
   * Ортографічна камера краще підходить для вигляду зверху.
   */
  const camera = new THREE.OrthographicCamera(
    -2.2,
    2.2,
    3.8,
    -3.8,
    0.1,
    100
  );

  camera.position.set(0, 8, 0.01);
  camera.lookAt(0, 0, 0);

  const hemisphereLight = new THREE.HemisphereLight(
    0xffffff,
    0x444444,
    2.4
  );

  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(
    0xffffff,
    3
  );

  sunLight.position.set(4, 8, 5);
  scene.add(sunLight);

  const loader = new GLTFLoader();

  loader.load(
    "/assets/models/cars/sedan.glb",

    (gltf) => {
      const car = gltf.scene;

      /*
       * Якщо модель занадто велика або мала,
       * змінюй тільки це число.
       */
      car.scale.setScalar(1);

      /*
       * Положення моделі в центрі контейнера.
       */
      car.position.set(0, 0, 0);

      /*
       * Якщо машина повернута боком:
       * Math.PI / 2 = 90 градусів
       * Math.PI = 180 градусів
       */
      car.rotation.y = 0;

      car.traverse((object) => {
        if (!object.isMesh) {
          return;
        }

        object.castShadow = false;
        object.receiveShadow = false;
      });

      /*
       * Автоматично ставимо модель по центру.
       */
      centerModel(car);

      scene.add(car);

      console.log("3D-машину додано на місце №11");
    },

    undefined,

    (error) => {
      console.error(
        "Не вдалося завантажити sedan.glb:",
        error
      );
    }
  );

  function render() {
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(render);
}

function centerModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;

  /*
   * Ставимо нижню частину моделі на рівень землі.
   */
  model.position.y -= box.min.y;
}