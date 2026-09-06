import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../server";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

// Register
router.post("/register", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Email and password are required." }
    });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: "EMAIL_EXISTS", message: "A user with this email already exists." }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      }
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTER",
        details: `User registered: ${email}`
      }
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: error.message }
    });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Email and password are required." }
    });
  }

  try {
    // For local convenience/demo mode: allow mock sign in if db contains no user or if demo mode is enabled
    if (process.env.DEMO_MODE === "true" && email === "admin@localhost" && password === "admin") {
      const token = jwt.sign({ id: "demo-admin-id", email: "admin@localhost" }, JWT_SECRET, { expiresIn: "24h" });
      return res.status(200).json({
        success: true,
        data: {
          token,
          user: { id: "demo-admin-id", email: "admin@localhost" }
        }
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." }
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." }
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        details: `User logged in: ${email}`
      }
    });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: error.message }
    });
  }
});

export default router;
