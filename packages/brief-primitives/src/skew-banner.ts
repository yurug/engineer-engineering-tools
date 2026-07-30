// Module: skew-banner -- PR5/ADR-012's rendered banner: a mismatched
// schemaVersion produces a visible, actionable SVG naming the refresh
// command, instead of a thrown error or a silent rejection.
import { escapeXmlText } from "./svg-utils.js";
import { TOKENS } from "./tokens.js";

export interface SkewBannerInfo {
  implementedVersion: string;
  specVersion: string;
  refreshCommand: string;
}

const BANNER_WIDTH = 480;
const BANNER_HEIGHT = 96;

/**
 * @returns a small, complete, standalone SVG document -- same substrate
 *   (SVG) as the renderer it stands in for, so a consumer can swap it in
 *   without special-casing the container.
 * @invariant PR5 -- the returned markup always names BOTH version numbers
 *   and the literal refresh command; never a generic "invalid spec" message.
 */
export function renderSkewBanner(info: SkewBannerInfo): string {
  const lines = [
    `schemaVersion mismatch: spec=${info.specVersion} renderer=${info.implementedVersion}`,
    `Refresh: ${info.refreshCommand}`,
  ];
  const text = lines
    .map(
      (line, i) =>
        `<text x="12" y="${28 + i * 20}" font-family="${TOKENS.font.family}" font-size="${TOKENS.font.size}" fill="${TOKENS.color.ink}">${escapeXmlText(line)}</text>`,
    )
    .join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH}pt" height="${BANNER_HEIGHT}pt" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}" class="backbrief-skew-banner">`,
    `<rect x="1" y="1" width="${BANNER_WIDTH - 2}" height="${BANNER_HEIGHT - 2}" fill="${TOKENS.color.surface}" stroke="${TOKENS.color.conjecture}" stroke-width="2" stroke-dasharray="${TOKENS.stroke.frameDash}"/>`,
    text,
    `</svg>`,
  ].join("\n");
}
