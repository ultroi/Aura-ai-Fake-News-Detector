import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import '../styles/Sidebar.css';

const getGroupLabel = (timestamp) => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMessage = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const dayDiff = Math.round((startOfToday - startOfMessage) / 86400000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return 'Previous 7 Days';
};

const Sidebar = ({ conversations, activeConversationId, onStartNewChat, onOpenConversation, onRenameConversation, onDeleteConversation, isOpen, closeSidebar }) => {
  const [menuOpenId, setMenuOpenId] = useState(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!menuOpenId) return;

    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpenId]);

  const groupedChats = useMemo(() => {
    const groups = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
    };

    conversations
      .slice()
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
      .forEach((conversation) => {
        const label = getGroupLabel(conversation.lastUpdated);
        groups[label].push(conversation);
      });

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }, [conversations]);

  const [pendingRenameId, setPendingRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const handleRename = (conversation) => {
    setPendingRenameId(conversation.id);
    setRenameValue(conversation.title || 'New Chat');
  };

  const handleConfirmRename = (conversationId) => {
    const trimmedTitle = renameValue.trim();
    if (trimmedTitle.length > 0) {
      onRenameConversation(conversationId, trimmedTitle);
    }
    setPendingRenameId(null);
    setRenameValue('');
    setMenuOpenId(null);
  };

  const handleCancelRename = () => {
    setPendingRenameId(null);
    setRenameValue('');
  };

  const handleDelete = (conversationId) => {
    setPendingDeleteId(conversationId);
  };

  const handleConfirmDelete = (conversationId) => {
    onDeleteConversation(conversationId);
    setMenuOpenId(null);
    setPendingDeleteId(null);
  };

  const handleCancelDelete = () => {
    setPendingDeleteId(null);
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen} ref={wrapperRef}>
      <div className="sidebar-header">
        <button className="new-chat-button" onClick={onStartNewChat} type="button">
          + New Chat
        </button>
        <button
          className="sidebar-close-button"
          onClick={closeSidebar}
          aria-label="Close sidebar"
          type="button"
        >
          ←
        </button>
      </div>

      <div className="recent-chats">
        <div className="recent-chats-header">
          <h2>Recent chats</h2>
        </div>

        {conversations.length === 0 ? (
          <div className="recent-chats-empty">
            No chat history yet. Start a conversation to save your first prompt.
          </div>
        ) : (
          <div className="recent-chats-list">
            {groupedChats.map((group) => (
              <div className="chat-group" key={group.label}>
                <div className="chat-group-label">{group.label}</div>
                <div className="chat-group-items">
                  {group.items.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`chat-item ${conversation.id === activeConversationId ? 'active' : ''}`}
                      onClick={() => {
                        onOpenConversation(conversation.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          onOpenConversation(conversation.id);
                        }
                      }}
                    >
                      <div className="chat-item-content">
                        <span className="chat-item-title">{conversation.title || 'New Chat'}</span>
                        <span className="chat-item-meta">
                          {new Date(conversation.lastUpdated).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className="chat-item-actions"
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="chat-item-menu"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpenId((current) => (current === conversation.id ? null : conversation.id));
                          }}
                          aria-label="Open conversation actions"
                          type="button"
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {menuOpenId === conversation.id && (
                          <div
                            className="chat-menu-dropdown"
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            {pendingRenameId === conversation.id ? (
                              <div className="chat-rename-confirmation">
                                <label className="chat-rename-label" htmlFor={`rename-${conversation.id}`}>
                                  Rename chat
                                </label>
                                <input
                                  id={`rename-${conversation.id}`}
                                  className="chat-rename-input"
                                  type="text"
                                  value={renameValue}
                                  onChange={(event) => setRenameValue(event.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <div className="chat-rename-actions">
                                  <button
                                    className="chat-rename-button chat-rename-button-cancel"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleCancelRename();
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="chat-rename-button chat-rename-button-confirm"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleConfirmRename(conversation.id);
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : pendingDeleteId === conversation.id ? (
                              <div className="chat-delete-confirmation">
                                <div className="chat-delete-message">Delete this chat?</div>
                                <div className="chat-delete-actions">
                                  <button
                                    className="chat-delete-button chat-delete-button-cancel"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleCancelDelete();
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="chat-delete-button chat-delete-button-confirm"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleConfirmDelete(conversation.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="chat-menu-item"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRename(conversation);
                                  }}
                                >
                                  <Edit2 size={14} />
                                  <span>Rename</span>
                                </button>
                                <button
                                  className="chat-menu-item chat-menu-item-delete"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDelete(conversation.id);
                                  }}
                                >
                                  <Trash2 size={14} />
                                  <span>Delete</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
