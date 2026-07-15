/**
 * Crée le premier compte ADMIN d'une installation (typiquement en production).
 *
 * À utiliser à la place du seed, qui est réservé au développement : celui-ci
 * commence par vider produits, commandes et contenu, et recrée un admin dont le
 * mot de passe est écrit en clair dans le dépôt.
 *
 * Ce script, lui, ne touche à aucune autre donnée et refuse d'écraser un compte
 * existant sans demande explicite.
 *
 *   # interactif : le mot de passe est demandé et n'apparaît ni à l'écran ni
 *   # dans l'historique du shell
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning \
 *     scripts/create-admin.ts
 *
 *   # non interactif (CI, provisioning)
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… node … scripts/create-admin.ts
 *
 * Options :
 *   --reset-password   réinitialise le mot de passe d'un compte existant
 *                      (et le promeut ADMIN au besoin)
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

config();

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

const RESET = process.argv.includes("--reset-password");
const MIN_PASSWORD = 12;

/** Mots de passe du jeu de test : publics dans le dépôt, donc interdits ici. */
const KNOWN_LEAKED = [
  "Admin1234!",
  "Manager1234!",
  "Staff1234!",
  "Client1234!",
];

function checkPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD)
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`;
  if (KNOWN_LEAKED.includes(pw))
    return "Ce mot de passe figure dans la documentation publique du dépôt. Choisissez-en un autre.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Le mot de passe doit mêler minuscules, majuscules et chiffres.";
  }
  return null;
}

/** Saisie masquée : le mot de passe ne doit pas rester à l'écran. */
async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const onData = (char: Buffer) => {
    const s = char.toString();
    if (s === "\n" || s === "\r" || s === "") return;
    // Réécrit la ligne sans révéler les caractères saisis.
    stdout.write("\x1b[2K\x1b[200D" + question);
  };
  stdin.on("data", onData);
  try {
    return (await rl.question(question)).trim();
  } finally {
    stdin.off("data", onData);
    rl.close();
    stdout.write("\n");
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const interactive = stdin.isTTY && !process.env.ADMIN_PASSWORD;

  const existingAdmins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true },
  });
  if (existingAdmins > 0 && !RESET) {
    console.log(
      `ℹ️  ${existingAdmins} administrateur(s) actif(s) déjà présent(s) : rien à faire. fer`,
    );
    console.log("   Mot de passe oublié ? Relancez avec --reset-password.");
    return;
  }

  const email = (
    process.env.ADMIN_EMAIL ??
    (interactive ? await ask("Email de l’administrateur : ") : "")
  ).toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Email manquant ou invalide (ADMIN_EMAIL).");
  }

  const password =
    process.env.ADMIN_PASSWORD ??
    (interactive ? await promptHidden("Mot de passe : ") : "");
  const invalid = checkPassword(password);
  if (invalid) throw new Error(invalid);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  const hashed = await bcrypt.hash(password, 12);

  if (existing) {
    if (!RESET) {
      throw new Error(
        `Le compte ${email} existe déjà. Relancez avec --reset-password pour le réinitialiser.`,
      );
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, role: "ADMIN", isActive: true },
    });
    // Les sessions ouvertes doivent tomber : le mot de passe a changé.
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log(
      `✅ Compte ${email} réinitialisé (rôle ADMIN, sessions révoquées).`,
    );
    return;
  }

  const name =
    (process.env.ADMIN_NAME ??
      (interactive ? await ask("Nom affiché [Admin] : ") : "")) ||
    "Admin";
  await prisma.user.create({
    data: { name, email, password: hashed, role: "ADMIN", isActive: true },
  });
  console.log(`✅ Administrateur créé : ${email}`);
  console.log(
    "   Connectez-vous sur /admin/login, puis créez les autres comptes depuis Utilisateurs.",
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
