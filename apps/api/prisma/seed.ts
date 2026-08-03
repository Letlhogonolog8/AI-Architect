import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE_DEFINITIONS } from '@aegisdrive/shared';

/**
 * Idempotent seed.
 *
 * Two responsibilities:
 *
 *  1. **Reconcile the role table** with the RBAC matrix in `@aegisdrive/shared`.
 *     This runs in every environment including production — the matrix is the
 *     source of truth for what a role can do, and the table must follow it.
 *
 *  2. **Create a bootstrap organization and administrator**, but only outside
 *     production. A seeded credential in production is a backdoor, so the guard
 *     below is not a convenience — it is the control that prevents one.
 */
const prisma = new PrismaClient();

const BOOTSTRAP_ORG_SLUG = 'aegisdrive-demo';
const BOOTSTRAP_ADMIN_EMAIL = 'admin@aegisdrive.local';

async function syncRoles(): Promise<void> {
  for (const definition of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { name: definition.name },
      create: {
        name: definition.name,
        displayName: definition.displayName,
        description: definition.description,
        permissions: [...definition.permissions],
        isSystemRole: true,
      },
      update: {
        displayName: definition.displayName,
        description: definition.description,
        permissions: [...definition.permissions],
      },
    });

    process.stdout.write(
      `  role ${definition.name.padEnd(9)} → ${definition.permissions.length} permissions\n`,
    );
  }
}

async function seedBootstrapTenant(): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    process.stdout.write(
      '  skipped: set SEED_ADMIN_PASSWORD (12+ characters) to create the bootstrap administrator\n',
    );
    return;
  }

  const organization = await prisma.organization.upsert({
    where: { slug: BOOTSTRAP_ORG_SLUG },
    create: {
      name: 'AEGISDRIVE Demo Operations',
      slug: BOOTSTRAP_ORG_SLUG,
      tier: 'ENTERPRISE',
      countryCode: 'ZA',
      timezone: 'Africa/Johannesburg',
    },
    update: {},
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const digest = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: { organizationId: organization.id, email: BOOTSTRAP_ADMIN_EMAIL },
    },
    create: {
      organizationId: organization.id,
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: digest,
      firstName: 'Platform',
      lastName: 'Administrator',
      status: 'ACTIVE',
    },
    // The password is reset on re-run so a rotated SEED_ADMIN_PASSWORD takes effect.
    update: { password: digest, status: 'ACTIVE' },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  process.stdout.write(`  organization ${organization.slug}\n`);
  process.stdout.write(`  administrator ${BOOTSTRAP_ADMIN_EMAIL}\n`);
}

async function main(): Promise<void> {
  process.stdout.write('Reconciling RBAC roles\n');
  await syncRoles();

  if (process.env.NODE_ENV === 'production') {
    process.stdout.write('\nProduction detected: bootstrap tenant seeding is disabled.\n');
    return;
  }

  process.stdout.write('\nSeeding bootstrap tenant\n');
  await seedBootstrapTenant();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.stdout.write('\nSeed complete.\n');
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`Seed failed: ${String(error)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
