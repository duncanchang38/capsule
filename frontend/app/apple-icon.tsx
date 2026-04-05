import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f7f5f0",
          borderRadius: 40,
        }}
      >
        {/* Capsule pill scaled up */}
        <div
          style={{
            width: 110,
            height: 68,
            borderRadius: 34,
            backgroundColor: "#1c1917",
            display: "flex",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div style={{ flex: 1 }} />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 2,
              backgroundColor: "rgba(255,255,255,0.25)",
            }}
          />
          <div style={{ flex: 1 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
