'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  isStreaming?: boolean;
}

interface ParsedMessage {
  body: string;
  options: string[];
}

const STARTER_QUESTIONS = [
  "What's the rotating torque for 2-7/8\" Spearhead?",
  "How does Spearhead compare to PH6?",
  "What material grade is Spearhead P-110?",
  "Tell me about the Spearhead connection design",
];

// Parse `[[OPTIONS: a | b | c]]` directive out of assistant messages — render as buttons.
function parseMessage(content: string): ParsedMessage {
  const re = /\[\[OPTIONS:\s*([^\]]+?)\]\]/i;
  const match = content.match(re);
  if (!match) return { body: content, options: [] };
  const options = match[1]
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
  const body = content.replace(re, '').trim();
  return { body, options };
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<Message[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    historyRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const history = historyRef.current.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessage: Message = { role: 'assistant', content: '', isStreaming: true };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let sources: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullContent += data.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: fullContent,
                  sources,
                  isStreaming: true,
                };
                return updated;
              });
            } else if (data.type === 'sources') {
              sources = data.sources;
            } else if (data.type === 'done') {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: fullContent,
                  sources,
                  isStreaming: false,
                };
                return updated;
              });
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errMsg}. Please try again.`,
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <header
        className="flex-shrink-0 border-b"
        style={{ borderColor: '#E4E4E7', background: '#FFFFFF' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/rigpal-logo.png"
              alt="RigPal"
              width={110}
              height={38}
              priority
              className="h-8 w-auto"
            />
            <div className="hidden sm:block w-px h-6" style={{ background: '#E4E4E7' }} />
            <div className="hidden sm:block">
              <div className="text-[13px] font-semibold" style={{ color: '#09090B', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
                Spearhead Technical Assistant
              </div>
              <div className="text-[11px]" style={{ color: '#71717A' }}>
                Tejas Tubular premium workstring specs
              </div>
            </div>
          </div>
          <a
            href="https://rigpal.com"
            target="_blank"
            rel="noopener"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors hidden md:inline-flex items-center gap-1.5"
            style={{ color: '#3F3F46', background: '#F4F4F5' }}
          >
            rigpal.com
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>
        </div>
      </header>

      {/* Messages */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <LandingState onQuestionClick={sendMessage} />
          ) : (
            <div className="space-y-5">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  onOptionClick={sendMessage}
                  disabled={isLoading}
                  isLast={i === messages.length - 1}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Footer disclaimer */}
      <div
        className="flex-shrink-0 text-center py-1.5 text-[10px]"
        style={{ color: '#A1A1AA', background: '#FAFAFA' }}
      >
        Powered by RigPal. Data limited to 2-3/8&quot; and 2-7/8&quot; Spearhead P-110. Always verify critical values against official Tejas Tubular documentation.
      </div>

      {/* Input */}
      <footer
        className="flex-shrink-0 border-t"
        style={{ borderColor: '#E4E4E7', background: '#FFFFFF' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about Spearhead connections..."
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl px-4 py-2.5 text-[15px] focus:outline-none disabled:opacity-50 transition-colors"
              style={{
                border: '1px solid #D4D4D8',
                background: '#FAFAFA',
                color: '#09090B',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                maxHeight: '120px',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#1E4D8C';
                e.currentTarget.style.background = '#FFFFFF';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#D4D4D8';
                e.currentTarget.style.background = '#FAFAFA';
              }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="flex-shrink-0 w-11 h-11 rounded-xl text-white flex items-center justify-center disabled:opacity-30 transition-all"
              style={{
                background: input.trim() && !isLoading ? '#1E4D8C' : '#A1A1AA',
              }}
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LandingState({ onQuestionClick }: { onQuestionClick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] text-center">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-sm"
        style={{ background: '#FFFFFF', border: '1px solid #E4E4E7' }}
      >
        <Image src="/rigpal-logo.png" alt="RigPal" width={60} height={21} />
      </div>
      <h1
        className="text-2xl sm:text-3xl font-semibold mb-3 tracking-tight"
        style={{ color: '#09090B', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}
      >
        Spearhead Technical Assistant
      </h1>
      <p
        className="mb-10 max-w-lg text-[15px] leading-relaxed"
        style={{ color: '#52525B' }}
      >
        Ask me about Spearhead premium workstring connections — torque specs, dimensions,
        wear life, running procedures, and comparisons to PH6.
      </p>

      <div className="text-xs uppercase tracking-wider mb-3 font-semibold" style={{ color: '#71717A' }}>
        Try asking
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
        {STARTER_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuestionClick(q)}
            className="text-left px-4 py-3.5 rounded-xl text-[14px] transition-all group"
            style={{
              border: '1px solid #E4E4E7',
              background: '#FFFFFF',
              color: '#18181B',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1E4D8C';
              e.currentTarget.style.background = '#F8FAFC';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(30, 77, 140, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#E4E4E7';
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="mt-0.5 w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                style={{ background: '#EEF4FF', color: '#1E4D8C' }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <span className="leading-snug">{q}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  msg,
  onOptionClick,
  disabled,
  isLast,
}: {
  msg: Message;
  onOptionClick: (text: string) => void;
  disabled: boolean;
  isLast: boolean;
}) {
  const parsed = msg.role === 'assistant' ? parseMessage(msg.content) : { body: msg.content, options: [] };
  const isEmpty = msg.role === 'assistant' && !parsed.body.trim() && msg.isStreaming;

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end msg-enter">
        <div
          className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed"
          style={{ background: '#1E4D8C', color: '#FFFFFF' }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5 msg-enter">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #E4E4E7' }}
      >
        <Image src="/rigpal-logo.png" alt="RigPal" width={24} height={8} />
      </div>
      <div className="max-w-[calc(100%-2.75rem)] flex-1">
        <div
          className="rounded-2xl rounded-tl-md px-4 py-3"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          {isEmpty ? (
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div className="prose-rp">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Wrap tables so they can scroll horizontally on mobile
                  table: ({ children, ...props }) => (
                    <div className="table-wrap">
                      <table {...props}>{children}</table>
                    </div>
                  ),
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                }}
              >
                {parsed.body}
              </ReactMarkdown>
              {msg.isStreaming && (
                <span
                  className="inline-block w-[3px] h-[14px] ml-0.5 align-middle animate-pulse"
                  style={{ background: '#DC2626', borderRadius: '1px' }}
                />
              )}
            </div>
          )}

          {/* Disambiguation / follow-up option buttons */}
          {!msg.isStreaming && parsed.options.length > 0 && (
            <div className="mt-3 pt-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid #F4F4F5' }}>
              {parsed.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onOptionClick(opt)}
                  disabled={disabled || !isLast}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    border: '1px solid #1E4D8C',
                    color: '#1E4D8C',
                    background: '#FFFFFF',
                  }}
                  onMouseEnter={e => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.background = '#1E4D8C';
                      e.currentTarget.style.color = '#FFFFFF';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.color = '#1E4D8C';
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
            <SourcesSection sources={msg.sources} />
          )}
        </div>
      </div>
    </div>
  );
});

function SourcesSection({ sources }: { sources: string[] }) {
  if (!sources || sources.length === 0) return null;
  const label = sources[0] || 'Based on Spearhead technical specifications';

  return (
    <div
      className="mt-3 pt-2.5 text-[11px] italic"
      style={{ borderTop: '1px solid #F4F4F5', color: '#71717A' }}
    >
      {label}
    </div>
  );
}
