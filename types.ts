
export interface EditorSettings {
  aspectRatio: string;
  resolution: '1K' | '2K' | '4K'; // 1K is default/Flash. 2K/4K triggers Pro.
  modelType: 'flash' | 'pro';
  style: string;
  cameraAngle: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

export interface QueueItem {
  id: string;
  prompt: string;
  settings: EditorSettings;
  sourceImages: string[];
  status: 'pending' | 'processing' | 'failed';
  timestamp: number;
  error?: string;
}

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
}

export const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1', icon: 'Square' },
  { label: '3:4', value: '3:4', icon: 'Portrait' },
  { label: '4:3', value: '4:3', icon: 'Landscape' },
  { label: '9:16', value: '9:16', icon: 'Mobile' },
  { label: '16:9', value: '16:9', icon: 'Wide' },
];

export const RESOLUTIONS = [
  { label: 'Standard', value: '1K', desc: 'Fast (Flash)' },
  { label: 'HD', value: '2K', desc: 'High Quality (Pro)' },
  { label: 'UHD', value: '4K', desc: 'Max Quality (Pro)' },
];

export const STYLES = [
  { label: 'None', value: 'None' },
  { label: 'Cinematic', value: 'Cinematic' },
  { label: 'Anime', value: 'Anime' },
  { label: 'Digital Art', value: 'Digital Art' },
  { label: 'Pixel Art', value: 'Pixel Art' },
  { label: 'Oil Painting', value: 'Oil Painting' },
  { label: 'Photorealistic', value: 'Photorealistic' },
  { label: 'Vintage', value: 'Vintage' },
  { label: 'Cyberpunk', value: 'Cyberpunk' },
  { label: 'Watercolor', value: 'Watercolor' },
  { label: '3D Render', value: '3D Render' },
  { label: 'Handwritten Notes', value: 'Handwritten Notes' },
  { label: 'Black Background', value: 'Black Background' },
  { label: 'White Background', value: 'White Background' },
  { label: 'Minimalist', value: 'Minimalist' },
  { label: 'Sketch', value: 'Sketch' },
  { label: 'Neon Glow', value: 'Neon Glow' },
];

export const PRESET_PROMPTS = [
  {
    label: 'Study Notes',
    icon: '📝',
    prompt: 'Create a handwritten-style study note. Use a messy but readable student-style handwriting on lined notebook paper. Highlight all key terms with a yellow neon marker and circle any dates or numbers in red. Add small, simple doodles or sketches to explain concepts visually. Make sure the entire layout fits on a single A4-size printable page with good spacing, clear sections, and a neat heading. Include arrows, boxes, and mini callouts wherever helpful to improve memory recall.',
  },
  {
    label: 'White BG',
    icon: '⬜',
    prompt: 'Change the background of this image to pure white (#FFFFFF). Keep the main subject completely unchanged with clean, natural edges. Preserve all details, colors, and lighting of the subject.',
  },
  {
    label: 'Black BG',
    icon: '⬛',
    prompt: 'Change the background of this image to pure black (#000000). Keep the main subject completely unchanged with clean, natural edges. Preserve all details, colors, and lighting of the subject.',
  },
  {
    label: 'Transparent BG',
    icon: '🔲',
    prompt: 'Create a professional cutout of the main subject from this image with transparent background. Remove all background elements completely while preserving the subject with perfect edge quality. Output as PNG format with transparency.',
  },
  {
    label: 'Enhance',
    icon: '✨',
    prompt: 'Enhance this image: Improve quality, sharpness, color balance, and overall visual appeal while preserving the original content and composition.',
  },
  {
    label: 'Upscale',
    icon: '🔍',
    prompt: 'Upscale this image to higher resolution while maintaining sharpness and adding fine details. Keep the original style and content intact.',
  },
];

export const CAMERA_ANGLES = [
  { label: 'None', value: 'None' },
  { label: 'Eye Level', value: 'Eye Level' },
  { label: 'Low Angle', value: 'Low Angle' },
  { label: 'High Angle', value: 'High Angle' },
  { label: 'Overhead', value: 'Overhead' },
  { label: 'Drone View', value: 'Drone View' },
  { label: 'Macro', value: 'Macro' },
  { label: 'Wide Angle', value: 'Wide Angle' },
  { label: 'Dutch Angle', value: 'Dutch Angle' },
];

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}