import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("threeMarket");

if (!container) {
  console.error("Не знайдено #threeMarket");
} else {
  createThreeMarket(container);
}

function createThreeMarket(container) {
  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -10,
    10,
    10,
    -10,
    0.1,
    100
  );

  /*
   * Легкий вид під кутом.
   */
  camera.position.set(8, 13, 11);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 1.5)
  );

  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  /*
   * Освітлення.
   */
  scene.add(
    new THREE.HemisphereLight(
      0xffffff,
      0x3d4b45,
      2.2
    )
  );

  const sun = new THREE.DirectionalLight(
    0xffffff,
    3
  );

  sun.position.set(8, 15, 10);
  sun.castShadow = true;

  scene.add(sun);

  /*
   * Тестовий асфальт.
   */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 16),
    new THREE.MeshStandardMaterial({
      color: 0x55595d,
      roughness: 0.95
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  scene.add(ground);

  /*
   * Розмітка тестового паркомісця.
   */
  const slot = createParkingSlot();
  slot.position.set(-5.5, 0.015, 0);

  scene.add(slot);

  /*
   * Завантажуємо одну машину.
   */
  const loader = new GLTFLoader();

  loader.load(
    "/assets/models/cars/sedan.glb",

    (gltf) => {
      const car = gltf.scene;

      prepareCar(car);

      /*
       * Ставимо на тестове місце.
       */
      car.position.set(-5.5, 0, 0);
      car.rotation.y = Math.PI / 2;

      scene.add(car);

      console.log("Спільна 3D-сцена AutoBazar запущена");
    },

    undefined,

    (error) => {
      console.error(
        "Помилка завантаження sedan.glb:",
        error
      );
    }
  );

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    renderer.setSize(width, height, false);

    const aspect = width / height;
    const viewHeight = 18;

    camera.left = -(viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;

    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}

function createParkingSlot() {
  const group = new THREE.Group();

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff
  });

  const width = 2.2;
  const length = 4.5;
  const line = 0.08;

  const left = new THREE.Mesh(
    new THREE.BoxGeometry(line, 0.02, length),
    material
  );

  left.position.x = -width / 2;

  const right = left.clone();
  right.position.x = width / 2;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.02, line),
    material
  );

  back.position.z = -length / 2;

  group.add(left, right, back);

  return group;
}

function prepareCar(car) {
  /*
   * Автоматично центруємо модель.
   */
  const box = new THREE.Box3().setFromObject(car);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  car.position.x -= center.x;
  car.position.y -= box.min.y;
  car.position.z -= center.z;

  /*
   * Автоматично масштабуємо приблизно
   * під довжину паркомісця.
   */
  const targetLength = 3.8;
  const currentLength = Math.max(size.x, size.z);
  const scale = targetLength / currentLength;

  car.scale.setScalar(scale);

  car.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
  });
}