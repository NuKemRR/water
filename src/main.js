import './style.css'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import Water from './Water.js'
import DebugUI from "./DebugUI.js";
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

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
camera.position.set(-1.842527014360247, 0.4111996693081914, -4.197380284182957);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3081ff);

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
sun.position.set(0, 1000, 0);

const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

const loader = new THREE.TextureLoader()
const controls = new OrbitControls(camera, renderer.domElement);
const water = new Water(loader, camera);
new DebugUI(water);
const timer = new THREE.Timer();
timer.connect(document);

scene.add(water.getMesh());
scene.add(sun);
scene.add(ambientLight);

//const hdrLoader = new HDRLoader();
//
//hdrLoader.load('/skybox.hdr', (texture) => {
//    texture.mapping = THREE.EquirectangularReflectionMapping;
//    scene.background = texture;
//    scene.environment = texture;
//    renderer.toneMappingExposure = 1.0;
//});

const gltfLoader = new GLTFLoader();
gltfLoader.load(
    '/terrain_mesh_test_water.glb',
    (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 2, 0);
        scene.add(model);

        console.log("Model loaded successfully!", gltf);
    },
    (xhr) => {
    },
    (error) => {
        console.error('An error happened', error);
    }
);

function update() {
    stats.begin();

    requestAnimationFrame(update);

    params.delta = timer.getDelta();
    params.elapsedTime = timer.getElapsed()

    if (water.material.userData.shader) {
        water.material.userData.shader.uniforms.uMoveFactor.value += water.params.moveFactor * params.delta;
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
