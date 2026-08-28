type IconProps = { active?: boolean };

const stroke = (active?: boolean) => (active ? "#e8a54b" : "#9fc4bf");

export function IconChat({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-3.5 3v-3H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
        stroke={stroke(active)}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMail({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke={stroke(active)} strokeWidth="1.8" />
      <path d="m5 8 7 5 7-5" stroke={stroke(active)} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function IconOmniChat({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="10" r="3.2" stroke={stroke(active)} strokeWidth="1.8" />
      <circle cx="16" cy="10" r="3.2" stroke={stroke(active)} strokeWidth="1.8" />
      <path d="M4.5 17.5c1.2-2 2.7-3 3.5-3s2.3 1 3.5 3" stroke={stroke(active)} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 17.5c1.2-2 2.7-3 3.5-3s2.3 1 3.5 3" stroke={stroke(active)} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconOmniMail({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5 12 4l8 4.5v7.5L12 20l-8-4V8.5Z"
        stroke={stroke(active)}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 8.5 12 13l8-4.5" stroke={stroke(active)} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
