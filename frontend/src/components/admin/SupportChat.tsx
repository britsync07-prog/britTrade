import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Clock, Search, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

interface Chat {
  telegramId: string;
  firstName: string;
  lastName: string;
  username: string;
  lastMessageAt: string;
}

interface Message {
  id: number;
  chatId: string;
  sender: 'user' | 'admin';
  text: string;
  timestamp: string;
}

export default function SupportChat() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 10000); // Refresh chat list every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.telegramId);
      const interval = setInterval(() => fetchMessages(selectedChat.telegramId), 3000); // Poll for messages every 3s
      return () => clearInterval(interval);
    }
  }, [selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChats = async () => {
    try {
      const res = await api.get('/admin/support/chats');
      setChats(res.data);
    } catch (e) {
      console.error('Failed to fetch chats', e);
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      const res = await api.get(`/admin/support/chats/${chatId}/messages`);
      setMessages(res.data);
    } catch (e) {
      console.error('Failed to fetch messages', e);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !replyText.trim()) return;

    const text = replyText;
    setReplyText('');

    try {
      await api.post(`/admin/support/chats/${selectedChat.telegramId}/messages`, { text });
      fetchMessages(selectedChat.telegramId);
    } catch (e) {
      alert('Failed to send message');
      setReplyText(text);
    }
  };

  const filteredChats = chats.filter(c => 
    c.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telegramId.includes(searchQuery)
  );

  return (
    <div className="flex h-[700px] glass-card overflow-hidden border-white/5 bg-slate-950/40 backdrop-blur-xl">
      {/* Sidebar - Chat List */}
      <div className="w-80 border-r border-white/5 flex flex-col bg-white/[0.02]">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-black tracking-tighter text-white uppercase">Support Center</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Search operators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {loadingChats ? (
            <div className="flex justify-center p-8">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center p-8 text-slate-600 text-xs font-bold uppercase tracking-widest">No active chats</div>
          ) : (
            filteredChats.map(chat => (
              <button
                key={chat.telegramId}
                onClick={() => setSelectedChat(chat)}
                className={`w-full p-4 rounded-2xl text-left transition-all flex gap-4 items-center group ${
                  selectedChat?.telegramId === chat.telegramId 
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' 
                    : 'hover:bg-white/5 text-slate-400'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border transition-all ${
                  selectedChat?.telegramId === chat.telegramId ? 'bg-white/20 border-white/20' : 'bg-slate-900 border-white/5 group-hover:border-cyan-500/30'
                }`}>
                  {chat.firstName?.[0] || chat.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm truncate ${selectedChat?.telegramId === chat.telegramId ? 'text-white' : 'text-slate-200'}`}>
                    {chat.firstName} {chat.lastName}
                  </div>
                  <div className={`text-[10px] font-medium truncate ${selectedChat?.telegramId === chat.telegramId ? 'text-cyan-100' : 'text-slate-500'}`}>
                    @{chat.username || chat.telegramId}
                  </div>
                </div>
                <div className={`text-[9px] font-black uppercase opacity-60 ${selectedChat?.telegramId === chat.telegramId ? 'text-white' : ''}`}>
                  {new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-950/20">
        {selectedChat ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg font-black text-white shadow-lg shadow-cyan-500/20">
                  {selectedChat.firstName?.[0] || '?'}
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">{selectedChat.firstName} {selectedChat.lastName}</h3>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">@{selectedChat.username || selectedChat.telegramId}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] space-y-2`}>
                      <div className={`px-6 py-4 rounded-3xl text-sm font-medium shadow-sm ${
                        msg.sender === 'admin' 
                          ? 'bg-white text-black rounded-tr-none' 
                          : 'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                      <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-600 ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                        {msg.sender === 'admin' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-6 border-t border-white/5 bg-white/[0.01]">
              <form onSubmit={handleSendReply} className="relative">
                <input 
                  type="text"
                  placeholder="Initiate tactical response..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-8 py-5 pr-20 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all shadow-inner"
                />
                <button 
                  type="submit"
                  disabled={!replyText.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-cyan-500 text-white rounded-xl hover:bg-cyan-400 transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-cyan-500/20"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-20">
             <MessageSquare size={120} className="text-white mb-6" />
             <h3 className="text-2xl font-black text-white uppercase tracking-tighter">No Active Transmission</h3>
             <p className="text-slate-400 font-medium">Select an operator from the registry to begin communication.</p>
          </div>
        )}
      </div>
    </div>
  );
}
