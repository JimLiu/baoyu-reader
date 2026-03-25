import type { ExtractedDocument } from "../../extract/document";
import { formatTimestamp, type YouTubeChapter, type YouTubeTranscriptSegment } from "./utils";

interface CaptionInfo {
  captionUrl: string;
  language: string;
  kind: string;
  available: string[];
  title?: string;
  author?: string;
}

function chunkSegments(
  segments: YouTubeTranscriptSegment[],
  chapters: YouTubeChapter[],
): string {
  if (segments.length === 0) {
    return "";
  }

  if (chapters.length > 0) {
    const parts: string[] = [];
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index];
      const nextTime = chapters[index + 1]?.time ?? Number.POSITIVE_INFINITY;
      const chapterSegments = segments.filter((segment) => segment.start >= chapter.time && segment.start < nextTime);
      if (chapterSegments.length === 0) {
        continue;
      }
      parts.push(`## ${chapter.title} (${formatTimestamp(chapter.time)})`);
      parts.push(chapterSegments.map((segment) => segment.text).join(" "));
    }
    if (parts.length > 0) {
      return parts.join("\n\n");
    }
  }

  const paragraphs: string[] = [];
  let currentText: string[] = [];
  let currentStart = segments[0]?.start ?? 0;
  let lastEnd = segments[0]?.end ?? 0;

  for (const segment of segments) {
    const wouldOverflow =
      currentText.join(" ").length > 320 ||
      currentText.length >= 8 ||
      segment.start - lastEnd > 8;

    if (currentText.length > 0 && wouldOverflow) {
      paragraphs.push(`### ${formatTimestamp(currentStart)}\n\n${currentText.join(" ")}`);
      currentText = [];
      currentStart = segment.start;
    }

    if (currentText.length === 0) {
      currentStart = segment.start;
    }

    currentText.push(segment.text);
    lastEnd = segment.end;
  }

  if (currentText.length > 0) {
    paragraphs.push(`### ${formatTimestamp(currentStart)}\n\n${currentText.join(" ")}`);
  }

  return paragraphs.join("\n\n");
}

