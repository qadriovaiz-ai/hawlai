// The face of the sales agent — one drawing, every size.
//
// A GENERIC CHAT BUBBLE SAYS "FORM"; A FACE SAYS "SOMEBODY IS HERE".
// The founder asked for a friendly humanoid robot rather than the
// message-circle icon the widget launched with: a rounded head, a simple
// geometric body, and a screen-like face with two round eyes and a small
// smile.
//
// FLAT SVG, NOT AN IMAGE, for three reasons that each had an alternative
// worth rejecting:
//
//   SHARP AT EVERY SIZE. It is drawn on a 48-unit grid and scales by
//   viewBox, so the 28px launcher icon, the 20px header badge and the
//   16px reply avatar are the same drawing rather than three crops of a
//   PNG. A raster at 2x would still blur on a 3x phone.
//
//   IT COSTS NO REQUEST. The widget is on every page of a customer's
//   storefront now (V4a). An <img> is a round trip before the launcher
//   can be drawn, on a connection this product's customers are often
//   on; inline markup paints with the page.
//
//   THE COLOURS ARE THE BUSINESS'S OWN. Rule 3: nothing here names a
//   brand, a trade or a palette. Every colour is passed in, derived
//   from the site's own theme, so the robot on a navy-and-amber site is
//   not the robot on a forest-and-cream one. The ONLY fixed values are
//   the whites of the eyes and the face screen's translucency, which
//   are geometry rather than branding — and `onColor` exists so a
//   caller drawing on an accent-coloured button can keep the face
//   readable instead of a dark robot disappearing into a dark circle.
//
// NO PHOTO-REALISM ON PURPOSE. A drawing that tries to look like a
// person invites the question of who it is; a flat robot is honestly
// what it is — which matters on a surface where the first rule is not
// to let a visitor believe something untrue.

export type AgentAvatarProps = {
  /** The business's own colour — the robot's shell. */
  color: string;
  /**
   * What the robot is drawn ON.
   *
   * When the avatar sits on a button already filled with `color`, pass
   * that colour here and the shell is drawn in `onColor` instead, so the
   * face never disappears into its own background.
   */
  onColor?: string;
  /** Rendered size in pixels. The drawing is resolution-independent. */
  size?: number;
  className?: string;
};

/**
 * The agent's face.
 *
 * Decorative: the surrounding control carries the label, so this is
 * hidden from screen readers rather than announced as "image".
 */
export default function AgentAvatar({ color, onColor, size = 28, className }: AgentAvatarProps) {
  const shell = onColor ?? color;
  const screen = onColor ? color : "#0B1220";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* The aerial — the one line that reads as "robot" at 16px, where
          the face itself is only a few pixels across. */}
      <path d="M24 5V9.5" stroke={shell} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="4" r="2.6" fill={shell} />

      {/* Head: rounded, not a circle — a circle plus a body reads as a
          snowman at small sizes. */}
      <rect x="9" y="9.5" width="30" height="24" rx="9" fill={shell} />

      {/* Ears, which also stop the head reading as a plain pill. */}
      <rect x="5.5" y="17" width="3.2" height="9" rx="1.6" fill={shell} />
      <rect x="39.3" y="17" width="3.2" height="9" rx="1.6" fill={shell} />

      {/* The screen the face is on. Translucent black over the shell, so
          it darkens whatever colour the business chose instead of
          fighting it with a second hue. */}
      <rect x="13.5" y="14" width="21" height="15.5" rx="7" fill={screen} fillOpacity={onColor ? 1 : 0.82} />

      {/* Two round eyes and a small smile — the whole expression. */}
      <circle cx="19.6" cy="21.2" r="2.5" fill="#FFFFFF" />
      <circle cx="28.4" cy="21.2" r="2.5" fill="#FFFFFF" />
      <path
        d="M20.6 25.8C21.7 26.9 22.8 27.4 24 27.4C25.2 27.4 26.3 26.9 27.4 25.8"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeOpacity="0.92"
      />

      {/* Body: a simple geometric shoulder line, cropped by the viewBox
          so the avatar reads as a bust rather than a floating head. */}
      <path
        d="M12 48V43.5C12 39.36 15.36 36 19.5 36H28.5C32.64 36 36 39.36 36 43.5V48H12Z"
        fill={shell}
      />
    </svg>
  );
}
