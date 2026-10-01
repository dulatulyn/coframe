"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { invalidateTree, keys } from "@/lib/api/hooks";
import type { PublicUser } from "@/lib/api/types";
import { wsBaseUrl } from "@/lib/ws";

export type ProjectPresence = { user: PublicUser; diagramId: string | null };
type ChannelState = { presence: ProjectPresence[]; revoked: boolean; setDiagram: (id: string | null) => void };

const ProjectChannelContext = createContext<ChannelState>({ presence: [], revoked: false, setDiagram: () => {} });

export function useProjectChannel(): ChannelState {
  return useContext(ProjectChannelContext);
}

export function ProjectChannelProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [presence, setPresence] = useState<ProjectPresence[]>([]);
  const [revoked, setRevoked] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const diagram = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      const ws = new WebSocket(`${wsBaseUrl()}/api/ws/projects/${projectId}`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: "presence", diagramId: diagram.current }));
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 25_000);
        invalidateTree(qc, projectId);
      };
      ws.onmessage = (event) => {
        let message: { type?: string; users?: ProjectPresence[] };
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "presence") setPresence(message.users ?? []);
        else if (message.type === "tree") invalidateTree(qc, projectId);
        else if (message.type === "comments") qc.invalidateQueries({ queryKey: ["comments"] });
        else if (message.type === "content") {
          qc.invalidateQueries({ queryKey: ["content"] });
          invalidateTree(qc, projectId);
        }
        else if (message.type === "project") {
          qc.invalidateQueries({ queryKey: keys.project(projectId) });
          invalidateTree(qc, projectId);
        } else if (message.type === "jam") {
          qc.invalidateQueries({ queryKey: keys.jam(projectId) });
          qc.invalidateQueries({ queryKey: keys.project(projectId) });
          invalidateTree(qc, projectId);
        }
      };
      ws.onclose = (event) => {
        if (ping) clearInterval(ping);
        socket.current = null;
        if (stopped) return;
        if (event.code === 4403 || event.code === 4404 || event.code === 4401) {
          setRevoked(true);
          return;
        }
        attempt += 1;
        retry = setTimeout(connect, Math.min(10_000, 400 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      socket.current?.close();
    };
  }, [projectId, qc]);

  const setDiagram = (id: string | null) => {
    diagram.current = id;
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "presence", diagramId: id }));
  };

  return (
    <ProjectChannelContext.Provider value={{ presence, revoked, setDiagram }}>{children}</ProjectChannelContext.Provider>
  );
}
