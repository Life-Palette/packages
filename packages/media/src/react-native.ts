import { toByteArray } from "base64-js";
import { extractMeta, getImagePixels } from "metaprobe/react-native";
import { type AnalyzeMediaOptions, analyzeRasterPixels } from "./shared";

export type AnalyzeMediaUriOptions = Pick<
  AnalyzeMediaOptions,
  | "analysisMaxDimension"
  | "blurhashComponentX"
  | "blurhashComponentY"
  | "colorCount"
>;

/** Analyze native image pixels with the same BlurHash and color algorithm as Web. */
export async function analyzeMediaUri(
  uri: string,
  filename: string,
  options: AnalyzeMediaUriOptions = {}
) {
  const metadata = await extractMeta(uri, filename);
  if (metadata.kind !== "image") {
    return { metadata };
  }

  try {
    const pixels = await getImagePixels(
      uri,
      options.analysisMaxDimension ?? 100
    );
    const rgba = new Uint8ClampedArray(toByteArray(pixels.rgbaBase64));
    return {
      image: analyzeRasterPixels(rgba, pixels.width, pixels.height, options),
      metadata,
    };
  } catch (error) {
    return {
      imageError: error instanceof Error ? error.message : String(error),
      metadata,
    };
  }
}
