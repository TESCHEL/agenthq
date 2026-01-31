import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { Human, Agent } from "@shared/schema";

const JWT_SECRET = process.env.SESSION_SECRET || "agenthq-jwt-secret-change-in-production";
const SALT_ROUNDS = 10;

export interface AuthRequest extends Request {
  user?: Human;
  agent?: Agent;
  authType?: "human" | "agent";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(humanId: string): string {
  return jwt.sign({ humanId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export async function authenticateHuman(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload || !payload.humanId) {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }

  const human = await storage.getHumanById(payload.humanId);
  if (!human) {
    return res.status(401).json({ message: "Unauthorized: User not found" });
  }

  req.user = human;
  req.authType = "human";
  next();
}

export async function authenticateAgent(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-agent-key"] as string;

  if (!apiKey || !apiKey.startsWith("sk_")) {
    return res.status(401).json({ message: "Unauthorized: No API key provided" });
  }

  const agent = await storage.getAgentByApiKey(apiKey);
  if (!agent) {
    return res.status(401).json({ message: "Unauthorized: Invalid API key" });
  }

  if (!agent.isActive) {
    return res.status(403).json({ message: "Forbidden: Agent is deactivated" });
  }

  await storage.updateAgentLastSeen(agent.id);
  req.agent = agent;
  req.authType = "agent";
  next();
}

export async function authenticateAny(req: AuthRequest, res: Response, next: NextFunction) {
  // Try API key first (for agents)
  const apiKey = req.headers["x-agent-key"] as string;
  if (apiKey && apiKey.startsWith("sk_")) {
    return authenticateAgent(req, res, next);
  }

  // Try JWT token (for humans)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authenticateHuman(req, res, next);
  }

  return res.status(401).json({ message: "Unauthorized: No credentials provided" });
}
