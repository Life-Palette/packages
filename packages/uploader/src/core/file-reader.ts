export interface FileReaderAdapter {
  checksum: (onProgress?: (percent: number) => void) => Promise<string>;
  close: () => Promise<void>;
  name: string;
  read: (start: number, end: number) => Promise<ArrayBuffer>;
  size: number;
}
