'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type HomeMode = 'explore' | 'prove' | 'write';

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
                    <TabsTrigger value="explore" className="px-5 py-2 text-sm">
                        Explore
                    </TabsTrigger>
                    <TabsTrigger value="prove" className="px-5 py-2 text-sm">
                        Prove
                    </TabsTrigger>
                    <TabsTrigger value="write" className="px-5 py-2 text-sm">
                        Write
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}
