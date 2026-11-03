'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, LogIn, Smile, Search, X, Trash2 } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface Message {
  id: string;
  channel_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  reactions?: Record<string, string[]>; // { "👍": ["user_id_1", "user_id_2"] }
}

const POPULAR_STICKERS = [
  { name: 'Pop Cat', url: 'https://media.tenor.com/2lF53G8oP4MAAAAC/pop-cat-cat.gif' },
  { name: 'Cat Jam', url: 'https://media.tenor.com/y_x1W4hLdSAAAAAC/cat-vibing.gif' },
  { name: 'Party Parrot', url: 'https://cultofthepartyparrot.com/parrots/hd/parrot.gif' },
  { name: 'Doge Dance', url: 'https://media.tenor.com/PZc3z_h0qYcAAAAC/doge-dance.gif' },
  { name: 'Pepe Pog', url: 'https://media.tenor.com/y29K29qK-sAAAAAC/pepe-pog.gif' },
  { name: 'Heart Cat', url: 'https://media.tenor.com/uGz32wE_bQAAAAAC/cat-heart.gif' },
];

const EMOJI_LIST = ['👍', '❤️', '😂', '🔥', '🎉', '💀'];

export default function ChatRoom({
  channelId,
  user,
  onRequireLogin,
}: {
  channelId: string;
  user: User | null;
  onRequireLogin: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'stickers' | 'gifs'>('stickers');
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<{ id: string; url: string; title: string }[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Fetch channel messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (data) setMessages(data);
    };

    fetchMessages();

    // 2. Real-time changes (INSERT, UPDATE, DELETE)
    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  // Fetch live GIPHY GIFs
  useEffect(() => {
    if (!showPicker || pickerTab !== 'gifs') return;

    const fetchLiveGifs = async () => {
      setLoadingGifs(true);
      try {
        const apiKey = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
        const endpoint = searchQuery.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchQuery)}&limit=16&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=16&rating=g`;

        const res = await fetch(endpoint);
        const data = await res.json();
        if (data?.data) {
          setGifs(
            data.data.map((item: any) => ({
              id: item.id,
              url: item.images.fixed_height.url,
              title: item.title,
            }))
          );
        }
      } catch (err) {
        console.error('GIF error:', err);
      } finally {
        setLoadingGifs(false);
      }
    };

    const timer = setTimeout(fetchLiveGifs, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, pickerTab, showPicker]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isImageOrGif = (content: string) => {
    return (
      content.match(/\.(gif|jpe?g|png|webp)($|\?)/i) ||
      content.includes('giphy.com') ||
      content.includes('tenor.com') ||
      content.includes('cultofthepartyparrot.com')
    );
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    if (!user) {
      onRequireLogin();
      return;
    }

    const messageText = text;
    setText('');

    await supabase.from('messages').insert({
      channel_id: channelId,
      user_id: user.id,
      content: messageText,
    });
  };

  const sendMedia = async (url: string) => {
    if (!user) {
      onRequireLogin();
      return;
    }

    setShowPicker(false);
    await supabase.from('messages').insert({
      channel_id: channelId,
      user_id: user.id,
      content: url,
    });
  };

  // Toggle Emoji Reaction on a message
  const handleToggleReaction = async (msg: Message, emoji: string) => {
    if (!user) {
      onRequireLogin();
      return;
    }

    const currentReactions: Record<string, string[]> = msg.reactions || {};
    const usersForEmoji = currentReactions[emoji] || [];
    const hasReacted = usersForEmoji.includes(user.id);

    let updatedUsers: string[];
    if (hasReacted) {
      updatedUsers = usersForEmoji.filter((id) => id !== user.id);
    } else {
      updatedUsers = [...usersForEmoji, user.id];
    }

    const updatedReactions = { ...currentReactions };
    if (updatedUsers.length > 0) {
      updatedReactions[emoji] = updatedUsers;
    } else {
      delete updatedReactions[emoji];
    }

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reactions: updatedReactions } : m))
    );

    await supabase
      .from('messages')
      .update({ reactions: updatedReactions })
      .eq('id', msg.id);
  };

  // Delete a message
  const handleDeleteMessage = async (msgId: string) => {
    // Optimistic delete
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    await supabase.from('messages').delete().eq('id', msgId);
  };

  return (
    <div className="flex flex-col h-full bg-[#313338] text-gray-200 relative">
      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-sm mt-4">
            Welcome to this channel! Send a message, GIF, or sticker!
          </div>
        ) : (
          messages.map((msg) => {
            const isMyMessage = user && msg.user_id === user.id;

            return (
              <div
                key={msg.id}
                className="group relative flex flex-col hover:bg-[#2b2d31] p-1.5 rounded transition"
              >
                {/* DISCORD FLOATING ACTION BAR ON HOVER */}
                <div className="absolute right-2 -top-3.5 hidden group-hover:flex items-center bg-[#313338] border border-[#1f2023] rounded-md shadow-md p-0.5 space-x-1 z-10">
                  {/* Quick Emojis */}
                  {EMOJI_LIST.slice(0, 3).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleToggleReaction(msg, emoji)}
                      className="hover:bg-[#383a40] p-1 rounded text-sm transition transform hover:scale-125"
                      title={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}

                  {/* Delete Button (Only for own messages) */}
                  {isMyMessage && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="hover:bg-[#383a40] text-gray-400 hover:text-red-400 p-1 rounded transition"
                      title="Delete Message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Message Header */}
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-sm text-indigo-400">
                    {isMyMessage ? 'You' : `User_${msg.user_id?.slice(0, 5) ?? 'Guest'}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Message Content */}
                {isImageOrGif(msg.content) ? (
                  <div className="mt-1">
                    <img
                      src={msg.content}
                      alt="media"
                      className="max-w-[240px] max-h-[180px] rounded-lg object-contain shadow-md"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-gray-100 mt-0.5 break-words">{msg.content}</p>
                )}

                {/* EMOJI REACTIONS DISPLAY */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                      const hasReacted = user && userIds.includes(user.id);

                      return (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(msg, emoji)}
                          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-xs border transition ${
                            hasReacted
                              ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-bold'
                              : 'bg-[#2b2d31] border-[#383a40] text-gray-300 hover:bg-[#35373c]'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* DISCORD STICKER & GIF PICKER */}
      {showPicker && (
        <div className="absolute bottom-16 right-4 w-80 h-96 bg-[#2b2d31] rounded-xl shadow-2xl border border-[#1f2023] flex flex-col z-50 overflow-hidden">
          <div className="flex items-center justify-between p-2.5 border-b border-[#1f2023] bg-[#232428]">
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setPickerTab('stickers')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  pickerTab === 'stickers' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Stickers
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('gifs')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  pickerTab === 'gifs' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                GIFs
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-gray-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {pickerTab === 'gifs' && (
            <div className="p-2 border-b border-[#1f2023]">
              <div className="flex items-center bg-[#1e1f22] rounded px-2.5 py-1.5">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search GIPHY..."
                  className="bg-transparent text-xs text-white outline-none flex-1 placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2.5">
            {pickerTab === 'stickers' ? (
              <div className="grid grid-cols-3 gap-2">
                {POPULAR_STICKERS.map((sticker) => (
                  <button
                    key={sticker.name}
                    type="button"
                    onClick={() => sendMedia(sticker.url)}
                    className="p-1.5 bg-[#1e1f22] hover:bg-[#35373c] rounded-lg transition flex flex-col items-center group"
                  >
                    <img
                      src={sticker.url}
                      alt={sticker.name}
                      className="w-16 h-16 object-contain group-hover:scale-110 transition-transform"
                    />
                    <span className="text-[10px] text-gray-400 mt-1 truncate w-full text-center">
                      {sticker.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                {loadingGifs ? (
                  <div className="text-center text-xs text-gray-400 py-8">Loading fresh GIFs...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {gifs.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => sendMedia(gif.url)}
                        className="relative group rounded-lg overflow-hidden h-24 bg-[#1e1f22] hover:ring-2 hover:ring-indigo-500 transition"
                      >
                        <img src={gif.url} alt={gif.title} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={sendMessage} className="p-4 bg-[#383a40]">
        <div className="flex items-center bg-[#40444b] rounded-lg px-4 py-2 space-x-2">
          {user ? (
            <>
              <input
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-400"
                placeholder="Message, send a sticker, or paste a GIF URL..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowPicker(!showPicker)}
                title="Stickers & GIFs"
                className={`p-1 rounded transition ${
                  showPicker ? 'text-indigo-400 bg-[#313338]' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Smile className="w-5 h-5" />
              </button>

              <button type="submit" className="text-gray-400 hover:text-white transition">
                <Send className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRequireLogin}
              className="w-full flex items-center justify-center space-x-2 text-indigo-300 hover:text-white text-sm py-1 transition"
            >
              <LogIn className="w-4 h-4" />
              <span>You must sign in with Google to send messages</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}