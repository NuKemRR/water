import './style.css'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import Water from './Water.js'
import DebugUI from "./DebugUI.js";

const params = {
    delta: 0.0,
    elapsedTime: 0.0
}

const renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const d = 10;
camera.position.set(d, d, d);

const scene = new THREE.Scene();

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
sun.position.set(0, 10000, 10000);

const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

const controls = new OrbitControls(camera, renderer.domElement);
const water = new Water(camera);
new DebugUI();
const timer = new THREE.Timer();
timer.connect(document);

const testMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 2, 2), new THREE.MeshStandardMaterial({
    roughness: 1.0,
    metalness: 0.0,
    color: 0x202030
}))
testMesh.position.set(0, -5, 0)
testMesh.rotateX(-Math.PI / 2);
scene.add(testMesh);

for (let i = 0; i < 20; i++) {
    const r = THREE.MathUtils.randFloat(10, 30);
    const geo = new THREE.CylinderGeometry(3, 3, r);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x33cdf1,
        roughness: Math.random(),
        metalness: Math.random()
    }));

    const x = 20 + Math.random() * 50;
    mesh.position.set(Math.sin(i) * x, THREE.MathUtils.randFloat(-2, 2), Math.cos(i) * x);
    scene.add(mesh);
}

scene.add(water.getMesh());
scene.add(sun);
scene.add(ambientLight)

function update() {
    stats.begin();

    requestAnimationFrame(update);

    params.delta = timer.getDelta();
    params.elapsedTime = timer.getElapsed()

    timer.update();

    water.update(params.delta);

    water.renderFBO(camera, scene, renderer);

    controls.update();
    renderer.render(scene, camera);

    stats.end();
}

update();
