import type { Metadata } from "next";
import Image from "next/image";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSplashGate } from "@/components/workspace/app-splash-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madora",
  description: "A quiet Markdown workspace for local notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" data-app-splash="active">
        <div className="app-splash" aria-label="Madora is loading">
          <main className="app-splash__content">
            <Image
              className="app-splash__logo block dark:hidden"
              src="/brand/madora-logo-dark.svg"
              alt=""
              width={32}
              height={32}
              priority
            />
            <Image
              className="app-splash__logo hidden dark:block"
              src="/brand/madora-logo-light.svg"
              alt=""
              width={32}
              height={32}
              priority
            />
            <h1 className="app-splash__title">先让它存在，再把它做好</h1>
            <p className="app-splash__subtitle">
              Make it exist first. Make it good later.
              <span className="app-splash__cursor" aria-hidden="true" />
            </p>
            <div className="app-splash__line" aria-hidden="true">
              <span />
            </div>
          </main>
        </div>
        <ThemeProvider>
          <AppSplashGate />
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
