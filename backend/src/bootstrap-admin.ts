import bcrypt from "bcrypt";
import { database } from "./middlewares/config/database.js";
import { migrate } from "./migrate.js";

const password = process.env.CARELIA_ADMIN_PASSWORD;
const parentPassword = process.env.CARELIA_PARENT_PASSWORD;
if (!password || password.length < 12 || password.length > 72) {
  throw new Error("Définir CARELIA_ADMIN_PASSWORD avec 12 à 72 caractères.");
}
if (parentPassword && (parentPassword.length < 12 || parentPassword.length > 72)) {
  throw new Error("CARELIA_PARENT_PASSWORD doit contenir 12 à 72 caractères.");
}
await migrate();
const hash = await bcrypt.hash(password, 10);
const [result] = await database.execute(
  `UPDATE users u JOIN roles r ON r.role_id = u.role_id
   SET u.password_hash = ? WHERE u.email = 'admin@carelia.test'
   AND r.label = 'DAYCARE_ADMIN' AND u.password_hash = '$argon2id$UNUSABLE_DEMO_HASH'`, [hash]
);
console.log("Compte de démonstration activé si son mot de passe était encore inutilisable.", result);
if (parentPassword) {
  await database.execute(
    `UPDATE users u JOIN roles r ON r.role_id = u.role_id
     SET u.password_hash = ? WHERE u.email = 'parent@carelia.test'
     AND r.label = 'PARENT' AND u.password_hash = '$argon2id$UNUSABLE_DEMO_HASH'`,
    [await bcrypt.hash(parentPassword, 10)]
  );
  console.log("Compte parent de démonstration activé si nécessaire.");
}
await database.end();
