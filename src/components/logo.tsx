export function Logo() {
  return (
    <div className="flex items-center justify-center size-16 rounded-full border-2 border-primary text-primary bg-primary/10">
      <svg
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="size-8"
        aria-hidden="true"
      >
        <path d="M12 2 L12 22"></path> 
        <path d="M12 12 L22 12"></path>
      </svg>
    </div>
  );
}
