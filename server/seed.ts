import { db } from "./db";
import { storage, generateApiKey } from "./storage";
import bcrypt from "bcrypt";
import { workspaces, humans, channels, agents, messages, handoffs, workspaceMembers } from "@shared/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

async function seed() {
  console.log("Checking if seed data exists...");

  // Check if demo user exists
  const existingUser = await storage.getHumanByEmail("demo@agenthq.io");
  if (existingUser) {
    console.log("Seed data already exists, skipping...");
    return;
  }

  console.log("Seeding database...");

  // Create demo user
  const hashedPassword = await bcrypt.hash("demo123", SALT_ROUNDS);
  const demoUser = await storage.createHuman({
    email: "demo@agenthq.io",
    name: "Alex Chen",
    password: hashedPassword,
  });
  console.log("Created demo user:", demoUser.email);

  // Create additional users
  const sarah = await storage.createHuman({
    email: "sarah@agenthq.io",
    name: "Sarah Miller",
    password: hashedPassword,
  });

  const mike = await storage.createHuman({
    email: "mike@agenthq.io",
    name: "Mike Johnson",
    password: hashedPassword,
  });

  // Create workspace
  const workspace = await storage.createWorkspace({
    name: "Acme Corp",
    slug: "acme-corp",
  });
  console.log("Created workspace:", workspace.name);

  // Add users to workspace
  await storage.addWorkspaceMember({
    workspaceId: workspace.id,
    humanId: demoUser.id,
    role: "owner",
  });

  await storage.addWorkspaceMember({
    workspaceId: workspace.id,
    humanId: sarah.id,
    role: "member",
  });

  await storage.addWorkspaceMember({
    workspaceId: workspace.id,
    humanId: mike.id,
    role: "member",
  });

  // Create channels
  const generalChannel = await storage.createChannel({
    workspaceId: workspace.id,
    name: "general",
    description: "General discussion and announcements",
    isPrivate: false,
  });

  const engineeringChannel = await storage.createChannel({
    workspaceId: workspace.id,
    name: "engineering",
    description: "Engineering team discussions",
    isPrivate: false,
  });

  const supportChannel = await storage.createChannel({
    workspaceId: workspace.id,
    name: "support",
    description: "Customer support escalations",
    isPrivate: false,
  });

  console.log("Created channels");

  // Create AI agents
  const codeReviewAgent = await storage.createAgent({
    workspaceId: workspace.id,
    name: "CodeReview Bot",
    description: "Automated code review and suggestions",
    apiKey: generateApiKey(),
    isActive: true,
  });

  const supportAgent = await storage.createAgent({
    workspaceId: workspace.id,
    name: "Support Assistant",
    description: "AI-powered customer support helper",
    apiKey: generateApiKey(),
    isActive: true,
  });

  const dataAgent = await storage.createAgent({
    workspaceId: workspace.id,
    name: "Data Analyzer",
    description: "Analyzes data and generates reports",
    apiKey: generateApiKey(),
    isActive: false,
  });

  console.log("Created AI agents");

  // Create messages in general channel
  await storage.createMessage({
    channelId: generalChannel.id,
    authorType: "human",
    authorId: demoUser.id,
    content: "Welcome to AgentHQ! This is where humans and AI agents collaborate.",
    messageType: "TEXT",
  });

  await storage.createMessage({
    channelId: generalChannel.id,
    authorType: "agent",
    authorId: supportAgent.id,
    content: "Hello team! I'm the Support Assistant. I'm here to help with customer inquiries and escalations.",
    messageType: "TEXT",
  });

  await storage.createMessage({
    channelId: generalChannel.id,
    authorType: "human",
    authorId: sarah.id,
    content: "Great to have AI assistance! Looking forward to improved response times.",
    messageType: "TEXT",
  });

  await storage.createMessage({
    channelId: generalChannel.id,
    authorType: "agent",
    authorId: codeReviewAgent.id,
    content: "I've completed reviewing the latest PR. Found 3 potential improvements. Check the engineering channel for details.",
    messageType: "TEXT",
  });

  await storage.createMessage({
    channelId: generalChannel.id,
    authorType: "human",
    authorId: mike.id,
    content: "Thanks CodeReview Bot! I'll take a look at those suggestions.",
    messageType: "TEXT",
  });

  // Create messages in engineering channel
  await storage.createMessage({
    channelId: engineeringChannel.id,
    authorType: "agent",
    authorId: codeReviewAgent.id,
    content: "PR #142 Review Summary:\n\n1. Consider using async/await instead of callbacks on line 45\n2. Missing error handling in the API endpoint\n3. Unused variable 'tempData' can be removed\n\nOverall: Good work! Minor improvements suggested.",
    messageType: "TEXT",
  });

  await storage.createMessage({
    channelId: engineeringChannel.id,
    authorType: "human",
    authorId: mike.id,
    content: "Good catch on the async/await. I'll refactor that section.",
    messageType: "TEXT",
  });

  // Create messages in support channel
  await storage.createMessage({
    channelId: supportChannel.id,
    authorType: "agent",
    authorId: supportAgent.id,
    content: "New support ticket #2847: Customer unable to access their dashboard after password reset. Priority: High. I've initiated the standard troubleshooting flow but may need human escalation.",
    messageType: "TEXT",
  });

  console.log("Created sample messages");

  // Create handoffs
  await storage.createHandoff({
    workspaceId: workspace.id,
    channelId: supportChannel.id,
    title: "Customer dashboard access issue",
    description: "Customer John Doe (john@example.com) cannot access dashboard after password reset. Standard troubleshooting unsuccessful. Need human verification of account status.",
    status: "OPEN",
    priority: "HIGH",
    fromAgentId: supportAgent.id,
  });

  await storage.createHandoff({
    workspaceId: workspace.id,
    channelId: engineeringChannel.id,
    title: "Complex merge conflict resolution",
    description: "Multiple conflicting changes in the authentication module. Automated resolution could not safely proceed.",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    fromAgentId: codeReviewAgent.id,
    toHumanId: mike.id,
  });

  await storage.createHandoff({
    workspaceId: workspace.id,
    title: "API rate limit configuration review",
    description: "Proposed new rate limits need human approval before implementation.",
    status: "OPEN",
    priority: "LOW",
    fromAgentId: dataAgent.id,
  });

  await storage.createHandoff({
    workspaceId: workspace.id,
    title: "Security audit completed",
    description: "Quarterly security scan completed. No critical issues found. Report attached for review.",
    status: "RESOLVED",
    priority: "MEDIUM",
    fromAgentId: codeReviewAgent.id,
    toHumanId: demoUser.id,
  });

  console.log("Created sample handoffs");
  console.log("Database seeded successfully!");
  console.log("\nDemo credentials:");
  console.log("  Email: demo@agenthq.io");
  console.log("  Password: demo123");
}

export { seed };
