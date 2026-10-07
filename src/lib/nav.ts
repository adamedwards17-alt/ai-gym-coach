export type NavItem = {
  href: string;
  label: string;
};

/** Main app sections. Home is the logo; these appear in the menu. */
export const appNavItems: NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/train", label: "Train" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
];
