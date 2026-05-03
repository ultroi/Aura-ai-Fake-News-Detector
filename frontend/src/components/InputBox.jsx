import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import '../styles/InputBox.css';

function InputBox({ onSendMessage }) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [attachedImages, setAttachedImages] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const isExpanded = input.trim().length > 0 || attachedImages.length > 0;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${scrollHeight}px`;
      textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > 150 ? 'auto' : 'hidden';
    }
  }, [input]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query && attachedImages.length === 0) return;
    
    onSendMessage(query, attachedImages);
    setInput('');
    setAttachedImages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      alert('Only image files are supported. Non-image files were ignored.');
    }

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => [...prev, {
          id: Date.now() + Math.random(),
          file: file,
          preview: event.target.result,
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (id) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="input-area">
        {attachedImages.length > 0 && (
          <div className="attachments-preview">
            {attachedImages.map((img) => (
              <div key={img.id} className="attachment-item">
                <img src={img.preview} alt={img.name} className="attachment-thumbnail" />
                <button 
                  className="remove-attachment"
                  onClick={() => removeImage(img.id)}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className={`input-box-container ${isFocused ? 'focused' : ''} ${isExpanded ? 'expanded' : ''}`}>
            <button 
              className="icon-button" 
              onClick={handleAttachmentClick}
              type="button"
              title="Attach images"
            >
                <Paperclip size={20} />
            </button>
            
            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden-file-input"
            />
            
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask Aura AI anything..."
                className="input-textarea"
                rows="1"
            />
            <button 
              className="send-button" 
              onClick={handleSend}
              type="button"
              disabled={!input.trim() && attachedImages.length === 0}
            >
                <Send size={20} />
            </button>
        </div>
        <p className="input-hint">Shift + Enter for new line • Enter to send</p>
    </div>
  );
}

export default InputBox;
