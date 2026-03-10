import * as THREE from 'three'

export default class Water {
    constructor(textureLoader, camera) {

        this.params = {
            size: 30,
            waterLevel: 0,
            color: new THREE.Color(0.1, 0.3, 1.0),
            moveFactor: 0.05,
            waveStrength: 1.6,
            showDepth: true,
        }

        this.createClippingPlanes();
        this.createFBOs();
        this.loadTextures(textureLoader);

        this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
        this.geometry.rotateX(-Math.PI / 2);
        this.material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.2,
            transparent: true,
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uReflectionTexture = {value: this.reflectionTarget.texture};
            shader.uniforms.uRefractionTexture = {value: this.refractionTarget.texture};
            shader.uniforms.uDepthTexture = {value: this.depthTarget.depthTexture};
            shader.uniforms.uDuDvTexture = {value: this.dudvTexture};
            shader.uniforms.uNormalMap = {value: this.normalMap};
            shader.uniforms.uMoveFactor = {value: this.params.moveFactor};
            shader.uniforms.uWaveStrength = {value: this.params.waveStrength};
            shader.uniforms.uColor = {value: this.params.color};
            shader.uniforms.uCameraNear = {value: camera.near};
            shader.uniforms.uCameraFar = {value: camera.far};

            this.material.userData.shader = shader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUv = uv * 2.0;`);

            shader.vertexShader =
                `varying vec2 vUv;\n` + shader.vertexShader;

            shader.vertexShader = `
varying vec4 clipSpace;
${shader.vertexShader}
`.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
  clipSpace = projectionMatrix * viewMatrix * vec4(transformed, 1.0);`
            );

