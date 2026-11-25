import { ImageResponse } from "next/og";

export const alt = "speeq: give your website a voice";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "linear-gradient(135deg, #07070c 0%, #14102b 55%, #08222b 100%)",
        color: "#f1f1f7",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "linear-gradient(135deg, #8b6cff, #22c7e6)",
            display: "flex",
          }}
        />
        speeq
      </div>
      <div
        style={{
          marginTop: 40,
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1.05,
          display: "flex",
        }}
      >
        Give your website a voice.
      </div>
      <div style={{ marginTop: 28, fontSize: 34, color: "#9a9ab0", display: "flex" }}>
        A headless voice and text assistant for web apps.
      </div>
    </div>,
    size,
  );
}
