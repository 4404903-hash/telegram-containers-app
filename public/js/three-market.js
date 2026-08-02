import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("threeMarket");

if (!container) {
  throw new Error("Не знайдено контейнер #threeMarket");
}

/*
 * Розташування відповідає чинним 30 місцям:
 * №1–5 ліворуч від офісу
 * №6–10 праворуч
 * №11–20 середній ряд
 * №21–30 нижній ряд
 */
const SLOT_LAYOUT = [
  { id: 1, x: 220, y: 520 },
  { id: 2, x: 365, y: 520 },
  { id: 3, x: 510, y: 520 },
  { id: 4, x: 655, y: 520 },
  { id: 5, x: 800, y: 520 },

  { id: 6, x: 1200, y: 520 },
  { id: 7, x: 1345, y: 520 },
  { id: 8, x: 1490, y: 520 },
  { id: 9, x: 1635, y: 520 },
  { id: 10, x: 1780, y: 520 },

  { id: 11, x: 280, y: 900 },
  { id: 12, x: 440, y: 900 },
  { id: 13, x: 600, y: 900 },
  { id: 14, x: 760, y: 900 },
  { id: 15, x: 920, y: 900 },
  { id: 16, x: 1080, y: 900 },
  { id: 17, x: 1240, y: 900 },
  { id: 18, x: 1400, y: 900 },
  { id: 19, x: 1560, y: 900 },
  { id: 20, x: 1720, y: 900 },

  { id: 21, x: 280, y: 1280 },
  { id: 22, x: 440, y: 1280 },
  { id: 23, x: 600, y: 1280 },
  { id: 24, x: 760, y: 1280 },
  { id: 25, x: 920, y: 1280 },
  { id: 26, x: 1080, y: 1280 },
  { id: 27, x: 1240, y: 1280 },
  { id: 28, x: 1400, y: 1280 },
  { id: 29, x: 1560, y: 1280 },
  { id: 30, x: 1720, y: 1280 }
];

const MAP_PIXELS = 2000;
const WORLD_SIZE = 24;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fa5b2);

/*
 * Ортографічна камера дає ізометричний вигляд
 * без сильного викривлення перспективи.
 */
const camera = new THREE.OrthographicCamera(
  -12,
  12,
  8,
  -8,
  0.1,
  200
);

camera.position.set(17, 21, 22);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
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
    0x31483a,
    2.1
  )
);

const sun = new THREE.DirectionalLight(
  0xffffff,
  3.2
);

sun.position.set(-12, 25, 16);
sun.castShadow = true;

sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;

scene.add(sun);

/* Групи сцени */
const marketGroup = new THREE.Group();
const slotGroup = new THREE.Group();
const carGroup = new THREE.Group();

scene.add(marketGroup);
scene.add(slotGroup);
scene.add(carGroup);

/* Завантажувач моделі */
const loader = new GLTFLoader();

let originalCarModel = null;
let carLoadFailed = false;

/* Кеш 3D-машин за номером місця */
const renderedCars = new Map();

/* Створюємо територію */
createGround();
createRoad();
createAllParkingSlots();
loadCarModel();
resizeRenderer();

/*
 * Стежимо за 2D-шаром.
 * Коли сервер надішле оголошення й renderSlots()
 * створить HTML-машини, ми автоматично створимо
 * відповідні 3D-машини.
 */
const slotLayer = document.getElementById("slotLayer");

if (slotLayer) {
  const observer = new MutationObserver(() => {
    syncCarsFromGame();
  });

  observer.observe(slotLayer, {
    childList: true,
    subtree: true,
    attributes: true
  });
}

window.addEventListener("resize", resizeRenderer);

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});

/* =========================================================
   СТВОРЕННЯ КАРТИ
========================================================= */

function createGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshStandardMaterial({
      color: 0x555b60,
      roughness: 0.96,
      metalness: 0
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  marketGroup.add(ground);

  /*
   * Темна основа під територією.
   */
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(24.8, 0.3, 18.8),
    new THREE.MeshStandardMaterial({
      color: 0x242c31,
      roughness: 0.9
    })
  );

  border.position.y = -0.18;
  border.receiveShadow = true;

  marketGroup.add(border);
}

function createRoad() {
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x303940,
      roughness: 1
    })
  );

  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.012, 10.2);

  marketGroup.add(road);

  const roadLineMaterial = new THREE.MeshBasicMaterial({
    color: 0xe7e3cd
  });

  for (let x = -10; x <= 10; x += 3) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.025, 0.1),
      roadLineMaterial
    );

    line.position.set(x, 0.03, 10.2);
    marketGroup.add(line);
  }
}

function createAllParkingSlots() {
  for (const slot of SLOT_LAYOUT) {
    const position = mapToWorld(slot.x, slot.y);

    const object = createParkingSlot(slot.id);

    object.position.set(
      position.x,
      0.025,
      position.z
    );

    slotGroup.add(object);
  }
}

function createParkingSlot(slotId) {
  const group = new THREE.Group();

  const isVip = slotId <= 10;

  const material = new THREE.MeshBasicMaterial({
    color: isVip ? 0xf4cf44 : 0xffffff
  });

  const width = 1.55;
  const length = 3.1;
  const thickness = 0.07;

  const leftLine = new THREE.Mesh(
    new THREE.BoxGeometry(
      thickness,
      0.025,
      length
    ),
    material
  );

  leftLine.position.x = -width / 2;

  const rightLine = leftLine.clone();
  rightLine.position.x = width / 2;

  const backLine = new THREE.Mesh(
    new THREE.BoxGeometry(
      width,
      0.025,
      thickness
    ),
    material
  );

  backLine.position.z = -length / 2;

  group.add(leftLine, rightLine, backLine);

  if (isVip) {
    const vipFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(
        width - 0.08,
        length - 0.08
      ),
      new THREE.MeshBasicMaterial({
        color: 0xc39d20,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      })
    );

    vipFloor.rotation.x = -Math.PI / 2;
    vipFloor.position.y = -0.01;

    group.add(vipFloor);
  }

  return group;
}

