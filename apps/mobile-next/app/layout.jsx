import "./globals.css";

export const metadata = {
  title: "Brainstyworkers Concierge",
  description: "Mobile-first Brainstyworkers concierge PWA",
  manifest: "/manifest.json"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#173f36"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