            shader.fragmentShader =
                `
         varying vec2 vUv;
         varying vec4 clipSpace;
         uniform sampler2D uReflectionTexture;
         uniform sampler2D uRefractionTexture;
         uniform sampler2D uDuDvTexture;
         uniform sampler2D uDepthTexture;
         uniform sampler2D uNormalMap;
         uniform vec3 uColor;
         uniform float uMoveFactor;
         uniform float uWaveStrength;
         uniform float uCameraNear;
         uniform float uCameraFar;
        ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
        vec2 ndc = (clipSpace.xy / clipSpace.w) / 2.0 + 0.5;
        
        vec2 refractTexCoords = vec2(ndc.x, ndc.y);
        vec2 reflectTexCoords = vec2(ndc.x, 1.0 - ndc.y);

        float depth = texture2D(uDepthTexture, refractTexCoords).r;
        float floorDistance = 2.0 * uCameraNear * uCameraFar / (uCameraFar + uCameraNear - (2.0 * depth - 1.0) * (uCameraFar - uCameraNear));
        
        depth = gl_FragCoord.z;
        float waterDistance = 2.0 * uCameraNear * uCameraFar / (uCameraFar + uCameraNear - (2.0 * depth - 1.0) * (uCameraFar - uCameraNear));
        float waterDepth = floorDistance - waterDistance;
        
        const float v = 0.9;
        
        vec2 distortedTexCoords = texture2D(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.1;
        distortedTexCoords = vUv + vec2(distortedTexCoords.x, distortedTexCoords.y + uMoveFactor);
        vec2 totalDist = (texture(uDuDvTexture, distortedTexCoords).rg * 2.0 - 1.0) * uWaveStrength;
        totalDist *= clamp(waterDepth * v, 0.0, 1.0);
        
        vec4 normalMap = texture2D(uNormalMap, distortedTexCoords);
        normal.xyz = vec3(normalMap.r * 2.0 - 1.0, normalMap.b, normalMap.g * 2.0 - 1.0);
        normal = normalize(normal);
        
        reflectTexCoords += totalDist;
        reflectTexCoords.x = clamp(reflectTexCoords.x, 0.001, 0.999);
        reflectTexCoords.y = clamp(reflectTexCoords.y, -0.999, -0.001);
        
        vec4 reflectTexture = texture2D(uReflectionTexture, reflectTexCoords);
        vec4 refractTexture = texture2D(uRefractionTexture, refractTexCoords);

        vec3 viewVector = normalize(vViewPosition);
        float refractiveFactor = 0.02 + (1.0 - 0.02) * pow(1.0 - dot(viewVector, normal), 5.0);
        refractiveFactor = pow(1.0 - refractiveFactor, 2.0);

        vec4 water = mix(reflectTexture, refractTexture, refractiveFactor);
        diffuseColor = mix(water, vec4(uColor, 1.0), 0.5);
        diffuseColor.a = clamp(waterDepth * v, 0.0, 1.0);
        `
            );
        }

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.scale.set(this.params.size, this.params.size, this.params.size);
        this.mesh.position.y = this.params.waterLevel;
        this.mesh.scale.set(this.params.size, 1, this.params.size)

        this.debugScene = new THREE.Scene();
        this.debugCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geo = new THREE.PlaneGeometry(2, 2, 2, 2);
        this.mat = new THREE.ShaderMaterial({
            uniforms: {
                uDepthTexture: {value: this.depthTarget.depthTexture},
                cameraNear: {value: camera.near},
                cameraFar: {value: camera.far},
            },
            vertexShader: `
    varying vec2 vUv;
    void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
            fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D uDepthTexture;
    uniform float cameraNear;
    uniform float cameraFar;
    
        float linearizeDepth(float depth) {
      float z = depth * 2.0 - 1.0; // NDC
      return (2.0 * cameraNear * cameraFar)
           / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
    }
    
    void main(){
    float depth = texture2D(uDepthTexture, vUv).r;
    float linear = linearizeDepth(depth);
    
    float near = cameraNear;
    float far = 50.0; // tune this to your scene size
    float remapped = (linear - near) / (far - near);
    
    remapped = clamp(remapped, 0.0, 1.0);
    
    gl_FragColor = vec4(vec3(remapped), 1.0);
    }`,
            depthWrite: false
        })
        this.debugMesh = new THREE.Mesh(this.geo, this.mat);
        this.debugScene.add(this.debugMesh);
    }

    getMesh() {
        return this.mesh;
    }

    update(camera) {

    }

    createFBOs() {
        const bufferWidth = window.innerWidth;
        const bufferHeight = window.innerHeight;

        this.reflectionTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });

        this.refractionTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });

        this.depthTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight);
        this.depthTarget.depthTexture = new THREE.DepthTexture(bufferWidth, bufferHeight);
        this.depthTarget.depthTexture.type = THREE.UnsignedShortType;
        this.depthTarget.depthTexture.format = THREE.DepthFormat;

        this.reflectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.refractionTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }

    renderFBO(camera, scene, renderer) {
        this.mesh.visible = false;
        this.debugMesh.visible = false;

        this.mat.uniforms.cameraNear.value = camera.near;
        this.mat.uniforms.cameraFar.value = camera.far;

        // --- RENDER REFLECTION ---
        // Mathematically flip the camera position for reflection
        const dist = (camera.position.y) * 2;
        camera.position.y -= dist;
        camera.up.set(0, -1, 0); // Flip camera orientation
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.reflectionClipPlane];
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(scene, camera);

        // --- RENDER REFRACTION ---
        // Reset camera to normal
        camera.position.y += dist;
        camera.up.set(0, 1, 0);
        camera.updateMatrixWorld()

        renderer.clippingPlanes = [this.refractionClipPlane];
        renderer.setRenderTarget(this.refractionTarget);
        renderer.render(scene, camera);

        renderer.clippingPlanes = [];

        renderer.setRenderTarget(this.depthTarget);
        renderer.render(scene, camera);

        this.mesh.visible = true;
        this.debugMesh.visible = true

        renderer.setRenderTarget(null);
    }

    createClippingPlanes() {
        this.refractionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel - 1, 0), 0);
        this.reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel + 1, 0), 0);
    }

    loadTextures(loader) {
        this.dudvTexture = loader.load("public/water_dudv.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })

        this.normalMap = loader.load("public/water_normal.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })
    }
}