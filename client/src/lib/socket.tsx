import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface SocketContextType {
  socket: WebSocket | null;
  isConnected: boolean;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  joinWorkspace: (workspaceId: string) => void;
  leaveWorkspace: (workspaceId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children, token }: { children: ReactNode; token: string | null }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [token]);

  function joinChannel(channelId: string) {
    if (socket && isConnected) {
      socket.send(JSON.stringify({ type: "join_channel", channelId }));
    }
  }

  function leaveChannel(channelId: string) {
    if (socket && isConnected) {
      socket.send(JSON.stringify({ type: "leave_channel", channelId }));
    }
  }

  function joinWorkspace(workspaceId: string) {
    if (socket && isConnected) {
      socket.send(JSON.stringify({ type: "join_workspace", workspaceId }));
    }
  }

  function leaveWorkspace(workspaceId: string) {
    if (socket && isConnected) {
      socket.send(JSON.stringify({ type: "leave_workspace", workspaceId }));
    }
  }

  return (
    <SocketContext.Provider value={{ socket, isConnected, joinChannel, leaveChannel, joinWorkspace, leaveWorkspace }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
