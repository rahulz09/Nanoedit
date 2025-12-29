
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