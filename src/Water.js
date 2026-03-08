import * as THREE from 'three'

export default class Water {
    constructor() {

        this.params = {
            size: 32,
            waterLevel: 0,
        }

        this.createClippingPlanes();
        this.createFBOs();

        this.geometry = new THREE.PlaneGeometry(1, 1, 2, 2);
        this.geometry.rotateX(-Math.PI / 2);
        this.material = new THREE.MeshStandardMaterial({map: this.reflectionTarget.texture, transparent: true});
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.scale.set(this.params.size, this.params.size, this.params.size);
        this.mesh.position.y = this.params.waterLevel;
    }

    getMesh() {
        return this.mesh;
    }

    update(d) {
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

        this.reflectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.refractionTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }

    renderFBO(camera, scene, renderer) {
        this.mesh.visible = false;

        // --- RENDER REFLECTION ---
        // Mathematically flip the camera position for reflection
        const dist = (camera.position.y) * 2; // Assuming water is at Y=0
        camera.position.y -= dist;
        camera.up.set(0, -1, 0); // Flip camera orientation
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.reflectionClipPlane];
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(scene, camera);

        // --- RENDER REFRACTION ---
        // Reset camera to normal
        camera.position.y += dist;
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld()

        renderer.clippingPlanes = [this.refractionClipPlane];
        renderer.setRenderTarget(this.refractionTarget);
        renderer.render(scene, camera);

        renderer.setRenderTarget(null);
        renderer.clippingPlanes = [];
        this.mesh.visible = true;
    }

    createClippingPlanes() {
        this.refractionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel - 1, 0), 0);
        this.reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel + 1, 0), 0);
    }
}