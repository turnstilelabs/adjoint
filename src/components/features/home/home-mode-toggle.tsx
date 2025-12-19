'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type HomeMode = 'explore' | 'prove';

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
                <TabsList className="h-8">
                    <TabsTrigger value="explore" className="px-3 py-1 text-xs">
                        Explore
                    </TabsTrigger>
                    <TabsTrigger value="prove" className="px-3 py-1 text-xs">
                        Attempt proof
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}
