import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, RefreshCcw, Check } from 'lucide-react';
import SourcesList from './SourcesList';
import '../styles/ChatMessage.css';

function ChatMessage({ message, onRetry }) {
  const [showSources, setShowSources] = useState(true);
  const [copied, setCopied] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeout = useRef(null);
  const isUser = message.role === 'user';
  const isLoading = message.isLoading;
  const isError = message.isError;

  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const renderContent = (content) => {
    if (!content) return { __html: '' };

    const rendered = content
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n/g, '<br/>');

    return { __html: rendered };
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Copy failed', error);
    }
  };

  useEffect(() => {
    if (!isUser && !isLoading && !isError && message.content) {
      setTypedText('');
      setIsTyping(true);
      let index = 0;
      const text = message.content;

      const tick = () => {
        index += 1;
        setTypedText(text.slice(0, index));

        if (index >= text.length) {
          setIsTyping(false);
          return;
        }

        const char = text[index - 1];
        let delay = 18;

        if (char === ' ') {
          delay = 30;
        } else if (char === '\n') {
          delay = 40;
        } else if (/[.,:;!?]/.test(char)) {
          delay = 50;
        } else {
          delay = 18 + Math.random() * 18;
        }

        typingTimeout.current = window.setTimeout(tick, delay);
      };

      typingTimeout.current = window.setTimeout(tick, 160);
    } else {
      setTypedText('');
      setIsTyping(false);
    }

    return () => {
      if (typingTimeout.current) {
        window.clearTimeout(typingTimeout.current);
      }
    };
  }, [message.content, isUser, isLoading, isError]);

  return (
    <motion.div
      className={`message ${isUser ? 'user-message' : 'ai-message'} ${isError ? 'error' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {isLoading ? (
        <div className="typing-indicator">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className={`message-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
            {isUser && message.images && message.images.length > 0 && (
              <div className="message-images">
                {message.images.map((image, idx) => (
                  <img 
                    key={idx} 
                    src={image.preview} 
                    alt={image.name}
                    className="chat-image"
                  />
                ))}
              </div>
            )}
            
            {isTyping && !isUser ? (
              <div className="message-content typing-text">{typedText}</div>
            ) : (
              <div className="message-content" dangerouslySetInnerHTML={renderContent(message.content)} />
            )}

            {!isUser && !isError && message.sources && message.sources.length > 0 && (
              <motion.div
                className="sources-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <div className="sources-wrapper">
                  <div className="sources-header">
                    <span className="sources-label">Sources checked</span>
                    <span className="sources-count">{message.sources.length}</span>
                  </div>
                  <motion.button
                    className="sources-toggle"
                    onClick={() => setShowSources(!showSources)}
                    whileHover={{ x: 3 }}
                    type="button"
                  >
                    {showSources ? 'Hide sources' : 'Show sources'} {showSources ? '▼' : '▶'}
                  </motion.button>
                  <motion.div
                    initial={false}
                    animate={{ height: showSources ? 'auto' : 0 }}
                    transition={{ duration: 0.24 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {showSources && <SourcesList sources={message.sources} />}
                  </motion.div>
                </div>
              </motion.div>
            )}
          <span className="message-timestamp">{timestamp}</span>
          </div>

          <div className="message-meta">
            <div className="message-actions">
              <motion.button
                className="icon-action copy-btn"
                onClick={handleCopy}
                type="button"
                aria-label={copied ? 'Copied' : 'Copy'}
                animate={{ scale: copied ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              >
                <motion.div
                  initial={false}
                  animate={{ rotate: copied ? 360 : 0, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </motion.div>
              </motion.button>

              {!isUser && !isLoading && !isError && (
                <button
                  className="icon-action"
                  onClick={onRetry}
                  type="button"
                  aria-label="Regenerate"
                >
                  <RefreshCcw size={14} />
                </button>
              )}

              {isError && (
                <button
                  className="icon-action"
                  onClick={onRetry}
                  type="button"
                  aria-label="Retry"
                >
                  <RefreshCcw size={14} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default ChatMessage;
