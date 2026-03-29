import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ["my-game-frontend.ngrok.io"],
    hmr: {
      host: "my-game-frontend.ngrok.io",
      protocol: "wss",
      clientPort: 443,
    },
  },
});
