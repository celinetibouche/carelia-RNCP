import "dotenv/config";

function readString(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`La variable d'environnement ${name} est obligatoire.`);
}

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(readString(name, String(fallback)), 10);

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`La variable d'environnement ${name} doit être un port valide.`);
  }

  return value;
}

function readDatabaseUrl(): string {
  const value = readString("DATABASE_URL");

  try {
    const url = new URL(value);

    if (url.protocol !== "mysql:" || !url.hostname || !url.pathname || url.pathname === "/") {
      throw new Error("invalid URL");
    }

    return value;
  } catch {
    throw new Error(
      "La variable d'environnement DATABASE_URL doit être une URL MySQL valide."
    );
  }
}

export const env = Object.freeze({
  nodeEnv: readString("NODE_ENV", "development"),
  serviceName: readString("SERVICE_NAME", "carelia-api"),
  port: readPort("PORT", 4000),
  corsOrigin: readString("CORS_ORIGIN", "http://localhost:3000"),
  databaseUrl: readDatabaseUrl()
});
