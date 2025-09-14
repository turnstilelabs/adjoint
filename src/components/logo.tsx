export function Logo() {
  return (
    <div className="flex items-center justify-center size-16 rounded-full border-2 border-primary text-primary bg-primary/10">
      <svg
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="size-8"
        aria-hidden="true"
      >
        <path d="M12 2v20"></path>
        <path d="M4 12h16"></path>
        <path d="M4 12V6a2 2 0 0 1 2-2h0"></path>
      </svg>
    </div>
  );
}