export async function extractYouTubeTranscriptDocument(
  context: Parameters<import("../types").Adapter["process"]>[0],
  videoId: string,
): Promise<ExtractedDocument | null> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  await context.browser.goto(videoUrl, context.timeoutMs);

  try {
    await context.network.waitForIdle({
      idleMs: 1_000,
      timeoutMs: Math.min(context.timeoutMs, 8_000),
    });
  } catch {
    context.log.debug("Network idle timed out on YouTube load.");
  }

  const captionInfo = await context.browser.evaluate<CaptionInfo | { error: string }>(`
    (async () => {
      const apiKey = window.ytcfg?.data_?.INNERTUBE_API_KEY;
      const playerResponse = window.ytInitialPlayerResponse;
      const videoDetails = playerResponse?.videoDetails || {};
      const title = videoDetails.title || document.title.replace(/ - YouTube$/, "").trim();
      const author = videoDetails.author || document.querySelector('link[itemprop="name"]')?.getAttribute('content') || undefined;
      if (!apiKey) {
        return { error: "INNERTUBE_API_KEY not found on page" };
      }

      const response = await fetch('/youtubei/v1/player?key=' + apiKey + '&prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
          videoId: ${JSON.stringify(videoId)}
        })
      });

      if (!response.ok) {
        return { error: 'InnerTube player API returned HTTP ' + response.status };
      }

      const data = await response.json();
      const renderer = data.captions?.playerCaptionsTracklistRenderer;
      if (!renderer?.captionTracks?.length) {
        return { error: 'No captions available for this video' };
      }

      const tracks = renderer.captionTracks;
      const track = tracks.find((item) => item.kind !== 'asr') || tracks[0];

      return {
        captionUrl: track.baseUrl,
        language: track.languageCode,
        kind: track.kind || 'manual',
        available: tracks.map((item) => item.languageCode + (item.kind === 'asr' ? ' (auto)' : '')),
        title,
        author,
      };
    })()
  `);

  if ("error" in captionInfo) {
    context.log.debug(`YouTube transcript unavailable: ${captionInfo.error}`);
    return null;
  }

  const segments = await context.browser.evaluate<YouTubeTranscriptSegment[] | { error: string }>(`
    (async () => {
      const response = await fetch(${JSON.stringify(captionInfo.captionUrl)});
      const xml = await response.text();
      if (!xml) {
        return { error: 'Caption XML is empty' };
      }

      function getAttr(tag, name) {
        const needle = name + '="';
        const index = tag.indexOf(needle);
        if (index === -1) return '';
        const valueStart = index + needle.length;
        const valueEnd = tag.indexOf('"', valueStart);
        if (valueEnd === -1) return '';
        return tag.substring(valueStart, valueEnd);
      }

      function decodeEntities(value) {
        return value
          .replaceAll('&amp;', '&')
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&#39;', "'");
      }

      const marker = xml.includes('<p t="') ? '<p ' : '<text ';
      const endMarker = marker === '<p ' ? '</p>' : '</text>';
      const results = [];
      let position = 0;

      while (true) {
        const tagStart = xml.indexOf(marker, position);
        if (tagStart === -1) break;
        let contentStart = xml.indexOf('>', tagStart);
        if (contentStart === -1) break;
        contentStart += 1;
        const tagEnd = xml.indexOf(endMarker, contentStart);
        if (tagEnd === -1) break;

        const attrString = xml.substring(tagStart + marker.length, contentStart - 1);
        const content = xml.substring(contentStart, tagEnd);
        const start = marker === '<p '
          ? (parseFloat(getAttr(attrString, 't')) || 0) / 1000
          : (parseFloat(getAttr(attrString, 'start')) || 0);
        const duration = marker === '<p '
          ? (parseFloat(getAttr(attrString, 'd')) || 0) / 1000
          : (parseFloat(getAttr(attrString, 'dur')) || 0);
        const text = decodeEntities(content.replace(/<[^>]+>/g, '')).split('\\n').join(' ').trim();
        if (text) {
          results.push({ start, end: start + duration, text });
        }

        position = tagEnd + endMarker.length;
      }

      if (results.length === 0) {
        return { error: 'Parsed 0 transcript segments' };
      }
      return results;
    })()
  `);

  if (!Array.isArray(segments) || segments.length === 0) {
    context.log.debug("Parsed no YouTube transcript segments.");
    return null;
  }

  const chapters = await context.browser.evaluate<YouTubeChapter[]>(`
    (() => {
      const data = window.ytInitialData;
      const markers = data?.playerOverlays?.playerOverlayRenderer
        ?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer
        ?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap || [];
      const results = [];

      for (const marker of markers) {
        const chapters = marker?.value?.chapters;
        if (!Array.isArray(chapters)) continue;
        for (const chapter of chapters) {
          const renderer = chapter?.chapterRenderer;
          const title = renderer?.title?.simpleText;
          const timeRangeStartMillis = renderer?.timeRangeStartMillis;
          if (title && typeof timeRangeStartMillis === 'number') {
            results.push({ title, time: Math.floor(timeRangeStartMillis / 1000) });
          }
        }
      }

      return results;
    })()
  `).catch(() => []);

  const markdown = chunkSegments(segments, chapters);
  if (!markdown) {
    return null;
  }

  const pageUrl = await context.browser.getURL();
  const summary = segments.slice(0, 8).map((segment) => segment.text).join(" ").slice(0, 240);

  return {
    url: pageUrl,
    canonicalUrl: pageUrl,
    title: captionInfo.title || "YouTube Transcript",
    author: captionInfo.author,
    siteName: "YouTube",
    summary: summary || undefined,
    adapter: "youtube",
    metadata: {
      kind: "youtube/transcript",
      videoId,
      language: captionInfo.language,
      captionKind: captionInfo.kind,
      availableLanguages: captionInfo.available,
      chapterCount: chapters.length,
    },
    content: [{ type: "markdown", markdown }],
  };
}

