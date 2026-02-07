// Minimal module declarations for pdfjs-dist ESM entrypoints.
//
// In some build environments (e.g. Vercel/Next.js typechecking), TypeScript
// fails to resolve the bundled declaration files for the explicit `.mjs` paths.
// We only rely on these imports as runtime values (typed as `any`), so a small
// shim keeps the build green.

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
    const pdfjs: any;
    export = pdfjs;
}

declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
    const pdfjs: any;
    export = pdfjs;
}
