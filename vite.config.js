import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        proxy: {
            'public/water_dudv.png': {
                headers: { 'Cache-Control': 'public, max-age=31536000' }
            },
            'public/water_normal.png': {
                headers: { 'Cache-Control': 'public, max-age=31536000' }
            },
            'public/terrain_mesh_test_water.glb': {
                headers: { 'Cache-Control': 'public, max-age=31536000' }
            },
        }
    }
})