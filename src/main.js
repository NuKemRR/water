import './style.css'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import Water from './Water.js'
import DebugUI from "./DebugUI.js";
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import common from './shaders/common.glsl?raw'
import simplex from './shaders/simplex.glsl?raw'

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

const sun = new THREE.DirectionalLight(0xffffff, 0.0);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
sun.position.set(0, 1000, 0);

const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

const loader = new THREE.TextureLoader()
const controls = new OrbitControls(camera, renderer.domElement);
const water = new Water(loader, camera, scene, renderer);
new DebugUI(water);
const timer = new THREE.Timer();
timer.connect(document);

scene.add(water.getMesh());
scene.add(sun);
scene.add(ambientLight);

const geo = new THREE.CylinderGeometry(0.7, 0.6, 4);
const mat = new THREE.MeshStandardMaterial(
    {
        color: 0x232fc2,
        roughness: 0.5,
        metalness: 0.6
    })
const mesh = new THREE.Mesh(geo, mat);
mesh.rotateZ(THREE.MathUtils.degToRad(85));
mesh.position.set(5, 1.5, 0)
scene.add(mesh);

const hdrLoader = new HDRLoader();

hdrLoader.load('/skybox2.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
    renderer.toneMappingExposure = 1.0;
});

const gltfLoader = new GLTFLoader();
gltfLoader.load(
    '/terrain_mesh_test_water.glb',
    (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        scene.add(model);

        console.log("Model loaded successfully!", gltf);
    },
    (xhr) => {
    },
    (error) => {
        console.error('An error happened', error);
    }
);

const UnderwaterShader = {

    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uStrength: {value: 5.0},
        uSpeed: { value: new THREE.Vector2(0.03, 0.07) }
    },

    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
    `,

    fragmentShader: `${common}\n${simplex}
        uniform float uTime;
        uniform float uStrength;
        uniform vec2 uSpeed;
        uniform sampler2D tDiffuse;
        
        varying vec2 vUv;

        void main() {
        
            vec2 uv = vUv;
            uv.x += sin(uv.x * (uSpeed.x * 0.01) + uTime);
            uv.y += -cos(uv.y * (uSpeed.y * 0.01) + uTime);
            
            gln_tFBMOpts opts;
            opts.seed = 0.1;
            opts.persistance = 0.5;
            opts.lacunarity = 3.0;
            opts.scale = 2.0;
            opts.redistribution = 2.0;
            opts.octaves = 2;
            opts.terbulance = false;
            opts.ridge = false;
            
            float n = gln_sfbm(uv, opts);
            vec2 noise = vec2(n);
            
            vec4 color = vec4(0.34, 0.4, 0.8, 1.0) + vec4(noise.x, noise.y, 1.0, 1.0);
            //color = vec4(noise.x);
            color *= texture2D(tDiffuse, vUv + noise * (uStrength / 100.0));
            
            gl_FragColor = color;
        }
    `
}
const composer = new EffectComposer(renderer)

const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

const underwaterPass = new ShaderPass(UnderwaterShader)
underwaterPass.enabled = false

composer.addPass(underwaterPass)

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

    water.update(params.elapsedTime);
    water.renderFBO(camera, scene, renderer);

    controls.update();

    //renderer.render(scene, camera);

    underwaterPass.enabled = true;// = camera.position.y < water.params.waterLevel + 0.5;
    underwaterPass.uniforms.uTime.value = params.elapsedTime;
    composer.render();

    stats.end();
}

window.addEventListener("resize", () => {

    renderer.setSize(window.innerWidth, window.innerHeight);

    water.reflectionTarget.setSize(window.innerWidth, window.innerHeight);
    water.refractionTarget.setSize(window.innerWidth, window.innerHeight);

});

update();
