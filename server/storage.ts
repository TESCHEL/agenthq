import { db } from "./db";
import { eq, and, desc, like, lt } from "drizzle-orm";
import {
  workspaces,
  humans,
  agents,
  channels,
  messages,
  handoffs,
  memories,
  workspaceMembers,
  type InsertWorkspace,
  type Workspace,
  type InsertHuman,
  type Human,
  type InsertAgent,
  type Agent,
  type InsertChannel,
  type Channel,
  type InsertMessage,
  type Message,
  type InsertHandoff,
  type Handoff,
  type InsertMemory,
  type Memory,
  type InsertWorkspaceMember,
  type WorkspaceMember,
} from "@shared/schema";
import { randomBytes } from "crypto";

export interface IStorage {
  // Humans
  getHumanById(id: string): Promise<Human | undefined>;
  getHumanByEmail(email: string): Promise<Human | undefined>;
  createHuman(human: InsertHuman): Promise<Human>;

  // Workspaces
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesForHuman(humanId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;

  // Workspace Members
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  getWorkspaceMember(workspaceId: string, humanId: string): Promise<WorkspaceMember | undefined>;

  // Agents
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentByApiKey(apiKey: string): Promise<Agent | undefined>;
  getAgentsForWorkspace(workspaceId: string): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgentLastSeen(id: string): Promise<void>;

  // Channels
  getChannel(id: string): Promise<Channel | undefined>;
  getChannelsForWorkspace(workspaceId: string): Promise<Channel[]>;
  createChannel(channel: InsertChannel): Promise<Channel>;

  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesForChannel(channelId: string, limit?: number, before?: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // Handoffs
  getHandoff(id: string): Promise<Handoff | undefined>;
  getHandoffsForWorkspace(workspaceId: string, status?: string): Promise<Handoff[]>;
  createHandoff(handoff: InsertHandoff): Promise<Handoff>;
  updateHandoffStatus(id: string, status: string): Promise<Handoff | undefined>;

  // Memory
  getMemory(agentId: string, key: string): Promise<Memory | undefined>;
  getMemoriesByPrefix(agentId: string, prefix: string): Promise<Memory[]>;
  setMemory(memory: InsertMemory): Promise<Memory>;
  deleteMemory(agentId: string, key: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Humans
  async getHumanById(id: string): Promise<Human | undefined> {
    const [human] = await db.select().from(humans).where(eq(humans.id, id));
    return human;
  }

  async getHumanByEmail(email: string): Promise<Human | undefined> {
    const [human] = await db.select().from(humans).where(eq(humans.email, email));
    return human;
  }

  async createHuman(human: InsertHuman): Promise<Human> {
    const [newHuman] = await db.insert(humans).values(human).returning();
    return newHuman;
  }

  // Workspaces
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspacesForHuman(humanId: string): Promise<Workspace[]> {
    const memberRows = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.humanId, humanId));

    if (memberRows.length === 0) return [];

    const workspaceIds = memberRows.map((m) => m.workspaceId);
    const result = await db.select().from(workspaces);
    return result.filter((w) => workspaceIds.includes(w.id));
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [newWorkspace] = await db.insert(workspaces).values(workspace).returning();
    return newWorkspace;
  }

  // Workspace Members
  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [newMember] = await db.insert(workspaceMembers).values(member).returning();
    return newMember;
  }

  async getWorkspaceMember(workspaceId: string, humanId: string): Promise<WorkspaceMember | undefined> {
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.humanId, humanId)));
    return member;
  }

  // Agents
  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async getAgentByApiKey(apiKey: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.apiKey, apiKey));
    return agent;
  }

  async getAgentsForWorkspace(workspaceId: string): Promise<Agent[]> {
    return db.select().from(agents).where(eq(agents.workspaceId, workspaceId));
  }

  async createAgent(agent: InsertAgent): Promise<Agent> {
    const [newAgent] = await db.insert(agents).values(agent).returning();
    return newAgent;
  }

  async updateAgentLastSeen(id: string): Promise<void> {
    await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, id));
  }

  // Channels
  async getChannel(id: string): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id));
    return channel;
  }

  async getChannelsForWorkspace(workspaceId: string): Promise<Channel[]> {
    return db.select().from(channels).where(eq(channels.workspaceId, workspaceId));
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [newChannel] = await db.insert(channels).values(channel).returning();
    return newChannel;
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message;
  }

  async getMessagesForChannel(channelId: string, limit = 50, before?: string): Promise<Message[]> {
    let query = db
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const result = await query;
    return result.reverse(); // Return in chronological order
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  // Handoffs
  async getHandoff(id: string): Promise<Handoff | undefined> {
    const [handoff] = await db.select().from(handoffs).where(eq(handoffs.id, id));
    return handoff;
  }

  async getHandoffsForWorkspace(workspaceId: string, status?: string): Promise<Handoff[]> {
    if (status) {
      return db
        .select()
        .from(handoffs)
        .where(and(eq(handoffs.workspaceId, workspaceId), eq(handoffs.status, status as any)))
        .orderBy(desc(handoffs.createdAt));
    }
    return db.select().from(handoffs).where(eq(handoffs.workspaceId, workspaceId)).orderBy(desc(handoffs.createdAt));
  }

  async createHandoff(handoff: InsertHandoff): Promise<Handoff> {
    const [newHandoff] = await db.insert(handoffs).values(handoff).returning();
    return newHandoff;
  }

  async updateHandoffStatus(id: string, status: string): Promise<Handoff | undefined> {
    const updateData: Partial<Handoff> = { status: status as any };
    if (status === "RESOLVED") {
      updateData.resolvedAt = new Date();
    }
    const [updated] = await db.update(handoffs).set(updateData).where(eq(handoffs.id, id)).returning();
    return updated;
  }

  // Memory
  async getMemory(agentId: string, key: string): Promise<Memory | undefined> {
    const [memory] = await db
      .select()
      .from(memories)
      .where(and(eq(memories.agentId, agentId), eq(memories.key, key)));
    return memory;
  }

  async getMemoriesByPrefix(agentId: string, prefix: string): Promise<Memory[]> {
    return db
      .select()
      .from(memories)
      .where(and(eq(memories.agentId, agentId), like(memories.key, `${prefix}%`)));
  }

  async setMemory(memory: InsertMemory): Promise<Memory> {
    // Upsert: delete existing then insert
    await db
      .delete(memories)
      .where(and(eq(memories.agentId, memory.agentId), eq(memories.key, memory.key)));
    const [newMemory] = await db.insert(memories).values(memory).returning();
    return newMemory;
  }

  async deleteMemory(agentId: string, key: string): Promise<void> {
    await db.delete(memories).where(and(eq(memories.agentId, agentId), eq(memories.key, key)));
  }
}

export function generateApiKey(): string {
  return `sk_${randomBytes(32).toString("hex")}`;
}

export const storage = new DatabaseStorage();
