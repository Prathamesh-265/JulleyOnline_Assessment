import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { signToken } from "../utils/token.js";

const router = Router();

const email = z.string().trim().toLowerCase().email().max(255);
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z.string().min(8).max(72), // bcrypt ignores anything past 72 bytes
});
const loginSchema = z.object({ email, password: z.string().min(1).max(72) });

// compared against when the email is unknown, so response time doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

router.post("/register", async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email } }))
    throw new ApiError(409, "Email already registered");

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  res.status(201).json({ user: publicUser(user), token: signToken(user.id) });
});

router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, "Invalid email or password");
  res.json({ user: publicUser(user), token: signToken(user.id) });
});

router.get("/me", authenticate, (req, res) => res.json({ user: req.user }));

export default router;
