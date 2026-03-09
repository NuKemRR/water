import './style.css'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import Water from './Water.js'
import DebugUI from "./DebugUI.js";
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const params = {
    delta: 0.0,
    elapsedTime: 0.0
}

const renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const d = 10;
camera.position.set(d, d, d);

const scene = new THREE.Scene();

const sun = new THREE.DirectionalLight(0xffffff, 0.5);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
sun.position.set(1, 10, 10);

const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

const loader = new THREE.TextureLoader()
const controls = new OrbitControls(camera, renderer.domElement);
const water = new Water(loader);
new DebugUI();
const timer = new THREE.Timer();
timer.connect(document);

const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial({color: 0x202030, roughness: 1.0, metalness: 1.0})
const matFloor = new THREE.MeshStandardMaterial({color: 0x707070, roughness: 1.0, metalness: 1.0})
const height = -25;
const yScale = 60;

const mesh0 = new THREE.Mesh(geo, mat);
mesh0.scale.set(20, yScale, 150)
mesh0.position.set(80, height, 0);

const mesh1 = new THREE.Mesh(geo, mat);
mesh1.scale.set(20, yScale, 150)
mesh1.position.set(-80, height, 0);

const mesh2 = new THREE.Mesh(geo, mat);
mesh2.scale.set(150, yScale, 20)
mesh2.position.set(0, height, 80);

const mesh3 = new THREE.Mesh(geo, mat);
mesh3.scale.set(150, yScale, 20)
mesh3.position.set(0, height, -80);

const mesh4 = new THREE.Mesh(geo, matFloor);
mesh4.scale.set(1000, 1, 1000)
mesh4.position.set(0, -50, 0);

scene.add(water.getMesh());
scene.add(sun);
scene.add(ambientLight);
scene.add(mesh0);
scene.add(mesh1);
scene.add(mesh2);
scene.add(mesh3);
scene.add(mesh4);

const hdrLoader = new HDRLoader();

hdrLoader.load('public/skybox.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
    renderer.toneMappingExposure = 1.0;
});

function update() {
    stats.begin();

    requestAnimationFrame(update);

    params.delta = timer.getDelta();
    params.elapsedTime = timer.getElapsed()

    if (water.material.userData.shader) {
        water.material.userData.shader.uniforms.uMoveFactor.value += 0.05 * params.delta;
        water.material.userData.shader.uniforms.uMoveFactor.value %= 1.0;
    }

    timer.update();

    water.update(camera);
    water.renderFBO(camera, scene, renderer);

    controls.update();
    renderer.render(scene, camera);

    stats.end();
}

window.addEventListener("resize", () => {

    renderer.setSize(window.innerWidth, window.innerHeight);

    water.reflectionTarget.setSize(window.innerWidth, window.innerHeight);
    water.refractionTarget.setSize(window.innerWidth, window.innerHeight);

});

update();
