import "./globals.css";

export const metadata = {
  title: "CoreOfCare",
  description: "Mobile-first CoreOfCare health-insurance resolution client",
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
