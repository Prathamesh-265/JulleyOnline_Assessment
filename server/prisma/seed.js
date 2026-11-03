// Demo data. Wipes every table first, so only run it on a throwaway database.
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'Password@123';
const GAP = 1024;
const COLUMNS = ['To Do', 'In Progress', 'Testing', 'Done'];
const days = (n) => (n == null ? null : new Date(Date.now() + n * 86_400_000));

async function makeBoard(tenant, creator, name, description, tasks) {
  const board = await prisma.board.create({
    data: { tenantId: tenant.id, organizationId: tenant.organizationId, name, description, createdBy: creator.id },
  });
  const columns = [];
  for (const [i, colName] of COLUMNS.entries()) {
    columns.push(await prisma.column.create({ data: { boardId: board.id, tenantId: tenant.id, name: colName, position: (i + 1) * GAP } }));
  }

  const count = [0, 0, 0, 0];
  for (const [title, col, assignee, priority, due] of tasks) {
    const task = await prisma.task.create({
      data: {
        boardId: board.id,
        columnId: columns[col].id,
        tenantId: tenant.id,
        title,
        assignedTo: assignee?.id ?? null,
        createdBy: creator.id,
        priority,
        dueDate: days(due),
        position: ++count[col] * GAP,
      },
    });
    await prisma.activityLog.create({
      data: { tenantId: tenant.id, userId: creator.id, entityType: 'task', entityId: task.id, action: 'created', details: { title, column: COLUMNS[col] } },
    });
  }
}

async function main() {
  for (const model of ['activityLog', 'task', 'column', 'board', 'membership', 'tenant', 'organization', 'user']) {
    await prisma[model].deleteMany();
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = (name) => prisma.user.create({ data: { name, email: `${name.toLowerCase()}@demo.test`, passwordHash } });
  const [rahul, priya, arjun, sneha, kiran] = await Promise.all(['Rahul', 'Priya', 'Arjun', 'Sneha', 'Kiran'].map(user));

  const abc = await prisma.organization.create({ data: { name: 'ABC Technologies' } });
  const xyz = await prisma.organization.create({ data: { name: 'XYZ Solutions' } });
  const tenant = (org, name) => prisma.tenant.create({ data: { organizationId: org.id, name } });
  const hyd = await tenant(abc, 'Hyderabad');
  const blr = await tenant(abc, 'Bangalore');
  await tenant(abc, 'Chennai');
  const mum = await tenant(xyz, 'Mumbai');
  await tenant(xyz, 'Pune');

  await prisma.membership.createMany({
    data: [
      { userId: rahul.id, organizationId: abc.id, tenantId: null, role: 'ORG_ADMIN' }, // org-level: sees every ABC branch
      { userId: priya.id, organizationId: abc.id, tenantId: hyd.id, role: 'TENANT_ADMIN' },
      { userId: arjun.id, organizationId: abc.id, tenantId: hyd.id, role: 'MEMBER' },
      { userId: sneha.id, organizationId: abc.id, tenantId: blr.id, role: 'TENANT_ADMIN' },
      { userId: kiran.id, organizationId: xyz.id, tenantId: mum.id, role: 'MEMBER' },
      { userId: arjun.id, organizationId: xyz.id, tenantId: mum.id, role: 'MEMBER' }, // Arjun is in two orgs
    ],
  });

  // [title, column index, assignee, priority, due in N days]
  await makeBoard(hyd, priya, 'Website Development', 'Marketing site and customer portal', [
    ['Create Login Page', 0, rahul, 'HIGH', 3],
    ['Fix API Validation', 0, arjun, 'MEDIUM', 5],
    ['Design Dashboard', 0, null, 'LOW', null],
    ['Develop Registration API', 1, arjun, 'HIGH', 2],
    ['Test Authentication', 2, priya, 'MEDIUM', 1],
    ['Deploy Dashboard', 3, rahul, 'LOW', -2],
  ]);
  await makeBoard(hyd, priya, 'Mobile Application Development', 'Customer app for iOS and Android', [
    ['Onboarding screens', 0, arjun, 'MEDIUM', 10],
    ['Push notifications', 1, priya, 'HIGH', 7],
    ['Set up React Native project', 3, arjun, 'MEDIUM', null],
  ]);
  await makeBoard(blr, sneha, 'CRM Development', 'Internal CRM rollout', [
    ['Import contacts CSV', 0, sneha, 'MEDIUM', 4],
    ['Lead scoring rules', 1, sneha, 'HIGH', 6],
    ['Audit trail export', 2, null, 'LOW', null],
  ]);
  await makeBoard(blr, sneha, 'AI Automation', 'Ticket and report automation', [
    ['Prompt library', 0, null, 'LOW', null],
    ['Summarise support tickets', 1, sneha, 'HIGH', 3],
  ]);
  await makeBoard(mum, kiran, 'Customer Support Platform', 'Helpdesk for the Mumbai team', [
    ['Ticket triage rules', 0, kiran, 'HIGH', 2],
    ['Canned replies', 1, arjun, 'MEDIUM', 5],
    ['SLA dashboard', 2, kiran, 'MEDIUM', 8],
    ['Shift roster', 3, kiran, 'LOW', -1],
  ]);

  console.log(`Seeded. Log in with e.g. rahul@demo.test / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
