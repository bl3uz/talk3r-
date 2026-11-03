'use client';

import { useState, useEffect, useRef } from 'react';
import ChatRoom from '@/components/ChatRoom';
import { supabase } from '@/lib/supabase';
import { 
  Hash, Plus, MessageSquare, LogOut, LogIn, X, 
  Lock, Globe, UserPlus, Copy, Check, KeyRound, Trash2, Users, Crown, Settings, Edit3, Upload, 
  Compass, Search, Sparkles, UserCheck 
} from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface Server {
  id: string;
  name: string;
  is_private: boolean;
  invite_code?: string;
  owner_id?: string;
  member_count?: number;
}

interface Channel {
  id: string;
  name: string;
  server_id: string;
  created_by?: string;
}

interface MemberInfo {
  user_id: string;
  name: string;
  avatar_url: string;
  is_online: boolean;
  bio?: string;
  custom_status?: string;
  banner_color?: string;
  banner_url?: string;
  status_state?: string;
}

const BANNER_COLORS = [
  '#5865F2', '#ED4245', '#57F287', '#FEE75C', '#EB459E', '#2B2D31', '#1E1F22', '#00A8FC'
];

export default function Home() {
  // Navigation: 'hub' (Discovery) or 'server' (Inside a group)
  const [activeView, setActiveView] = useState<'hub' | 'server'>('hub');
  const [myServers, setMyServers] = useState<Server[]>([]);
  const [discoverServers, setDiscoverServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Hub Search
  const [hubSearch, setHubSearch] = useState('');

  // Profile & Member List states
  const [showMemberList, setShowMemberList] = useState(true);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<MemberInfo | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form
  const [myProfile, setMyProfile] = useState<MemberInfo>({
    user_id: '',
    name: '',
    avatar_url: '',
    is_online: true,
    bio: 'Hey there! I am using talk3r.',
    custom_status: 'Exploring talk3r!',
    banner_color: '#5865F2',
    banner_url: '',
    status_state: 'online',
  });

  // Modals
  const [showServerModal, setShowServerModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);

  // Inputs
  const [newServerName, setNewServerName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [copied, setCopied] = useState(false);

  // 1. Initial Load: User & Servers
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) loadMyProfile(user);
      loadAllServers(user?.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) loadMyProfile(currentUser);
      loadAllServers(currentUser?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadMyProfile = async (u: User) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single();
    if (data) {
      setMyProfile({
        user_id: u.id,
        name: data.username || u.user_metadata?.full_name || u.email?.split('@')[0],
        avatar_url: data.avatar_url || u.user_metadata?.avatar_url || '',
        is_online: true,
        bio: data.bio || 'Hey there! I am using talk3r.',
        custom_status: data.custom_status || 'Exploring talk3r!',
        banner_color: data.banner_color || '#5865F2',
        banner_url: data.banner_url || '',
        status_state: data.status_state || 'online',
      });
    }
  };

  // Fetch servers: distinguishes joined servers vs public discoverable servers
  const loadAllServers = async (userId?: string) => {
    // 1. Get all public servers
    const { data: allPublic } = await supabase
      .from('servers')
      .select('*')
      .eq('is_private', false)
      .order('created_at', { ascending: false });

    let userJoined: Server[] = [];

    if (userId) {
      const { data: memberships } = await supabase
        .from('server_members')
        .select('server_id')
        .eq('user_id', userId);

      if (memberships && memberships.length > 0) {
        const ids = memberships.map((m) => m.server_id);
        const { data: joinedData } = await supabase
          .from('servers')
          .select('*')
          .in('id', ids);

        if (joinedData) userJoined = joinedData;
      }
    }

    setMyServers(userJoined);

    // Discoverable = public servers that user hasn't joined yet
    const joinedIds = new Set(userJoined.map((s) => s.id));
    const unjoined = (allPublic || []).filter((s) => !joinedIds.has(s.id));
    setDiscoverServers(unjoined);

    // If user has no servers, default to the Hub!
    if (userJoined.length === 0) {
      setActiveView('hub');
      setActiveServer(null);
    }
  };

  // Switch to a server
  const selectServer = (server: Server) => {
    setActiveServer(server);
    setActiveView('server');
  };

  // Join a public server from the Hub
  const handleJoinFromHub = async (server: Server) => {
    if (!user) {
      handleGoogleLogin();
      return;
    }

    await supabase.from('server_members').upsert({
      server_id: server.id,
      user_id: user.id,
    });

    setMyServers((prev) => [...prev, server]);
    setDiscoverServers((prev) => prev.filter((s) => s.id !== server.id));
    selectServer(server);
  };

  // Leave server
  const handleLeaveServer = async (serverId: string) => {
    if (!user) return;
    const confirm = window.confirm('Are you sure you want to leave this group?');
    if (!confirm) return;

    await supabase.from('server_members').delete().match({ server_id: serverId, user_id: user.id });

    const remaining = myServers.filter((s) => s.id !== serverId);
    setMyServers(remaining);
    setActiveView('hub');
    setActiveServer(null);
    loadAllServers(user.id);
  };

  // 2. Fetch channels & presence for active server
  useEffect(() => {
    if (!activeServer || activeView !== 'server') return;

    const fetchChannels = async () => {
      const { data } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', activeServer.id)
        .order('created_at', { ascending: true });

      if (data) {
        setChannels(data);
        setActiveChannel(data[0] || null);
      }
    };
    fetchChannels();

    const presenceChannel = supabase.channel(`presence:${activeServer.id}`, {
      config: { presence: { key: user?.id || 'guest-' + Math.random().toString(36).substring(7) } },
    });

    const updatePresenceMembers = async () => {
      const { data: dbMembers } = await supabase
        .from('server_members')
        .select('user_id, profiles(id, username, avatar_url, bio, custom_status, banner_color, banner_url, status_state)')
        .eq('server_id', activeServer.id);

      const onlineState = presenceChannel.presenceState();
      const onlineUserIds = Object.keys(onlineState);
      const memberMap = new Map<string, MemberInfo>();

      if (dbMembers) {
        dbMembers.forEach((item: any) => {
          const prof = item.profiles;
          if (prof) {
            memberMap.set(prof.id, {
              user_id: prof.id,
              name: prof.username || 'talk3r Member',
              avatar_url: prof.avatar_url || '',
              is_online: onlineUserIds.includes(prof.id),
              bio: prof.bio,
              custom_status: prof.custom_status,
              banner_color: prof.banner_color,
              banner_url: prof.banner_url,
              status_state: prof.status_state,
            });
          }
        });
      }

      onlineUserIds.forEach((uid) => {
        const presences = onlineState[uid] as any[];
        if (presences && presences[0]) {
          const p = presences[0];
          memberMap.set(uid, {
            user_id: uid,
            name: p.name || 'Member',
            avatar_url: p.avatar_url || '',
            is_online: true,
            bio: p.bio,
            custom_status: p.custom_status,
            banner_color: p.banner_color,
            banner_url: p.banner_url,
            status_state: p.status_state,
          });
        }
      });

      setMembers(Array.from(memberMap.values()));
    };

    presenceChannel
      .on('presence', { event: 'sync' }, updatePresenceMembers)
      .on('presence', { event: 'join' }, updatePresenceMembers)
      .on('presence', { event: 'leave' }, updatePresenceMembers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) {
          await presenceChannel.track({
            name: myProfile.name,
            avatar_url: myProfile.avatar_url,
            bio: myProfile.bio,
            custom_status: myProfile.custom_status,
            banner_color: myProfile.banner_color,
            banner_url: myProfile.banner_url,
            status_state: myProfile.status_state,
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [activeServer, user, activeView]);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('banners')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setMyProfile((prev) => ({ ...prev, banner_url: event.target?.result as string }));
        };
        reader.readAsDataURL(file);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('banners')
          .getPublicUrl(filePath);

        setMyProfile((prev) => ({ ...prev, banner_url: publicUrl }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingBanner(false);
    }
  };

  const saveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    await supabase.from('profiles').update({
      username: myProfile.name,
      bio: myProfile.bio,
      custom_status: myProfile.custom_status,
      banner_color: myProfile.banner_color,
      banner_url: myProfile.banner_url,
      status_state: myProfile.status_state,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    setShowEditProfile(false);
  };

  const openInviteModal = async () => {
    if (!activeServer) return;
    if (!activeServer.invite_code) {
      const newCode = `TK3-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await supabase.from('servers').update({ invite_code: newCode }).eq('id', activeServer.id);
      setActiveServer({ ...activeServer, invite_code: newCode });
    }
    setShowInviteModal(true);
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName.trim() || !user) return;

    const generatedCode = `TK3-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data: newServer, error } = await supabase
      .from('servers')
      .insert({
        name: newServerName.trim(),
        is_private: isPrivate,
        invite_code: generatedCode,
        owner_id: user.id,
      })
      .select()
      .single();

    if (newServer && !error) {
      await supabase.from('server_members').insert({
        server_id: newServer.id,
        user_id: user.id,
      });

      const { data: defaultChannel } = await supabase
        .from('channels')
        .insert({ 
          server_id: newServer.id, 
          name: 'general',
          created_by: user.id 
        })
        .select()
        .single();

      setMyServers((prev) => [...prev, newServer]);
      selectServer(newServer);
      if (defaultChannel) setActiveChannel(defaultChannel);
      setNewServerName('');
      setIsPrivate(false);
      setShowServerModal(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!joinCode.trim() || !user) return;

    const { data: foundServer } = await supabase
      .from('servers')
      .select('*')
      .ilike('invite_code', joinCode.trim())
      .single();

    if (!foundServer) {
      setJoinError('Invalid invite code. Please check and try again.');
      return;
    }

    await supabase.from('server_members').upsert({
      server_id: foundServer.id,
      user_id: user.id,
    });

    if (!myServers.some((s) => s.id === foundServer.id)) {
      setMyServers((prev) => [...prev, foundServer]);
    }
    selectServer(foundServer);
    setJoinCode('');
    setShowJoinModal(false);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !activeServer || !user) return;

    const formattedName = newChannelName.toLowerCase().trim().replace(/\s+/g, '-');

    const { data: newChan, error } = await supabase
      .from('channels')
      .insert({ 
        server_id: activeServer.id, 
        name: formattedName,
        created_by: user.id 
      })
      .select()
      .single();

    if (newChan && !error) {
      setChannels((prev) => [...prev, newChan]);
      setActiveChannel(newChan);
      setNewChannelName('');
      setShowChannelModal(false);
    }
  };

  const handleDeleteChannel = async (e: React.MouseEvent, channelId: string, channelName: string) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Delete #${channelName}? All messages inside will be permanently deleted.`);
    if (!confirmed) return;

    const { error } = await supabase.from('channels').delete().eq('id', channelId);
    if (!error) {
      const remaining = channels.filter((c) => c.id !== channelId);
      setChannels(remaining);
      if (activeChannel?.id === channelId) {
        setActiveChannel(remaining[0] || null);
      }
    }
  };

  const copyInviteCode = () => {
    if (!activeServer?.invite_code) return;
    navigator.clipboard.writeText(activeServer.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'idle': return 'bg-amber-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-green-500';
    }
  };

  const onlineMembers = members.filter((m) => m.is_online);
  const offlineMembers = members.filter((m) => !m.is_online);

  const filteredDiscoverServers = discoverServers.filter((s) =>
    s.name.toLowerCase().includes(hubSearch.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-[#1e1f22]">
      {/* 1. DISCORD SERVER RAIL */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 select-none overflow-y-auto">
        {/* Discovery Hub Icon (Compass 🧭) */}
        <div className="relative group flex items-center justify-center w-full">
          <div 
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
              activeView === 'hub' ? 'h-10' : 'h-0 group-hover:h-5'
            }`} 
          />
          <button
            onClick={() => setActiveView('hub')}
            title="Discover Groups"
            className={`w-12 h-12 flex items-center justify-center font-bold transition-all duration-200 active:scale-95 ${
              activeView === 'hub'
                ? 'bg-green-500 text-white rounded-2xl shadow-lg'
                : 'bg-[#313338] text-green-500 hover:bg-green-500 hover:text-white rounded-3xl hover:rounded-2xl'
            }`}
          >
            <Compass className="w-6 h-6" />
          </button>
        </div>

        <div className="w-8 h-[2px] bg-[#35363c] rounded" />

        {/* User's Joined Servers */}
        {myServers.map((server) => {
          const isActive = activeView === 'server' && activeServer?.id === server.id;
          const initials = server.name.slice(0, 2).toUpperCase();

          return (
            <div key={server.id} className="relative group flex items-center justify-center w-full">
              {/* Discord Sliding Pill */}
              <div 
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive ? 'h-10' : 'h-0 group-hover:h-5'
                }`} 
              />

              <button
                onClick={() => selectServer(server)}
                title={`${server.name} ${server.is_private ? '(Private)' : ''}`}
                className={`w-12 h-12 flex items-center justify-center font-bold text-sm transition-all duration-200 active:scale-90 relative ${
                  isActive
                    ? 'bg-indigo-500 text-white rounded-2xl shadow-lg'
                    : 'bg-[#313338] text-gray-300 hover:bg-indigo-500 hover:text-white rounded-3xl hover:rounded-2xl'
                }`}
              >
                {initials}
                {server.is_private && (
                  <Lock className="w-3 h-3 absolute bottom-1 right-1 text-gray-300" />
                )}
              </button>
            </div>
          );
        })}

        {/* Create Group Button */}
        <div className="relative group flex items-center justify-center w-full">
          <div className="absolute left-0 w-1 bg-white rounded-r-full h-0 group-hover:h-5 transition-all duration-200" />
          <button
            onClick={() => {
              if (!user) handleGoogleLogin();
              else setShowServerModal(true);
            }}
            title="Create a Group"
            className="w-12 h-12 bg-[#313338] text-green-500 hover:bg-green-500 hover:text-white rounded-3xl hover:rounded-2xl transition-all duration-200 active:scale-95 flex items-center justify-center"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Join by Code Button */}
        <div className="relative group flex items-center justify-center w-full">
          <div className="absolute left-0 w-1 bg-white rounded-r-full h-0 group-hover:h-5 transition-all duration-200" />
          <button
            onClick={() => {
              if (!user) handleGoogleLogin();
              else setShowJoinModal(true);
            }}
            title="Join with Invite Code"
            className="w-12 h-12 bg-[#313338] text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-3xl hover:rounded-2xl transition-all duration-200 active:scale-95 flex items-center justify-center"
          >
            <KeyRound className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW A: DISCORD DISCOVERY HUB (When no server is open)    */}
      {/* ========================================================= */}
      {activeView === 'hub' ? (
        <div className="flex-1 bg-[#313338] flex flex-col overflow-y-auto">
          {/* Hero Banner */}
          <div className="h-64 bg-gradient-to-r from-indigo-900 via-indigo-700 to-purple-800 p-8 flex flex-col justify-center items-center text-center relative overflow-hidden shadow-inner">
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <Sparkles className="w-8 h-8 text-amber-300 mb-2 animate-bounce" />
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              Find your community on talk3r
            </h1>
            <p className="text-indigo-200 text-sm mt-2 max-w-md">
              From gaming to music, learning, or hanging out with friends—explore public groups below!
            </p>

            {/* Search Input */}
            <div className="mt-5 w-full max-w-md relative">
              <input
                type="text"
                placeholder="Explore public groups..."
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                className="w-full bg-[#1e1f22] text-white text-sm pl-10 pr-4 py-3 rounded-lg border border-transparent focus:border-indigo-400 outline-none shadow-lg transition"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
            </div>
          </div>

          {/* Communities Grid */}
          <div className="p-8 max-w-6xl mx-auto w-full">
            <h2 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
              <Compass className="w-5 h-5 text-indigo-400" />
              <span>Available Public Groups</span>
            </h2>

            {filteredDiscoverServers.length === 0 ? (
              <div className="bg-[#2b2d31] border border-[#1f2023] rounded-2xl p-10 text-center space-y-4">
                <Globe className="w-12 h-12 text-gray-400 mx-auto opacity-40" />
                <h3 className="text-white font-semibold text-lg">No public groups found!</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                  Be the very first pioneer! Create your own public community right now.
                </p>
                <button
                  onClick={() => {
                    if (!user) handleGoogleLogin();
                    else setShowServerModal(true);
                  }}
                  className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-semibold rounded-lg text-sm shadow transition duration-150 inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Group</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDiscoverServers.map((server) => {
                  const initials = server.name.slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={server.id}
                      className="bg-[#2b2d31] hover:bg-[#35373c] border border-[#1f2023] rounded-xl overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between"
                    >
                      <div>
                        {/* Card Header Banner */}
                        <div className="h-20 bg-gradient-to-r from-indigo-600 to-purple-600 relative p-3">
                          <div className="w-12 h-12 rounded-2xl bg-[#1e1f22] border-2 border-[#2b2d31] flex items-center justify-center font-bold text-white shadow absolute -bottom-4 left-4">
                            {initials}
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="pt-6 px-4 pb-2">
                          <h3 className="text-white font-bold text-base truncate flex items-center space-x-1.5">
                            <span>{server.name}</span>
                          </h3>
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            A public community on talk3r. Hop in to chat, share GIFs, and make friends!
                          </p>
                        </div>
                      </div>

                      {/* Join Action */}
                      <div className="p-4 pt-2 border-t border-[#1f2023]/50 flex justify-between items-center">
                        <span className="text-[11px] text-gray-400 flex items-center space-x-1">
                          <Globe className="w-3.5 h-3.5 text-green-400" />
                          <span>Public Community</span>
                        </span>

                        <button
                          onClick={() => handleJoinFromHub(server)}
                          className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-90 text-white text-xs font-semibold rounded-md shadow transition duration-150"
                        >
                          Join Group
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* VIEW B: INSIDE A SERVER (Channels, Chat & Member List)    */
        /* ========================================================= */
        <>
          {/* 2. Channel Sidebar */}
          <div className="w-60 bg-[#2b2d31] flex flex-col border-r border-[#1f2023]">
            <div className="h-12 border-b border-[#1f2023] flex items-center justify-between px-4 font-bold text-white shadow-sm">
              <div className="flex items-center space-x-1.5 truncate">
                {activeServer?.is_private ? (
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="truncate">{activeServer?.name ?? 'talk3r'}</span>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={openInviteModal}
                  title="Invite Friends"
                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#35373c] active:scale-90 transition"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-2 space-y-1 overflow-y-auto">
              <div className="flex items-center justify-between px-2 pt-2 pb-1">
                <span className="text-xs font-bold text-gray-400">TEXT CHANNELS</span>
                <button
                  onClick={() => {
                    if (!user) handleGoogleLogin();
                    else setShowChannelModal(true);
                  }}
                  title="Add a new section"
                  className="text-gray-400 hover:text-white p-0.5 rounded active:scale-90 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {channels.map((chan) => {
                const isActive = activeChannel?.id === chan.id;
                const canDelete = user && (chan.created_by === user.id || activeServer?.owner_id === user.id);

                return (
                  <div
                    key={chan.id}
                    onClick={() => setActiveChannel(chan)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition cursor-pointer group active:scale-[0.98] ${
                      isActive
                        ? 'text-white bg-[#35373c] font-medium'
                        : 'text-gray-400 hover:bg-[#35373c] hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{chan.name}</span>
                    </div>

                    {canDelete && (
                      <button
                        onClick={(e) => handleDeleteChannel(e, chan.id, chan.name)}
                        title={`Delete #${chan.name}`}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-400 p-1 rounded active:scale-90 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Leave Server Button in footer if not owner */}
            {activeServer && activeServer.owner_id !== user?.id && (
              <button
                onClick={() => handleLeaveServer(activeServer.id)}
                className="mx-3 mb-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 rounded font-semibold text-center transition"
              >
                Leave Group
              </button>
            )}

            {/* User Profile Footer */}
            <div className="h-16 bg-[#232428] flex items-center px-3 justify-between">
              {user ? (
                <>
                  <div 
                    onClick={() => setShowEditProfile(true)}
                    className="flex items-center space-x-2 overflow-hidden cursor-pointer hover:bg-[#2b2d31] p-1 rounded transition flex-1 active:scale-95"
                    title="Customize your Discord profile"
                  >
                    <div className="relative">
                      {myProfile.avatar_url ? (
                        <img
                          src={myProfile.avatar_url}
                          alt="avatar"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {myProfile.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(myProfile.status_state)} rounded-full border-2 border-[#232428]`} />
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-semibold text-white truncate">
                        {myProfile.name}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate">
                        {myProfile.custom_status || 'Online'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setShowEditProfile(true)}
                      title="Profile Settings"
                      className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#313338] active:scale-90 transition"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleLogout}
                      title="Log out"
                      className="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-[#313338] active:scale-90 transition"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white py-1.5 px-3 rounded text-xs font-semibold transition"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login with Gmail</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Main Chat Viewport */}
          <div className="flex-1 flex flex-col bg-[#313338] min-w-0">
            <header className="h-12 bg-[#313338] border-b border-[#232428] flex items-center justify-between px-4 text-white font-semibold shadow-sm">
              <div className="flex items-center space-x-2">
                <Hash className="w-5 h-5 text-gray-400" />
                <span>{activeChannel?.name ?? 'general'}</span>
              </div>

              <div className="flex items-center space-x-3">
                {activeServer?.is_private && (
                  <div className="flex items-center space-x-1.5 text-xs bg-[#232428] px-2.5 py-1 rounded-full text-amber-300 border border-amber-500/20">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Private Group</span>
                  </div>
                )}

                <button
                  onClick={() => setShowMemberList(!showMemberList)}
                  title={showMemberList ? 'Hide Member List' : 'Show Member List'}
                  className={`p-1.5 rounded active:scale-90 transition ${
                    showMemberList ? 'text-white bg-[#35373c]' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Users className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-hidden">
              {activeChannel ? (
                <ChatRoom
                  key={activeChannel.id}
                  channelId={activeChannel.id}
                  user={user}
                  onRequireLogin={handleGoogleLogin}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No channel selected. Create or select a channel!
                </div>
              )}
            </div>
          </div>

          {/* 4. Discord Right-side Member List */}
          {showMemberList && (
            <div className="w-60 bg-[#2b2d31] border-l border-[#1f2023] flex flex-col p-3 overflow-y-auto select-none">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 pb-1.5">
                ONLINE — {onlineMembers.length}
              </div>

              <div className="space-y-1 mb-4">
                {onlineMembers.map((member) => {
                  const isOwner = activeServer?.owner_id === member.user_id;

                  return (
                    <div
                      key={member.user_id}
                      onClick={() => setSelectedProfile(member)}
                      className="flex items-center space-x-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] active:scale-95 transition group cursor-pointer"
                      title="Click to view profile"
                    >
                      <div className="relative">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt="avatar"
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(member.status_state)} rounded-full border-2 border-[#2b2d31]`} />
                      </div>

                      <div className="flex flex-col truncate">
                        <div className="flex items-center space-x-1.5 truncate">
                          <span className="text-sm font-medium text-gray-200 group-hover:text-white truncate">
                            {member.name}
                          </span>
                          {isOwner && (
                            <span title="Group Owner">
                              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            </span>
                          )}
                        </div>
                        {member.custom_status && (
                          <span className="text-[10px] text-gray-400 truncate">
                            {member.custom_status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {offlineMembers.length > 0 && (
                <>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 pb-1.5 pt-2">
                    OFFLINE — {offlineMembers.length}
                  </div>

                  <div className="space-y-1">
                    {offlineMembers.map((member) => {
                      const isOwner = activeServer?.owner_id === member.user_id;

                      return (
                        <div
                          key={member.user_id}
                          onClick={() => setSelectedProfile(member)}
                          className="flex items-center space-x-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] active:scale-95 transition group cursor-pointer opacity-60 hover:opacity-100"
                          title="Click to view profile"
                        >
                          <div className="relative">
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt="avatar"
                                className="w-8 h-8 rounded-full object-cover grayscale"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-500 rounded-full border-2 border-[#2b2d31]" />
                          </div>

                          <div className="flex flex-col truncate">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="text-sm font-medium text-gray-300 group-hover:text-white truncate">
                                {member.name}
                              </span>
                              {isOwner && (
                                <span title="Group Owner">
                                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* DISCORD PROFILE CARD (Pop-up when clicking any member) */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProfile(null)}>
          <div 
            className="w-80 bg-[#232428] rounded-2xl overflow-hidden shadow-2xl border border-[#1f2023] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="h-28 w-full relative bg-cover bg-center" 
              style={{ 
                backgroundColor: selectedProfile.banner_color || '#5865F2',
                backgroundImage: selectedProfile.banner_url ? `url(${selectedProfile.banner_url})` : undefined
              }}
            >
              <button
                onClick={() => setSelectedProfile(null)}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full active:scale-90 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 relative">
              <div className="flex justify-between items-end -mt-10 mb-3">
                <div className="relative">
                  {selectedProfile.avatar_url ? (
                    <img
                      src={selectedProfile.avatar_url}
                      alt="avatar"
                      className="w-20 h-20 rounded-full border-4 border-[#232428] object-cover bg-[#1e1f22]"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full border-4 border-[#232428] bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                      {selectedProfile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={`absolute bottom-1 right-1 w-5 h-5 ${getStatusColor(selectedProfile.status_state)} rounded-full border-4 border-[#232428]`} />
                </div>

                {activeServer?.owner_id === selectedProfile.user_id && (
                  <div className="bg-[#1e1f22] border border-amber-500/30 px-2 py-1 rounded-md flex items-center space-x-1 text-amber-400 text-xs font-semibold">
                    <Crown className="w-3.5 h-3.5" />
                    <span>Server Owner</span>
                  </div>
                )}
              </div>

              <div className="bg-[#111214] p-3 rounded-xl space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {selectedProfile.name}
                  </h3>
                  <p className="text-xs text-gray-400">
                    @{selectedProfile.name.toLowerCase().replace(/\s+/g, '')}
                  </p>
                </div>

                {selectedProfile.custom_status && (
                  <div className="text-xs bg-[#1e1f22] p-2 rounded-lg text-gray-200 border border-[#2b2d31]">
                    💬 {selectedProfile.custom_status}
                  </div>
                )}

                <div>
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    ABOUT ME
                  </h4>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {selectedProfile.bio || 'This user has not written a bio yet.'}
                  </p>
                </div>

                {user && user.id === selectedProfile.user_id && (
                  <button
                    onClick={() => {
                      setSelectedProfile(null);
                      setShowEditProfile(true);
                    }}
                    className="w-full mt-2 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DISCORD PROFILE EDITOR MODAL */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={saveMyProfile}
            className="bg-[#313338] text-white p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Customize Your Profile</h2>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="text-gray-400 hover:text-white active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase">
                  BANNER IMAGE
                </label>
                {myProfile.banner_url && (
                  <button
                    type="button"
                    onClick={() => setMyProfile({ ...myProfile, banner_url: '' })}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Remove Image
                  </button>
                )}
              </div>

              <div 
                className="h-28 w-full rounded-xl relative bg-cover bg-center overflow-hidden border border-[#1f2023] flex items-center justify-center"
                style={{ 
                  backgroundColor: myProfile.banner_color || '#5865F2',
                  backgroundImage: myProfile.banner_url ? `url(${myProfile.banner_url})` : undefined 
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleBannerUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingBanner}
                  className="bg-black/60 hover:bg-black/80 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingBanner ? 'Uploading...' : 'Upload Banner Image'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                OR PICK SOLID COLOR
              </label>
              <div className="flex items-center space-x-2 mt-1.5">
                {BANNER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMyProfile({ ...myProfile, banner_color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition active:scale-90 ${
                      myProfile.banner_color === c ? 'border-white scale-110 shadow' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                DISPLAY NAME
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#1e1f22] p-2.5 rounded-lg text-sm text-white mt-1 border-none outline-none focus:ring-2 focus:ring-indigo-500"
                value={myProfile.name}
                onChange={(e) => setMyProfile({ ...myProfile, name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                CUSTOM STATUS
              </label>
              <input
                type="text"
                className="w-full bg-[#1e1f22] p-2.5 rounded-lg text-sm text-white mt-1 border-none outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Grinding Ranked 🎮"
                value={myProfile.custom_status}
                onChange={(e) => setMyProfile({ ...myProfile, custom_status: e.target.value })}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                STATUS STATE
              </label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { id: 'online', label: 'Online', color: 'bg-green-500' },
                  { id: 'idle', label: 'Idle', color: 'bg-amber-500' },
                  { id: 'dnd', label: 'Do Not Disturb', color: 'bg-red-500' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setMyProfile({ ...myProfile, status_state: s.id })}
                    className={`flex items-center space-x-2 p-2 rounded-lg text-xs font-semibold border transition active:scale-95 ${
                      myProfile.status_state === s.id
                        ? 'border-indigo-500 bg-[#2b2d31]'
                        : 'border-[#1e1f22] bg-[#1e1f22] text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                ABOUT ME
              </label>
              <textarea
                rows={3}
                className="w-full bg-[#1e1f22] p-2.5 rounded-lg text-sm text-white mt-1 border-none outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                value={myProfile.bio}
                onChange={(e) => setMyProfile({ ...myProfile, bio: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:underline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 rounded-lg text-sm font-semibold transition"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: Create Group */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateServer}
            className="bg-[#313338] text-white p-6 rounded-lg w-full max-w-sm shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Create a Group</h2>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="text-gray-400 hover:text-white active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                GROUP NAME
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#1e1f22] p-2.5 rounded text-sm text-white mt-1 border-none outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Secret Squad"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
              />
            </div>

            <div className="bg-[#2b2d31] p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsPrivate(!isPrivate)}>
                <div className="flex items-center space-x-2">
                  {isPrivate ? <Lock className="w-4 h-4 text-amber-400" /> : <Globe className="w-4 h-4 text-green-400" />}
                  <span className="text-sm font-semibold">{isPrivate ? 'Private Group' : 'Public Group'}</span>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                {isPrivate
                  ? 'Only people with the Invite Code will be able to join.'
                  : 'Will be featured in the Discovery Hub for everyone to join.'}
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:underline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 rounded text-sm font-semibold transition"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Join Group with Code */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleJoinByCode}
            className="bg-[#313338] text-white p-6 rounded-lg w-full max-w-sm shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Join with Invite Code</h2>
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="text-gray-400 hover:text-white active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                INVITE CODE
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#1e1f22] p-2.5 rounded text-sm text-white mt-1 uppercase tracking-wider font-mono border-none outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. TK3-ABCD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              {joinError && <p className="text-red-400 text-xs mt-1">{joinError}</p>}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:underline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 rounded text-sm font-semibold transition"
              >
                Join Group
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: Share Invite Code */}
      {showInviteModal && activeServer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#313338] text-white p-6 rounded-lg w-full max-w-sm shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Invite to {activeServer.name}</span>
              </h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-between bg-[#1e1f22] p-3 rounded border border-indigo-500/30">
              <span className="font-mono font-bold tracking-widest text-indigo-300 text-base">
                {activeServer.invite_code || 'NO-CODE'}
              </span>
              <button
                onClick={copyInviteCode}
                className="flex items-center space-x-1 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white text-xs px-3 py-1.5 rounded font-semibold transition"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 bg-[#2b2d31] hover:bg-[#35373c] active:scale-95 rounded text-sm font-semibold transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Create Text Channel */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateChannel}
            className="bg-[#313338] text-white p-6 rounded-lg w-full max-w-sm shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Create Text Channel</h2>
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="text-gray-400 hover:text-white active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                CHANNEL NAME
              </label>
              <div className="flex items-center bg-[#1e1f22] rounded px-3 py-2 mt-1">
                <Hash className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type="text"
                  required
                  className="bg-transparent flex-1 text-sm text-white border-none outline-none"
                  placeholder="e.g. memes"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:underline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 rounded text-sm font-semibold transition"
              >
                Create Channel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}