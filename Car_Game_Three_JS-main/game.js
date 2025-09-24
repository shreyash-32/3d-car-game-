/*
  3D Car Runner in Three.js
  - Scene init, player car, world, controls, enemies, collisions, HUD, restart
*/

// -------- Globals
let scene, renderer, camera;
let containerEl = document.getElementById('container');
let lastTime = 0;
let isGameOver = false;
let elapsedTime = 0;

// Player state
const laneXPositions = [-2.5, 0, 2.5];
let currentLaneIndex = 1; // middle
let targetLaneIndex = 1;
let playerSpeed = 0; // meters/sec
let targetSpeed = 14; // desired cruise speed
const maxForwardSpeed = 28;
const maxReverseSpeed = -6;
const acceleration = 18; // m/s^2
const brakingDecel = 28; // m/s^2
const steeringLerp = 10; // higher is snappier

let playerCar;
let playerBox = new THREE.Box3();

// Camera chase spring
const cameraOffset = new THREE.Vector3(0, 4.5, -10);
const cameraLookAtOffset = new THREE.Vector3(0, 1.2, 3);
const cameraFollowLerp = 3.0;

// World
let road;
let dashedLines = [];

// Enemies
const enemyPool = [];
const activeEnemies = [];
let spawnTimer = 0;
let spawnInterval = 1.2; // seconds; will ramp down
let enemyBaseSpeed = 14; // relative to world, they come toward player

// Score/HUD
let score = 0;
let scoreEl = document.getElementById('score');
let overlayEl = document.getElementById('overlay');
let finalScoreEl = document.getElementById('finalScore');
let highScoreEl = document.getElementById('highScore');
let finalHighScoreEl = document.getElementById('finalHighScore');
let highScore = Number(localStorage.getItem('carGameHighScore') || 0);
if (highScoreEl) highScoreEl.textContent = Math.floor(highScore).toString();
let restartBtn = document.getElementById('restartBtn');
let hasStarted = true;

// Input
const keys = new Set();

init();
animate(0);

function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0b0f1a, 1);
  containerEl.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(10, 20, 10);
  dir.castShadow = false;
  scene.add(dir);

  // World
  buildWorld();

  // Player car
  playerCar = buildCar(0x1f6feb, 0x17468f);
  playerCar.position.set(laneXPositions[currentLaneIndex], 0.5, 0);
  scene.add(playerCar);

  // Place camera behind the car to start
  camera.position.copy(new THREE.Vector3().copy(playerCar.position).add(cameraOffset));
  camera.lookAt(new THREE.Vector3().copy(playerCar.position).add(cameraLookAtOffset));

  // Event listeners
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => { keys.add(e.code); handleKeyPress(e); });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  restartBtn.addEventListener('click', restartGame);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function buildWorld() {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Grass
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x0f3d1e, roughness: 1 });
  const grassGeom = new THREE.PlaneGeometry(40, 400);
  const grass = new THREE.Mesh(grassGeom, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.z = 60;
  grass.receiveShadow = false;
  worldGroup.add(grass);

  // Road
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 1, metalness: 0 });
  const roadGeom = new THREE.PlaneGeometry(10, 400);
  road = new THREE.Mesh(roadGeom, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = 60;
  worldGroup.add(road);

  // Lane markers (dashed)
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf0f3f6, emissive: 0x101315, emissiveIntensity: 0.6 });
  const dashGeom = new THREE.BoxGeometry(0.2, 0.02, 1.2);
  dashedLines.length = 0;
  for (let lane = -1; lane <= 1; lane += 2) {
    for (let i = 0; i < 80; i++) {
      const dash = new THREE.Mesh(dashGeom, lineMat);
      dash.position.set(lane * 1.25, 0.011, i * 5);
      worldGroup.add(dash);
      dashedLines.push(dash);
    }
  }
}

