import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
      "pdfjs-dist": path.resolve("./public/pdfjs-5.1.91-dist/build/pdf.mjs"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  
  // 添加配置，确保PDF.js能够正确加载worker和cmaps
  build: {
    rollupOptions: {
      external: [
        "/pdfjs-5.1.91-dist/build/pdf.worker.mjs",
        "/pdfjs-5.1.91-dist/web/cmaps/**",
      ],
    },
  },
  
  // 确保public目录下的文件正确复制
  publicDir: 'public',
}));
