import type { Adapter } from "../types";
import { extractYouTubeTranscriptDocument } from "./transcript";
import { isYouTubeHost, parseYouTubeVideoId } from "./utils";

export const youtubeAdapter: Adapter = {
  name: "youtube",
  match(input) {
    return isYouTubeHost(input.url.hostname);
  },
  async process(context) {
    const videoId = parseYouTubeVideoId(context.input.url);
    if (!videoId) {
      return null;
    }

    context.log.info(`Loading ${context.input.url.toString()} with youtube adapter`);
    return extractYouTubeTranscriptDocument(context, videoId);
  },
};