function buildCar(bodyColor, cabinColor) {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 3.2),
    new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.2, roughness: 0.6 })
  );
  body.position.y = 0.5;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.6, 1.6),
    new THREE.MeshStandardMaterial({ color: cabinColor, metalness: 0.1, roughness: 0.4 })
  );
  cabin.position.set(0, 0.9, -0.3);
  car.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 16);

  function addWheel(x, z) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.35, z);
    car.add(w);
    return w;
  }

  const wheels = [
    addWheel(-0.8, -1.2),
    addWheel(0.8, -1.2),
    addWheel(-0.8, 1.1),
    addWheel(0.8, 1.1)
  ];
  car.userData.wheels = wheels;

  // Headlights
  const headLightMat = new THREE.MeshStandardMaterial({ color: 0xfff8c5, emissive: 0xfff1a1, emissiveIntensity: 1.6 });
  const hlGeom = new THREE.BoxGeometry(0.25, 0.12, 0.2);
  const hl1 = new THREE.Mesh(hlGeom, headLightMat);
  const hl2 = new THREE.Mesh(hlGeom, headLightMat);
  hl1.position.set(-0.4, 0.6, 1.6);
  hl2.position.set(0.4, 0.6, 1.6);
  car.add(hl1, hl2);

  // Shadow catcher offset via small y to avoid z-fighting
  car.position.y = 0;

  return car;
}

function createEnemy() {
  const color = Math.random() < 0.5 ? 0xff6b6b : 0x22c55e;
  const enemy = buildCar(color, 0x1f2937);
  enemy.scale.setScalar(1.0);
  enemy.userData.isEnemy = true;
  enemy.userData.velocityZ = -enemyBaseSpeed;
  enemy.visible = false;
  scene.add(enemy);
  return enemy;
}

function spawnEnemy() {
  const enemy = enemyPool.pop() || createEnemy();
  enemy.visible = true;
  const laneIndex = Math.floor(Math.random() * laneXPositions.length);
  const laneX = laneXPositions[laneIndex];
  const spawnZ = playerCar.position.z + 120; // far ahead in front of the car (positive z)
  enemy.position.set(laneX, 0.5, spawnZ);
  enemy.userData.velocityZ = -enemyBaseSpeed * (1 + Math.random() * 0.3);
  activeEnemies.push(enemy);
}

function recycleEnemy(enemy) {
  enemy.visible = false;
  activeEnemies.splice(activeEnemies.indexOf(enemy), 1);
  enemyPool.push(enemy);
}

function handleKeyPress(e) {
  if (isGameOver) return;
  if (e.code === 'ArrowLeft') {
    // With the camera looking forward (+Z), screen-left corresponds to increasing X
    targetLaneIndex = Math.min(laneXPositions.length - 1, targetLaneIndex + 1);
  } else if (e.code === 'ArrowRight') {
    targetLaneIndex = Math.max(0, targetLaneIndex - 1);
  }
}

function updateInput(dt) {
  if (keys.has('ArrowUp')) {
    targetSpeed = Math.min(maxForwardSpeed, targetSpeed + acceleration * dt);
  } else if (keys.has('ArrowDown')) {
    targetSpeed = Math.max(maxReverseSpeed, targetSpeed - brakingDecel * dt);
  } else {
    // ease speed towards a cruise when no input
    targetSpeed += (14 - targetSpeed) * Math.min(1, dt * 0.8);
  }
  // move playerSpeed towards targetSpeed
  const speedLerp = 6;
  playerSpeed += (targetSpeed - playerSpeed) * Math.min(1, dt * speedLerp);

  // lane steering
  const targetX = laneXPositions[targetLaneIndex];
  const dx = targetX - playerCar.position.x;
  playerCar.position.x += dx * Math.min(1, dt * steeringLerp);
}

function updateChaseCamera(dt) {
  const desiredPos = new THREE.Vector3().copy(playerCar.position).add(cameraOffset);
  camera.position.lerp(desiredPos, Math.min(1, dt * cameraFollowLerp));
  const lookTarget = new THREE.Vector3().copy(playerCar.position).add(cameraLookAtOffset);
  camera.lookAt(lookTarget);

  // Speed-based FOV kick for sense of speed
  const baseFov = 60;
  const maxKick = 6;
  const speedNorm = Math.max(0, Math.min(1, playerSpeed / maxForwardSpeed));
  const targetFov = baseFov + maxKick * speedNorm;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2);
  camera.updateProjectionMatrix();
}

function updateWorldScrolling(dt) {
  // Scroll dashed lines to simulate motion
  const worldMove = playerSpeed * dt;
  for (const dash of dashedLines) {
    dash.position.z -= worldMove;
    if (dash.position.z < -10) dash.position.z += 80 * 5; // wrap strip set
  }

  // Subtle emissive pulse on lane markers
  const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 2);
  for (const dash of dashedLines) {
    if (dash.material && dash.material.emissive !== undefined) {
      dash.material.emissiveIntensity = 0.4 + 0.2 * pulse;
    }
  }
}

