import React from 'react';
import InputBox from './InputBox';

const HeroSection = ({ onSendMessage }) => {
  return (
    <section className="initial-container" aria-labelledby="chat-welcome-title">
      <div className="welcome-screen">
        <h1 id="chat-welcome-title">What can I help with?</h1>
        <p className="welcome-subtitle">Ask Aura AI anything</p>
        <div className="main-input-area">
          <InputBox onSendMessage={onSendMessage} />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
