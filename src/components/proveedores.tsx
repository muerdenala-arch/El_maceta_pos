"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { RegistroServiceWorker } from "@/components/offline/registro-sw";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Proveedores({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* Respeta la preferencia "reducir movimiento" del dispositivo */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="top-center" richColors closeButton />
          <RegistroServiceWorker />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
