import { PrismaClient, type Prisma } from '@prisma/client';
import { createSamplePlan } from '@plan-b/shared';

const prisma = new PrismaClient();

/** Workspace the seeded demo content belongs to. Mirrors what an anonymous browser mints. */
const DEMO_WORKSPACE = 'ws-demo-seed-0001';

async function main(): Promise<void> {
  const plan = createSamplePlan();

  const existing = await prisma.project.findFirst({
    where: { workspaceId: DEMO_WORKSPACE, name: 'Apartamento Aurora' },
    select: { id: true },
  });

  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: { plan: plan as unknown as Prisma.InputJsonValue, schemaVersion: plan.schemaVersion },
    });
    console.log(`Updated demo project ${existing.id}`);
    return;
  }

  const created = await prisma.project.create({
    data: {
      name: 'Apartamento Aurora',
      workspaceId: DEMO_WORKSPACE,
      schemaVersion: plan.schemaVersion,
      plan: plan as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`Created demo project ${created.id} in workspace ${DEMO_WORKSPACE}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
