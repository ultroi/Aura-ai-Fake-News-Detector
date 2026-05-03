import React from 'react';
import InputBox from './InputBox';

const HeroSection = ({ onSendMessage }) => {
  return (
    <div className="initial-container">
      <div className="welcome-screen">
        <h2>What can I help with?</h2>
        <p className="welcome-subtitle">Ask Aura AI anything</p>
        <div className="main-input-area">
          <InputBox onSendMessage={onSendMessage} />
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
