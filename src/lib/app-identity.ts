/**
 * What the installed application calls itself and looks like. One source for the
 * manifest and the page. It is the product's, never a company's: the phone
 * fetches the manifest and the icons without a session, so nothing here may
 * come from who is signed in.
 */
export const APP_NAME = "ERP · Ávila Ops";
export const APP_SHORT_NAME = "ERP";
export const APP_DESCRIPTION = "Sistema comercial.";

/** The system bar of the installed application: the brand colour of the screens. */
export const THEME_COLOR = "#2c49a8";
/** The screen shown while the application opens: the background of the page. */
export const BACKGROUND_COLOR = "#edefeb";
export const ICON_COLOR = "#2c49a8";
/** What is behind the Ávila mark in the icons: the mark has its own colours, so the fill is white. */
export const ICON_BACKGROUND = "#ffffff";

export type AppIcon = {
  /** Where the file is in the repository. */
  file: string;
  /** Side in pixels: every icon is a square. */
  size: number;
  /** A maskable icon is cut by the phone into a circle or a rounded square: its drawing stays in the safe area. */
  maskable: boolean;
  /** Only the icon of the browser tab: on the home screen of a phone, transparency turns black. */
  transparent?: boolean;
};

/** Every icon of the application. The ones under `src/app` are served by Next's file convention (`/icon.png`, `/apple-icon.png`). */
export const APP_ICONS: AppIcon[] = [
  { file: "public/icons/icon-192.png", size: 192, maskable: false },
  { file: "public/icons/icon-512.png", size: 512, maskable: false },
  { file: "public/icons/icon-maskable-512.png", size: 512, maskable: true },
  { file: "src/app/apple-icon.png", size: 180, maskable: false },
  { file: "src/app/icon.png", size: 64, maskable: false, transparent: true },
];
