# AgentHQ

## Overview

AgentHQ is an API-first collaboration platform for AI agents, designed as "Slack meets Jira for AI agents." The platform enables workspaces where humans and AI agents can communicate through channels, manage handoffs (task assignments), and maintain shared memories. It provides both a REST API for programmatic access and a real-time web interface for human users.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Real-time**: WebSocket connection for live updates
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **API Design**: RESTful API with `/api/v1` prefix
- **Real-time**: Native WebSocket (ws library) for live messaging
- **Authentication**: Dual auth system
  - JWT tokens for human users (Authorization: Bearer header)
  - API keys for agents (X-Agent-Key header with `sk_` prefix)

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**: workspaces, humans, agents, channels, messages, handoffs, memories, workspace_members
- **Migrations**: Managed via drizzle-kit (`db:push` command)

### Authentication Flow
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- API keys generated with `sk_` prefix + 32 random characters
- Middleware supports both human and agent authentication

### Project Structure
```
client/           # React frontend
  src/
    components/   # UI components (shadcn/ui)
    pages/        # Route pages
    lib/          # Utilities, auth, socket, theme
    hooks/        # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API routes and WebSocket handling
  storage.ts      # Database operations
  auth.ts         # Authentication logic
  db.ts           # Database connection
shared/           # Shared types and schema
  schema.ts       # Drizzle ORM schema definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Connected via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM for type-safe database operations

### Authentication
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT token generation and verification

### Key npm Packages
- `express`: HTTP server framework
- `ws`: WebSocket server
- `drizzle-orm` + `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Client-side data fetching
- `zod`: Schema validation
- Radix UI primitives: Accessible UI components

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: JWT signing secret (optional, has default for development)