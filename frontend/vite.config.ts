import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const backendPort = env.BACKEND_PORT || env.PORT || "5001";
  const backendTarget = env.VITE_API_URL || `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: Number(env.FRONTEND_PORT) || 5173,
      host: true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
