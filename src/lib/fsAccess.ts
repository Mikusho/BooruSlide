// Browser File System Access API helper for writing directly to a user-selected OS directory
// Falls back cleanly when running inside restricted iframes or browsers without showDirectoryPicker.

export interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

export function isBrowserFolderPickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as DirectoryPickerWindow;
  if (typeof win.showDirectoryPicker !== 'function') return false;
  try {
    // Cross-origin iframes throw SecurityError when calling showDirectoryPicker
    return window.self === window.top;
  } catch {
    return false;
  }
}

export async function pickBrowserGalleryDirectory(): Promise<FileSystemDirectoryHandle> {
  const win = window as DirectoryPickerWindow;
  if (typeof win.showDirectoryPicker !== 'function') {
    throw new Error('Your browser does not support direct folder selection (File System Access API).');
  }
  return await win.showDirectoryPicker({ mode: 'readwrite' });
}

export async function writeMediaToBrowserDirectory(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  sourceUrl: string
): Promise<void> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch image bytes (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}
