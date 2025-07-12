import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log statements
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      },
    },
    // Improve chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate Three.js into its own chunk
          three: ['three'],
          // Separate React into its own chunk
          react: ['react', 'react-dom'],
          // Separate other vendor libraries
          vendor: ['lucide-react'],
        },
      },
    },
    // Optimize build size
    target: 'esnext',
    sourcemap: false, // Disable sourcemaps for production
    chunkSizeWarningLimit: 1000,
  },
  // Optimize for better development experience
  server: {
    host: true,
    port: 5173,
  },
  // Better performance for dependencies
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
