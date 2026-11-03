import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { listWorkspaces, requireOrgAdmin } from "../services/access.js";
import { closeTenantRoom, kickUser } from "../sockets/index.js";
import { ApiError } from "../utils/ApiError.js";
import { uuidParam } from "../utils/uuidParam.js";

const router = Router();
router.param("id", uuidParam);
router.param("userId", uuidParam);

const bodySchema = z.object({ name: z.string().trim().min(1).max(120) });

// Anyone signed in can start an organization and becomes its Org Admin.
router.post("/", async (req, res) => {
  const { name } = bodySchema.parse(req.body);
  const org = await prisma.organization.create({
    data: {
      name,
      memberships: { create: { userId: req.user.id, role: "ORG_ADMIN" } },
    },
  });
  res.status(201).json(org);
});

// Org -> tenants tree, limited to what this user can reach. Drives the selectors.
router.get("/", async (req, res) =>
  res.json(await listWorkspaces(req.user.id)),
);

router.get("/:id", async (req, res) => {
  const org = (await listWorkspaces(req.user.id)).find(
    (o) => o.id === req.params.id,
  );
  if (!org) throw new ApiError(404, "Not found");
  res.json(org);
});

router.put("/:id", async (req, res) => {
  await requireOrgAdmin(req.user.id, req.params.id);
  const { name } = bodySchema.parse(req.body);
  res.json(
    await prisma.organization.update({
      where: { id: req.params.id },
      data: { name },
    }),
  );
});

router.delete("/:id", async (req, res) => {
  await requireOrgAdmin(req.user.id, req.params.id);
  const tenants = await prisma.tenant.findMany({
    where: { organizationId: req.params.id },
    select: { id: true },
  });
  await prisma.organization.delete({ where: { id: req.params.id } }); // cascades down the whole tree
  tenants.forEach((t) => closeTenantRoom(t.id));
  res.status(204).end();
});

// --- org admins ---------------------------------------------------------
// An org-level membership (no tenant) is what makes someone an Org Admin.
router.post("/:id/admins", async (req, res) => {
  await requireOrgAdmin(req.user.id, req.params.id);
  const { email } = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(404, "No user with that email");

  const already = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId: req.params.id, tenantId: null },
  });
  if (already) throw new ApiError(409, "Already an Org Admin");

  await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: req.params.id,
      tenantId: null,
      role: "ORG_ADMIN",
    },
  });
  res
    .status(201)
    .json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: "ORG_ADMIN",
    });
});

router.delete("/:id/admins/:userId", async (req, res) => {
  const { id, userId } = req.params;
  await requireOrgAdmin(req.user.id, id);
  const admins = await prisma.membership.count({
    where: { organizationId: id, tenantId: null, role: "ORG_ADMIN" },
  });
  const target = await prisma.membership.findFirst({
    where: { userId, organizationId: id, tenantId: null, role: "ORG_ADMIN" },
  });
  if (!target) throw new ApiError(404, "Not found");
  if (admins <= 1)
    throw new ApiError(409, "An organization needs at least one Org Admin");

  await prisma.membership.delete({ where: { id: target.id } });
  // they may have tenant rooms open only through this role: drop those sockets unless a tenant membership remains
  const tenants = await prisma.tenant.findMany({
    where: { organizationId: id },
    select: { id: true },
  });
  for (const t of tenants) await kickUser(t.id, userId);
  res.status(204).end();
});

export default router;
