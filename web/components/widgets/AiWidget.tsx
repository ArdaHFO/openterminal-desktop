"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiGet, apiPost, type Quote } from "../../lib/api";
import { useTerminal } from "../../store/terminal";

type Msg = { role: "user" | "assistant"; content: string };

export default function AiWidget() {
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const requestRef=useRef<{next:Msg[];symbol:string}|null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: status, error: statusError } = useQuery({queryKey: ['status'], queryFn: () => apiGet<{ai: boolean}>('/api/status'), refetchInterval: 60_000});

  const chat = useMutation({
    mutationFn: async ({next,symbol}:{next:Msg[];symbol:string}) => {
      let context: unknown = null;
      try {
        context = { activeSymbol:symbol, quote: (await apiGet<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbol)}`))[0] };
      } catch {
        // context is best-effort
      }
      const res = await apiPost<{ text: string }>("/api/ai/chat", { messages: next, context });
      return { next, reply: res.text };
    },
    onSuccess: ({ next, reply }) => {
      setMessages([...next, { role: "assistant", content: reply }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9 }), 50);
    },
  });

  const send = () => {
    const text = input.trim();
    if (!text || chat.isPending || status?.ai !== true) return;
    const next:Msg[]=[...messages,{role:"user",content:text}];
    const request={next,symbol:activeSymbol};requestRef.current=request;
    setMessages(next);
    setInput("");
    chat.mutate(request);
  };

  return (
    <div className="flex flex-col h-full">
      {statusError&&<div role="alert" className="p-2 down">AI status: {(statusError as Error).message}</div>}
      {status && !status.ai && <div className="p-2 dim">AI is not configured. Configure ANTHROPIC_API_KEY on the local server to use it. Messages and the selected quote are sent to the configured AI provider.</div>}
      <div ref={scrollRef} className="flex-1 overflow-auto p-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="dim">
            Ask about {activeSymbol}, the market, an indicator, or a headline. The current quote is shared as context.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <span className={m.role === "user" ? "amber" : "up"}>{m.role === "user" ? "YOU" : "AI"} ›</span>{" "}
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {chat.isPending && <div className="dim">thinking…</div>}
        {chat.error && <div role="alert" className="down">{(chat.error as Error).message} <button className="term-btn" disabled={chat.isPending||status?.ai!==true} onClick={()=>requestRef.current&&chat.mutate(requestRef.current)}>Retry message</button></div>}
      </div>
      <div className="flex gap-1 p-1 border-t border-[var(--border)] shrink-0">
        <input
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Ask about ${activeSymbol}…`}
        />
        <button className="term-btn" onClick={send} disabled={status?.ai !== true||chat.isPending}>SEND</button>
      </div>
    </div>
  );
}
