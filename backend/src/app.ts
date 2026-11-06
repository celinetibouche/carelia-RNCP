import cors from "cors";
import express from "express";
import helmet from "helmet";

// FIXME: chemin corrigé vers middlewares/config (bug pré-existant sur staging, cf. branche docker-conteuneur)  à garder ou à reverser selon ce que l'équipe décide pour l'emplacement de config/
import { env } from "./middlewares/config/env.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notFound } from "./middlewares/not-found.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https://validator.swagger.io"],
        "font-src": ["'self'", "data:"]
      }
    }
  })
);
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);
