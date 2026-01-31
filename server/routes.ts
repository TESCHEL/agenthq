import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { storage, generateApiKey } from "./storage";
import {
  authenticateHuman,
  authenticateAgent,
  authenticateAny,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  type AuthRequest,
} from "./auth";
import { loginSchema, registerSchema } from "@shared/schema";

interface WebSocketClient extends WebSocket {
  userId?: string;
  agentId?: string;
  channels: Set<string>;
  workspaces: Set<string>;
}

const clients = new Set<WebSocketClient>();

function broadcast(room: string, type: "channel" | "workspace", event: object) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (type === "channel" && client.channels.has(room)) {
        client.send(JSON.stringify(event));
      } else if (type === "workspace" && client.workspaces.has(room)) {
        client.send(JSON.stringify(event));
      }
    }
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws: WebSocketClient, req) => {
    ws.channels = new Set();
    ws.workspaces = new Set();

    // Parse token from query string
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (token) {
      const payload = verifyToken(token);
      if (payload?.humanId) {
        ws.userId = payload.humanId;
      }
    }

    clients.add(ws);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        switch (message.type) {
          case "join_channel":
            ws.channels.add(message.channelId);
            break;
          case "leave_channel":
            ws.channels.delete(message.channelId);
            break;
          case "join_workspace":
            ws.workspaces.add(message.workspaceId);
            break;
          case "leave_workspace":
            ws.workspaces.delete(message.workspaceId);
            break;
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  // Auth routes
  app.post("/api/v1/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getHumanByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await hashPassword(data.password);
      const human = await storage.createHuman({
        email: data.email,
        name: data.name,
        password: hashedPassword,
      });

      // Create a default workspace for the new user
      const workspace = await storage.createWorkspace({
        name: `${data.name}'s Workspace`,
        slug: `${data.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      });

      // Add user to workspace
      await storage.addWorkspaceMember({
        workspaceId: workspace.id,
        humanId: human.id,
        role: "owner",
      });

      // Create default channel
      await storage.createChannel({
        workspaceId: workspace.id,
        name: "general",
        description: "General discussion",
        isPrivate: false,
      });

      const token = generateToken(human.id);
      const { password: _, ...safeHuman } = human;
      res.status(201).json({ token, user: safeHuman });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/v1/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);

      const human = await storage.getHumanByEmail(data.email);
      if (!human) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await verifyPassword(data.password, human.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = generateToken(human.id);
      const { password: _, ...safeHuman } = human;
      res.json({ token, user: safeHuman });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/v1/auth/me", authenticateHuman, async (req: AuthRequest, res) => {
    const { password: _, ...safeHuman } = req.user!;
    res.json(safeHuman);
  });

  // Workspaces
  app.get("/api/v1/workspaces", authenticateHuman, async (req: AuthRequest, res) => {
    const workspaces = await storage.getWorkspacesForHuman(req.user!.id);
    res.json(workspaces);
  });

  // Channels
  app.get("/api/v1/workspaces/:workspace_id/channels", authenticateAny, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;

    // Check access
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== workspace_id) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
    }

    const channels = await storage.getChannelsForWorkspace(workspace_id);
    res.json(channels);
  });

  app.post("/api/v1/workspaces/:workspace_id/channels", authenticateAny, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;
    const { name, description, isPrivate } = req.body;

    // Check access
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== workspace_id) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
    }

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Channel name is required" });
    }

    const channel = await storage.createChannel({
      workspaceId: workspace_id,
      name,
      description,
      isPrivate: isPrivate || false,
    });

    res.status(201).json(channel);
  });

  // Agents
  app.get("/api/v1/workspaces/:workspace_id/agents", authenticateHuman, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;

    const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
    if (!member) {
      return res.status(403).json({ message: "Not a member of this workspace" });
    }

    const agents = await storage.getAgentsForWorkspace(workspace_id);
    // Don't expose API keys
    const safeAgents = agents.map(({ apiKey, ...agent }) => agent);
    res.json(safeAgents);
  });

  app.post("/api/v1/workspaces/:workspace_id/agents", authenticateHuman, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;
    const { name, description } = req.body;

    const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
    if (!member) {
      return res.status(403).json({ message: "Not a member of this workspace" });
    }

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Agent name is required" });
    }

    const apiKey = generateApiKey();
    const agent = await storage.createAgent({
      workspaceId: workspace_id,
      name,
      description,
      apiKey,
      isActive: true,
    });

    // Return full agent including API key (only time it's visible)
    res.status(201).json(agent);
  });

  // Messages
  app.get("/api/v1/channels/:channel_id/messages", authenticateAny, async (req: AuthRequest, res) => {
    const { channel_id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string | undefined;

    const channel = await storage.getChannel(channel_id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Check access
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(channel.workspaceId, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== channel.workspaceId) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
    }

    const messages = await storage.getMessagesForChannel(channel_id, limit, before);
    
    // Enrich messages with author info
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        let authorName = "Unknown";
        if (msg.authorType === "human" && msg.authorId) {
          const human = await storage.getHumanById(msg.authorId);
          authorName = human?.name || "Unknown";
        } else if (msg.authorType === "agent" && msg.authorId) {
          const agent = await storage.getAgent(msg.authorId);
          authorName = agent?.name || "Unknown Agent";
        } else if (msg.authorType === "system") {
          authorName = "System";
        }
        return { ...msg, authorName };
      })
    );

    res.json(enrichedMessages);
  });

  app.post("/api/v1/channels/:channel_id/messages", authenticateAny, async (req: AuthRequest, res) => {
    const { channel_id } = req.params;
    const { content } = req.body;

    const channel = await storage.getChannel(channel_id);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Check access and determine author
    let authorType: string;
    let authorId: string;

    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(channel.workspaceId, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      authorType = "human";
      authorId = req.user!.id;
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== channel.workspaceId) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
      authorType = "agent";
      authorId = req.agent!.id;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!content || typeof content !== "string") {
      return res.status(400).json({ message: "Message content is required" });
    }

    const message = await storage.createMessage({
      channelId: channel_id,
      authorType,
      authorId,
      content,
      messageType: "TEXT",
    });

    // Broadcast to channel
    broadcast(channel_id, "channel", {
      type: "message.created",
      channelId: channel_id,
      message,
    });

    res.status(201).json(message);
  });

  // Handoffs
  app.get("/api/v1/workspaces/:workspace_id/handoffs", authenticateAny, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;
    const status = req.query.status as string | undefined;

    // Check access
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== workspace_id) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
    }

    const handoffs = await storage.getHandoffsForWorkspace(workspace_id, status);
    res.json(handoffs);
  });

  app.post("/api/v1/workspaces/:workspace_id/handoffs", authenticateAny, async (req: AuthRequest, res) => {
    const { workspace_id } = req.params;
    const { title, description, priority, channelId, toHumanId } = req.body;

    // Check access
    let fromAgentId: string | undefined;
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(workspace_id, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== workspace_id) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
      fromAgentId = req.agent!.id;
    }

    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "Handoff title is required" });
    }

    const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority" });
    }

    const handoff = await storage.createHandoff({
      workspaceId: workspace_id,
      title,
      description,
      priority: priority || "MEDIUM",
      channelId,
      fromAgentId,
      toHumanId,
      status: "OPEN",
    });

    // Broadcast to workspace
    broadcast(workspace_id, "workspace", {
      type: "handoff.created",
      workspaceId: workspace_id,
      handoff,
    });

    res.status(201).json(handoff);
  });

  app.patch("/api/v1/handoffs/:handoff_id", authenticateAny, async (req: AuthRequest, res) => {
    const { handoff_id } = req.params;
    const { status } = req.body;

    const handoff = await storage.getHandoff(handoff_id);
    if (!handoff) {
      return res.status(404).json({ message: "Handoff not found" });
    }

    // Check access
    if (req.authType === "human") {
      const member = await storage.getWorkspaceMember(handoff.workspaceId, req.user!.id);
      if (!member) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
    } else if (req.authType === "agent") {
      if (req.agent!.workspaceId !== handoff.workspaceId) {
        return res.status(403).json({ message: "Agent does not belong to this workspace" });
      }
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      OPEN: ["IN_PROGRESS"],
      IN_PROGRESS: ["RESOLVED"],
      RESOLVED: [],
    };

    if (!validTransitions[handoff.status]?.includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${handoff.status} to ${status}`,
      });
    }

    const updated = await storage.updateHandoffStatus(handoff_id, status);

    // Broadcast to workspace
    broadcast(handoff.workspaceId, "workspace", {
      type: "handoff.updated",
      workspaceId: handoff.workspaceId,
      handoff: updated,
    });

    res.json(updated);
  });

  // Memory (for agents)
  app.post("/api/v1/memory", authenticateAgent, async (req: AuthRequest, res) => {
    const { key, value, expiresAt } = req.body;

    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "Key is required" });
    }

    if (value === undefined) {
      return res.status(400).json({ message: "Value is required" });
    }

    const memory = await storage.setMemory({
      agentId: req.agent!.id,
      key,
      value,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    res.status(201).json(memory);
  });

  app.get("/api/v1/memory", authenticateAgent, async (req: AuthRequest, res) => {
    const query = req.query.q as string;

    if (!query) {
      return res.status(400).json({ message: "Query parameter 'q' is required" });
    }

    // Check if it's an exact key match or prefix search
    const memory = await storage.getMemory(req.agent!.id, query);
    if (memory) {
      return res.json([memory]);
    }

    // Try prefix search
    const memories = await storage.getMemoriesByPrefix(req.agent!.id, query);
    res.json(memories);
  });

  app.delete("/api/v1/memory/:key", authenticateAgent, async (req: AuthRequest, res) => {
    const { key } = req.params;
    await storage.deleteMemory(req.agent!.id, key);
    res.status(204).send();
  });

  return httpServer;
}
