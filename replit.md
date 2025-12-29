# Nano Edit - AI Image Editor

## Overview

Nano Edit is a client-side AI image editor powered by Google's Gemini 2.5 Flash and Pro models. Users can edit images using natural language prompts with control over aspect ratio, resolution, and various style presets. The application is built as a single-page React application with Vite as the build tool.

Key features:
- Natural language image editing via Gemini AI
- Multiple resolution options (1K/Flash, 2K/4K/Pro models)
- Aspect ratio controls and style presets
- Image queue system for batch processing
- Persistent state using IndexedDB and LocalStorage
- Full-screen image viewer with zoom/pan capabilities
- Bulk download via ZIP export
- Quick action preset buttons (Study Notes, Background Remover, Enhance, Upscale)
- Apple Magic Keyboard shortcuts support

## Keyboard Shortcuts (Mac)

| Shortcut | Action |
|----------|--------|
| Cmd + Enter | Generate image |
| Cmd + S | Save/download first image |
| Cmd + Shift + S | Download all as ZIP |
| Cmd + U | Upload image |
| Cmd + I | Toggle Image Input mode |
| Cmd + B | Remove background (white) |
| Cmd + K | Clear prompt |
| Cmd + D | Duplicate last generated to layers |
| Cmd + . | Toggle UI visibility |
| Escape | Close viewer / Clear images |

## Preset Quick Actions

- **Study Notes**: Creates handwritten-style study notes on lined paper with highlights, doodles, and visual memory aids
- **White BG**: Replace background with pure white
- **Black BG**: Replace background with pure black  
- **Transparent BG**: Remove background completely
- **Enhance**: Improve image quality and visual appeal
- **Upscale**: Increase resolution with detail enhancement

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6 with React plugin
- **Styling**: Tailwind CSS loaded via CDN with custom theme configuration
- **State Management**: React useState hooks with persistence layers

The application follows a single-component architecture centered around `App.tsx`, with supporting service modules for API calls and storage. Icons are componentized in a separate file for reusability.

### Data Persistence Strategy
Two-tier storage approach chosen to balance performance and capability:
1. **LocalStorage**: Lightweight state (prompt text, settings, UI preferences) - loads synchronously to prevent flash of default content
2. **IndexedDB**: Heavy data (source images, generated images as base64) - loads asynchronously after initial render

This split prevents localStorage quota issues while ensuring fast initial loads for user settings.

### AI Integration
- **Service**: Google Gemini API via `@google/genai` SDK
- **Models**: 
  - Gemini 2.5 Flash for standard (1K) resolution - faster, lower cost
  - Gemini 2.5 Pro for HD (2K/4K) resolution - higher quality output
- **Image Preprocessing**: Base64 images are resized client-side (max 1024px) before API calls to avoid payload limits and improve response times
- **API Key**: Loaded via environment variable (`GEMINI_API_KEY`) and injected at build time through Vite's define config

### Queue System
Asynchronous queue for managing multiple generation requests:
- Items tracked with status: pending, processing, failed
- Allows users to queue multiple edits without blocking UI
- Failed items retain error messages for debugging

### Type System
Centralized type definitions in `types.ts` including:
- `EditorSettings`: User preferences for generation
- `GeneratedImage`: Output tracking with metadata
- `QueueItem`: Queue management state
- Preset constants for UI dropdowns (aspect ratios, resolutions, styles, camera angles)

## External Dependencies

### APIs & Services
- **Google Gemini API**: Core AI functionality for image generation and editing
  - Requires `GEMINI_API_KEY` environment variable
  - Uses `@google/genai` SDK (v1.30.0+)

### Client-Side Storage
- **IndexedDB**: Browser database for large image data persistence
- **LocalStorage**: Quick-access storage for user preferences

### NPM Packages
- `react` / `react-dom`: UI framework (v19)
- `@google/genai`: Google's Generative AI SDK
- `jszip`: ZIP file generation for bulk image downloads

### CDN Resources
- Tailwind CSS (via CDN script)
- Inter font (Google Fonts)

### Development Tools
- TypeScript 5.8
- Vite 6 with React plugin
- Node.js types for build configuration