/* =========================================================
   ЗАВАНТАЖЕННЯ ТА ВІДОБРАЖЕННЯ МАШИН
========================================================= */

function loadCarModel() {
  loader.load(
    "/assets/models/cars/sedan.glb",

    (gltf) => {
      originalCarModel = gltf.scene;

      normalizeCarModel(originalCarModel);

      syncCarsFromGame();

      console.log(
        "3D-модель автомобіля завантажена"
      );
    },

    undefined,

    (error) => {
      carLoadFailed = true;

      console.error(
        "Не вдалося завантажити sedan.glb:",
        error
      );
    }
  );
}

function syncCarsFromGame() {
  if (!originalCarModel || carLoadFailed) {
    return;
  }

  const activeSlotIds = new Set();

  document
    .querySelectorAll(".parking-slot")
    .forEach((slotElement) => {
      const carElement =
        slotElement.querySelector(".car");

      if (!carElement) {
        return;
      }

      const slotId = Number(
        slotElement.dataset.slotId
      );

      if (!Number.isInteger(slotId)) {
        return;
      }

      activeSlotIds.add(slotId);

      if (renderedCars.has(slotId)) {
        return;
      }

      const imageElement =
        carElement.querySelector("img");

      const color = getCarColorFromImage(
        imageElement?.getAttribute("src") || ""
      );

      addCarToSlot(slotId, color);
    });

  /*
   * Прибираємо 3D-машини, якщо оголошення зняли.
   */
  for (const [slotId, car] of renderedCars) {
    if (!activeSlotIds.has(slotId)) {
      carGroup.remove(car);
      disposeObject(car);
      renderedCars.delete(slotId);
    }
  }
}

function addCarToSlot(slotId, colorName) {
  const slot = SLOT_LAYOUT.find(
    (item) => item.id === slotId
  );

  if (!slot) {
    return;
  }

  const car = originalCarModel.clone(true);

  cloneMaterials(car);
  setCarColor(car, colorName);

  const position = mapToWorld(slot.x, slot.y);

  car.position.set(
    position.x,
    0.035,
    position.z
  );

  /*
   * Машини стоять вертикально відносно рядів.
   * За потреби змінюй Math.PI / 2.
   */
  car.rotation.y = 0;

  carGroup.add(car);
  renderedCars.set(slotId, car);
}

function normalizeCarModel(car) {
  const initialBox = new THREE.Box3().setFromObject(car);
  const initialSize = initialBox.getSize(
    new THREE.Vector3()
  );

  const currentLength = Math.max(
    initialSize.x,
    initialSize.z
  );

  if (currentLength <= 0) {
    throw new Error(
      "GLB-модель має неправильний розмір"
    );
  }

  const targetLength = 2.55;
  const scale = targetLength / currentLength;

  car.scale.setScalar(scale);

  /*
   * Перераховуємо межі після зміни масштабу.
   */
  car.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(car);
  const center = box.getCenter(
    new THREE.Vector3()
  );

  car.position.x -= center.x;
  car.position.z -= center.z;
  car.position.y -= box.min.y;

  car.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function cloneMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material = child.material.map(
        (material) => material.clone()
      );
    } else {
      child.material = child.material.clone();
    }
  });
}

function setCarColor(car, colorName) {
  const colors = {
    black: "#15191d",
    white: "#eceff1",
    silver: "#aeb7bd",
    red: "#b71926",
    blue: "#175caa",
    green: "#18764e",
    yellow: "#e4b928",
    purple: "#64268c"
  };

  const selectedColor =
    colors[colorName] || colors.silver;

  let bodyMaterialChanged = false;

  car.traverse((object) => {
    if (!object.isMesh || !object.material) {
      return;
    }

    const objectName =
      String(object.name || "").toLowerCase();

    const materialName =
      String(object.material.name || "")
        .toLowerCase();

    const looksLikeBody =
      objectName.includes("body") ||
      objectName.includes("carpaint") ||
      materialName.includes("body") ||
      materialName.includes("paint");

    if (looksLikeBody) {
      object.material.color.set(selectedColor);
      bodyMaterialChanged = true;
    }
  });

  /*
   * Якщо в Blender кузов не названий Body,
   * тимчасово фарбуємо перший придатний mesh.
   */
  if (!bodyMaterialChanged) {
    car.traverse((object) => {
      if (
        bodyMaterialChanged ||
        !object.isMesh ||
        !object.material
      ) {
        return;
      }

      object.material.color.set(selectedColor);
      bodyMaterialChanged = true;
    });
  }
}

function getCarColorFromImage(src) {
  const match = src.match(
    /\/(black|white|silver|red|blue|green|yellow|purple)\.png/i
  );

  return match ? match[1].toLowerCase() : "silver";
}

/* =========================================================
   ДОПОМІЖНІ ФУНКЦІЇ
========================================================= */

function mapToWorld(mapX, mapY) {
  /*
   * Перетворює координати старої карти 0–2000
   * у координати Three.js приблизно -12…12.
   */
  return {
    x: (mapX / MAP_PIXELS - 0.5) * WORLD_SIZE,
    z: (mapY / MAP_PIXELS - 0.5) * WORLD_SIZE
  };
}

function resizeRenderer() {
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

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry?.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach(
        (material) => material.dispose()
      );
    } else {
      child.material?.dispose();
    }
  });
}