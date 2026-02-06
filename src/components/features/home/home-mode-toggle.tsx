'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type HomeMode = 'explore' | 'prove' | 'write';

// Workspace-first UX: Home no longer presents Explore/Prove/Write mode choices.
// Kept temporarily to avoid breaking imports; HomeView no longer uses this.

export function HomeModeToggle({
    mode,
    onChange,
}: {
    mode: HomeMode;
    onChange: (mode: HomeMode) => void;
}) {
    return (
        <div className="flex justify-center">
            <Tabs value={mode} onValueChange={(v) => onChange(v as HomeMode)}>
                <TabsList className="h-10">
                    <TabsTrigger value="write" className="px-5 py-2 text-sm">
                        Workspace
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}
