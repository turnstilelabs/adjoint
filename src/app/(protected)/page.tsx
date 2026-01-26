import HomeView from '@/components/features/home/home-view';
import { AppViewport } from '@/components/app-viewport';
import { RouteViewSync } from '@/components/route-view-sync';

/**
 * Home route.
 *
 * The app used to render Home/Explore/Prove/Workspace from a single route by
 * switching Zustand `view`. We now use real routes; this page renders Home only.
 */
export default function HomePage() {
    return (
        <AppViewport>
            <RouteViewSync view="home" />
            <HomeView />
        </AppViewport>
    );
}
