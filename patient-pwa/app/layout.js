import "@/styles/globals.css";

export const metadata = {
  title:       "PharmaVerify — Medicine Authenticator",
  description: "Verify your medicine is authentic using blockchain",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="pwa-header">
          <h1>💊 PharmaVerify</h1>
          <div style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: ".2rem" }}>
            Government-Backed Medicine Verification
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}