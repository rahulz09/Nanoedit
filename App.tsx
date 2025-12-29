
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { editImageWithGemini } from './services/geminiService';
import { saveToIndexedDB, getFromIndexedDB, saveToLocalStorage, getFromLocalStorage, STORAGE_KEYS } from './services/storageService';
import { EditorSettings, GeneratedImage, QueueItem, ASPECT_RATIOS, RESOLUTIONS, STYLES, CAMERA_ANGLES, PRESET_PROMPTS } from './types';
import { IconUpload, IconSparkles, IconAspectRatio, IconX, IconDownload, IconPalette, IconToggleLeft, IconToggleRight, IconLayers, IconEye, IconLayerPlus, IconZip, IconEyeOff, IconEraser, IconTrash, IconZoomIn, IconZoomOut, IconSettings, IconCamera } from './components/Icons';
// @ts-ignore
import JSZip from 'jszip';

function App() {
  // Initialize lightweight state from LocalStorage to avoid flash
  const [prompt, setPrompt] = useState(() => getFromLocalStorage('nano_prompt', ''));
  const [isImageMode, setIsImageMode] = useState(() => getFromLocalStorage('nano_is_image_mode', false));
  const [uiVisible, setUiVisible] = useState(() => getFromLocalStorage('nano_ui_visible', true));
  
  // Settings initialization - Defaulting to 4K/Pro as requested, ensuring all fields exist
  const [settings, setSettings] = useState<EditorSettings>(() => {
      const defaults: EditorSettings = {
        aspectRatio: '16:9',
        resolution: '4K',
        modelType: 'pro',
        style: 'None',
        cameraAngle: 'None'
      };
      const saved = getFromLocalStorage('nano_settings', {});
      return { ...defaults, ...saved };
  });

  // Heavy state (images) initialized empty, loaded async
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  
  // Queue System State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [isRestoring, setIsRestoring] = useState(true);
  const [timer, setTimer] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [textResponse, setTextResponse] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  
  // State for Full Screen Image Viewer
  const [viewedImage, setViewedImage] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  
  // State for Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Refs for Pinch Zoom
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  
  // Restore heavy state from IndexedDB on mount
  useEffect(() => {
      const restoreState = async () => {
          try {
              const savedSource = await getFromIndexedDB(STORAGE_KEYS.SOURCE_IMAGES);
              if (savedSource) setSourceImages(savedSource);

              const savedGenerated = await getFromIndexedDB(STORAGE_KEYS.GENERATED_IMAGES);
              if (savedGenerated) setGeneratedImages(savedGenerated);
          } catch (e) {
              console.error("Failed to restore app state", e);
          } finally {
              setIsRestoring(false);
          }
      };
      restoreState();
  }, []);

  // Persistence Effects
  useEffect(() => {
      saveToLocalStorage('nano_prompt', prompt);
  }, [prompt]);

  useEffect(() => {
      saveToLocalStorage('nano_is_image_mode', isImageMode);
  }, [isImageMode]);

  useEffect(() => {
      saveToLocalStorage('nano_ui_visible', uiVisible);
  }, [uiVisible]);

  useEffect(() => {
      saveToLocalStorage('nano_settings', settings);
  }, [settings]);

  // Debounce saving images to avoid performance hits on rapid updates
  useEffect(() => {
      if (!isRestoring) {
          const timeoutId = setTimeout(() => {
              saveToIndexedDB(STORAGE_KEYS.SOURCE_IMAGES, sourceImages);
          }, 500);
          return () => clearTimeout(timeoutId);
      }
  }, [sourceImages, isRestoring]);

  useEffect(() => {
      if (!isRestoring) {
          const timeoutId = setTimeout(() => {
              saveToIndexedDB(STORAGE_KEYS.GENERATED_IMAGES, generatedImages);
          }, 500);
          return () => clearTimeout(timeoutId);
      }
  }, [generatedImages, isRestoring]);

  // Timer Effect for active processing
  useEffect(() => {
      let interval: any;
      if (isProcessing) {
          interval = setInterval(() => {
              setTimer(prev => prev + 0.1);
          }, 100);
      } else {
          setTimer(0);
      }
      return () => clearInterval(interval);
  }, [isProcessing]);

  
  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          const has = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(has);
        } else {
          setHasApiKey(true);
        }
      } catch (e) {
        console.error("Failed to check API key status", e);
        setHasApiKey(true);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  // Queue Processing Logic
  useEffect(() => {
      const processNextItem = async () => {
          if (isProcessing) return;

          // Find the next pending item (FIFO)
          const nextItem = queue.find(item => item.status === 'pending');
          if (!nextItem) return;

          setIsProcessing(true);
          setGlobalError(null);
          
          // Update status to processing
          setQueue(prev => prev.map(i => i.id === nextItem.id ? { ...i, status: 'processing' } : i));

          try {
              const { images, text } = await editImageWithGemini(
                  nextItem.sourceImages, 
                  nextItem.prompt, 
                  nextItem.settings
              );

              if (images.length > 0) {
                  const newImages: GeneratedImage[] = images.map(url => ({
                      id: crypto.randomUUID(),
                      url,
                      prompt: nextItem.prompt,
                      timestamp: Date.now()
                  }));
                  setGeneratedImages(prev => [...newImages, ...prev]);
              }

              if (text) {
                  setTextResponse(text);
              }

              // Remove from queue on success
              setQueue(prev => prev.filter(i => i.id !== nextItem.id));

          } catch (err: any) {
              const errorMessage = err.message || "Failed to generate image.";
              setGlobalError(errorMessage);
              
              // Update queue item to failed
              setQueue(prev => prev.map(i => i.id === nextItem.id ? { ...i, status: 'failed', error: errorMessage } : i));
          } finally {
              setIsProcessing(false);
          }
      };

      processNextItem();
  }, [queue, isProcessing]);


  const handleConnectKey = async () => {
    if (window.aistudio) {
        try {
            await window.aistudio.openSelectKey();
            setHasApiKey(true);
        } catch (e) {
            console.error("Key selection failed", e);
        }
    }
  };

  // Reset zoom and pan when image changes or viewer opens
  useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImageLoadError(false);
  }, [viewedImage]);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to find closest aspect ratio
  const detectAspectRatio = (width: number, height: number) => {
      const ratio = width / height;
      const ratios = {
          '1:1': 1,
          '3:4': 0.75,
          '4:3': 1.33,
          '9:16': 0.5625,
          '16:9': 1.7778
      };
      
      let closest = '16:9';
      let minDiff = Infinity;
      
      Object.entries(ratios).forEach(([key, val]) => {
          const diff = Math.abs(ratio - val);
          if (diff < minDiff) {
              minDiff = diff;
              closest = key;
          }
      });
      return closest;
  };

  // Handle File Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  };

  const processFiles = (files: File[]) => {
      const newImages: string[] = [];
      let processedCount = 0;

      files.forEach(file => {
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (e) => {
                  if (e.target?.result) {
                      const resultStr = e.target.result as string;
                      newImages.push(resultStr);
                      
                      // Detect Aspect Ratio from the first image added
                      if (processedCount === 0) {
                          const img = new Image();
                          img.onload = () => {
                              const detectedRatio = detectAspectRatio(img.width, img.height);
                              setSettings(prev => ({ ...prev, aspectRatio: detectedRatio }));
                          };
                          img.src = resultStr;
                      }
                  }
                  processedCount++;
                  if (processedCount === files.length) {
                      setSourceImages(prev => [...prev, ...newImages]);
                      setGlobalError(null);
                      setIsImageMode(true);
                  }
              };
              reader.readAsDataURL(file);
          } else {
              processedCount++;
          }
      });
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        processFiles(Array.from(files));
    }
  };

  const addToQueue = useCallback((currentPrompt: string, overrideSettings?: Partial<EditorSettings>) => {
      if (!currentPrompt.trim()) return;

      const effectiveSettings = { ...settings, ...overrideSettings };
      
      // Determine if we should include source images based on mode and availability
      // IMPORTANT: We copy the array so if the user changes sources later, this request is unaffected
      const requestSourceImages = isImageMode ? [...sourceImages] : [];

      const newItem: QueueItem = {
          id: crypto.randomUUID(),
          prompt: currentPrompt,
          settings: effectiveSettings,
          sourceImages: requestSourceImages,
          status: 'pending',
          timestamp: Date.now()
      };

      setQueue(prev => [...prev, newItem]);
      
      // Clear prompt if it was a manual entry (not a preset button click)
      if (!overrideSettings) {
          setPrompt("");
      }
  }, [settings, isImageMode, sourceImages]);

  const handleGenerate = useCallback(() => {
    addToQueue(prompt);
  }, [prompt, addToQueue]);

  const handleRemoveBackground = () => {
      if (!isImageMode || sourceImages.length === 0) {
          setGlobalError("Upload an image first to remove background.");
          setIsImageMode(true);
          return;
      }
      // Strict prompt to preserve subject
      const bgPrompt = "Edit this image: Replace the background with a clean white color. Keep the main subject exactly identical pixel-for-pixel. Do not regenerate the subject.";
      
      // Force Style to None and Model to Pro for better instruction following
      addToQueue(bgPrompt, { style: 'None', modelType: 'pro', resolution: '4K' });
  };
  
  const handleViewerRemoveBg = (imageUrl: string) => {
      setSourceImages([imageUrl]);
      setIsImageMode(true);
      setViewedImage(null);
      
      // Auto-detect ratio for the generated image being used as source
      const img = new Image();
      img.onload = () => {
           const detectedRatio = detectAspectRatio(img.width, img.height);
           setSettings(prev => ({ ...prev, aspectRatio: detectedRatio }));
           
           const bgPrompt = "Edit this image: Replace the background with a clean white color. Keep the main subject exactly identical pixel-for-pixel. Do not regenerate the subject.";
           setTimeout(() => addToQueue(bgPrompt, { style: 'None', aspectRatio: detectedRatio, modelType: 'pro', resolution: '4K' }), 100);
      };
      img.src = imageUrl;
  };

  const removeSourceImage = (index: number) => {
    setSourceImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllSourceImages = () => {
    setSourceImages([]);
  };

  const deleteGeneratedImage = (id: string) => {
      setGeneratedImages(prev => prev.filter(img => img.id !== id));
      if (viewedImage) setViewedImage(null);
  };
  
  const cancelQueueItem = (id: string) => {
      setQueue(prev => prev.filter(item => item.id !== id));
  };

  // Short filename generator
  const getShortName = (prefix = "img") => {
      return `${prefix}-${Math.floor(Math.random() * 0xFFFFF).toString(16)}`;
  }

  const downloadImage = (url: string) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getShortName()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
      if (generatedImages.length === 0) return;
      
      const zip = new JSZip();
      
      generatedImages.forEach((img, index) => {
          try {
              // Extract base64 data directly to avoid fetch issues with Data URLs
              const base64Data = img.url.split(',')[1];
              if (base64Data) {
                  zip.file(`${getShortName('nano')}-${index + 1}.png`, base64Data, { base64: true });
              }
          } catch (e) {
              console.error("Failed to add image to zip", e);
          }
      });
      
      try {
          const content = await zip.generateAsync({ type: "blob" });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(content);
          link.download = `nano-batch-${getShortName()}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(link.href), 100);
      } catch (e) {
          console.error("Failed to generate zip", e);
          setGlobalError("Failed to create zip file.");
      }
  };

  const addToLayers = (url: string) => {
      if (sourceImages.length >= 4) {
          setGlobalError("Max 4 layers allowed. Remove some source images to add more.");
          return;
      }
      setSourceImages(prev => [...prev, url]);
      setIsImageMode(true); 
      
      // If it's the first image, update aspect ratio to match
      if (sourceImages.length === 0) {
           const img = new Image();
           img.onload = () => {
               const detectedRatio = detectAspectRatio(img.width, img.height);
               setSettings(prev => ({ ...prev, aspectRatio: detectedRatio }));
           };
           img.src = url;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Zoom & Pan Controls
  const handleZoomIn = (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom(prev => Math.min(prev + 0.5, 5));
  };
  
  const handleZoomOut = (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom(prev => Math.max(prev - 0.5, 0.5));
  };

  // Wheel Zoom with Zoom-To-Cursor Logic
  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Determine zoom direction and factor
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      let newZoom = zoom * factor;
      newZoom = Math.max(0.5, Math.min(newZoom, 5));
      
      if (Math.abs(newZoom - zoom) < 0.01) return;

      const containerRect = e.currentTarget.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      
      // Mouse position relative to center
      const mouseX = e.clientX - containerRect.left - centerX;
      const mouseY = e.clientY - containerRect.top - centerY;
      
      // Math: NewPan = Mouse * (1 - NewZoom/OldZoom) + OldPan * (NewZoom/OldZoom)
      const effectiveFactor = newZoom / zoom;
      
      setPan(prev => ({
          x: mouseX * (1 - effectiveFactor) + prev.x * effectiveFactor,
          y: mouseY * (1 - effectiveFactor) + prev.y * effectiveFactor
      }));
      setZoom(newZoom);
  };

  // Mouse Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
      // Allow drag if zoomed in OR if specifically testing (removed zoom>1 check for flexibility if needed, but keeping it for UX)
      if (zoom > 1) {
          e.preventDefault(); 
          setIsDragging(true);
          dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging && zoom > 1) {
          e.preventDefault();
          setPan({
              x: e.clientX - dragStartRef.current.x,
              y: e.clientY - dragStartRef.current.y
          });
      }
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  // Touch Handlers for Mobile (Pan & Pinch)
  const getPinchDistance = (touches: React.TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      e.stopPropagation(); // Stop propagation to prevent closing viewer
      if (e.touches.length === 1 && zoom > 1) {
          // Single touch pan
          setIsDragging(true);
          const touch = e.touches[0];
          dragStartRef.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
      } else if (e.touches.length === 2) {
          // Pinch Zoom Start
          const dist = getPinchDistance(e.touches);
          initialPinchDistanceRef.current = dist;
          initialZoomRef.current = zoom;
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      e.stopPropagation();
      // e.preventDefault(); // Removed to allow potential browser gestures if needed, but relying on touch-action: none CSS

      if (e.touches.length === 1 && isDragging && zoom > 1) {
           // Single touch pan
           const touch = e.touches[0];
           setPan({
              x: touch.clientX - dragStartRef.current.x,
              y: touch.clientY - dragStartRef.current.y
           });
      } else if (e.touches.length === 2 && initialPinchDistanceRef.current) {
           // Pinch Zoom Move
           const dist = getPinchDistance(e.touches);
           const scaleFactor = dist / initialPinchDistanceRef.current;
           let newZoom = initialZoomRef.current * scaleFactor;
           newZoom = Math.max(0.5, Math.min(newZoom, 5));
           setZoom(newZoom);
      }
  };

  const handleTouchEnd = () => {
      setIsDragging(false);
      initialPinchDistanceRef.current = null;
  };

  // Keyboard Shortcuts - Apple Magic Keyboard compatible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd/Ctrl + Enter: Generate
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (prompt.trim()) {
                handleGenerate();
            }
        }
        // Escape: Close viewer or clear images
        if (e.key === 'Escape') {
           if (viewedImage) {
               setViewedImage(null);
           } else {
               clearAllSourceImages();
           }
        }
        // Cmd/Ctrl + S: Save/Download first image
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault(); 
            if (generatedImages.length > 0) {
                downloadImage(generatedImages[0].url);
            }
        }
        // Cmd/Ctrl + .: Toggle UI
        if ((e.ctrlKey || e.metaKey) && e.key === '.') {
            e.preventDefault();
            setUiVisible(prev => !prev);
        }
        // Cmd/Ctrl + U: Upload image
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            triggerFileUpload();
        }
        // Cmd/Ctrl + I: Toggle Image Mode
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            setIsImageMode(prev => !prev);
        }
        // Cmd/Ctrl + Shift + S: Download all as ZIP
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
            e.preventDefault();
            if (generatedImages.length > 0) {
                handleDownloadAll();
            }
        }
        // Cmd/Ctrl + B: Remove background (white)
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            if (isImageMode && sourceImages.length > 0) {
                handleRemoveBackground();
            }
        }
        // Cmd/Ctrl + K: Clear prompt
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setPrompt('');
        }
        // Cmd/Ctrl + D: Duplicate last generated to layers
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            if (generatedImages.length > 0) {
                addToLayers(generatedImages[0].url);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleGenerate, prompt, generatedImages, viewedImage, isImageMode, sourceImages]);


  if (isCheckingKey || isRestoring) {
      return <div className="min-h-screen bg-nano-bg flex items-center justify-center"><div className="w-8 h-8 border-2 border-nano-accent border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!hasApiKey) {
    return (
        <div className="min-h-screen bg-nano-bg text-nano-text flex items-center justify-center p-4 font-sans">
            <div className="max-w-md w-full bg-nano-card border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
                <div className="w-16 h-16 bg-nano-accent rounded-full flex items-center justify-center text-nano-bg font-bold text-3xl mx-auto mb-4 shadow-[0_0_20px_rgba(204,255,0,0.3)]">N</div>
                <h1 className="text-2xl font-bold text-white">Nano Edit</h1>
                <p className="text-zinc-400">Connect your Google Cloud project to start.</p>
                <button 
                    onClick={handleConnectKey}
                    className="w-full py-3 bg-nano-accent hover:bg-nano-accentHover text-nano-bg font-bold rounded-xl transition-all shadow-lg"
                >
                    Connect API Key
                </button>
                <p className="text-xs text-zinc-500 pt-2"><a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">Billing Information</a></p>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-nano-bg text-nano-text selection:bg-nano-accent selection:text-nano-bg flex flex-col font-sans">
      
      <header className={`p-6 flex justify-between items-center z-10 transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-nano-accent rounded-full flex items-center justify-center text-nano-bg font-bold">N</div>
            <span className="font-semibold text-lg tracking-tight">Nano Edit</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="hidden md:flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">⌘.</kbd> UI</span>
            <span className="hidden md:flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">⌘U</kbd> Upload</span>
            <span className="hidden lg:flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">⌘S</kbd> Save</span>
            <span className="hidden lg:flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">⌘B</kbd> Remove BG</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start relative w-full max-w-7xl mx-auto px-4 pb-48 pt-4">
        <div className="w-full h-full flex flex-col gap-8">
            
            {isImageMode && uiVisible && (
                <div className="w-full flex flex-col items-start gap-2 animate-fade-in-up">
                    <div className="flex items-center justify-between w-full px-1">
                         <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <IconLayers /> Input Layers ({sourceImages.length})
                        </span>
                        {sourceImages.length > 0 && (
                            <button onClick={clearAllSourceImages} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear (Esc)</button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3 overflow-x-auto w-full pb-2 no-scrollbar">
                         <div 
                            className="shrink-0 w-24 h-24 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-1 text-zinc-500 hover:border-nano-accent hover:text-nano-accent transition-all cursor-pointer bg-nano-card/50"
                            onClick={triggerFileUpload}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            title="Upload Image"
                        >
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
                            <IconUpload />
                            <span className="text-[10px] font-medium">Add</span>
                        </div>
                        {sourceImages.map((img, idx) => (
                            <div key={idx} className="relative group shrink-0 w-24 h-24 rounded-xl overflow-hidden shadow-lg border border-zinc-800">
                                <img src={img} alt={`Source ${idx}`} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300" onClick={() => setViewedImage(img)} />
                                <button 
                                    onClick={() => removeSourceImage(idx)}
                                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500/80 rounded-full text-white backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <IconX />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {globalError && uiVisible && (
                <div className="w-full max-w-2xl mx-auto bg-red-900/20 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex-1"><span className="font-bold block sm:inline mr-1">Error:</span> <span className="break-words">{globalError}</span></div>
                    {(globalError.includes("403") || globalError.includes("PERMISSION_DENIED")) && (
                         <button onClick={async () => { if(window.aistudio && window.aistudio.openSelectKey) { await window.aistudio.openSelectKey(); setGlobalError(null); } }} className="shrink-0 mt-2 sm:mt-0 px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors">Change API Key</button>
                    )}
                     <button onClick={() => setGlobalError(null)} className="shrink-0 p-1 hover:text-white"><IconX /></button>
                </div>
            )}

            {textResponse && uiVisible && (
                <div className="w-full max-w-4xl mx-auto animate-fade-in-up">
                    <div className="bg-nano-card border border-zinc-700 rounded-xl p-6 shadow-lg relative">
                        <button 
                            onClick={() => setTextResponse(null)} 
                            className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-white transition-colors"
                        >
                            <IconX />
                        </button>
                        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                            <IconSparkles /> AI Response
                        </h3>
                        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-mono text-zinc-300">
                            {textResponse}
                        </div>
                    </div>
                </div>
            )}

            {(generatedImages.length > 0 || queue.length > 0) && (
                <div className="w-full">
                    <h3 className={`text-zinc-500 text-sm font-medium mb-4 uppercase tracking-wider flex items-center justify-between transition-opacity ${uiVisible ? 'opacity-100' : 'opacity-0'}`}>
                        <span>
                            {isProcessing ? `Generating (${timer.toFixed(1)}s)...` : 'Gallery'} 
                            {queue.length > 0 && !isProcessing && <span className="text-zinc-600 ml-2">({queue.length} in queue)</span>}
                        </span>
                        <div className="flex items-center gap-3">
                            <span className="text-xs normal-case text-zinc-600 hidden sm:inline">Cmd/Ctrl+S to save</span>
                        </div>
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full animate-fade-in-up">
                        
                        {/* Queue Items Rendering */}
                        {queue.map((item, idx) => (
                             <div key={item.id} className="relative aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center gap-3 shadow-[0_0_15px_rgba(204,255,0,0.05)] overflow-hidden">
                                {item.status === 'processing' ? (
                                    <>
                                        <div className="w-10 h-10 border-2 border-nano-accent border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-nano-accent text-sm font-mono">{timer.toFixed(1)}s</span>
                                        <p className="text-xs text-zinc-500 px-4 text-center line-clamp-1 absolute bottom-4 w-full">{item.prompt}</p>
                                    </>
                                ) : item.status === 'failed' ? (
                                     <>
                                        <div className="text-red-500 mb-2"><IconX /></div>
                                        <span className="text-red-400 text-xs font-bold">Failed</span>
                                        <button onClick={() => cancelQueueItem(item.id)} className="mt-2 text-[10px] underline text-zinc-500 hover:text-zinc-300">Dismiss</button>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-dotted animate-pulse"></div>
                                        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Waiting...</span>
                                        <div className="absolute top-2 left-2 text-[10px] text-zinc-600 font-mono">#{idx + 1}</div>
                                        <p className="text-xs text-zinc-600 px-4 text-center line-clamp-2 absolute bottom-4 w-full opacity-60">{item.prompt}</p>
                                        <button 
                                            onClick={() => cancelQueueItem(item.id)} 
                                            className="absolute top-2 right-2 p-1 text-zinc-600 hover:text-red-400 transition-colors"
                                            title="Cancel"
                                        >
                                            <IconX />
                                        </button>
                                    </>
                                )}
                             </div>
                        ))}

                        {/* Generated Images */}
                        {generatedImages.map((img) => (
                            <div key={img.id} className="relative group rounded-xl overflow-hidden bg-nano-card border border-zinc-800 aspect-square flex items-center justify-center">
                                <img src={img.url} alt={img.prompt} className="w-full h-full object-cover cursor-pointer" onClick={() => setViewedImage(img.url)} />
                                <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-4 transition-all duration-300 ${uiVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <p className="text-xs text-white/90 line-clamp-2 mb-3 font-medium">{img.prompt}</p>
                                    <div className="grid grid-cols-4 gap-2">
                                         <button onClick={() => setViewedImage(img.url)} className="px-2 py-2 bg-zinc-800 text-white text-xs font-bold rounded-lg hover:bg-zinc-700 flex items-center justify-center transition-colors" title="View Fullscreen"><IconEye /></button>
                                        <button onClick={() => addToLayers(img.url)} className="px-2 py-2 bg-nano-accent text-nano-bg text-xs font-bold rounded-lg hover:bg-nano-accentHover flex items-center justify-center transition-colors" title="Add Layer"><IconLayerPlus /></button>
                                        <button onClick={() => downloadImage(img.url)} className="px-2 py-2 bg-zinc-800 text-white text-xs font-bold rounded-lg hover:bg-zinc-700 flex items-center justify-center transition-colors" title="Download"><IconDownload /></button>
                                        <button onClick={() => deleteGeneratedImage(img.id)} className="px-2 py-2 bg-red-900/50 text-red-200 text-xs font-bold rounded-lg hover:bg-red-900 flex items-center justify-center transition-colors" title="Delete"><IconTrash /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </main>

      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-50 transition-all duration-500 ${uiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        <div className="bg-nano-card/90 backdrop-blur-xl border border-zinc-800 p-2 rounded-2xl shadow-2xl flex flex-col gap-2">
          
          <div className="flex items-center gap-2 p-1">
              <div className="flex-1 relative">
                  <input 
                      type="text" 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={isImageMode && sourceImages.length > 0 ? "Describe your edit..." : "Describe an image to generate..."}
                      className="w-full bg-zinc-900/50 text-white placeholder-zinc-500 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-zinc-700 border border-transparent focus:border-zinc-700 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && handleGenerate()}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5 hidden sm:block">Cmd/Ctrl+Enter</span>
                  </div>
              </div>
              <button 
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="h-12 px-6 bg-nano-accent hover:bg-nano-accentHover disabled:opacity-50 disabled:cursor-not-allowed text-nano-bg font-bold rounded-xl flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
              >
                 {isProcessing ? 'Queue' : 'Generate'}
                 <IconSparkles />
              </button>
          </div>

          <div className="flex flex-wrap items-center justify-between px-2 pb-1 gap-2">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
                  <button 
                    onClick={() => setIsImageMode(!isImageMode)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isImageMode ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white'}`}
                  >
                     <span className="hidden sm:inline">Image Input</span>
                     {isImageMode ? <IconToggleRight /> : <IconToggleLeft />}
                  </button>

                  <div className="w-px h-6 bg-zinc-800 mx-1 hidden sm:block"></div>

                  <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0">
                      <IconSettings />
                      <select 
                          value={settings.resolution} 
                          onChange={(e) => setSettings(prev => ({
                              ...prev, 
                              resolution: e.target.value as any, 
                              modelType: (e.target.value === '1K' ? 'flash' : 'pro') 
                          }))} 
                          className="bg-transparent text-xs font-medium text-white outline-none cursor-pointer w-24"
                      >
                          <option value="1K" className="bg-zinc-900 text-white">Standard (Fast)</option>
                          <option value="2K" className="bg-zinc-900 text-white">HD (Pro)</option>
                          <option value="4K" className="bg-zinc-900 text-white">4K (Pro)</option>
                      </select>
                  </div>

                  <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0">
                      <IconAspectRatio />
                      <select value={settings.aspectRatio} onChange={(e) => setSettings(prev => ({...prev, aspectRatio: e.target.value}))} className="bg-transparent text-xs font-medium text-white outline-none cursor-pointer w-16">
                          {ASPECT_RATIOS.map(ratio => (<option key={ratio.value} value={ratio.value} className="bg-zinc-900 text-white">{ratio.label}</option>))}
                      </select>
                  </div>

                   <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0">
                      <IconPalette />
                      <select value={settings.style} onChange={(e) => setSettings(prev => ({...prev, style: e.target.value}))} className="bg-transparent text-xs font-medium text-white outline-none cursor-pointer w-20">
                          {STYLES.map(style => (<option key={style.value} value={style.value} className="bg-zinc-900 text-white">{style.label}</option>))}
                      </select>
                  </div>

                   <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0">
                      <IconCamera />
                      <select value={settings.cameraAngle} onChange={(e) => setSettings(prev => ({...prev, cameraAngle: e.target.value}))} className="bg-transparent text-xs font-medium text-white outline-none cursor-pointer w-24">
                          {CAMERA_ANGLES.map(angle => (<option key={angle.value} value={angle.value} className="bg-zinc-900 text-white">{angle.label}</option>))}
                      </select>
                  </div>

                  {/* Quick Actions Dropdown */}
                  <div className="flex items-center gap-2 bg-nano-accent/10 rounded-lg px-3 py-1.5 border border-nano-accent/30 shrink-0">
                      <IconSparkles />
                      <select 
                          value="" 
                          onChange={(e) => {
                              if (e.target.value) {
                                  const preset = PRESET_PROMPTS.find(p => p.label === e.target.value);
                                  if (preset) {
                                      setPrompt(preset.prompt);
                                      if (preset.label.includes('BG') && sourceImages.length === 0) {
                                          setGlobalError("Upload an image first to change background.");
                                          setIsImageMode(true);
                                      }
                                  }
                              }
                          }} 
                          className="bg-transparent text-xs font-medium text-nano-accent outline-none cursor-pointer w-24"
                      >
                          <option value="" className="bg-zinc-900 text-white">Quick Actions</option>
                          {PRESET_PROMPTS.map(preset => (
                              <option key={preset.label} value={preset.label} className="bg-zinc-900 text-white">
                                  {preset.icon} {preset.label}
                              </option>
                          ))}
                      </select>
                  </div>

                  {/* Remove Background Button */}
                  {isImageMode && sourceImages.length > 0 && (
                      <button 
                          onClick={handleRemoveBackground}
                          className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0 text-xs font-medium text-zinc-300 transition-colors"
                          title="Remove Background"
                      >
                          <IconEraser />
                          <span className="hidden sm:inline">Remove BG</span>
                      </button>
                  )}

                  {generatedImages.length > 0 && (
                      <button onClick={handleDownloadAll} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg px-3 py-1.5 border border-zinc-800 shrink-0 text-xs font-bold text-nano-accent transition-colors" title="Download all as ZIP">
                          <IconZip /> <span className="hidden sm:inline">Download All</span>
                      </button>
                  )}
              </div>

               <button onClick={() => setUiVisible(false)} className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 rounded-lg text-xs font-medium transition-all" title="Hide UI (Cmd/Ctrl + .)">
                  <IconEyeOff />
              </button>
          </div>
        </div>
      </div>

      {!uiVisible && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 opacity-50 hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-zinc-500 bg-black/50 backdrop-blur px-2 py-1 rounded-full">Cmd/Ctrl + . to show controls</span>
          </div>
      )}

      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-nano-accent/5 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[100px]"></div>
      </div>

      {viewedImage && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setViewedImage(null)}>
              <button className={`absolute top-4 right-4 p-2 bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-white transition-opacity ${uiVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`} onClick={() => setViewedImage(null)}><IconX /></button>
              
              {/* Enhanced Zoom & Pan Controls Overlay */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-2 pl-4 pr-4 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-full shadow-2xl z-[110] transition-all hover:bg-zinc-900" onClick={e => e.stopPropagation()}>
                   <button onClick={handleZoomOut} className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={zoom <= 0.5} title="Zoom Out"><IconZoomOut /></button>
                   
                   <input 
                      type="range" 
                      min="0.5" 
                      max="5" 
                      step="0.1" 
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-32 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-nano-accent outline-none hover:bg-zinc-600 transition-colors"
                   />
                   
                   <button onClick={handleZoomIn} className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={zoom >= 5} title="Zoom In"><IconZoomIn /></button>
                   
                   <div className="w-px h-4 bg-zinc-700 mx-1"></div>
                   
                   <button onClick={() => { setZoom(1); setPan({x:0,y:0}); }} className="text-xs font-mono text-nano-accent w-[4ch] text-center hover:text-white transition-colors" title="Reset Zoom">
                       {Math.round(zoom * 100)}%
                   </button>
              </div>

              <div 
                  className={`w-full h-full overflow-hidden flex items-center justify-center ${zoom > 1 ? 'cursor-move' : 'cursor-default'}`} 
                  onClick={e => e.stopPropagation()}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{ touchAction: 'none' }}
              >
                 {imageLoadError ? (
                    <div className="flex flex-col items-center justify-center text-zinc-500 gap-2">
                        <IconX />
                        <span>Failed to load image preview</span>
                    </div>
                 ) : (
                  <img 
                      key={viewedImage}
                      src={viewedImage} 
                      alt="Full View" 
                      className="origin-center select-none block"
                      style={{ 
                          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          transition: isDragging ? 'none' : 'transform 0.1s ease-out' 
                      }}
                      draggable={false}
                      onError={() => setImageLoadError(true)}
                  />
                 )}
              </div>

              <div className={`absolute bottom-4 right-4 flex gap-2 transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`} onClick={e => e.stopPropagation()}>
                   <button onClick={() => handleViewerRemoveBg(viewedImage!)} className="px-4 py-2 bg-zinc-800 text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-700 flex items-center gap-2 transition-colors border border-zinc-700" title="Use to Remove Background"><IconEraser /> Remove BG</button>
                   <button onClick={() => downloadImage(viewedImage!)} className="px-4 py-2 bg-nano-card/80 backdrop-blur text-white text-sm font-bold rounded-lg hover:bg-zinc-700 flex items-center gap-2 transition-colors border border-zinc-700"><IconDownload /> Save</button>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;