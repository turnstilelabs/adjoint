declare global {
  interface Window {
    renderMathInElement: (element: HTMLElement, options?: object) => void;
  }
}

// This empty export is needed to make the file a module.
export {};
