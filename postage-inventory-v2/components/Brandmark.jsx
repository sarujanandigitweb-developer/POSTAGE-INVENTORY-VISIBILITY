// The dashboard's mark, copied from the live page so the two look identical.
export default function Brandmark({ size = 30 }) {
  return (
    <span className="brandmark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size} focusable="false">
        <defs>
          <linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5b8cff" /><stop offset="1" stopColor="#1f4fd8" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#bmg)" />
        <path d="M16 6.4a6.3 6.3 0 0 0-3.75 11.37c.56.41.91 1.06.91 1.77v.56h5.68v-.56c0-.71.35-1.36.91-1.77A6.3 6.3 0 0 0 16 6.4Z"
              fill="#fff" fillOpacity=".96" />
        <path d="M13.35 22.75h5.3M14.15 25.15h3.7" stroke="#fff" strokeWidth="1.7"
              strokeLinecap="round" strokeOpacity=".9" />
        <path d="M16 9.6v6.2M13.9 12.4h4.2" stroke="#2a5ae0" strokeWidth="1.15"
              strokeLinecap="round" strokeOpacity=".85" />
      </svg>
    </span>
  );
}
