import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ChatMessage from './ChatMessage';
import '../styles/ChatContainer.css';

const SUGGESTION_PROMPTS = [
  'Vaccines cause autism',
  'Climate change is a hoax',
  'The moon landing was fake',
  '5G causes COVID-19',
];

function ChatContainer({ messages, onSendMessage, onRetry }) {
  const hasStarted = messages.length > 0;
  const endRef = useRef(null);
  
  const handleSuggestionSelect = (prompt) => {
    onSendMessage(prompt);
  };

  useEffect(() => {
    if (messages.length > 0 && hasStarted) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 50);
    }
  }, [messages, hasStarted]);

  return (
    <motion.section
      className="chat-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {!hasStarted ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="empty-state-content">
            <h2 className="empty-state-title">What can I help with?</h2>
          </div>
        </motion.div>
      ) : (
        <motion.div
          className="messages-list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onRetry={() => onRetry(msg.id)} />
          ))}
          <div ref={endRef} />
        </motion.div>
      )}
    </motion.section>
  );
}

export default ChatContainer;
