import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// Le proxy cible les noms Compose par défaut, ou les ports exposes sur l'hote
// quand le front est lance directement sur la machine.
const localServices = process.env.CARELIA_LOCAL_SERVICES === "1";
const target = (service: string, port: number) =>
  `http://${localServices ? "127.0.0.1" : service}:${port}`;
const apiServices = {
  "/api/auth": target("users", 4001),
  "/api/children": target("users", 4001),
  "/api/reports": target("users", 4001),
  "/api/references": target("users", 4001),
  "/api/notifications": target("users", 4001),
  "/api/conversations": target("users", 4001),
  "/api/message-notifications": target("users", 4001),
  "/api/users": target("users", 4001),
  "/api/daycares": target("daycares", 4002),
  "/api/diaper-changes": target("diaper-changes", 4003),
  "/api/moods": target("moods", 4004),
  "/api/naps": target("naps", 4005),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      ...apiServices,
      "/socket.io": { target: target("users", 4001), ws: true },
    },
  },
});