function updateEnemies(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = spawnInterval;
  }

  const worldMove = playerSpeed * dt;
  for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];
    e.position.z += e.userData.velocityZ * dt - worldMove; // move towards player while world scrolls back
    if (e.position.z < playerCar.position.z - 10) {
      recycleEnemy(e);
    }
  }
}

function checkCollisions() {
  playerBox.setFromObject(playerCar);
  for (const e of activeEnemies) {
    const enemyBox = new THREE.Box3().setFromObject(e);
    if (playerBox.intersectsBox(enemyBox)) {
      return true;
    }
  }
  return false;
}

function updateHUD(dt) {
  // Award points based purely on survival time
  score += dt; // 1 point per second survived
  scoreEl.textContent = Math.floor(score).toString();
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('carGameHighScore', String(Math.floor(highScore)));
    if (highScoreEl) highScoreEl.textContent = Math.floor(highScore).toString();
  }
}

function difficultyRamp(elapsed) {
  // Gradually reduce spawn interval and increase enemy speed cap
  const t = Math.min(1, elapsed / 90); // reach max at 90s
  spawnInterval = 1.2 - 0.8 * t; // 1.2 -> 0.4s
  enemyBaseSpeed = 14 + 10 * t; // 14 -> 24
}

function gameOver() {
  isGameOver = true;
  finalScoreEl.textContent = Math.floor(score).toString();
  if (finalHighScoreEl) finalHighScoreEl.textContent = Math.floor(highScore).toString();
  overlayEl.classList.remove('hidden');
}

function restartGame() {
  // Reset state
  isGameOver = false;
  overlayEl.classList.add('hidden');
  hasStarted = true; // keep running after restart
  score = 0;
  if (highScoreEl) highScoreEl.textContent = Math.floor(highScore).toString();
  playerSpeed = 0;
  targetSpeed = 14;
  currentLaneIndex = 1;
  targetLaneIndex = 1;
  playerCar.position.set(laneXPositions[currentLaneIndex], 0.5, 0);

  // Recycle enemies
  while (activeEnemies.length) {
    recycleEnemy(activeEnemies[activeEnemies.length - 1]);
  }
}

function animate(ts) {
  const dt = Math.min(0.033, (ts - lastTime) / 1000 || 0);
  lastTime = ts;
  elapsedTime += dt;

  if (!isGameOver) {
    updateInput(dt);
    updateWorldScrolling(dt);
    updateEnemies(dt);
    updateChaseCamera(dt);
    updateWheels(dt);
    updateHUD(dt);
    difficultyRamp(ts / 1000);
    if (checkCollisions()) gameOver();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateWheels(dt) {
  // Rotate player wheels based on ground speed
  rotateCarWheels(playerCar, playerSpeed, dt);
  // Rotate enemy wheels based on their ground-relative speed
  for (const e of activeEnemies) {
    const groundSpeed = e.userData.velocityZ - playerSpeed; // z-forward positive
    rotateCarWheels(e, groundSpeed, dt);
  }

  // Apply car body lean and bob
  applyCarBodyMotion(dt);
}

function rotateCarWheels(car, linearSpeed, dt) {
  const wheels = car.userData && car.userData.wheels;
  if (!wheels) return;
  const wheelRadius = 0.35;
  const angularDelta = (linearSpeed / wheelRadius) * dt;
  for (const w of wheels) {
    w.rotation.x -= angularDelta;
  }
}

function applyCarBodyMotion(dt) {
  if (!playerCar) return;
  // Lean based on steering toward target lane
  const targetX = laneXPositions[targetLaneIndex];
  const dx = targetX - playerCar.position.x;
  const steeringAmount = Math.max(-1, Math.min(1, dx));
  const targetRoll = -steeringAmount * 0.15; // roll around Z
  playerCar.rotation.z += (targetRoll - playerCar.rotation.z) * Math.min(1, dt * 6);

  // Bob based on speed
  const speedNorm = Math.max(0, Math.min(1, playerSpeed / maxForwardSpeed));
  const bobAmp = 0.02 + 0.03 * speedNorm;
  const bobFreq = 6 + 6 * speedNorm;
  const bob = Math.sin(elapsedTime * bobFreq) * bobAmp;
  playerCar.position.y = 0.5 + bob;
}


