import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://Frees-Ling.github.io", // replace this with your deployed domain
  author: "Frees-Ling",
  desc: "I am a code lover (aficionado) , I love programming, and look forward to one day can write a perfect program of their own, I also love chemistry, photography and so on",
  title: "Blog of FL",
  ogImage: "og-image-default.png",    //TODO
  lightAndDarkMode: true,
  postPerPage: 5,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};

export const LOCALE = {
  lang: "en", // html lang code. Set this empty and default will be "en"
  langTag: ["en", "zh"], // BCP 47 Language Tags. Set this empty [] to use the environment default
  fallback: {
    zh: "en",
  },
  routing: {
    prefixDefaultLocale: false,
  },
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = [
  {
    name: "Github",
    href: "https://github.com/Frees-Ling",
    linkTitle: ` FL on GitHub`,
    active: true,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=100094647702843",
    linkTitle: `FL on Facebook`,
    active: false,
  },
  {
    name: "Instagram",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Instagram`,
    active: false,
  },
  {
    name: "LinkedIn",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on LinkedIn`,
    active: false,
  },
  {
    name: "Mail",
    href: "freesling496@gmail.com",
    linkTitle: `Send an email to FL`,
    active: true,
  },
  {
    name: "Twitter",
    href: "https://twitter.com/LingFrees23428",
    linkTitle: `FL on Twitter`,
    active: true,
  },
  {
    name: "Twitch",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Twitch`,
    active: false,
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/channel/UCwcOc0G4P2yd1zpk0qbfrbw",
    linkTitle: `FL on YouTube`,
    active: false,
  },
  {
    name: "WhatsApp",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on WhatsApp`,
    active: false,
  },
  {
    name: "Snapchat",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Snapchat`,
    active: false,
  },
  {
    name: "Pinterest",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Pinterest`,
    active: false,
  },
  {
    name: "TikTok",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on TikTok`,
    active: false,
  },
  {
    name: "CodePen",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on CodePen`,
    active: false,
  },
  {
    name: "Discord",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Discord`,
    active: false,
  },
  {
    name: "GitLab",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on GitLab`,
    active: false,
  },
  {
    name: "Reddit",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Reddit`,
    active: false,
  },
  {
    name: "Skype",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Skype`,
    active: false,
  },
  {
    name: "Steam",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `FL on Steam`,
    active: false,
  },
  {
    name: "Telegram",
    href: "https://t.me/FLoffic",
    linkTitle: `FL on Telegram`,
    active: true,
  },
  {
    name: "Mastodon",
    href: "https://mastodon.social/deck/@Free_keys",
    linkTitle: `FL on Mastodon`,
    active: true,
  },
];
