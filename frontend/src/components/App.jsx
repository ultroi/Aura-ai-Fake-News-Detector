import { useState, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import ChatContainer from './ChatContainer';
import InputBox from './InputBox';
import SettingsDropdown from './SettingsDropdown';
import Sidebar from './Sidebar';
import HeroSection from './HeroSection';
import AuthPage from './AuthPage';
import DashboardPage from './DashboardPage';
import SettingsPage from './SettingsPage';
import SupportPage from './SupportPage';
import ProfileModal from './ProfileModal';
import '../styles/App.css';
import '../styles/HeroSection.css';
import apiClient, { ANALYSIS_API_URL } from '../services/authService';
import { serializeConversation, deserializeConversation, cacheImages } from '../utils/storageManager';
import { detectInputType, isValidURL } from '../utils/urlDetector';

function App() {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('aura_conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Deserialize conversations to restore images from cache
        return parsed.map(deserializeConversation);
      } catch {
        return [];
      }
    }

    const oldMessages = localStorage.getItem('aura_messages');
    if (oldMessages) {
      try {
        const parsed = JSON.parse(oldMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return [
            {
              id: `conv_${Date.now()}`,
              title:
                parsed.find((msg) => msg.role === 'user')?.content?.slice(0, 120) ||
                'New Chat',
              messages: parsed,
              createdAt: new Date().toISOString(),
              lastUpdated:
                parsed[parsed.length - 1]?.timestamp || new Date().toISOString(),
            },
          ];
        }
      } catch {
        return [];
      }
    }

    return [];
  });

  const [activeConversationId, setActiveConversationId] = useState(() => {
    const saved = localStorage.getItem('aura_active_conversation');
    if (saved) return saved;
    return conversations[0]?.id || null;
  });

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const messages = activeConversation?.messages || [];

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((value) => !value);
  const closeSidebar = () => setIsSidebarOpen(false);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aura_theme');
    return saved || 'dark';
  });
  const abortControllersRef = useRef({});
  const currentAbortMessageIdRef = useRef(null);
  const isRequestActive = messages.some((msg) => msg.role === 'assistant' && msg.isLoading);

  useEffect(() => {
    // Limit to last 50 conversations to manage storage
    const toStore = conversations.slice(0, 50);
    try {
      localStorage.setItem('aura_conversations', JSON.stringify(toStore.map(serializeConversation)));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, removing old conversations');
        // Keep only last 10 conversations
        const recent = conversations.slice(0, 10);
        localStorage.setItem('aura_conversations', JSON.stringify(recent.map(serializeConversation)));
      }
    }
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('aura_active_conversation', activeConversationId);
    } else {
      localStorage.removeItem('aura_active_conversation');
    }
  }, [activeConversationId]);

  useEffect(() => {
    localStorage.setItem('aura_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const response = await apiClient.getCurrentUser();
        if (isMounted) {
          setUser(response.data.user);
          setAuthenticated(true);
          setView('dashboard');
        }
      } catch (err) {
        if (isMounted) {
          setAuthenticated(false);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTryAura = () => {
    setShowProfileModal(false);
    setShowSettingsModal(false);
    if (!authenticated) {
      setView('auth');
    } else {
      setView('chat');
    }
  };

  const handleOpenAuth = () => {
    setShowProfileModal(false);
    setShowSettingsModal(false);
    setView('auth');
  };

  const handleBackToDashboard = () => {
    setShowProfileModal(false);
    setShowSettingsModal(false);
    setView('dashboard');
  };

  const handleContinueWithAuth = (userData) => {
    setUser(userData);
    setAuthenticated(true);
    setView('dashboard');
  };

  const handleUpdateProfile = async (updatedUser) => {
    setUser(updatedUser);
    setShowProfileModal(false);

    try {
      const response = await apiClient.updateProfile({
        name: updatedUser.name,
        username: updatedUser.username,
        picture: updatedUser.picture,
      });

      if (response?.data?.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Profile update failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setAuthenticated(false);
      setView('dashboard');
      setActiveConversationId(null);
      setShowProfileModal(false);
      setShowSettingsModal(false);
      setIsSidebarOpen(false);
    }
  };

  const handleProfile = () => {
    setShowProfileModal(true);
  };

  const handleSettings = () => {
    setShowSettingsModal(true);
  };

  const handleHelp = () => {
    setView('support');
  };

  const handleStartNewChat = () => {
    setShowProfileModal(false);
    setShowSettingsModal(false);
    setActiveConversationId(null);
    setView('chat');
    closeSidebar();
  };

  const handleOpenConversation = (conversationId) => {
    setActiveConversationId(conversationId);
    setView('chat');
    closeSidebar();
  };

  const handleRenameConversation = (conversationId, title) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, title } : conversation
      )
    );
  };

  const handleDeleteConversation = (conversationId) => {
    setConversations((prev) => {
      const next = prev.filter((conversation) => conversation.id !== conversationId);
      if (activeConversationId === conversationId) {
        setActiveConversationId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleSendMessage = async (query, attachedImages = [], url = '') => {
    if (!authenticated) {
      setView('auth');
      return;
    }

    const timestamp = new Date().toISOString();
    const messageId = Date.now();

    // Intelligent input detection and routing
    let inputType = { type: 'text', urls: [], query };
    let finalQuery = query;
    let finalUrl = url;

    // If no URL was detected at input level, analyze the query for URLs
    if (!url && query) {
      inputType = detectInputType(query);
      finalQuery = inputType.query;
      finalUrl = inputType.urls.length > 0 ? inputType.urls[0] : '';
    }

    // Validate input
    if (!finalQuery && !finalUrl && attachedImages.length === 0) return;

    // Build display content
    const displayContent = finalUrl 
      ? `${finalQuery} ${finalUrl}`.trim() 
      : finalQuery;

    const userMessage = {
      id: messageId,
      role: 'user',
      content: displayContent,
      timestamp,
      url: finalUrl || null,
      images: attachedImages.map(img => ({
        name: img.name,
        preview: img.preview,
      })),
    };

    // Cache images in memory
    if (attachedImages.length > 0) {
      cacheImages(messageId, attachedImages);
    }

    const loadingMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: '',
      isLoading: true,
      timestamp,
    };

    const conversationId = activeConversation?.id || `conv_${Date.now()}`;

    if (!activeConversation) {
      const newConversation = {
        id: conversationId,
        title: displayContent.slice(0, 120) || 'New Chat',
        messages: [userMessage, loadingMessage],
        createdAt: timestamp,
        lastUpdated: timestamp,
      };

      setConversations((prev) => [newConversation, ...prev]);
      setActiveConversationId(conversationId);
    } else {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [...conversation.messages, userMessage, loadingMessage],
                lastUpdated: timestamp,
              }
            : conversation
        )
      );
    }

    try {
      const requestBody = {
        user_id: user?.id || user?._id || 'anonymous',
        mode: 'verify',
      };

      // Send query as main analysis content
      if (finalQuery) {
        requestBody.query = finalQuery;
      }

      // Send URL as reference if detected/provided
      if (finalUrl) {
        // Validate URL before sending
        if (!isValidURL(finalUrl)) {
          throw new Error(`Invalid URL format: ${finalUrl}`);
        }
        requestBody.url = finalUrl;
      }

      if (attachedImages.length > 0) {
        requestBody.images = attachedImages.map(img => img.preview);
      }

      const controller = new AbortController();
      abortControllersRef.current[loadingMessage.id] = controller;
      currentAbortMessageIdRef.current = loadingMessage.id;

      const response = await fetch(`${ANALYSIS_API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze claim');
      }

      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || 'Invalid server response');
      }

      // Map Stage 4 response fields to frontend message format
      const assistantText = data.response || data.reason || data.summary || data.explanation || '';
      const trusted = data.trusted_sources || [];
      const suspicious = data.suspicious_sources || [];
      // Combine and normalize sources into {title, url}
      const combinedSources = [...trusted, ...suspicious].map((s) =>
        typeof s === 'string' ? { title: s, url: s } : s
      );

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          return {
            ...conversation,
            messages: conversation.messages.map((msg) =>
              msg.id === loadingMessage.id
                ? {
                    ...msg,
                    content: assistantText,
                    shortSummary: data.short_summary || '',
                    reason: data.reason || '',
                    keyFacts: data.key_facts || [],
                    importantContext: data.important_context || null,
                    verdict: data.verdict || data.verdict_display || '',
                    sources: combinedSources,
                    sourceUrl: data.source_url || null,
                    isLoading: false,
                  }
                : msg
            ),
            lastUpdated: new Date().toISOString(),
          };
        })
      );
    } catch (error) {
      console.error('Error:', error);
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          return {
            ...conversation,
            messages: conversation.messages.map((msg) =>
              msg.id === loadingMessage.id
                ? {
                    ...msg,
                    content:
                      error.name === 'AbortError'
                        ? 'Analysis stopped by user.'
                        : `Error: ${error.message}. Please try again.`,
                    isLoading: false,
                    isError: error.name !== 'AbortError',
                  }
                : msg
            ),
          };
        })
      );
    } finally {
      if (abortControllersRef.current[loadingMessage.id]) {
        delete abortControllersRef.current[loadingMessage.id];
      }
      if (currentAbortMessageIdRef.current === loadingMessage.id) {
        currentAbortMessageIdRef.current = null;
      }
    }
  };

  const handleStop = () => {
    const activeId = currentAbortMessageIdRef.current;
    if (!activeId) return;
    const controller = abortControllersRef.current[activeId];
    if (controller) {
      controller.abort();
    }
  };

  const handleRetry = (assistantMessageId) => {
    const messageIndex = messages.findIndex((msg) => msg.id === assistantMessageId);
    if (messageIndex === -1) return;

    const previousUserMessage = [...messages]
      .slice(0, messageIndex)
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!previousUserMessage?.content && !previousUserMessage?.url) return;

    handleSendMessage(previousUserMessage.content || '', previousUserMessage.images || [], previousUserMessage.url || '');
  };

  if (authLoading) {
    return (
      <div className="app auth-app-screen">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ width: '100%', maxWidth: '600px', padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ height: '60px', backgroundColor: '#e0e0e0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: '20px', backgroundColor: '#e0e0e0', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: '20px', backgroundColor: '#e0e0e0', borderRadius: '4px', width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: '100px', backgroundColor: '#e0e0e0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div className="app settings-app-screen">
        <SettingsPage user={user} onBack={handleBackToDashboard} />
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <>
        <div className="app auth-app-screen">
          <DashboardPage
            onTryAura={handleTryAura}
            onOpenAuth={handleOpenAuth}
            user={user}
            authenticated={authenticated}
            onProfile={handleProfile}
            onSettings={handleSettings}
            onHelp={handleHelp}
            onLogout={handleLogout}
          />
        </div>

        {showSettingsModal && (
          <SettingsPage user={user} onClose={() => setShowSettingsModal(false)} />
        )}

        <ProfileModal
          visible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onSave={handleUpdateProfile}
          user={user}
        />
      </>
    );
  }

  if (view === 'auth') {
    return (
      <div className="app auth-app-screen">
        <AuthPage onContinue={handleContinueWithAuth} onBack={handleBackToDashboard} />
      </div>
    );
  }

  if (view === 'support') {
    return (
      <div className="app support-app-screen">
        <SupportPage user={user} onBack={handleBackToDashboard} />
      </div>
    );
  }

  return (
    <>
      <div className={`app ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onStartNewChat={handleStartNewChat}
          onOpenConversation={handleOpenConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
          isOpen={isSidebarOpen}
          closeSidebar={closeSidebar}
        />
        <div
          className="sidebar-backdrop"
          onClick={closeSidebar}
          aria-hidden={!isSidebarOpen}
        />
        <main className="main-content">
          <div className="top-bar">
            <button
              className="sidebar-toggle-button"
              onClick={toggleSidebar}
              aria-expanded={isSidebarOpen}
              aria-label="Open sidebar"
              type="button"
            >
              <Menu size={20} />
            </button>
            <div className="app-branding">
              <div className="app-logo">
                <img src="/aura_ai.png" alt="Aura AI logo" />
              </div>
              <div className="app-brand-text">Aura AI</div>
            </div>
            <div className="top-bar-actions">
              <SettingsDropdown
                user={user}
                onProfile={handleProfile}
                onSettings={handleSettings}
                onHelp={handleHelp}
                onLogout={handleLogout}
              />
            </div>
          </div>
          {messages.length === 0 ? (
            <HeroSection onSendMessage={handleSendMessage} />
          ) : (
            <>
              <ChatContainer messages={messages} onSendMessage={handleSendMessage} onRetry={handleRetry} onStop={handleStop} />
              <InputBox onSendMessage={handleSendMessage} onStop={handleStop} isLoading={isRequestActive} />
            </>
          )}
        </main>
      </div>

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <SettingsPage user={user} onClose={() => setShowSettingsModal(false)} />
      )}

      <ProfileModal
        visible={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSave={handleUpdateProfile}
        user={user}
      />
    </>
  );
}

export default App;

