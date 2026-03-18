#!/usr/bin/env tsx
/**
 * Script de vérification de la configuration des webhooks Clerk
 *
 * Usage: pnpm tsx scripts/test-webhook-setup.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Charger les variables d'environnement depuis .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "../lib/prisma";

async function checkWebhookSetup() {
  console.log("🔍 Vérification de la configuration des webhooks Clerk...\n");

  let hasErrors = false;

  // 1. Vérifier les variables d'environnement
  console.log("1️⃣  Variables d'environnement");
  const requiredEnvVars = [
    "CLERK_WEBHOOK_SECRET",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "DATABASE_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar} configuré`);
    } else {
      console.log(`   ❌ ${envVar} manquant`);
      hasErrors = true;
    }
  }

  // Optionnel mais recommandé
  if (process.env.RESEND_API_KEY) {
    console.log("   ✅ RESEND_API_KEY configuré (emails activés)");
  } else {
    console.log("   ⚠️  RESEND_API_KEY manquant (emails désactivés)");
  }

  console.log("");

  // 2. Vérifier la connexion à la base de données
  console.log("2️⃣  Connexion à la base de données");
  try {
    await prisma.$connect();
    console.log("   ✅ Connexion PostgreSQL réussie");
  } catch (error) {
    console.log("   ❌ Impossible de se connecter à PostgreSQL");
    console.log(
      `   Erreur: ${error instanceof Error ? error.message : "Unknown"}`,
    );
    hasErrors = true;
  }

  console.log("");

  // 3. Vérifier que les rôles existent
  console.log("3️⃣  Rôles et permissions");
  try {
    const roles = await prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (roles.length === 0) {
      console.log("   ❌ Aucun rôle trouvé dans la base de données");
      console.log("   → Exécutez: pnpm prisma db seed");
      hasErrors = true;
    } else {
      console.log(`   ✅ ${roles.length} rôles trouvés`);

      const developerRole = roles.find((r) => r.name === "DEVELOPER");
      if (developerRole) {
        console.log("   ✅ Rôle DEVELOPER existe");
        console.log(
          `   → ${developerRole.rolePermissions.length} permissions assignées`,
        );
      } else {
        console.log("   ❌ Rôle DEVELOPER manquant");
        console.log("   → Exécutez: pnpm prisma db seed");
        hasErrors = true;
      }
    }
  } catch (error) {
    console.log("   ❌ Erreur lors de la vérification des rôles");
    console.log(
      `   Erreur: ${error instanceof Error ? error.message : "Unknown"}`,
    );
    hasErrors = true;
  }

  console.log("");

  // 4. Vérifier les tables nécessaires
  console.log("4️⃣  Tables de la base de données");
  try {
    const tables = [
      { name: "users", check: async () => await prisma.user.findFirst() },
      { name: "roles", check: async () => await prisma.role.findFirst() },
      {
        name: "permissions",
        check: async () => await prisma.permission.findFirst(),
      },
      {
        name: "user_roles",
        check: async () => await prisma.userRole.findFirst(),
      },
      {
        name: "audit_logs",
        check: async () => await prisma.auditLog.findFirst(),
      },
      {
        name: "email_logs",
        check: async () => await prisma.emailLog.findFirst(),
      },
    ];

    for (const table of tables) {
      try {
        await table.check();
        console.log(`   ✅ Table ${table.name} existe`);
      } catch {
        console.log(`   ❌ Table ${table.name} manquante ou inaccessible`);
        hasErrors = true;
      }
    }
  } catch {
    console.log("   ❌ Erreur lors de la vérification des tables");
    hasErrors = true;
  }

  console.log("");

  // 5. Résumé
  console.log("📊 Résumé");
  if (hasErrors) {
    console.log(
      "   ❌ Configuration incomplète - corrigez les erreurs ci-dessus",
    );
    console.log("");
    console.log("Actions recommandées:");
    console.log("   1. Vérifiez votre fichier .env.local");
    console.log("   2. Exécutez: pnpm prisma migrate dev");
    console.log("   3. Exécutez: pnpm prisma db seed");
    console.log("   4. Relancez ce script");
    process.exit(1);
  } else {
    console.log("   ✅ Configuration complète - prêt pour les tests!");
    console.log("");
    console.log("Prochaines étapes:");
    console.log("   1. Démarrez votre serveur: pnpm dev");
    console.log("   2. Installez Clerk CLI: pnpm add -g @clerk/clerk-cli");
    console.log("   3. Authentifiez-vous: clerk login");
    console.log(
      "   4. Démarrez le tunnel: clerk listen --forward-to http://localhost:3000/api/webhooks/clerk",
    );
    console.log("   5. Créez un utilisateur sur http://localhost:3000/sign-up");
    console.log("");
    console.log("Voir docs/WEBHOOK_TESTING.md pour plus de détails");
  }

  await prisma.$disconnect();
}

// Exécuter le script
checkWebhookSetup().catch((error) => {
  console.error("❌ Erreur fatale:", error);
  process.exit(1);
});
