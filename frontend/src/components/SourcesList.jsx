import React from 'react';
import { motion } from 'framer-motion';
import '../styles/SourcesList.css';

function SourcesList({ sources }) {
  if (!sources || sources.length === 0) {
    return <div className="sources-list">No sources found</div>;
  }

  const getSafeUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
      return new URL(value).toString();
    } catch {
      if (value.startsWith('www.')) {
        try {
          return new URL(`https://${value}`).toString();
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -8 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <motion.div
      className="sources-list"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {sources.map((source, index) => (
        (() => {
          const safeUrl = getSafeUrl(source.url);
          const hostname = safeUrl ? new URL(safeUrl).hostname.replace(/^www\./, '') : (source.url || 'Unknown source');
          const title = source.title || hostname;

          if (!safeUrl) {
            return (
              <motion.div
                key={index}
                className="source-item source-item--plain"
                variants={itemVariants}
              >
                <div className="source-icon">🔎</div>
                <div className="source-content">
                  <div className="source-title">{title}</div>
                  <div className="source-url">{hostname}</div>
                </div>
              </motion.div>
            );
          }

          return (
            <motion.a
              key={index}
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="source-item"
              variants={itemVariants}
              whileHover={{ x: 4 }}
            >
              <div className="source-icon">🔗</div>
              <div className="source-content">
                <div className="source-title">{title}</div>
                <div className="source-url">{hostname}</div>
              </div>
              <motion.div className="source-arrow" whileHover={{ x: 4 }}>
                →
              </motion.div>
            </motion.a>
          );
        })()
      ))}
    </motion.div>
  );
}

export default SourcesList;
