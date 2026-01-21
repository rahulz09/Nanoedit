
import { GoogleGenAI, Type } from "@google/genai";
import { EditorSettings } from "../types";

// Helper to resize base64 image to avoid payload limits (500 errors) and improve speed
export const resizeBase64Image = (base64Str: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    // If not in browser environment (e.g. SSR), return original
    if (typeof window === 'undefined') {
        resolve(base64Str);
        return;
    }

    // Quick check for length to avoid processing tiny images
    if (base64Str.length < 50000) { // ~37KB
        resolve(base64Str);
        return;
    }

    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous"; // Handle potential CORS if url is remote
    
    img.onload = () => {
      // If image is already small enough, return original
      if (img.width <= maxWidth && img.height <= maxWidth) {
        resolve(base64Str);
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Export as JPEG with 0.7 quality (balanced for AI input) to reduce size/latency
        const resized = canvas.toDataURL('image/jpeg', 0.7);
        resolve(resized);
      } else {
        resolve(base64Str);
      }
    };
    
    img.onerror = () => {
        // Fallback to original if loading fails
        resolve(base64Str); 
    };
  });
};

/**
 * Edit an image or generate a new one using Gemini 2.5 Flash Image or Gemini 3 Pro Image Preview
 * based on the requested quality/resolution.
 */
export const editImageWithGemini = async (
  base64Images: string[],
  prompt: string,
  settings: EditorSettings
): Promise<{ images: string[], text: string }> => {
  
  // Initialize the client inside the function to ensure it captures the 
  // latest injected process.env.API_KEY after user selection.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Determine model based on resolution/settings
  // Default to Flash for speed and general editing/generation
  let modelName = 'gemini-2.5-flash-image';
  
  // Upgrade to Pro if high resolution is requested
  const isPro = settings.resolution === '2K' || settings.resolution === '4K' || settings.modelType === 'pro';
  if (isPro) {
    modelName = 'gemini-3-pro-image-preview';
  }

  // Construct the configuration
  // IMPORTANT: aspectRatio is part of imageConfig.
  const config: any = {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: {
      aspectRatio: settings.aspectRatio,
    }
  };

  // imageSize is only supported on the Pro model
  if (modelName === 'gemini-3-pro-image-preview') {
    config.imageConfig.imageSize = settings.resolution;
  }

  // Prepare content parts
  const parts: any[] = [];

  // If we have images, add them (Edit/Merge Mode)
  // We process them to ensure they aren't too large for the API payload
  if (base64Images && base64Images.length > 0) {
    try {
        // Resize all input images in parallel
        const processedImages = await Promise.all(
            base64Images.map(img => resizeBase64Image(img))
        );

        processedImages.forEach((base64Image) => {
            // Strip header if present to get raw base64 data for inlineData
            const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
            
            // Extract mime type or default to jpeg (since we convert to jpeg in resize)
            const mimeTypeMatch = base64Image.match(/^data:(image\/[a-zA-Z]+);base64,/);
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            });
        });
    } catch (e) {
        console.warn("Image processing failed, falling back to originals", e);
        // Fallback logic if resize fails
        base64Images.forEach((base64Image) => {
            const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
             const mimeTypeMatch = base64Image.match(/^data:(image\/[a-zA-Z]+);base64,/);
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            });
        });
    }
  }

  // Append style and camera angle modifiers
  let finalPrompt = prompt;
  const modifiers: string[] = [];

  if (settings.style && settings.style !== 'None') {
    modifiers.push(`in ${settings.style} style`);
  }
  
  if (settings.cameraAngle && settings.cameraAngle !== 'None') {
      modifiers.push(`shot from ${settings.cameraAngle}`);
  }

  // We rely on the model's capabilities and the user's specific prompt.
  // Removed forced "highly detailed" etc. to allow for simpler styles if requested.
  // The backend model switch to 'gemini-3-pro-image-preview' handles quality.

  if (modifiers.length > 0) {
      finalPrompt = `${prompt}, ${modifiers.join(', ')}`;
  }

  // Always add the text prompt
  parts.push({ text: finalPrompt });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: parts,
      },
      config: config,
    });

    const images: string[] = [];
    let textOutput = "";

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const imgUrl = `data:image/png;base64,${part.inlineData.data}`;
          images.push(imgUrl);
        } else if (part.text) {
          textOutput += part.text;
        }
      }
    }

    if (images.length === 0 && !textOutput) {
       throw new Error("No image generated.");
    }

    return { images, text: textOutput };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errMsg = error.message || String(error);
    
    // Handle common errors with user-friendly messages
    if (errMsg.includes("500")) {
        throw new Error("Server Error (500). The image might be too complex or the server is busy. Try again.");
    }
    if (errMsg.includes("Load failed") || errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError")) {
        throw new Error("Network error. Check your internet connection and try again.");
    }
    if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("API key")) {
        throw new Error("API key invalid or expired. Please reconnect your API key.");
    }
    if (errMsg.includes("429") || errMsg.includes("quota")) {
        throw new Error("Rate limit exceeded. Wait a moment and try again.");
    }
    throw new Error(errMsg || "Failed to generate image");
  }
};
