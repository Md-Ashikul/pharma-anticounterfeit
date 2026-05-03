import "@/styles/globals.css";
import Navbar from "@/components/Navbar";

export const metadata = {
  title:       "PharmaChain — Supply Chain Portal",
  description: "Blockchain-based pharmaceutical anti-counterfeiting system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}