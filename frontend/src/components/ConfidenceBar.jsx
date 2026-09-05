import React from 'react';
import { motion } from 'framer-motion';
import '../styles/ConfidenceBar.css';

function ConfidenceBar({ confidence }) {
  const getConfidenceColor = (conf) => {
    if (conf >= 80) return 'var(--success)';
    if (conf >= 60) return 'var(--accent-secondary)';
    if (conf >= 40) return 'var(--warning)';
    return 'var(--error)';
  };

  return (
    <div className="confidence-container">
      <div className="confidence-label">
        <span>Confidence Level</span>
        <motion.span
          className="confidence-value"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {confidence}%
        </motion.span>
      </div>
      <div className="confidence-bar">
        <motion.div
          className="confidence-fill"
          style={{
            backgroundColor: getConfidenceColor(confidence),
          }}
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export default ConfidenceBar;