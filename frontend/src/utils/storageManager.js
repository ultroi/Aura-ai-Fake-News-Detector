// Storage manager to handle conversations without storing large base64 images
// Keep images in memory, store only metadata

const IMAGE_CACHE = new Map(); // In-memory cache for images

export const serializeConversation = (conversation) => {
  // Remove image previews before storing
  const serialized = {
    ...conversation,
    messages: conversation.messages.map(msg => {
      if (msg.images && msg.images.length > 0) {
        // Store image metadata only, not the base64 preview
        const imageIds = msg.images.map((_, idx) => `${msg.id}_${idx}`);
        
        // Cache images in memory
        msg.images.forEach((img, idx) => {
          const imageId = `${msg.id}_${idx}`;
          IMAGE_CACHE.set(imageId, img);
        });

        return {
          ...msg,
          images: msg.images.map(img => ({
            name: img.name,
            // Don't store preview here
          })),
          imageIds, // Reference to cached images
        };
      }
      return msg;
    }),
  };
  
  return serialized;
};

export const deserializeConversation = (conversation) => {
  // Restore images from cache
  return {
    ...conversation,
    messages: conversation.messages.map(msg => {
      if (msg.imageIds && msg.imageIds.length > 0) {
        return {
          ...msg,
          images: msg.imageIds.map(id => IMAGE_CACHE.get(id) || { name: 'image' }),
        };
      }
      return msg;
    }),
  };
};

export const cacheImages = (messageId, images) => {
  images.forEach((img, idx) => {
    const imageId = `${messageId}_${idx}`;
    IMAGE_CACHE.set(imageId, img);
  });
};

export const getImageFromCache = (imageId) => {
  return IMAGE_CACHE.get(imageId);
};

export const clearImageCache = () => {
  IMAGE_CACHE.clear();
};
