"use client";

import React, { useEffect, useRef } from 'react';

type Particle = {
    x: number;
    y: number;
    vy: number;
    radius: number;
};

// Make the effect clearly visible: more particles, slightly larger, slower fall.
const PARTICLE_COUNT = 260;
const MIN_RADIUS = 2.0;
const MAX_RADIUS = 4.0;

export function YellowSnowBackground() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let animationFrameId: number;
        let particles: Particle[] = [];

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const createParticle = (): Particle => ({
            x: Math.random() * width,
            y: Math.random() * height,
            vy: 0.25 + Math.random() * 0.8,
            radius: MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS),
        });

        const initParticles = () => {
            particles = Array.from({ length: PARTICLE_COUNT }, createParticle);
        };

        const draw = () => {
            if (!width || !height) return;

            // Dark backdrop matching app but slightly deeper so the snow pops.
            ctx.fillStyle = 'rgb(5, 5, 5)';
            ctx.fillRect(0, 0, width, height);

            // Soft yellow glow at the bottom to suggest accumulation
            const baseHeight = height * 0.22;
            const gradient = ctx.createLinearGradient(0, height - baseHeight, 0, height);
            gradient.addColorStop(0, 'rgba(255, 221, 87, 0.05)');
            gradient.addColorStop(1, 'rgba(255, 221, 87, 0.55)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, height - baseHeight, width, baseHeight);

            // Draw particles
            ctx.fillStyle = '#ffdd57';
            for (const p of particles) {
                p.y += p.vy;
                // Slight side drift
                p.x += (Math.random() - 0.5) * 0.3;

                if (p.y > height) {
                    // Respawn near the top once it "joins" the base
                    p.y = -10;
                    p.x = Math.random() * width;
                }

                if (p.x < -10) p.x = width + 10;
                if (p.x > width + 10) p.x = -10;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            animationFrameId = window.requestAnimationFrame(draw);
        };

        const handleResize = () => {
            resize();
            initParticles();
        };

        resize();
        initParticles();
        draw();

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-0 h-full w-full"
        />
    );
}
