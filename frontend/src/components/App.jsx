import { useState, useEffect } from 'react';
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
import '../styles/App.css';
import '../styles/HeroSection.css';
import apiClient from '../services/authService';
import { serializeConversation, deserializeConversation, cacheImages } from '../utils/storageManager';

function App() {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
    const checkAuth = async () => {
      try {
        const response = await apiClient.getCurrentUser();
        setUser(response.data.user);
        setAuthenticated(true);
        setView('dashboard');
      } catch (err) {
        setAuthenticated(false);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleTryAura = () => {
    if (!authenticated) {
      setView('auth');
    } else {
      setView('chat');
    }
  };

  const handleOpenAuth = () => {
    setView('auth');
  };

  const handleBackToDashboard = () => {
    setView('dashboard');
  };

  const handleContinueWithAuth = (userData) => {
    setUser(userData);
    setAuthenticated(true);
    setView('dashboard');
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      setUser(null);
      setAuthenticated(false);
      setView('dashboard');
      setActiveConversationId(null);
    } catch (err) {
      console.error('Logout error:', err);
      setUser(null);
      setAuthenticated(false);
      setView('dashboard');
      setActiveConversationId(null);
    }
  };

  const handleProfile = () => {
    setView('dashboard');
  };

  const handleSettings = () => {
    setShowSettingsModal(true);
  };

  const handleHelp = () => {
    setView('support');
  };

  const handleStartNewChat = () => {
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

  const handleSendMessage = async (query, attachedImages = []) => {
    if (!authenticated) {
      setView('auth');
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery && attachedImages.length === 0) return;

    const timestamp = new Date().toISOString();
    const messageId = Date.now();
    
    const userMessage = {
      id: messageId,
      role: 'user',
      content: trimmedQuery,
      timestamp,
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
        title: trimmedQuery || 'Image Analysis',
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
      // Prepare request body with images
      const requestBody = {
        query: trimmedQuery,
        user_id: user?.id || user?._id || 'anonymous',
      };

      // If images are attached, add them as base64
      if (attachedImages.length > 0) {
        requestBody.images = attachedImages.map(img => img.preview);
      }

      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
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
                    verdict: data.verdict || data.verdict_display || '',
                    sources: combinedSources,
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
                    content: `Error: ${error.message}. Please try again.`,
                    isLoading: false,
                    isError: true,
                  }
                : msg
            ),
          };
        })
      );
    }
  };

  const handleRetry = (assistantMessageId) => {
    const messageIndex = messages.findIndex((msg) => msg.id === assistantMessageId);
    if (messageIndex === -1) return;

    const previousUserMessage = [...messages]
      .slice(0, messageIndex)
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!previousUserMessage?.content) return;

    handleSendMessage(previousUserMessage.content);
  };

  if (authLoading) {
    return (
      <div className="app auth-app-screen">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div>Loading...</div>
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
              <ChatContainer messages={messages} onSendMessage={handleSendMessage} onRetry={handleRetry} />
              <InputBox onSendMessage={handleSendMessage} />
            </>
          )}
        </main>
      </div>

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <SettingsPage user={user} onClose={() => setShowSettingsModal(false)} />
      )}
    </>
  );
}

export default App;

