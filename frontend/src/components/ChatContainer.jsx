import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import ChatMessage from './ChatMessage';
import '../styles/ChatContainer.css';

const EMPTY_MESSAGES = [];
const BOTTOM_THRESHOLD_PX = 120;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ChatContainer({ messages = EMPTY_MESSAGES, onRetry, onStop }) {
  const safeMessages = Array.isArray(messages) ? messages : EMPTY_MESSAGES;
  const hasStarted = safeMessages.length > 0;

  const containerRef = useRef(null);
  const messagesListRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((requestedBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;

    const behavior = prefersReducedMotion() ? 'auto' : requestedBehavior;
    container.scrollTo({ top: container.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  const updateScrollButton = useCallback(() => {
    const container = containerRef.current;
    if (!container || !hasStarted) {
      isNearBottomRef.current = true;
      setShowScrollButton(false);
      return;
    }

    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = remaining <= BOTTOM_THRESHOLD_PX;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, [hasStarted]);

  // Keep the latest response in view while the user is at the bottom.
  // If the user scrolls up to read older content, preserve their position and
  // show the jump-to-latest control instead of pulling them back down.
  useEffect(() => {
    if (!hasStarted) {
      isNearBottomRef.current = true;
      setShowScrollButton(false);
      return undefined;
    }

    if (!isNearBottomRef.current) {
      setShowScrollButton(true);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom('auto');
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hasStarted, safeMessages, scrollToBottom]);

  // Assistant text can grow locally during its typing animation, without a
  // parent messages-array change. Observe the transcript so auto-follow stays
  // correct in that case too.
  useEffect(() => {
    const list = messagesListRef.current;
    const container = containerRef.current;
    if (!hasStarted || !list || !container || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const scrollContainer = containerRef.current;
      if (!scrollContainer) return;

      if (isNearBottomRef.current) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        setShowScrollButton(false);
      } else {
        const remaining = scrollContainer.scrollHeight
          - scrollContainer.scrollTop
          - scrollContainer.clientHeight;
        setShowScrollButton(remaining > BOTTOM_THRESHOLD_PX);
      }
    });

    observer.observe(list);
    return () => observer.disconnect();
  }, [hasStarted]);

  return (
    <div className="chat-viewport">
      <motion.section
        ref={containerRef}
        className="chat-container"
        aria-label="Conversation"
        onScroll={updateScrollButton}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        {hasStarted ? (
          <motion.div
            ref={messagesListRef}
            className="messages-list"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {safeMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onRetry={() => onRetry?.(message.id)}
                onStop={onStop}
              />
            ))}
            <div className="chat-scroll-anchor" aria-hidden="true" />
          </motion.div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-content">
              <h2 className="empty-state-title">What can I help with?</h2>
            </div>
          </div>
        )}
      </motion.section>

      <AnimatePresence>
        {hasStarted && showScrollButton && (
          <motion.button
            key="scroll-to-latest"
            className="chat-scroll-to-bottom"
            type="button"
            aria-label="Scroll to latest message"
            title="Scroll to latest message"
            onClick={() => scrollToBottom('smooth')}
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.94 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            whileTap={{ scale: 0.96 }}
          >
            <ArrowDown size={19} strokeWidth={2} aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ChatContainer;
