import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import '../styles/InputBox.css';
import { detectInputType, isValidURL } from '../utils/urlDetector';

function InputBox({ onSendMessage, onStop, isLoading }) {
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
    const trimmedInput = input.trim();
    if (!trimmedInput && attachedImages.length === 0) return;

    try {
      const inputType = detectInputType(trimmedInput);

      if (inputType.type === 'text') {
        onSendMessage(trimmedInput, attachedImages, '');
        setInput('');
        setAttachedImages([]);
      } else if (inputType.type === 'url_only') {
        processURLs(inputType.urls, '');
      } else if (inputType.type === 'url_with_prompt') {
        processURLs(inputType.urls, inputType.query);
      }
    } catch (error) {
      console.error('Error processing input:', error);
    }
  };

  const processURLs = async (urls, userQuery) => {
    try {
      const validUrls = urls.filter(url => isValidURL(url));
      if (validUrls.length === 0) {
        alert('No valid URLs found. Please enter valid URLs starting with http:// or https://');
        return;
      }

      const firstUrl = validUrls[0];
      onSendMessage(userQuery || `Analyze this URL: ${firstUrl}`, attachedImages, firstUrl);
      setInput('');
      setAttachedImages([]);
    } catch (error) {
      console.error('Error processing URLs:', error);
      alert('Failed to process URLs');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertTextAtCursor = (textToInsert) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = textarea.value.slice(0, start) + textToInsert + textarea.value.slice(end);
    setInput(newValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    });
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

  const handlePaste = (e) => {
    if (!e.clipboardData) return;
    const items = Array.from(e.clipboardData.items || []);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const text = e.clipboardData.getData('text');
    if (text) {
      insertTextAtCursor(text);
    }

    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => [...prev, {
          id: Date.now() + Math.random(),
          file: file,
          preview: event.target.result,
          name: file.name || 'pasted-image.png'
        }]);
      };
      reader.readAsDataURL(file);
    });
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
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask anything... text, URLs, or URL + question"
                className="input-textarea"
                rows="1"
            />
            
            <button 
              className={`send-button ${isLoading ? 'processing' : ''}`} 
              onClick={isLoading ? onStop : handleSend}
              type="button"
              disabled={!input.trim() && attachedImages.length === 0 && !isLoading}
            >
                {isLoading ? (
                  <X size={20} />
                ) : (
                  <Send size={20} />
                )}
            </button>
        </div>
        <p className="input-hint">Shift + Enter for new line • Enter to send</p>
    </div>
  );
}

export default InputBox;
