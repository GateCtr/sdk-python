import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "GateCtr — One gateway. Every LLM.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        padding: "80px",
      }}
    >
      {/* Cyan accent bar */}
      <div
        style={{
          width: "60px",
          height: "4px",
          backgroundColor: "#00d4ff",
          marginBottom: "32px",
        }}
      />
      {/* Title */}
      <div
        style={{
          fontSize: "56px",
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.1,
          marginBottom: "24px",
          maxWidth: "900px",
        }}
      >
        GateCtr — One gateway. Every LLM.
      </div>
      {/* Description */}
      <div
        style={{
          fontSize: "28px",
          color: "#a0a0a0",
          lineHeight: 1.4,
          maxWidth: "800px",
        }}
      >
        Cut LLM costs by 40%. One endpoint swap. Zero code changes.
      </div>
      {/* Brand name bottom right */}
      <div
        style={{
          position: "absolute",
          bottom: "60px",
          right: "80px",
          fontSize: "24px",
          color: "#00d4ff",
          fontWeight: 700,
        }}
      >
        gatectr.com
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
