/** Minimal structural metadata accepted by the server upload completion API. */
export interface UploadMetadata {
  basic: {
    md5: string;
    size: number;
  };
  image?: object;
  schema_version: number;
  video?: object;
}
