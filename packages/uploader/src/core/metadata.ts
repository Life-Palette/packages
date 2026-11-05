/** Minimal structural metadata accepted by the server upload completion API. */
export interface UploadMetadata {
  basic: {
    md5: string;
    size: number;
  };
  schema_version: number;
  image?: object;
  video?: object;
}
