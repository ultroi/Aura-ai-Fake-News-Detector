import React from 'react';
import { motion } from 'framer-motion';
import '../styles/VerdictBadge.css';

function VerdictBadge({ verdict }) {
  const getVerdictConfig = (v) => {
    switch (v.toLowerCase()) {
      case 'true':
        return { label: '✓ TRUE', className: 'verdict-true', color: 'var(--color-success)' };
      case 'false':
        return { label: '✗ FALSE', className: 'verdict-false', color: 'var(--color-error)' };
      case 'uncertain':
        return { label: '? UNCERTAIN', className: 'verdict-uncertain', color: 'var(--color-warning)' };
      default:
        return { label: 'UNKNOWN', className: 'verdict-unknown', color: 'var(--color-text-muted)' };
    }
  };

  const config = getVerdictConfig(verdict);

  return (
    <motion.div
      className={`verdict-badge ${config.className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {config.label}
    </motion.div>
  );
}

export default VerdictBadge;
