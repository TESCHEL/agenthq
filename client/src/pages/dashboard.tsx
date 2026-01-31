import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/lib/socket";
import { useTheme } from "@/lib/theme";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Hash,
  Plus,
  Send,
  LogOut,
  Moon,
  Sun,
  Building2,
  ArrowRightLeft,
  Loader2,
  ChevronDown,
  AlertCircle,
  Clock,
  CheckCircle2,
  Users,
} from "lucide-react";
import type { Workspace, Channel, Message, Handoff, Agent } from "@shared/schema";

interface MessageWithAuthor extends Message {
  authorName?: string;
  authorAvatar?: string;
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const { socket, isConnected, joinChannel, leaveChannel, joinWorkspace, leaveWorkspace } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showHandoffs, setShowHandoffs] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isCreateHandoffOpen, setIsCreateHandoffOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newHandoffTitle, setNewHandoffTitle] = useState("");
  const [newHandoffDescription, setNewHandoffDescription] = useState("");
  const [newHandoffPriority, setNewHandoffPriority] = useState<string>("MEDIUM");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/v1/workspaces"],
    enabled: !!token,
  });

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ["/api/v1/workspaces", selectedWorkspace?.id, "channels"],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspace.id}/channels`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch channels");
      return res.json();
    },
    enabled: !!selectedWorkspace && !!token,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/v1/workspaces", selectedWorkspace?.id, "agents"],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspace.id}/agents`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
    enabled: !!selectedWorkspace && !!token,
  });

  const { data: messages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery<MessageWithAuthor[]>({
    queryKey: ["/api/v1/channels", selectedChannel?.id, "messages"],
    queryFn: async () => {
      if (!selectedChannel) return [];
      const res = await fetch(`/api/v1/channels/${selectedChannel.id}/messages?limit=50`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedChannel && !!token,
  });

  const { data: handoffs = [], isLoading: handoffsLoading, refetch: refetchHandoffs } = useQuery<Handoff[]>({
    queryKey: ["/api/v1/workspaces", selectedWorkspace?.id, "handoffs"],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspace.id}/handoffs`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch handoffs");
      return res.json();
    },
    enabled: !!selectedWorkspace && !!token,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/v1/channels/${selectedChannel!.id}/messages`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      refetchMessages();
      setMessageInput("");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to send message" });
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspace!.id}/channels`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/workspaces", selectedWorkspace?.id, "channels"] });
      setIsCreateChannelOpen(false);
      setNewChannelName("");
      toast({ title: "Channel created successfully" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to create channel" });
    },
  });

  const createHandoffMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; priority: string }) => {
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspace!.id}/handoffs`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create handoff");
      return res.json();
    },
    onSuccess: () => {
      refetchHandoffs();
      setIsCreateHandoffOpen(false);
      setNewHandoffTitle("");
      setNewHandoffDescription("");
      setNewHandoffPriority("MEDIUM");
      toast({ title: "Handoff created successfully" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to create handoff" });
    },
  });

  const updateHandoffMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/v1/handoffs/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update handoff");
      return res.json();
    },
    onSuccess: () => {
      refetchHandoffs();
      toast({ title: "Handoff updated successfully" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update handoff" });
    },
  });

  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace) {
      setSelectedWorkspace(workspaces[0]);
    }
  }, [workspaces, selectedWorkspace]);

  useEffect(() => {
    if (channels.length > 0 && !selectedChannel) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

  useEffect(() => {
    if (selectedWorkspace) {
      joinWorkspace(selectedWorkspace.id);
      return () => leaveWorkspace(selectedWorkspace.id);
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    if (selectedChannel) {
      joinChannel(selectedChannel.id);
      return () => leaveChannel(selectedChannel.id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (socket) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "message.created" && data.channelId === selectedChannel?.id) {
            refetchMessages();
          } else if (data.type === "handoff.created" || data.type === "handoff.updated") {
            refetchHandoffs();
          }
        } catch {
          // Ignore parse errors
        }
      };
      socket.addEventListener("message", handleMessage);
      return () => socket.removeEventListener("message", handleMessage);
    }
  }, [socket, selectedChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannel) return;
    sendMessageMutation.mutate(messageInput.trim());
  }

  function handleLogout() {
    logout();
    setLocation("/login");
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "OPEN":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
      case "IN_PROGRESS":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "RESOLVED":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      default:
        return "";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "OPEN":
        return <AlertCircle className="w-3 h-3" />;
      case "IN_PROGRESS":
        return <Clock className="w-3 h-3" />;
      case "RESOLVED":
        return <CheckCircle2 className="w-3 h-3" />;
      default:
        return null;
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case "URGENT":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
      case "HIGH":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      case "MEDIUM":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "LOW":
        return "bg-muted text-muted-foreground";
      default:
        return "";
    }
  }

  function getNextStatus(current: string): string | null {
    switch (current) {
      case "OPEN":
        return "IN_PROGRESS";
      case "IN_PROGRESS":
        return "RESOLVED";
      default:
        return null;
    }
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (workspacesLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">AgentHQ</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Workspaces
                </span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {workspaces.map((ws) => (
                    <SidebarMenuItem key={ws.id}>
                      <SidebarMenuButton
                        data-testid={`workspace-${ws.id}`}
                        isActive={selectedWorkspace?.id === ws.id}
                        onClick={() => {
                          setSelectedWorkspace(ws);
                          setSelectedChannel(null);
                          setShowHandoffs(false);
                        }}
                      >
                        <span className="truncate">{ws.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {selectedWorkspace && (
              <>
                <SidebarGroup>
                  <SidebarGroupLabel className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Hash className="w-4 h-4" />
                      Channels
                    </span>
                    <Dialog open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-5 w-5" data-testid="button-create-channel">
                          <Plus className="w-3 h-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Channel</DialogTitle>
                          <DialogDescription>
                            Create a new channel for your workspace
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="channel-name">Channel Name</Label>
                            <Input
                              id="channel-name"
                              data-testid="input-channel-name"
                              value={newChannelName}
                              onChange={(e) => setNewChannelName(e.target.value)}
                              placeholder="general"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => createChannelMutation.mutate(newChannelName)}
                            disabled={!newChannelName.trim() || createChannelMutation.isPending}
                            data-testid="button-submit-channel"
                          >
                            {createChannelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {channelsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : (
                        channels.map((channel) => (
                          <SidebarMenuItem key={channel.id}>
                            <SidebarMenuButton
                              data-testid={`channel-${channel.id}`}
                              isActive={selectedChannel?.id === channel.id && !showHandoffs}
                              onClick={() => {
                                setSelectedChannel(channel);
                                setShowHandoffs(false);
                              }}
                            >
                              <Hash className="w-4 h-4" />
                              <span className="truncate">{channel.name}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    Handoffs
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          data-testid="button-handoffs"
                          isActive={showHandoffs}
                          onClick={() => setShowHandoffs(true)}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          <span>View Handoffs</span>
                          {handoffs.filter((h) => h.status !== "RESOLVED").length > 0 && (
                            <Badge variant="secondary" className="ml-auto">
                              {handoffs.filter((h) => h.status !== "RESOLVED").length}
                            </Badge>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                {agents.length > 0 && (
                  <SidebarGroup>
                    <SidebarGroupLabel className="flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Agents
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {agents.map((agent) => (
                          <SidebarMenuItem key={agent.id}>
                            <SidebarMenuButton>
                              <div className="relative">
                                <Bot className="w-4 h-4" />
                                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${agent.isActive ? "bg-status-online" : "bg-status-offline"}`} />
                              </div>
                              <span className="truncate">{agent.name}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )}
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme">
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-14 border-b flex items-center justify-between gap-4 px-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {showHandoffs ? (
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-muted-foreground" />
                  <span className="font-semibold">Handoffs</span>
                </div>
              ) : selectedChannel ? (
                <div className="flex items-center gap-2">
                  <Hash className="w-5 h-5 text-muted-foreground" />
                  <span className="font-semibold">{selectedChannel.name}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select a channel</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 text-xs ${isConnected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-muted"}`} />
                {isConnected ? "Connected" : "Disconnected"}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-hidden">
            {showHandoffs ? (
              <div className="h-full p-6 overflow-auto">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold">Handoffs</h2>
                      <p className="text-muted-foreground">Manage task handoffs between agents and humans</p>
                    </div>
                    <Dialog open={isCreateHandoffOpen} onOpenChange={setIsCreateHandoffOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-create-handoff">
                          <Plus className="w-4 h-4 mr-2" />
                          New Handoff
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Handoff</DialogTitle>
                          <DialogDescription>
                            Create a new task handoff for your team
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="handoff-title">Title</Label>
                            <Input
                              id="handoff-title"
                              data-testid="input-handoff-title"
                              value={newHandoffTitle}
                              onChange={(e) => setNewHandoffTitle(e.target.value)}
                              placeholder="Requires human review"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="handoff-description">Description</Label>
                            <Textarea
                              id="handoff-description"
                              data-testid="input-handoff-description"
                              value={newHandoffDescription}
                              onChange={(e) => setNewHandoffDescription(e.target.value)}
                              placeholder="Describe the task..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="handoff-priority">Priority</Label>
                            <Select value={newHandoffPriority} onValueChange={setNewHandoffPriority}>
                              <SelectTrigger data-testid="select-handoff-priority">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LOW">Low</SelectItem>
                                <SelectItem value="MEDIUM">Medium</SelectItem>
                                <SelectItem value="HIGH">High</SelectItem>
                                <SelectItem value="URGENT">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() =>
                              createHandoffMutation.mutate({
                                title: newHandoffTitle,
                                description: newHandoffDescription,
                                priority: newHandoffPriority,
                              })
                            }
                            disabled={!newHandoffTitle.trim() || createHandoffMutation.isPending}
                            data-testid="button-submit-handoff"
                          >
                            {createHandoffMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {handoffsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : handoffs.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <ArrowRightLeft className="w-12 h-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No handoffs yet</h3>
                        <p className="text-muted-foreground text-center mb-4">
                          Create your first handoff to start collaborating
                        </p>
                        <Button onClick={() => setIsCreateHandoffOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          New Handoff
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {handoffs.map((handoff) => (
                        <Card key={handoff.id} data-testid={`handoff-${handoff.id}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-lg">{handoff.title}</CardTitle>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className={`${getStatusColor(handoff.status)} flex items-center gap-1`}>
                                  {getStatusIcon(handoff.status)}
                                  {handoff.status.replace("_", " ")}
                                </Badge>
                                <Badge variant="outline" className={getPriorityColor(handoff.priority)}>
                                  {handoff.priority}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {handoff.description && (
                              <p className="text-muted-foreground text-sm mb-4">{handoff.description}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Created {new Date(handoff.createdAt).toLocaleDateString()}
                              </span>
                              {getNextStatus(handoff.status) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateHandoffMutation.mutate({
                                      id: handoff.id,
                                      status: getNextStatus(handoff.status)!,
                                    })
                                  }
                                  disabled={updateHandoffMutation.isPending}
                                  data-testid={`button-update-handoff-${handoff.id}`}
                                >
                                  {updateHandoffMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                                  Move to {getNextStatus(handoff.status)?.replace("_", " ")}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedChannel ? (
              <div className="flex flex-col h-full">
                <ScrollArea className="flex-1 p-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Hash className="w-12 h-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No messages yet</h3>
                      <p className="text-muted-foreground">
                        Start the conversation in #{selectedChannel.name}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-3xl mx-auto">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className="flex items-start gap-3"
                          data-testid={`message-${message.id}`}
                        >
                          <Avatar className="flex-shrink-0">
                            <AvatarFallback>
                              {message.authorType === "agent" ? (
                                <Bot className="w-4 h-4" />
                              ) : message.authorType === "system" ? (
                                <AlertCircle className="w-4 h-4" />
                              ) : (
                                message.authorName?.charAt(0).toUpperCase() || "U"
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {message.authorName || (message.authorType === "system" ? "System" : "Unknown")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(message.createdAt).toLocaleTimeString()}
                              </span>
                              {message.authorType === "agent" && (
                                <Badge variant="outline" className="text-xs">Agent</Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{message.content}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                <div className="p-4 border-t flex-shrink-0">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-3xl mx-auto">
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder={`Message #${selectedChannel.name}`}
                      className="flex-1"
                      data-testid="input-message"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      data-testid="button-send-message"
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Users className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium mb-2">Welcome to AgentHQ</h3>
                <p className="text-muted-foreground max-w-md">
                  {channels.length === 0
                    ? "Create a channel to start collaborating with your team and AI agents"
                    : "Select a channel from the sidebar to start messaging"}
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
