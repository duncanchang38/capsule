import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Capsule pill: 22×14, rounded corners matching 18×11 ratio */}
        <div
          style={{
            width: 22,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#1c1917",
            display: "flex",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Left half */}
          <div style={{ flex: 1 }} />
          {/* Center divider */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 1,
              backgroundColor: "rgba(255,255,255,0.3)",
            }}
          />
          {/* Right half */}
          <div style={{ flex: 1 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
