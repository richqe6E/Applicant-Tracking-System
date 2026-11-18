import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import { StatusCacheProvider } from '@/lib/context/status-cache';
import { LanguageProvider } from '@/lib/context/language-context';
import { BackgroundOpsProvider } from '@/lib/context/background-ops-context';
import { LocalizedErrorBoundary } from '@/components/common/error-boundary';
import { MotionProvider } from '@/components/common/motion-provider';
import { EffectsProvider } from '@/lib/context/effects-context';
import { BlockDissolveProvider } from '@/components/effects/block-dissolve-provider';
import { LazyToaster } from '@/components/ui/lazy-toaster';
import { LiveDemoPlayer } from '@/components/common/live-demo-player';
import { AppTopNav } from '@/components/common/app-top-nav';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <StatusCacheProvider>
      <LanguageProvider>
        <BackgroundOpsProvider>
          <ResumePreviewProvider>
            <LocalizedErrorBoundary>
              <MotionProvider>
                <EffectsProvider>
                  <BlockDissolveProvider>
                    <div className="min-h-screen flex flex-col">
                      <AppTopNav />
                      <main className="flex-1 min-h-0 flex flex-col">{children}</main>
                    </div>
                    <LiveDemoPlayer />
                  </BlockDissolveProvider>
                </EffectsProvider>
              </MotionProvider>
            </LocalizedErrorBoundary>
          </ResumePreviewProvider>
          <LazyToaster />
        </BackgroundOpsProvider>
      </LanguageProvider>
    </StatusCacheProvider>
  );
}
